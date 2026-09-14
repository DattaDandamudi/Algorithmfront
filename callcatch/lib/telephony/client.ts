import twilio from "twilio";
import { env } from "@/lib/env";

let client: ReturnType<typeof twilio> | null = null;

/** Twilio REST client singleton (server-only). */
export function twilioClient() {
  if (!client) {
    client = twilio(env.required("TWILIO_ACCOUNT_SID"), env.required("TWILIO_AUTH_TOKEN"));
  }
  return client;
}

/** E.164 normalizer for US numbers: "(555) 123-4567" -> "+15551234567". */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return /^\+\d{8,15}$/.test(digits) ? digits : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

/**
 * Placeholders Twilio substitutes for a withheld caller ID on voice webhooks
 * (they spell ANONYMOUS / RESTRICTED / BLOCKED / UNKNOWN / UNAVAILABLE on a keypad).
 * They pass `normalizePhone` (8-15 digits) but are not real numbers.
 */
export const BLOCKED_CALLER_IDS: ReadonlySet<string> = new Set(["+266696687", "+7378742833", "+2562533", "+8656696", "+86282452253"]);

const BLOCKED_CALLER_WORDS = new Set(["anonymous", "restricted", "blocked", "unknown", "unavailable", "private"]);

/** True when the voice `From` carries no usable caller ID (empty, a word like "anonymous", or a placeholder). */
export function isBlockedCallerId(raw: string | null | undefined): boolean {
  if (!raw || !raw.trim()) return true;
  if (BLOCKED_CALLER_WORDS.has(raw.trim().toLowerCase())) return true;
  const e164 = normalizePhone(raw);
  return !e164 || BLOCKED_CALLER_IDS.has(e164);
}

/**
 * Like `normalizePhone` for a voice caller ID, but returns null for withheld caller ID and for
 * anything outside the US/Canada (+1) — numbers we can neither text back nor store as a contact.
 */
export function normalizeCallerId(raw: string | null | undefined): string | null {
  if (isBlockedCallerId(raw)) return null;
  const e164 = normalizePhone(raw);
  return e164 && /^\+1\d{10}$/.test(e164) ? e164 : null;
}

/** Pretty US format for UI: "+15551234567" -> "(555) 123-4567". */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

/** Public URL Twilio signed against (behind Vercel, request.url may differ from the public host). */
export function publicUrlFor(request: Request): string {
  const u = new URL(request.url);
  return `${env.appUrl()}${u.pathname}${u.search}`;
}

/**
 * Validates X-Twilio-Signature for a form-encoded webhook.
 * Returns the parsed params on success, or null when the signature is invalid.
 * Skips validation only when TWILIO_SKIP_SIGNATURE_VALIDATION=true (local dev).
 */
export async function validateTwilioRequest(request: Request): Promise<Record<string, string> | null> {
  const text = await request.text();
  const params: Record<string, string> = {};
  new URLSearchParams(text).forEach((v, k) => {
    params[k] = v;
  });
  if (env.bool("TWILIO_SKIP_SIGNATURE_VALIDATION")) return params;
  const signature = request.headers.get("x-twilio-signature") ?? "";
  const ok = twilio.validateRequest(env.required("TWILIO_AUTH_TOKEN"), signature, publicUrlFor(request), params);
  return ok ? params : null;
}

export type SendSmsInput = {
  to: string;
  from?: string; // defaults to TWILIO_NOTIFICATION_NUMBER
  body: string;
  statusCallback?: string;
};

/** Sends one SMS. Callers are responsible for consent/opt-out/quiet-hour checks. */
export async function sendSms(input: SendSmsInput): Promise<{ sid: string; segments: number }> {
  const from = input.from ?? env.required("TWILIO_NOTIFICATION_NUMBER");
  const msg = await twilioClient().messages.create({
    to: input.to,
    from,
    body: input.body,
    statusCallback: input.statusCallback ?? `${env.appUrl()}/api/twilio/sms/status`,
  });
  return { sid: msg.sid, segments: Number(msg.numSegments ?? 1) };
}

/** Empty TwiML response helper. */
export function twiml(xml: string): Response {
  return new Response(xml.startsWith("<?xml") ? xml : `<?xml version="1.0" encoding="UTF-8"?>${xml}`, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}
