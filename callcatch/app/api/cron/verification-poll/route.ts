/**
 * GET /api/cron/verification-poll — every 30 minutes.
 * Polls every number with verification_status pending/in_review against Twilio and applies
 * changes (verified → sms_enabled, "You're live", onVerified). Escalates to ADMIN_EMAILS once
 * a submission has been pending for 5+ business days (one `verification_events` row of status
 * `escalated` guards repeats).
 */
import type { NextRequest } from "next/server";
import { createAdminSupabase } from "@/lib/db/client";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/email/send";
import { renderAlertEmail } from "@/lib/telephony/alerts";
import { businessDaysBetween } from "@/lib/telephony/quietHours";
import { pollVerification } from "@/lib/verification/poll";
import { authorizeCron, cronError, cronResponse } from "../_lib/cron";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const ESCALATE_AFTER_BUSINESS_DAYS = 5;

export async function GET(request: NextRequest) {
  const denied = authorizeCron(request);
  if (denied) return denied;
  const started = Date.now();
  const counts = { pending: 0, polled: 0, verified: 0, rejected: 0, unchanged: 0, errors: 0, escalated: 0 };
  const db = createAdminSupabase();
  try {
    const numbers = await db
      .from("numbers")
      .select("*")
      .in("verification_status", ["pending", "in_review"])
      .not("verification_sid", "is", null)
      .order("verification_submitted_at", { ascending: true })
      .limit(200);
    const now = new Date();
    for (const number of numbers.data ?? []) {
      counts.pending++;
      if (Date.now() - started > 50_000) break;
      try {
        const result = await pollVerification(number, db);
        counts.polled++;
        if (!result || !result.changed) counts.unchanged++;
        else if (result.status === "verified") counts.verified++;
        else if (result.status === "rejected") counts.rejected++;
        if (result?.changed && (result.status === "verified" || result.status === "rejected")) continue;
      } catch (err) {
        counts.errors++;
        console.error("[cron:verification-poll] poll failed", { numberId: number.id, err: err instanceof Error ? err.message : err });
      }

      const submittedAt = number.verification_submitted_at ? new Date(number.verification_submitted_at) : new Date(number.created_at);
      if (businessDaysBetween(submittedAt, now) < ESCALATE_AFTER_BUSINESS_DAYS) continue;
      const already = await db.from("verification_events").select("id").eq("number_id", number.id).eq("status", "escalated").limit(1).maybeSingle();
      if (already.data) continue;
      const admins = env.adminEmails();
      const account = await db.from("accounts").select("legal_name, dba, alert_email").eq("id", number.account_id).maybeSingle();
      const name = account.data?.dba || account.data?.legal_name || number.account_id;
      const { html, text } = renderAlertEmail({
        title: `TFV pending ${businessDaysBetween(submittedAt, now)} business days`,
        intro: `Verification for ${number.phone_number} (${name}) is still ${number.verification_status}. Open a Twilio support ticket (Runbook §1).`,
        rows: [
          { label: "Verification SID", value: number.verification_sid ?? "—" },
          { label: "Submitted", value: submittedAt.toISOString() },
          { label: "Account", value: number.account_id },
          { label: "Owner email", value: account.data?.alert_email ?? "—" },
        ],
        ctaUrl: `${env.appUrl()}/admin`,
        ctaLabel: "Open admin",
      });
      if (admins.length) {
        await sendEmail({ to: admins, subject: `Escalate TFV: ${name} (${number.phone_number})`, html, text, tags: [{ name: "kind", value: "tfv_escalation" }] }).catch((e) =>
          console.error("[cron:verification-poll] escalation email failed", e)
        );
      }
      await db.from("verification_events").insert({
        number_id: number.id,
        account_id: number.account_id,
        status: "escalated",
        payload: { business_days: businessDaysBetween(submittedAt, now), at: now.toISOString(), admins_notified: admins.length },
      });
      counts.escalated++;
    }
    return cronResponse("verification-poll", started, counts);
  } catch (err) {
    return cronError("verification-poll", started, err, counts);
  }
}
