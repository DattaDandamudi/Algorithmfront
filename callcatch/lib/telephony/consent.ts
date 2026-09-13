/**
 * SMS consent + opt-out keyword handling (CTIA / Twilio compliant).
 *
 * Twilio's built-in "Advanced Opt-Out" replies to STOP/START/HELP on US toll-free and
 * long-code numbers automatically and blocks further sends to opted-out handsets. We still
 * receive the inbound keyword on the webhook, so we mirror the state into `contacts.opted_out`.
 * Set TWILIO_HANDLES_OPTOUT_KEYWORDS=false only if opt-out management is disabled on the
 * number/messaging service — then we send the confirmation replies ourselves.
 */
import type { Db } from "@/lib/db/client";
import type { ConsentSource, ContactRow, Json } from "@/lib/db/types";
import { env } from "@/lib/env";

export const STOP_KEYWORDS = ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"] as const;
export const START_KEYWORDS = ["START", "UNSTOP", "YES"] as const;
export const HELP_KEYWORDS = ["HELP", "INFO"] as const;

export type KeywordKind = "stop" | "start" | "help" | null;

/** Exact-keyword match on the whole message (case-insensitive, trailing punctuation ignored). */
export function classifyKeyword(body: string | null | undefined): KeywordKind {
  if (!body) return null;
  const word = body.trim().toUpperCase().replace(/[.!?,;:\s]+$/g, "");
  if (!/^[A-Z]+$/.test(word)) return null;
  if ((STOP_KEYWORDS as readonly string[]).includes(word)) return "stop";
  if ((START_KEYWORDS as readonly string[]).includes(word)) return "start";
  if ((HELP_KEYWORDS as readonly string[]).includes(word)) return "help";
  return null;
}

export function twilioHandlesOptOutKeywords(): boolean {
  return env.bool("TWILIO_HANDLES_OPTOUT_KEYWORDS", true);
}

export function stopReply(businessName: string): string {
  return `${businessName}: You have been unsubscribed and will not receive further messages. Reply START to resubscribe.`;
}

export function startReply(businessName: string): string {
  return `${businessName}: You are resubscribed to messages from this number. Reply STOP to opt out, HELP for help.`;
}

export function helpReply(businessName: string): string {
  return `${businessName}: This number texts back missed calls and lead requests. Msg&data rates may apply. Reply STOP to opt out. Questions: ${env.appUrl()}/sms-terms`;
}

/** The disclosure that must appear in the first outbound message of every conversation. */
export const STOP_DISCLOSURE = "Reply STOP to opt out.";

export function hasStopDisclosure(text: string): boolean {
  return /\bstop\b/i.test(text) && /opt[\s-]?out|unsubscribe|cancel/i.test(text);
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
