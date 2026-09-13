/**
 * POST /api/twilio/sms/status — delivery status for messages we send (statusCallback).
 *
 * Params: MessageSid, MessageStatus (queued|accepted|sending|sent|delivered|undelivered|failed|read|canceled),
 *         ErrorCode (numeric, on failure), From (our number), To.
 *
 * Error 30032 ("Toll-Free Number Has Not Been Verified") means Twilio blocked the send because
 * the *sending* number has no approved verification: we flip `numbers.sms_enabled=false`, mark a
 * previously-verified number `rejected`, record a verification_events row and email the admins.
 */
import { after, type NextRequest } from "next/server";
import { createAdminSupabase } from "@/lib/db/client";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/email/send";
import { renderAlertEmail } from "@/lib/telephony/alerts";
import { normalizePhone, validateTwilioRequest } from "@/lib/telephony/client";

export const runtime = "nodejs";
export const maxDuration = 30;

const RANK: Record<string, number> = { queued: 0, sent: 1, delivered: 2, failed: 3 };

function mapStatus(twilioStatus: string): "sent" | "delivered" | "failed" | null {
  switch (twilioStatus) {
    case "accepted":
    case "queued":
    case "sending":
    case "sent":
      return "sent";
    case "delivered":
    case "read":
      return "delivered";
    case "failed":
    case "undelivered":
    case "canceled":
      return "failed";
    default:
      return null;
  }
}

async function handleUnverifiedTollFree(fromNumber: string, messageSid: string): Promise<void> {
  const db = createAdminSupabase();
  const num = await db.from("numbers").select("*").eq("phone_number", fromNumber).maybeSingle();
  if (!num.data) return;
  const wasVerified = num.data.verification_status === "verified";
  await db
    .from("numbers")
    .update({
      sms_enabled: false,
      ...(wasVerified ? { verification_status: "rejected", rejection_reason: "Twilio error 30032: toll-free number not verified (carrier disagreed with our status)" } : {}),
    })
    .eq("id", num.data.id);
  await db.from("verification_events").insert({
    number_id: num.data.id,
    account_id: num.data.account_id,
    status: "sms_blocked_30032",
    payload: { message_sid: messageSid, previous_status: num.data.verification_status, at: new Date().toISOString() },
  });
  const admins = env.adminEmails();
  if (admins.length) {
    const { html, text } = renderAlertEmail({
      title: "Twilio 30032: unverified toll-free send blocked",
      intro: `Outbound SMS from ${fromNumber} was blocked (30032). sms_enabled is now false${wasVerified ? " and verification_status was set to rejected" : ""}.`,
      rows: [
        { label: "Number", value: fromNumber },
        { label: "Account", value: num.data.account_id },
        { label: "Previous status", value: num.data.verification_status },
        { label: "Message SID", value: messageSid },
      ],
      ctaUrl: `${env.appUrl()}/admin`,
      ctaLabel: "Open admin",
      footnote: "Runbook §3: re-poll the verification SID and re-queue the failed rows once verified.",
    });
    await sendEmail({ to: admins, subject: `30032 on ${fromNumber} — SMS disabled`, html, text, tags: [{ name: "kind", value: "sms_30032" }] }).catch((e) =>
      console.error("[sms/status] admin email failed", e)
    );
  }
}

export async function POST(request: NextRequest) {
  const params = await validateTwilioRequest(request);
  if (!params) return new Response("invalid signature", { status: 403 });
  const sid = params.MessageSid ?? params.SmsSid ?? "";
  const mapped = mapStatus((params.MessageStatus ?? params.SmsStatus ?? "").toLowerCase());
  const errorCode = params.ErrorCode && params.ErrorCode !== "0" ? params.ErrorCode : null;
  const from = normalizePhone(params.From);
  if (!sid || !mapped) return new Response(null, { status: 204 });

  after(async () => {
    const db = createAdminSupabase();
    const row = await db.from("messages").select("id, status, error_code").eq("twilio_sid", sid).maybeSingle();
    if (row.data) {
      const currentRank = RANK[row.data.status] ?? 0;
      if (RANK[mapped] > currentRank || (mapped === "failed" && errorCode && errorCode !== row.data.error_code)) {
        await db.from("messages").update({ status: mapped, error_code: errorCode ?? row.data.error_code }).eq("id", row.data.id);
      }
    } else {
      // Owner alert SMS (alerts.twilio_sid) — delivered/failed only.
      if (mapped !== "sent") await db.from("alerts").update({ status: mapped }).eq("twilio_sid", sid);
    }
    if (errorCode === "30032" && from) await handleUnverifiedTollFree(from, sid);
  });
  return new Response(null, { status: 204 });
}
