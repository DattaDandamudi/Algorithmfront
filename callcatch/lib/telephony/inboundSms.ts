/**
 * Shared inbound-SMS handler for customer numbers and the demo number.
 *
 * Twilio params (application/x-www-form-urlencoded, signature-validated by the route):
 *   MessageSid  — unique id of the inbound message (idempotency key)
 *   From / To   — E.164 sender / our number
 *   Body        — message text (may be empty for MMS)
 *   NumSegments — carrier segments used inbound (billing)
 *   NumMedia    — count of attachments (we note them, never fetch them)
 *
 * Returns the synchronous TwiML plus a follow-up thunk the route hands to `after()`.
 */
import { createAdminSupabase, type Db } from "@/lib/db/client";
import type { AccountRow, ContactRow, ConversationRow, NumberRow } from "@/lib/db/types";
import { businessNameOf, DEMO_PROFILE } from "@/lib/ai/prompts";
import { runAiTurn } from "@/lib/ai/engine";
import { classifyKeyword, findOrCreateContact, helpReply, setOptedOut, startReply, stopReply, twilioHandlesOptOutKeywords } from "@/lib/telephony/consent";
import { normalizePhone } from "@/lib/telephony/client";
import { emptyResponse, messageResponse } from "@/lib/telephony/twiml";
import { track } from "@/lib/events";

export type InboundSmsParams = Record<string, string>;

export type InboundSmsOutcome = {
  twiml: string;
  followUp?: () => Promise<void>;
  status: "ignored" | "stop" | "start" | "help" | "message" | "duplicate";
};

/** Latest usable conversation for the contact on this number, else a new `inbound_sms` one. */
export async function findOrCreateConversation(
  db: Db,
  account: AccountRow,
  contact: ContactRow,
  number: NumberRow,
  source: ConversationRow["source"] = "inbound_sms"
): Promise<ConversationRow> {
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const existing = await db
    .from("conversations")
    .select("*")
    .eq("account_id", account.id)
    .eq("contact_id", contact.id)
    .in("status", ["open", "qualified", "booked"])
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing.data) return existing.data;
  const created = await db
    .from("conversations")
    .insert({ account_id: account.id, contact_id: contact.id, number_id: number.id, channel: "sms", source, status: "open" })
    .select("*")
    .single();
  if (created.error || !created.data) throw new Error(`conversations insert failed: ${created.error?.message ?? "unknown"}`);
  return created.data;
}

export async function handleInboundSms(params: InboundSmsParams, number: NumberRow): Promise<InboundSmsOutcome> {
  const db = createAdminSupabase();
  const from = normalizePhone(params.From);
  const body = (params.Body ?? "").trim();
  const messageSid = params.MessageSid ?? "";
  const segments = Math.max(1, Number(params.NumSegments ?? 1) || 1);
  const numMedia = Number(params.NumMedia ?? 0) || 0;
  if (!from || !messageSid) return { twiml: emptyResponse(), status: "ignored" };

  const accountRes = await db.from("accounts").select("*").eq("id", number.account_id).maybeSingle();
  const account = accountRes.data;
  if (!account) return { twiml: emptyResponse(), status: "ignored" };
  const isDemo = number.purpose === "demo";
  const businessName = isDemo ? DEMO_PROFILE.businessName : businessNameOf(account);

  // Idempotency: Twilio retries on non-2xx; never double-insert a message.
  const dup = await db.from("messages").select("id").eq("twilio_sid", messageSid).maybeSingle();
  if (dup.data) return { twiml: emptyResponse(), status: "duplicate" };

  const contact = await findOrCreateContact(db, {
    accountId: account.id,
    phone: from,
    // The customer initiated by texting the business number; evidence keeps the message sid.
    consentSource: "inbound_sms",
    consentEvidence: { type: "inbound_sms", message_sid: messageSid, to: number.phone_number, at: new Date().toISOString() },
  });

  const keyword = classifyKeyword(body);
  const selfReply = !twilioHandlesOptOutKeywords();

  if (keyword === "stop") {
    await setOptedOut(db, contact.id, true);
    const conv = await findOrCreateConversation(db, account, contact, number);
    await db.from("messages").insert({
      conversation_id: conv.id,
      account_id: account.id,
      direction: "in",
      author: "contact",
      body: body || "STOP",
      twilio_sid: messageSid,
      status: "received",
      segments,
    });
    await db.from("conversations").update({ status: "closed", ai_paused: true, last_message_at: new Date().toISOString() }).eq("id", conv.id);
    await track("contact_opted_out", { contact_id: contact.id, via: "sms_stop" }, { accountId: account.id });
    return { twiml: selfReply ? messageResponse(stopReply(businessName)) : emptyResponse(), status: "stop" };
  }

  if (keyword === "start") {
    if (contact.opted_out) await setOptedOut(db, contact.id, false);
    await track("contact_opted_in", { contact_id: contact.id, via: "sms_start" }, { accountId: account.id });
    return { twiml: selfReply ? messageResponse(startReply(businessName)) : emptyResponse(), status: "start" };
  }

  if (keyword === "help") {
    return { twiml: selfReply ? messageResponse(helpReply(businessName)) : emptyResponse(), status: "help" };
  }

  if (contact.opted_out) {
    // Opted-out contacts can still text us; we store nothing and never reply.
    return { twiml: emptyResponse(), status: "ignored" };
  }

  const conversation = await findOrCreateConversation(db, account, contact, number);
  const text = body || (numMedia > 0 ? `[${numMedia} attachment${numMedia > 1 ? "s" : ""} received]` : "");
  if (!text) return { twiml: emptyResponse(), status: "ignored" };

  const inserted = await db.from("messages").insert({
    conversation_id: conversation.id,
    account_id: account.id,
    direction: "in",
    author: "contact",
    body: text,
    twilio_sid: messageSid,
    status: "received",
    segments,
  });
  if (inserted.error) {
    console.error("[sms/inbound] message insert failed", inserted.error.message);
    return { twiml: emptyResponse(), status: "ignored" };
  }
  await db
    .from("conversations")
    .update({ last_message_at: new Date().toISOString(), ...(conversation.status === "closed" ? { status: "open" } : {}) })
    .eq("id", conversation.id);

  const shouldRunAi = !conversation.ai_paused && (isDemo || account.status === "live");
  return {
    twiml: emptyResponse(),
    status: "message",
    followUp: shouldRunAi
      ? async () => {
          const result = await runAiTurn(conversation.id);
          console.info("[sms/inbound] ai turn", { conversationId: conversation.id, ...result });
        }
      : undefined,
  };
}
