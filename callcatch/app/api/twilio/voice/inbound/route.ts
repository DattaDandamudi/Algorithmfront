/**
 * POST /api/twilio/voice/inbound — a forwarded call arrives on a customer number.
 *
 * Twilio voice webhook params we rely on (form-encoded, HMAC-SHA1 signed):
 *   CallSid        unique call id (idempotency key for `calls.twilio_call_sid`)
 *   From           caller in E.164 ("+266696687" / "anonymous" when caller id is blocked)
 *   To             the CallCatch number that was dialed
 *   ForwardedFrom  the customer's business line, when the carrier reports the forward
 *   CallStatus     "ringing" at this point
 *
 * Responds with TwiML in well under a second; text-back + owner alert run in `after()`.
 * The text-back is sent from here (not the recording callback) so it lands within ~10s.
 */
import { after, type NextRequest } from "next/server";
import { createAdminSupabase } from "@/lib/db/client";
import type { AccountRow, ContactRow, NumberRow } from "@/lib/db/types";
import { env } from "@/lib/env";
import { track } from "@/lib/events";
import { businessNameOf } from "@/lib/ai/prompts";
import { sendFirstTextback } from "@/lib/ai/engine";
import { prettyPhone, renderAlertEmail, sendOwnerAlert } from "@/lib/telephony/alerts";
import { normalizePhone, twiml, validateTwilioRequest } from "@/lib/telephony/client";
import { findOrCreateContact } from "@/lib/telephony/consent";
import { demoCallTwiml, startDemoConversation } from "@/lib/telephony/demo";
import { findOrCreateConversation } from "@/lib/telephony/inboundSms";
import { quietHoursLabel } from "@/lib/telephony/quietHours";
import { sayAndHangup, sayAndRecord } from "@/lib/telephony/twiml";

export const runtime = "nodejs";
export const maxDuration = 60;

function greetingFor(account: AccountRow, willText: boolean): string {
  const name = businessNameOf(account);
  return willText
    ? `Hi, you've reached ${name}. Sorry we missed your call — we'll text you in a few seconds. Leave a message after the tone, or just hang up.`
    : `Hi, you've reached ${name}. Sorry we missed your call. Leave a message after the tone and we'll call you right back.`;
}

async function afterInboundCall(input: {
  account: AccountRow;
  number: NumberRow;
  contact: ContactRow | null;
  callId: string;
  callSid: string;
  from: string | null;
  forwardedFrom: string | null;
}): Promise<void> {
  const { account, number, contact } = input;
  const db = createAdminSupabase();
  const willText = number.sms_enabled && account.status === "live" && Boolean(contact) && !contact?.opted_out;

  // 1. Text-back (target < 10s from the call reaching us).
  let status = number.sms_enabled ? "Text-back is off for this account." : "Text-back turns on once your number is verified.";
  if (contact?.opted_out) status = "This caller opted out of texts.";
  if (willText && contact) {
    try {
      const conversation = await findOrCreateConversation(db, account, contact, number, "missed_call");
      const sent = await sendFirstTextback(conversation.id);
      console.info("[voice/inbound] text-back", { callSid: input.callSid, conversationId: conversation.id, ...sent });
      status = sent.ok
        ? sent.queued
          ? `We'll text them back at ${quietHoursLabel(account).split("–")[0]} (quiet hours).`
          : "We texted them back."
        : sent.reason === "already_texted"
          ? "They already have an open text thread."
          : `Text-back skipped (${sent.reason ?? "unknown"}).`;
    } catch (err) {
      status = "Text-back failed — please call them.";
      console.error("[voice/inbound] text-back failed", { callSid: input.callSid, err: err instanceof Error ? err.message : err });
    }
  }

  // 2. Owner alert — always, from the notification number.
  const caller = prettyPhone(input.from);
  const sms = `CallCatch: Missed call from ${caller} — tap to call back. ${status}`;
  const email = renderAlertEmail({
    title: `Missed call from ${caller}`,
    intro: status,
    rows: [
      { label: "Caller", value: caller },
      { label: "Forwarded from", value: input.forwardedFrom ? prettyPhone(input.forwardedFrom) : "—" },
      { label: "Time", value: new Date().toLocaleString("en-US", { timeZone: account.timezone ?? "America/Chicago" }) },
    ],
    ctaUrl: `${env.appUrl()}/calls`,
    ctaLabel: "See the call",
    footnote: "If they leave a voicemail you'll get a second alert with the transcript.",
  });
  await sendOwnerAlert({ account, kind: "missed_call", sms, email: { subject: `Missed call from ${caller}`, ...email }, callId: input.callId });
}

export async function POST(request: NextRequest) {
  const params = await validateTwilioRequest(request);
  if (!params) return new Response("invalid signature", { status: 403 });

  const callSid = params.CallSid ?? "";
  const to = normalizePhone(params.To);
  const from = normalizePhone(params.From);
  const forwardedFrom = normalizePhone(params.ForwardedFrom);
  if (!callSid || !to) return twiml(sayAndHangup(["Sorry, this call could not be routed."]));

  const db = createAdminSupabase();
  const numberRes = await db.from("numbers").select("*").eq("phone_number", to).maybeSingle();
  const number = numberRes.data;
  if (!number) return twiml(sayAndHangup(["Sorry, this number isn't set up yet. Goodbye."]));

  // Public demo line pointed at this route instead of /api/demo/call.
  if (number.purpose === "demo") {
    after(async () => {
      const r = await startDemoConversation({ from: params.From ?? "", callSid });
      console.info("[voice/inbound] demo", { callSid, ...r });
    });
    return twiml(demoCallTwiml());
  }
  if (number.purpose === "notification") {
    return twiml(sayAndHangup(["This is the CallCatch notification line. For help, visit callcatch dot co. Goodbye."]));
  }

  const accountRes = await db.from("accounts").select("*").eq("id", number.account_id).maybeSingle();
  const account = accountRes.data;
  if (!account) return twiml(sayAndHangup(["Sorry, this number isn't set up yet. Goodbye."]));
  if (account.status === "cancelled") return twiml(sayAndHangup(["This number is no longer in service. Goodbye."]));

  // Module b's "Test my forwarding" places a call from our notification number to the business line;
  // when the carrier forwards it here we know forwarding works.
  const isTest = Boolean(from) && from === env.get("TWILIO_NOTIFICATION_NUMBER");

  let contact: ContactRow | null = null;
  if (!isTest && from) {
    try {
      contact = await findOrCreateContact(db, {
        accountId: account.id,
        phone: from,
        consentSource: "inbound_call",
        consentEvidence: { call_sid: callSid, called_at: new Date().toISOString(), to, forwarded_from: forwardedFrom },
      });
    } catch (err) {
      console.error("[voice/inbound] contact failed", err instanceof Error ? err.message : err);
    }
  }

  const inserted = await db
    .from("calls")
    .insert({
      account_id: account.id,
      number_id: number.id,
      contact_id: contact?.id ?? null,
      twilio_call_sid: callSid,
      from_phone: from ?? params.From ?? "anonymous",
      to_phone: to,
      forwarded_from: forwardedFrom,
      status: isTest ? "test" : "missed",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  let callId = inserted.data?.id ?? null;
  if (!callId) {
    // Twilio retried the webhook: reuse the existing row.
    const existing = await db.from("calls").select("id").eq("twilio_call_sid", callSid).maybeSingle();
    callId = existing.data?.id ?? null;
  }

  if (isTest) {
    after(async () => {
      await track("forwarding_tested", { call_sid: callSid, number_id: number.id, forwarded_from: forwardedFrom }, { accountId: account.id });
    });
    return twiml(sayAndHangup(["This is CallCatch. Your call forwarding works. Goodbye."]));
  }

  const willText = number.sms_enabled && account.status === "live" && Boolean(contact) && !contact?.opted_out;
  if (callId) {
    const id = callId;
    after(() => afterInboundCall({ account, number, contact, callId: id, callSid, from, forwardedFrom }));
  }

  return twiml(
    sayAndRecord({
      greeting: greetingFor(account, willText),
      recordingStatusCallback: `${env.appUrl()}/api/twilio/voice/recording`,
      maxLengthSeconds: 120,
      silenceTimeoutSeconds: 5,
      goodbye: willText ? "Thanks — check your texts. Goodbye." : "Thanks — we'll call you back shortly. Goodbye.",
    })
  );
}
