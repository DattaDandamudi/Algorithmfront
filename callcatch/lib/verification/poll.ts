/**
 * Toll-Free Verification status handling. Source of truth is Twilio's
 * `messaging.v1.tollfreeVerifications(sid).fetch()`; the webhook route and the cron both
 * funnel into `applyVerificationStatus` so the "verified" side effects run exactly once:
 * numbers.sms_enabled=true + verified_at, a verification_events row, track('verified'),
 * the "You're live" email, then billing's onVerified(accountId) (contract).
 */
import { createAdminSupabase, type Db } from "@/lib/db/client";
import type { AccountRow, Json, NumberRow, VerificationStatus } from "@/lib/db/types";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/email/send";
import { track } from "@/lib/events";
import { onVerified } from "@/lib/billing/onVerified";
import { twilioClient } from "@/lib/telephony/client";
import { renderAlertEmail } from "@/lib/telephony/alerts";
import { businessNameOf } from "@/lib/ai/prompts";

export type TwilioTfvStatus = "PENDING_REVIEW" | "IN_REVIEW" | "TWILIO_APPROVED" | "TWILIO_REJECTED";

export function mapTwilioVerificationStatus(status: string | null | undefined): VerificationStatus | null {
  switch ((status ?? "").toUpperCase()) {
    case "TWILIO_APPROVED":
      return "verified";
    case "TWILIO_REJECTED":
      return "rejected";
    case "IN_REVIEW":
      return "in_review";
    case "PENDING_REVIEW":
      return "pending";
    default:
      return null;
  }
}

export type ApplyInput = {
  number: NumberRow;
  status: VerificationStatus;
  payload: Record<string, Json | undefined>;
  rejectionReason?: string | null;
};

export type ApplyResult = { changed: boolean; status: VerificationStatus; billing?: { ok: boolean; detail?: string } };

async function loadAccount(db: Db, accountId: string): Promise<AccountRow | null> {
  const r = await db.from("accounts").select("*").eq("id", accountId).maybeSingle();
  return r.data ?? null;
}

async function sendYoureLiveEmail(account: AccountRow, number: NumberRow): Promise<void> {
  if (!account.alert_email) return;
  const name = businessNameOf(account);
  const { html, text } = renderAlertEmail({
    title: "You're live — texting is on",
    intro: `Carriers verified ${number.phone_number} for ${name}. From now on every forwarded call that goes unanswered gets a text back within seconds, and replies are qualified automatically.`,
    rows: [
      { label: "Number", value: number.phone_number },
      { label: "Verified", value: new Date().toLocaleString("en-US", { timeZone: account.timezone ?? "America/Chicago" }) },
      { label: "Next", value: "Make sure call forwarding is on, then miss a call on purpose to see it work." },
    ],
    ctaUrl: `${env.appUrl()}/inbox`,
    ctaLabel: "Open your inbox",
    footnote: "Your billing period starts today (trial or first invoice, per your plan).",
  });
  await sendEmail({ to: account.alert_email, subject: `You're live: ${name} now texts back missed calls`, html, text, tags: [{ name: "kind", value: "verified" }] });
}

async function sendRejectedEmails(account: AccountRow, number: NumberRow, reason: string | null): Promise<void> {
  const name = businessNameOf(account);
  const admin = env.adminEmails();
  const body = renderAlertEmail({
    title: "Toll-free verification rejected",
    intro: `Twilio rejected the verification for ${number.phone_number} (${name}).`,
    rows: [
      { label: "Reason", value: reason ?? "not provided" },
      { label: "Verification SID", value: number.verification_sid ?? "—" },
      { label: "Account", value: account.id },
    ],
    ctaUrl: `${env.appUrl()}/admin`,
    ctaLabel: "Open admin",
    footnote: "Runbook §2: fix the fields, then resubmit from the app.",
  });
  if (admin.length) {
    await sendEmail({ to: admin, subject: `TFV rejected — ${name} (${number.phone_number})`, ...body, tags: [{ name: "kind", value: "tfv_rejected" }] }).catch((e) =>
      console.error("[verification] admin email failed", e)
    );
  }
  if (account.alert_email) {
    const owner = renderAlertEmail({
      title: "We need one more thing for your number",
      intro: `The carrier review of ${number.phone_number} came back with a question. We're on it and will fix it with you — your alerts and voicemail transcripts keep working in the meantime.`,
      rows: [{ label: "Carrier note", value: reason ?? "Details to follow" }],
      ctaUrl: `${env.appUrl()}/settings`,
      ctaLabel: "Review your business details",
    });
    await sendEmail({ to: account.alert_email, subject: "Quick fix needed for your texting number", ...owner, tags: [{ name: "kind", value: "tfv_rejected" }] }).catch((e) =>
      console.error("[verification] owner email failed", e)
    );
  }
}

/** Applies a mapped status to the numbers row (idempotent) and runs the side effects on change. */
export async function applyVerificationStatus(input: ApplyInput, db: Db = createAdminSupabase()): Promise<ApplyResult> {
  const { number, status } = input;
  const fresh = await db.from("numbers").select("*").eq("id", number.id).maybeSingle();
  const current = fresh.data ?? number;
  if (current.verification_status === status) {
    // Still record rejection reason updates.
    if (status === "rejected" && input.rejectionReason && input.rejectionReason !== current.rejection_reason) {
      await db.from("numbers").update({ rejection_reason: input.rejectionReason }).eq("id", current.id);
    }
    return { changed: false, status };
  }

  const nowIso = new Date().toISOString();
  await db.from("verification_events").insert({
    number_id: current.id,
    account_id: current.account_id,
    status,
    payload: input.payload,
    received_at: nowIso,
  });

  const update: Partial<NumberRow> = { verification_status: status };
  if (status === "verified") {
    update.sms_enabled = true;
    update.verified_at = nowIso;
    update.rejection_reason = null;
  } else if (status === "rejected") {
    update.sms_enabled = false;
    update.rejection_reason = input.rejectionReason ?? current.rejection_reason ?? "rejected";
  }
  const updated = await db.from("numbers").update(update).eq("id", current.id);
  if (updated.error) throw new Error(`numbers update failed: ${updated.error.message}`);

  const account = await loadAccount(db, current.account_id);
  const result: ApplyResult = { changed: true, status };

  if (status === "verified") {
    await track("verified", { number_id: current.id, phone_number: current.phone_number, verification_sid: current.verification_sid }, { accountId: current.account_id });
    if (account) {
      if (account.status === "pending_verification") {
        await db.from("accounts").update({ status: "live" }).eq("id", account.id).eq("status", "pending_verification");
      }
      await sendYoureLiveEmail(account, { ...current, ...update }).catch((e) => console.error("[verification] you're-live email failed", e));
    }
    try {
      result.billing = await onVerified(current.account_id);
    } catch (err) {
      console.error("[verification] onVerified threw", err);
      result.billing = { ok: false, detail: err instanceof Error ? err.message : "error" };
    }
  } else if (status === "rejected") {
    await track("verification_rejected", { number_id: current.id, reason: update.rejection_reason }, { accountId: current.account_id });
    if (account) await sendRejectedEmails(account, { ...current, ...update }, update.rejection_reason ?? null);
  } else {
    await track("verification_status", { number_id: current.id, status }, { accountId: current.account_id });
  }
  return result;
}

/** Maps a 10DLC (sole-proprietor) brand + campaign status pair onto our verification status. */
export function mapTenDlcStatus(brandStatus: string | null | undefined, campaignStatus: string | null | undefined): VerificationStatus | null {
  const b = (brandStatus ?? "").toUpperCase();
  const c = (campaignStatus ?? "").toUpperCase();
  if (b === "FAILED" || c === "FAILED") return "rejected";
  if (c === "VERIFIED") return "verified";
  if (c === "IN_PROGRESS" || b === "IN_REVIEW") return "in_review";
  if (b === "PENDING" || c === "PENDING" || b === "APPROVED" || b === "VERIFIED" || b === "UNVERIFIED") return "pending";
  return null;
}

/**
 * Sole-proprietor path: no toll-free verification SID; the number is live when the 10DLC campaign is VERIFIED.
 * The messaging service SID is kept in the verification_events payload written at submission time.
 */
async function pollTenDlc(number: NumberRow, db: Db): Promise<ApplyResult | null> {
  if (!number.tendlc_campaign_sid || !number.tendlc_brand_sid) return null;
  const events = await db
    .from("verification_events")
    .select("payload")
    .eq("number_id", number.id)
    .order("received_at", { ascending: false })
    .limit(10);
  let messagingServiceSid: string | null = null;
  for (const e of events.data ?? []) {
    const payload = (e.payload ?? {}) as { messaging_service_sid?: string };
    if (payload.messaging_service_sid) {
      messagingServiceSid = payload.messaging_service_sid;
      break;
    }
  }
  const client = twilioClient();
  const brand = await client.messaging.v1.brandRegistrations(number.tendlc_brand_sid).fetch();
  let campaignStatus: string | null = null;
  let campaignFailure: string | null = null;
  if (messagingServiceSid) {
    const campaign = await client.messaging.v1.services(messagingServiceSid).usAppToPerson(number.tendlc_campaign_sid).fetch();
    campaignStatus = campaign.campaignStatus ?? null;
    const errors = (campaign as unknown as { errors?: unknown }).errors;
    campaignFailure = Array.isArray(errors) && errors.length ? JSON.stringify(errors) : null;
  }
  const status = mapTenDlcStatus(brand.status, campaignStatus);
  if (!status) {
    console.warn("[verification] unknown 10DLC status", { brand: brand.status, campaign: campaignStatus, number: number.id });
    return null;
  }
  const brandFailure = (brand as unknown as { brandFeedback?: unknown }).brandFeedback;
  const rejectionReason =
    status === "rejected"
      ? [campaignFailure, Array.isArray(brandFailure) && brandFailure.length ? JSON.stringify(brandFailure) : null].filter(Boolean).join(" | ") || "10DLC registration failed"
      : null;
  return applyVerificationStatus(
    {
      number,
      status,
      rejectionReason,
      payload: {
        source: "poll_10dlc",
        brand_sid: number.tendlc_brand_sid,
        brand_status: brand.status ?? null,
        campaign_sid: number.tendlc_campaign_sid,
        campaign_status: campaignStatus,
        messaging_service_sid: messagingServiceSid,
      },
    },
    db
  );
}

/** Fetches the verification from Twilio and applies it. Returns null when the number has no SID at all. */
export async function pollVerification(number: NumberRow, db: Db = createAdminSupabase()): Promise<ApplyResult | null> {
  if (!number.verification_sid) return pollTenDlc(number, db);
  const v = await twilioClient().messaging.v1.tollfreeVerifications(number.verification_sid).fetch();
  const status = mapTwilioVerificationStatus(v.status);
  if (!status) {
    console.warn("[verification] unknown Twilio status", { sid: number.verification_sid, status: v.status });
    return null;
  }
  const reasons = Array.isArray(v.rejectionReasons)
    ? (v.rejectionReasons as unknown[])
        .map((r) => (typeof r === "string" ? r : r && typeof r === "object" ? JSON.stringify(r) : ""))
        .filter(Boolean)
        .join("; ")
    : "";
  const rejectionReason = [v.rejectionReason, reasons].filter(Boolean).join(" | ") || null;
  return applyVerificationStatus(
    {
      number,
      status,
      rejectionReason,
      payload: {
        source: "poll",
        twilio_status: v.status,
        sid: v.sid,
        error_code: typeof v.errorCode === "number" ? v.errorCode : null,
        rejection_reason: rejectionReason,
        date_updated: v.dateUpdated ? new Date(v.dateUpdated).toISOString() : null,
      },
    },
    db
  );
}

/** Finds the numbers row for a verification SID (webhook path). */
export async function findNumberByVerificationSid(sid: string, db: Db = createAdminSupabase()): Promise<NumberRow | null> {
  const r = await db.from("numbers").select("*").eq("verification_sid", sid).maybeSingle();
  return r.data ?? null;
}
