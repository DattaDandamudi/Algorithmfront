/**
 * Public demo line (TWILIO_DEMO_NUMBER). Voice: greeting + hang up. Then a text-back demo
 * thread from the demo number using the engine with the fixed DEMO_PROFILE (3 AI turns,
 * closing with a /signup link). Contacts/conversations live under the account that owns the
 * `numbers` row with purpose='demo' (our own internal account).
 */
import { createAdminSupabase, type Db } from "@/lib/db/client";
import type { NumberRow } from "@/lib/db/types";
import { env } from "@/lib/env";
import { track } from "@/lib/events";
import { sendCapiEvent } from "@/lib/meta/capi";
import { sendFirstTextback } from "@/lib/ai/engine";
import { findOrCreateContact } from "@/lib/telephony/consent";
import { normalizePhone } from "@/lib/telephony/client";
import { sayAndHangup } from "@/lib/telephony/twiml";

/** Leads with CallCatch (the verified owner of the demo number); the fictional business only appears in the role-play text. */
import { DEMO_GREETING } from "@/lib/telephony/demoCopy";
export { DEMO_GREETING };

export function demoCallTwiml(): string {
  return sayAndHangup(DEMO_GREETING);
}

export async function findDemoNumber(db: Db = createAdminSupabase()): Promise<NumberRow | null> {
  const demoPhone = env.get("TWILIO_DEMO_NUMBER");
  if (demoPhone) {
    const byPhone = await db.from("numbers").select("*").eq("phone_number", demoPhone).maybeSingle();
    if (byPhone.data) return byPhone.data;
  }
  const byPurpose = await db.from("numbers").select("*").eq("purpose", "demo").order("created_at", { ascending: true }).limit(1).maybeSingle();
  return byPurpose.data ?? null;
}

/**
 * Creates the demo contact + conversation for the caller and sends the first text-back.
 * Fires Meta CAPI `Lead` (event id = call sid) and tracks `demo_call`.
 */
export async function startDemoConversation(input: { from: string; callSid: string }): Promise<{ ok: boolean; reason?: string; conversationId?: string }> {
  const db = createAdminSupabase();
  const from = normalizePhone(input.from);
  if (!from) return { ok: false, reason: "bad_from" };
  const number = await findDemoNumber(db);
  if (!number) {
    console.error("[demo] no numbers row for the demo number; seed one with purpose='demo'");
    return { ok: false, reason: "demo_number_not_configured" };
  }

  await track("demo_call", { call_sid: input.callSid, from_suffix: from.slice(-4) }, { accountId: number.account_id });
  await sendCapiEvent({
    eventName: "Lead",
    eventId: `demo-call-${input.callSid}`,
    phone: from,
    sourceUrl: `${env.appUrl()}/demo`,
    customData: { source: "demo_line" },
  });

  if (!number.sms_enabled) return { ok: false, reason: "demo_number_not_verified" };

  const contact = await findOrCreateContact(db, {
    accountId: number.account_id,
    phone: from,
    consentSource: "inbound_call",
    consentEvidence: { type: "demo_call", call_sid: input.callSid, to: number.phone_number, at: new Date().toISOString() },
  });
  if (contact.opted_out) return { ok: false, reason: "opted_out" };

  // Fresh demo thread per call so the 3-turn script starts over; older demo threads are closed.
  await db
    .from("conversations")
    .update({ status: "closed" })
    .eq("account_id", number.account_id)
    .eq("contact_id", contact.id)
    .eq("number_id", number.id)
    .in("status", ["open", "qualified"]);
  const conv = await db
    .from("conversations")
    .insert({ account_id: number.account_id, contact_id: contact.id, number_id: number.id, channel: "sms", source: "missed_call", status: "open" })
    .select("id")
    .single();
  if (conv.error || !conv.data) return { ok: false, reason: "conversation_insert_failed" };

  const sent = await sendFirstTextback(conv.data.id);
  return { ok: sent.ok, reason: sent.ok ? undefined : sent.reason, conversationId: conv.data.id };
}
