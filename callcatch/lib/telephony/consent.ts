/**
 * SMS consent + opt-out keyword handling (CTIA / Twilio compliant).
 *
 * Twilio's built-in "Advanced Opt-Out" replies to STOP/START/HELP on US toll-free and
 * long-code numbers automatically and blocks further sends to opted-out handsets. We still
 * receive the inbound keyword on the webhook, so we mirror the state into `contacts.opted_out`.
 *
 * TWILIO_HANDLES_OPTOUT_KEYWORDS (default true): when true we send no confirmation of our own
 * for the keywords Twilio handles (the customer gets Twilio's carrier-standard reply). Twilio's
 * default handling cannot be disabled on a standalone number; set the variable to `false` only
 * when the number sits in a Messaging Service with Advanced Opt-Out turned off — then the
 * `stopReply`/`startReply`/`helpReply` texts below are sent (they must match /sms-terms §6-7).
 *
 * Natural-language revocations ("please stop texting me") are never seen by Twilio's keyword
 * filter, so the inbound handler detects them itself (see `looksLikeOptOut` /
 * `mentionsOptOutTrigger` + lib/ai/optOut.ts) and always sends the single confirmation.
 */
import type { Db } from "@/lib/db/client";
import type { ConsentSource, ContactRow, Json } from "@/lib/db/types";
import { env } from "@/lib/env";

/** Keywords Twilio's Advanced Opt-Out handles by itself (carrier-standard confirmation, handset blocked). */
export const TWILIO_STOP_KEYWORDS = ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"] as const;
/** FCC-named revocation words we honor ourselves (we always send the confirmation for these). */
export const EXTRA_STOP_KEYWORDS = ["REVOKE", "OPTOUT", "REMOVE"] as const;
export const STOP_KEYWORDS = [...TWILIO_STOP_KEYWORDS, ...EXTRA_STOP_KEYWORDS] as const;
export const START_KEYWORDS = ["START", "UNSTOP", "YES"] as const;
export const HELP_KEYWORDS = ["HELP", "INFO"] as const;

export type KeywordKind = "stop" | "start" | "help" | null;

function keywordOf(body: string | null | undefined): string | null {
  if (!body) return null;
  const word = body.trim().toUpperCase().replace(/[.!?,;:\s]+$/g, "");
  return /^[A-Z]+$/.test(word) ? word : null;
}

/** Exact-keyword match on the whole message (case-insensitive, trailing punctuation ignored). */
export function classifyKeyword(body: string | null | undefined): KeywordKind {
  const word = keywordOf(body);
  if (!word) return null;
  if ((STOP_KEYWORDS as readonly string[]).includes(word)) return "stop";
  if ((START_KEYWORDS as readonly string[]).includes(word)) return "start";
  if ((HELP_KEYWORDS as readonly string[]).includes(word)) return "help";
  return null;
}

/** True when the message is one of the keywords Twilio's own opt-out handling replies to. */
export function isTwilioHandledKeyword(body: string | null | undefined): boolean {
  const word = keywordOf(body);
  if (!word) return false;
  return (
    (TWILIO_STOP_KEYWORDS as readonly string[]).includes(word) ||
    (START_KEYWORDS as readonly string[]).includes(word) ||
    (HELP_KEYWORDS as readonly string[]).includes(word)
  );
}

export function twilioHandlesOptOutKeywords(): boolean {
  return env.bool("TWILIO_HANDLES_OPTOUT_KEYWORDS", true);
}

export function supportEmail(): string {
  return env.get("NEXT_PUBLIC_SUPPORT_EMAIL", "support@callcatch.co") ?? "support@callcatch.co";
}

/** Our own STOP confirmation (also used for natural-language opt-outs). Wording matches /sms-terms §6. */
export function stopReply(businessName: string): string {
  return `${businessName}: You have been unsubscribed and will not receive further messages from this number. Reply START to resubscribe.`;
}

/** Wording matches /sms-terms §6. */
export function startReply(businessName: string): string {
  return `${businessName}: You are resubscribed to messages from this number. Reply STOP to opt out, HELP for help.`;
}

/** Wording matches /sms-terms §7. */
export function helpReply(businessName: string): string {
  return `${businessName} texts are powered by CallCatch. For help email ${supportEmail()} or visit ${env.appUrl()}/sms-terms. Msg&data rates may apply. Reply STOP to opt out.`;
}

// ---------------------------------------------------------------------------
// First-message disclosures (spec §4.4: business name + automated assistant + STOP)
// ---------------------------------------------------------------------------

/** The opt-out line that must appear in the first outbound message of every conversation. */
export const STOP_DISCLOSURE = "Reply STOP to opt out.";

/** The bot disclosure wording shared by the templates, the sanitizer and the SMS Terms samples. */
export const AI_DISCLOSURE = "the automated assistant for";

/** True only for the exact opt-out phrase (case-insensitive) — the word "stop" alone is not a disclosure. */
export function hasStopDisclosure(text: string): boolean {
  return /\breply\s+stop\s+to\s+opt[\s-]?out\b/i.test(text);
}

/** True when the text identifies itself as automated ("automated assistant", "AI assistant", "automated system"). */
export function hasAiDisclosure(text: string): boolean {
  return /\b(automated|virtual|ai)\s+(assistant|system|front\s+desk)\b/i.test(text) || /\bcallcatch demo\b/i.test(text);
}

// ---------------------------------------------------------------------------
// Natural-language opt-out (47 CFR 64.1200(a)(10): revocation "in any reasonable manner")
// ---------------------------------------------------------------------------

/** Definite revocations — honored without consulting the model. */
const NL_OPT_OUT_DEFINITE: RegExp[] = [
  // "stop texting me", "please don't message me again", "do not contact me", "no more texts"
  /\b(stop|quit|cease|don'?t|do not|never|no more|no longer)\b[^.!?\n]{0,30}\b(texts?|txts?|texting|sms|messages?|messaging|msgs?|contact(ing)?)\b/i,
  /\b(unsubscribe|opt[\s-]?out|revoke (my )?consent|remove me|take me off|leave me alone)\b/i,
  /\bnot interested,? (please )?(stop|don'?t)\b/i,
];

/**
 * Loose triggers: phrasings that *might* be a revocation ("stop", "wrong number", "remove me").
 * When one matches and no definite pattern did, the inbound handler asks the fast model.
 */
const NL_OPT_OUT_TRIGGER = /\b(stop|don'?t text|do not text|unsubscribe|remove me|leave me alone|wrong number|no more)\b/i;

/** Deterministic opt-out check for free-text messages (keywords are handled by `classifyKeyword`). */
export function looksLikeOptOut(body: string | null | undefined): boolean {
  if (!body) return false;
  return NL_OPT_OUT_DEFINITE.some((re) => re.test(body));
}

/** True when the text contains a phrase worth a fast-model opt-out check. */
export function mentionsOptOutTrigger(body: string | null | undefined): boolean {
  if (!body) return false;
  return NL_OPT_OUT_TRIGGER.test(body);
}

/** "don't text me, just call" — the customer still wants the business to reach them by phone. */
export function asksForCallInstead(body: string | null | undefined): boolean {
  if (!body) return false;
  return /\b(call|phone|ring)\b/i.test(body);
}

export type EnsureContactInput = {
  accountId: string;
  phone: string; // E.164
  consentSource: ConsentSource;
  consentEvidence: Record<string, Json | undefined>;
  name?: string | null;
  email?: string | null;
  address?: string | null;
};

/**
 * Finds the contact for (account, phone) or creates it with the consent evidence.
 * Existing contacts keep their original consent record; missing name/email/address are filled in.
 */
export async function findOrCreateContact(db: Db, input: EnsureContactInput): Promise<ContactRow> {
  const existing = await db
    .from("contacts")
    .select("*")
    .eq("account_id", input.accountId)
    .eq("phone", input.phone)
    .maybeSingle();
  if (existing.error) throw new Error(`contacts lookup failed: ${existing.error.message}`);
  if (existing.data) {
    const patch: { name?: string; email?: string; address?: string } = {};
    if (!existing.data.name && input.name) patch.name = input.name;
    if (!existing.data.email && input.email) patch.email = input.email;
    if (!existing.data.address && input.address) patch.address = input.address;
    if (Object.keys(patch).length > 0) {
      const updated = await db.from("contacts").update(patch).eq("id", existing.data.id).select("*").single();
      if (!updated.error && updated.data) return updated.data;
    }
    return existing.data;
  }
  const evidence: { [key: string]: Json | undefined } = { ...input.consentEvidence, recorded_at: new Date().toISOString() };
  const inserted = await db
    .from("contacts")
    .insert({
      account_id: input.accountId,
      phone: input.phone,
      name: input.name ?? null,
      email: input.email ?? null,
      address: input.address ?? null,
      consent_source: input.consentSource,
      consent_evidence: evidence,
    })
    .select("*")
    .single();
  if (inserted.error) {
    // Race: another webhook inserted the same contact a moment ago.
    const retry = await db
      .from("contacts")
      .select("*")
      .eq("account_id", input.accountId)
      .eq("phone", input.phone)
      .maybeSingle();
    if (retry.data) return retry.data;
    throw new Error(`contacts insert failed: ${inserted.error.message}`);
  }
  return inserted.data;
}

export async function setOptedOut(db: Db, contactId: string, optedOut: boolean): Promise<void> {
  const { error } = await db
    .from("contacts")
    .update({ opted_out: optedOut, opted_out_at: optedOut ? new Date().toISOString() : null })
    .eq("id", contactId);
  if (error) throw new Error(`contacts opt-out update failed: ${error.message}`);
}
