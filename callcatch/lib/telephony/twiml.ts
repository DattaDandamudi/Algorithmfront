/**
 * TwiML builders for the voice/SMS webhooks.
 *
 * Every string interpolated into TwiML is XML-escaped here so a caller id or a
 * business name containing `&` or `<` can never break the document Twilio parses.
 * Amazon Polly voices are used for the greeting (`Polly.Joanna` = US English, female).
 */

export const SAY_VOICE = "Polly.Joanna";

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function say(text: string): string {
  return `<Say voice="${SAY_VOICE}">${escapeXml(text)}</Say>`;
}

/** `<Response/>` — the correct reply to an inbound SMS when we send nothing back synchronously. */
export function emptyResponse(): string {
  return "<Response></Response>";
}

/** Reply to an inbound SMS synchronously with `<Message>` (used for HELP/START when Twilio does not auto-reply). */
export function messageResponse(body: string): string {
  return `<Response><Message>${escapeXml(body)}</Message></Response>`;
}

/** Speak one or more lines then hang up. */
export function sayAndHangup(lines: string[]): string {
  return `<Response>${lines.map(say).join("")}<Hangup/></Response>`;
}

export type SayAndRecordOptions = {
  greeting: string;
  /** Absolute URL Twilio POSTs to when the recording is ready (RecordingStatusCallback). */
  recordingStatusCallback: string;
  /** Seconds. Twilio max is 14400; voicemails are capped at 120s per spec. */
  maxLengthSeconds?: number;
  /** Seconds of silence that end the recording. */
  silenceTimeoutSeconds?: number;
  /** Line spoken after the recording finishes (or the caller presses a key). */
  goodbye?: string;
};

/**
 * Missed-call greeting + voicemail recording.
 *
 * `<Record>` attributes we rely on:
 *  - maxLength: hard cap on the voicemail length.
 *  - playBeep: the caller hears a beep so they know when to talk.
 *  - timeout: silence (seconds) that ends the recording.
 *  - trim="trim-silence": Twilio removes leading/trailing silence before storing.
 *  - recordingStatusCallback + recordingStatusCallbackEvent="completed": Twilio POSTs
 *    RecordingSid/RecordingUrl/RecordingDuration/CallSid to /api/twilio/voice/recording once
 *    the file is available (separate from the call's own status callback).
 *  - transcribe is intentionally NOT set: we transcribe with Deepgram ourselves.
 *  - No `action` attribute, so Twilio continues to the following verbs after the recording.
 */
export function sayAndRecord(opts: SayAndRecordOptions): string {
  const maxLength = Math.min(Math.max(opts.maxLengthSeconds ?? 120, 5), 600);
  const timeout = Math.min(Math.max(opts.silenceTimeoutSeconds ?? 5, 1), 30);
  const goodbye = opts.goodbye ?? "Thanks. We'll be in touch shortly. Goodbye.";
  return (
    "<Response>" +
    say(opts.greeting) +
    `<Record maxLength="${maxLength}" playBeep="true" timeout="${timeout}" trim="trim-silence" ` +
    `recordingStatusCallback="${escapeXml(opts.recordingStatusCallback)}" ` +
    `recordingStatusCallbackMethod="POST" recordingStatusCallbackEvent="completed"/>` +
    say(goodbye) +
    "<Hangup/></Response>"
  );
}

/** TwiML for an outbound call we place (emergency owner call): speak the message twice, then hang up. */
export function sayTwiceAndHangup(text: string): string {
  return `<Response>${say(text)}<Pause length="1"/>${say("Once more. " + text)}<Hangup/></Response>`;
}

/** Full XML document (Twilio accepts both, but the `twiml()` helper adds the prolog if missing). */
export function document(inner: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>${inner}`;
}
