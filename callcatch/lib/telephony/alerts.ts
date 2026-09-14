/**
 * Owner alerts. SMS always goes from TWILIO_NOTIFICATION_NUMBER (our verified number) to
 * `accounts.alert_phone`; email goes to `accounts.alert_email`. Emergency voice calls go to
 * `on_call_phone` (Pro + configured) or `alert_phone`. Every alert is recorded in `alerts`.
 */
import { createAdminSupabase } from "@/lib/db/client";
import type { AccountRow, AlertChannel } from "@/lib/db/types";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/email/send";
import { can } from "@/lib/plans";
import { formatPhone, sendSms, twilioClient } from "@/lib/telephony/client";
import { escapeXml, sayTwiceAndHangup } from "@/lib/telephony/twiml";

export type AlertKind =
  | "missed_call"
  | "voicemail"
  | "lead"
  | "qualified"
  | "booked"
  | "emergency"
  | "escalation"
  | "turn_limit"
  /** A customer texted a thread the assistant will not answer (owner took over, turn cap, opted out). */
  | "customer_reply"
  | "report";

export type OwnerAlertInput = {
  account: AccountRow;
  kind: AlertKind;
  /** SMS body (keep under ~300 chars; phone numbers are auto-linked by handsets). */
  sms: string;
  email?: { subject: string; html: string; text: string } | null;
  callId?: string | null;
  leadId?: string | null;
  /** Skip the SMS channel (e.g. weekly report on Starter). */
  smsEnabled?: boolean;
};

export type OwnerAlertResult = { sms: "sent" | "skipped" | "failed"; email: "sent" | "skipped" | "failed" };

async function recordAlert(input: {
  accountId: string;
  channel: AlertChannel;
  status: "sent" | "failed";
  twilioSid?: string | null;
  callId?: string | null;
  leadId?: string | null;
}): Promise<void> {
  try {
    const db = createAdminSupabase();
    await db.from("alerts").insert({
      account_id: input.accountId,
      channel: input.channel,
      status: input.status,
      twilio_sid: input.twilioSid ?? null,
      call_id: input.callId ?? null,
      lead_id: input.leadId ?? null,
      sent_at: input.status === "sent" ? new Date().toISOString() : null,
    });
  } catch (err) {
    console.error("[alerts] record failed", err);
  }
}

/** Sends SMS + email to the owner. Never throws. */
export async function sendOwnerAlert(input: OwnerAlertInput): Promise<OwnerAlertResult> {
  const { account } = input;
  const result: OwnerAlertResult = { sms: "skipped", email: "skipped" };

  const smsAllowed = input.smsEnabled !== false && Boolean(account.alert_phone) && account.alert_phone_verified;
  if (smsAllowed && account.alert_phone) {
    try {
      const { sid } = await sendSms({ to: account.alert_phone, body: input.sms });
      await recordAlert({ accountId: account.id, channel: "sms", status: "sent", twilioSid: sid, callId: input.callId, leadId: input.leadId });
      result.sms = "sent";
    } catch (err) {
      console.error("[alerts] sms failed", { accountId: account.id, kind: input.kind, err: err instanceof Error ? err.message : err });
      await recordAlert({ accountId: account.id, channel: "sms", status: "failed", callId: input.callId, leadId: input.leadId });
      result.sms = "failed";
    }
  } else if (input.smsEnabled !== false && account.alert_phone && !account.alert_phone_verified) {
    console.warn("[alerts] alert_phone not verified; SMS skipped", { accountId: account.id, kind: input.kind });
  }

  if (input.email && account.alert_email) {
    try {
      await sendEmail({
        to: account.alert_email,
        subject: input.email.subject,
        html: input.email.html,
        text: input.email.text,
        tags: [{ name: "kind", value: input.kind }],
      });
      await recordAlert({ accountId: account.id, channel: "email", status: "sent", callId: input.callId, leadId: input.leadId });
      result.email = "sent";
    } catch (err) {
      console.error("[alerts] email failed", { accountId: account.id, kind: input.kind, err: err instanceof Error ? err.message : err });
      await recordAlert({ accountId: account.id, channel: "email", status: "failed", callId: input.callId, leadId: input.leadId });
      result.email = "failed";
    }
  }
  return result;
}

/** Which number to ring for emergencies: on-call tech (Pro + configured) else the owner. */
export function emergencyPhoneFor(account: AccountRow): string | null {
  if (can(account, "after_hours_routing") && account.on_call_phone) return account.on_call_phone;
  return account.alert_phone ?? null;
}

/**
 * Places an outbound voice call from the notification number that reads `say` twice.
 * Used for emergencies (customer text or voicemail). Never throws.
 */
export async function placeOwnerVoiceCall(input: {
  account: AccountRow;
  say: string;
  callId?: string | null;
  leadId?: string | null;
}): Promise<{ ok: boolean; sid?: string; to?: string; reason?: string }> {
  const to = emergencyPhoneFor(input.account);
  if (!to) return { ok: false, reason: "no_phone" };
  try {
    const call = await twilioClient().calls.create({
      to,
      from: env.required("TWILIO_NOTIFICATION_NUMBER"),
      // Inline TwiML (max 4000 chars) so the emergency call never depends on a second webhook round-trip.
      twiml: sayTwiceAndHangup(input.say.slice(0, 900)),
      statusCallback: `${env.appUrl()}/api/twilio/voice/status`,
      statusCallbackMethod: "POST",
      timeout: 40,
    });
    await recordAlert({ accountId: input.account.id, channel: "voice", status: "sent", twilioSid: call.sid, callId: input.callId, leadId: input.leadId });
    return { ok: true, sid: call.sid, to };
  } catch (err) {
    console.error("[alerts] voice call failed", { accountId: input.account.id, err: err instanceof Error ? err.message : err });
    await recordAlert({ accountId: input.account.id, channel: "voice", status: "failed", callId: input.callId, leadId: input.leadId });
    return { ok: false, reason: "twilio_error" };
  }
}

// ---------------------------------------------------------------------------
// Email rendering (brand: navy #0b1f3a, orange #ff6a1a)
// ---------------------------------------------------------------------------

export type AlertEmailInput = {
  title: string;
  intro?: string;
  rows?: Array<{ label: string; value: string }>;
  ctaUrl?: string;
  ctaLabel?: string;
  footnote?: string;
};

export function renderAlertEmail(input: AlertEmailInput): { html: string; text: string } {
  const rowsHtml = (input.rows ?? [])
    .map(
      (r) =>
        `<tr><td style="padding:8px 12px;color:#4f75b5;font-size:13px;white-space:nowrap;vertical-align:top">${escapeXml(r.label)}</td><td style="padding:8px 12px;color:#0b1f3a;font-size:15px">${escapeXml(r.value)}</td></tr>`
    )
    .join("");
  const cta = input.ctaUrl
    ? `<p style="margin:24px 0 8px"><a href="${escapeXml(input.ctaUrl)}" style="display:inline-block;background:#ff6a1a;color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px">${escapeXml(input.ctaLabel ?? "Open CallCatch")}</a></p>`
    : "";
  const html = `<!doctype html><html><body style="margin:0;background:#fbfaf7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
  <div style="background:#0b1f3a;color:#fff;border-radius:12px 12px 0 0;padding:16px 20px;font-weight:700;font-size:16px">CallCatch</div>
  <div style="background:#fff;border:1px solid #d8e2f2;border-top:0;border-radius:0 0 12px 12px;padding:20px">
    <h1 style="margin:0 0 8px;font-size:20px;color:#0b1f3a">${escapeXml(input.title)}</h1>
    ${input.intro ? `<p style="margin:0 0 16px;color:#22427a;font-size:15px;line-height:1.5">${escapeXml(input.intro)}</p>` : ""}
    ${rowsHtml ? `<table style="border-collapse:collapse;width:100%;background:#eef3fa;border-radius:8px">${rowsHtml}</table>` : ""}
    ${cta}
    ${input.footnote ? `<p style="margin:16px 0 0;color:#7f9dcf;font-size:12px">${escapeXml(input.footnote)}</p>` : ""}
  </div>
  <p style="color:#7f9dcf;font-size:12px;margin:12px 4px">Sent by CallCatch · ${escapeXml(env.appUrl())}</p>
</div></body></html>`;
  const text = [
    input.title,
    input.intro ?? "",
    ...(input.rows ?? []).map((r) => `${r.label}: ${r.value}`),
    input.ctaUrl ? `${input.ctaLabel ?? "Open"}: ${input.ctaUrl}` : "",
    input.footnote ?? "",
  ]
    .filter(Boolean)
    .join("\n");
  return { html, text };
}

/** "(555) 123-4567" for SMS bodies; falls back to the raw value. */
export function prettyPhone(e164: string | null | undefined): string {
  return formatPhone(e164) || e164 || "unknown number";
}
