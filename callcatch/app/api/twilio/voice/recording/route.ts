/**
 * POST /api/twilio/voice/recording — RecordingStatusCallback from the `<Record>` verb.
 *
 * Params: RecordingSid, RecordingUrl (no extension; append .mp3), RecordingStatus
 *         (in-progress|completed|absent|failed), RecordingDuration (seconds), CallSid,
 *         RecordingChannels, RecordingSource ("RecordVerb"), ErrorCode.
 *
 * Pipeline (in after()): download with Twilio basic auth → Deepgram Nova-3 transcript →
 * fast-model summary + emergency flag → calls row → owner alert with the summary →
 * emergency: voice call to the on-call/owner phone (+ safety text if the thread can be texted).
 */
import { after, type NextRequest } from "next/server";
import { createAdminSupabase } from "@/lib/db/client";
import { env } from "@/lib/env";
import { track } from "@/lib/events";
import { detectEmergency, safetyLine } from "@/lib/ai/emergency";
import { businessNameOf, emergencyTemplate, profileFromAccount, TRADES } from "@/lib/ai/prompts";
import { summarizeVoicemail } from "@/lib/ai/voicemail";
import { ensureLead, patchLead } from "@/lib/leads/store";
import { placeOwnerVoiceCall, prettyPhone, renderAlertEmail, sendOwnerAlert } from "@/lib/telephony/alerts";
import { validateTwilioRequest } from "@/lib/telephony/client";
import { sendCustomerMessage } from "@/lib/telephony/outbound";
import { transcribeRecording } from "@/lib/transcription/deepgram";
import { ZERO_USAGE } from "@/lib/ai/cost";

export const runtime = "nodejs";
export const maxDuration = 60;

async function processRecording(input: { callSid: string; recordingUrl: string; recordingSid: string; durationSec: number | null }): Promise<void> {
  const db = createAdminSupabase();
  const callRes = await db.from("calls").select("*").eq("twilio_call_sid", input.callSid).maybeSingle();
  const call = callRes.data;
  if (!call) {
    console.warn("[voice/recording] unknown call", input.callSid);
    return;
  }
  if (call.transcript !== null && call.recording_url === input.recordingUrl) return; // Twilio retry — already processed.
  if (call.status === "test") return;

  const accountRes = await db.from("accounts").select("*").eq("id", call.account_id).maybeSingle();
  const account = accountRes.data;
  if (!account) return;

  const transcription = await transcribeRecording(input.recordingUrl);
  const transcript = transcription.ok ? transcription.transcript : "";
  if (!transcription.ok) console.warn("[voice/recording] transcription unavailable", { callSid: input.callSid, reason: transcription.reason });

  const tradeLabel = TRADES[profileFromAccount(account).trade].label;
  const summary = transcript ? await summarizeVoicemail(transcript, tradeLabel) : null;
  const isEmergency = summary?.is_emergency ?? false;
  const duration = input.durationSec ?? (transcription.ok ? Math.round(transcription.durationSec ?? 0) : null);

  await db
    .from("calls")
    .update({
      status: "voicemail",
      recording_url: input.recordingUrl,
      recording_duration: duration,
      transcript: transcript || (transcription.ok ? "" : `[transcription unavailable: ${transcription.reason}]`),
      summary: summary?.summary || null,
      is_emergency: isEmergency,
    })
    .eq("id", call.id);

  const caller = prettyPhone(call.from_phone);
  const summaryText = summary?.summary || (transcript ? transcript.slice(0, 200) : `Voicemail (${duration ?? "?"}s) — transcript unavailable`);

  // Lead + emergency handling.
  let leadId: string | null = null;
  if (call.contact_id && (transcript || isEmergency)) {
    const contact = await db.from("contacts").select("*").eq("id", call.contact_id).maybeSingle();
    if (contact.data) {
      const conv = await db
        .from("conversations")
        .select("id")
        .eq("account_id", account.id)
        .eq("contact_id", contact.data.id)
        .in("status", ["open", "qualified"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const lead = await ensureLead(db, {
        accountId: account.id,
        conversationId: conv.data?.id ?? null,
        contactId: contact.data.id,
        phone: contact.data.phone,
        source: "missed_call",
        name: summary?.caller_name ?? contact.data.name,
        raw: { call_sid: call.twilio_call_sid, from: "voicemail" },
      });
      leadId = lead.id;
      await patchLead(db, lead, { issue: summary?.summary ?? null, urgency: summary?.urgency ?? null, name: summary?.caller_name ?? null });
      if (summary?.caller_name && !contact.data.name) await db.from("contacts").update({ name: summary.caller_name }).eq("id", contact.data.id);

      if (isEmergency && conv.data && !contact.data.opted_out) {
        const detected = detectEmergency(transcript);
        const body = emergencyTemplate(profileFromAccount(account), safetyLine(detected.isEmergency ? detected.kind : "other"));
        await sendCustomerMessage({ accountId: account.id, conversationId: conv.data.id, body, author: "system", usage: ZERO_USAGE("template") });
      }
    }
  }

  if (isEmergency) {
    await placeOwnerVoiceCall({
      account,
      say: `CallCatch emergency alert for ${businessNameOf(account)}. A caller at ${caller.replace(/\D/g, "").split("").join(" ")} left this voicemail: ${summaryText.slice(0, 220)}. Please call them back now.`,
      callId: call.id,
      leadId,
    });
    await track("emergency_detected", { call_id: call.id, via: "voicemail" }, { accountId: account.id });
  }

  const sms = `CallCatch: ${isEmergency ? "EMERGENCY voicemail" : "Voicemail"} from ${caller}: "${summaryText.slice(0, 150)}" — tap to call back.`;
  const email = renderAlertEmail({
    title: `${isEmergency ? "EMERGENCY voicemail" : "Voicemail"} from ${caller}`,
    intro: summaryText,
    rows: [
      { label: "Caller", value: caller },
      { label: "Length", value: duration != null ? `${duration}s` : "—" },
      { label: "Transcript", value: transcript || "(unavailable)" },
    ],
    ctaUrl: `${env.appUrl()}/calls`,
    ctaLabel: "Listen in CallCatch",
  });
  await sendOwnerAlert({
    account,
    kind: isEmergency ? "emergency" : "voicemail",
    sms: sms.slice(0, 320),
    email: { subject: `${isEmergency ? "EMERGENCY — " : ""}Voicemail from ${caller}`, ...email },
    callId: call.id,
    leadId,
  });
}

export async function POST(request: NextRequest) {
  const params = await validateTwilioRequest(request);
  if (!params) return new Response("invalid signature", { status: 403 });
  const status = (params.RecordingStatus ?? "").toLowerCase();
  const callSid = params.CallSid ?? "";
  const recordingUrl = params.RecordingUrl ?? "";
  const recordingSid = params.RecordingSid ?? "";
  if (status !== "completed" || !callSid || !recordingUrl) return new Response(null, { status: 204 });
  const durationSec = Number.isFinite(Number(params.RecordingDuration)) ? Number(params.RecordingDuration) : null;

  after(async () => {
    try {
      await processRecording({ callSid, recordingUrl, recordingSid, durationSec });
    } catch (err) {
      console.error("[voice/recording] processing failed", { callSid, err: err instanceof Error ? err.message : err });
    }
  });
  return new Response(null, { status: 204 });
}
