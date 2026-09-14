/**
 * Shared inbound-SMS handler for customer numbers and the demo number.
 *
 * Twilio params (application/x-www-form-urlencoded, signature-validated by the route):
 *   MessageSid  — unique id of the inbound message (idempotency key)
 *   From / To   — E.164 sender / our number
 *   Body        — message text (may be empty for MMS)
 *   NumSegments — carrier segments used inbound (billing)
 *   NumMedia    — count of attachments (we note them, never fetch them)
 *   OptOutType  — "STOP" | "START" | "HELP" when Twilio's Advanced Opt-Out handled the keyword
 *
 * Rules (spec §4.4 + review):
 *   - A customer message is never swallowed: every text (including keywords) is stored on the
 *     contact's latest thread, terminal or not; a reply to a closed/lost thread reopens THAT
 *     thread (no cap reset, owner's ai_paused preserved) instead of starting a new one.
 *   - Opt-out is honored from exact keywords AND plain language ("please stop texting me"):
 *     contact opted out, thread closed + AI paused, one confirmation sent.
 *   - START/UNSTOP/YES only mean "resubscribe" when the contact is actually opted out (or Twilio
 *     says so); otherwise "Yes" is an ordinary reply and the assistant answers it.
 *   - When the assistant will not answer (AI paused / owner took over, account not live, turn
 *     cap reached, contact opted out) the owner is alerted instead (throttled per thread).
 *
 * Returns the synchronous TwiML plus a follow-up thunk the route hands to `after()`.
 */
import { createAdminSupabase, type Db } from "@/lib/db/client";
import type { AccountRow, ContactRow, ConversationRow, NumberRow } from "@/lib/db/types";
import { env } from "@/lib/env";
import { businessNameOf, DEMO_SENDER_NAME } from "@/lib/ai/prompts";
import { runAiTurn } from "@/lib/ai/engine";
import { detectNaturalLanguageOptOut } from "@/lib/ai/optOut";
import { prettyPhone, renderAlertEmail, sendOwnerAlert } from "@/lib/telephony/alerts";
import {
  asksForCallInstead,
  classifyKeyword,
  findOrCreateContact,
  helpReply,
  isTwilioHandledKeyword,
  setOptedOut,
  startReply,
  stopReply,
  twilioHandlesOptOutKeywords,
} from "@/lib/telephony/consent";
import { normalizePhone } from "@/lib/telephony/client";
import { emptyResponse, messageResponse } from "@/lib/telephony/twiml";
import { track } from "@/lib/events";

export type InboundSmsParams = Record<string, string>;

export type InboundSmsOutcome = {
  twiml: string;
  followUp?: () => Promise<void>;
  status: "ignored" | "stop" | "start" | "help" | "message" | "duplicate";
};

/** At most one "customer replied" owner alert per thread per this window. */
const REPLY_ALERT_THROTTLE_MS = 10 * 60_000;

/**
 * Latest usable conversation for the contact on this number, else a new `inbound_sms` one.
 * By default only live threads (open/qualified/booked) are reused, so a new missed call after
 * a closed thread starts fresh; `includeTerminal` also returns closed/lost threads so an inbound
 * text lands in the thread the customer is replying to.
 */
export async function findOrCreateConversation(
  db: Db,
  account: AccountRow,
  contact: ContactRow,
  number: NumberRow,
  source: ConversationRow["source"] = "inbound_sms",
  opts: { includeTerminal?: boolean } = {}
): Promise<ConversationRow> {
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  let query = db.from("conversations").select("*").eq("account_id", account.id).eq("contact_id", contact.id).gte("created_at", since);
  if (!opts.includeTerminal) query = query.in("status", ["open", "qualified", "booked"]);
  const existing = await query.order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (existing.data) return existing.data;
  const created = await db
    .from("conversations")
    .insert({ account_id: account.id, contact_id: contact.id, number_id: number.id, channel: "sms", source, status: "open" })
    .select("*")
    .single();
  if (created.error || !created.data) throw new Error(`conversations insert failed: ${created.error?.message ?? "unknown"}`);
  return created.data;
}

type StoreInput = {
  db: Db;
  account: AccountRow;
  conversation: ConversationRow;
  body: string;
  messageSid: string;
  segments: number;
};

/** Stores the inbound row; returns false when the insert failed (logged). */
async function storeInbound(input: StoreInput): Promise<boolean> {
  const inserted = await input.db.from("messages").insert({
    conversation_id: input.conversation.id,
    account_id: input.account.id,
    direction: "in",
    author: "contact",
    body: input.body,
    twilio_sid: input.messageSid,
    status: "received",
    segments: input.segments,
  });
  if (inserted.error) {
    console.error("[sms/inbound] message insert failed", inserted.error.message);
    return false;
  }
  return true;
}

/** True when another inbound text landed in this thread within the throttle window (skip the alert). */
async function recentlyAlertedBurst(db: Db, conversationId: string, excludeSid: string): Promise<boolean> {
  const prev = await db
    .from("messages")
    .select("created_at")
    .eq("conversation_id", conversationId)
    .eq("direction", "in")
    .neq("twilio_sid", excludeSid)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return Boolean(prev.data && Date.now() - new Date(prev.data.created_at).getTime() < REPLY_ALERT_THROTTLE_MS);
}

type ReplyAlertInput = {
  db: Db;
  account: AccountRow;
  contact: ContactRow;
  conversation: ConversationRow;
  text: string;
  messageSid: string;
  /** Short reason the assistant is not answering, e.g. "AI is paused on this thread". */
  why: string;
  /** Extra line for the owner (e.g. the contact opted out of texts). */
  note?: string;
};

/**
 * "Customer replied and the assistant won't answer" alert (SMS + email), at most one per thread
 * per 10 minutes. This is how a tradesperson on a job site learns that a thread they took over
 * (or that hit its turn cap) needs them.
 */
async function alertOwnerAboutReply(input: ReplyAlertInput): Promise<void> {
  const { db, account, contact, conversation, text } = input;
  if (await recentlyAlertedBurst(db, conversation.id, input.messageSid)) return;
  const who = contact.name ?? prettyPhone(contact.phone);
  const phone = prettyPhone(contact.phone);
  const threadUrl = `${env.appUrl()}/inbox/${conversation.id}`;
  const headline = `${who} replied - ${input.why}`;
  const snippet = text.length > 140 ? `${text.slice(0, 137)}...` : text;
  const sms = [`CallCatch: ${headline}.`, input.note ?? null, `"${snippet}"`, `Call ${phone} or reply at ${threadUrl}`].filter(Boolean).join(" ");
  const email = renderAlertEmail({
    title: headline,
    intro: input.note ? `${input.note} They wrote:` : "They wrote:",
    rows: [
      { label: "Message", value: text.slice(0, 1000) },
      { label: "Phone", value: phone },
      { label: "Why you", value: input.why },
    ],
    ctaUrl: threadUrl,
    ctaLabel: "Open the thread",
  });
  await sendOwnerAlert({ account, kind: "customer_reply", sms: sms.slice(0, 320), email: { subject: headline, ...email } });
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
  // Keyword replies name the actual sender: the demo number is verified for CallCatch, not the fictional business.
  const businessName = isDemo ? DEMO_SENDER_NAME : businessNameOf(account);

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

  const text = body || (numMedia > 0 ? `[${numMedia} attachment${numMedia > 1 ? "s" : ""} received]` : "");
  const keyword = classifyKeyword(body);
  const twilioOptOutType = (params.OptOutType ?? "").toUpperCase();
  // Twilio already replied to the keywords it handles; for everything else we confirm ourselves.
  const twilioReplied = twilioHandlesOptOutKeywords() && isTwilioHandledKeyword(body);
  // Always the thread the customer is replying to, even if the owner closed it.
  const conversation = await findOrCreateConversation(db, account, contact, number, "inbound_sms", { includeTerminal: true });

  const optOut = async (via: "sms_stop" | "sms_natural_language"): Promise<InboundSmsOutcome> => {
    await setOptedOut(db, contact.id, true);
    await storeInbound({ db, account, conversation, body: text || "STOP", messageSid, segments });
    await db.from("conversations").update({ status: "closed", ai_paused: true, last_message_at: new Date().toISOString() }).eq("id", conversation.id);
    await track("contact_opted_out", { contact_id: contact.id, via, conversation_id: conversation.id }, { accountId: account.id });
    const wantsCall = via === "sms_natural_language" && !isDemo && asksForCallInstead(text);
    return {
      // The single confirmation the FCC rule permits; sent synchronously, so quiet hours cannot hold it.
      twiml: twilioReplied ? emptyResponse() : messageResponse(stopReply(businessName)),
      status: "stop",
      followUp: wantsCall
        ? async () => {
            await sendOwnerAlert({
              account,
              kind: "escalation",
              sms: `CallCatch: ${prettyPhone(from)} asked not to be texted - please call them instead. "${text.slice(0, 120)}" ${env.appUrl()}/inbox/${conversation.id}`.slice(0, 320),
              email: {
                subject: `${prettyPhone(from)} asked for a call instead of texts`,
                ...renderAlertEmail({
                  title: "Customer asked not to be texted - please call them",
                  intro: text,
                  rows: [{ label: "Phone", value: prettyPhone(from) }],
                  ctaUrl: `${env.appUrl()}/inbox/${conversation.id}`,
                  ctaLabel: "Open the thread",
                }),
              },
            });
          }
        : undefined,
    };
  };

  if (keyword === "stop") return optOut("sms_stop");

  if (keyword === "start" && (contact.opted_out || twilioOptOutType === "START")) {
    if (contact.opted_out) await setOptedOut(db, contact.id, false);
    await storeInbound({ db, account, conversation, body: text || "START", messageSid, segments });
    await db.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversation.id);
    await track("contact_opted_in", { contact_id: contact.id, via: "sms_start" }, { accountId: account.id });
    return { twiml: twilioReplied ? emptyResponse() : messageResponse(startReply(businessName)), status: "start" };
  }
  // A "Yes"/"Start" from a contact who is not opted out is an ordinary reply: handled below.

  if (keyword === "help") {
    await storeInbound({ db, account, conversation, body: text || "HELP", messageSid, segments });
    await db.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversation.id);
    return { twiml: twilioReplied ? emptyResponse() : messageResponse(helpReply(businessName)), status: "help" };
  }

  if (!text) return { twiml: emptyResponse(), status: "ignored" };

  // Natural-language revocation ("please stop texting me", "wrong number") — before any AI turn.
  if (!contact.opted_out) {
    const nl = await detectNaturalLanguageOptOut(text);
    if (nl.optOut) {
      console.info("[sms/inbound] natural-language opt-out", { conversationId: conversation.id, via: nl.via });
      return optOut("sms_natural_language");
    }
  }

  const stored = await storeInbound({ db, account, conversation, body: text, messageSid, segments });
  if (!stored) return { twiml: emptyResponse(), status: "ignored" };

  const optedOut = contact.opted_out;
  const terminal = conversation.status === "closed" || conversation.status === "lost";
  // A reply to a closed/lost thread reopens the same thread (the demo's closing is final, and an
  // opted-out contact's thread stays closed: nothing may be sent to them).
  const reopen = terminal && !isDemo && !optedOut;
  await db
    .from("conversations")
    .update({ last_message_at: new Date().toISOString(), ...(reopen ? { status: "open" } : {}) })
    .eq("id", conversation.id);

  const accountLive = isDemo || account.status === "live";
  const shouldRunAi = !optedOut && !conversation.ai_paused && !(isDemo && terminal) && accountLive;
  const alertBase = { db, account, contact, conversation, text, messageSid };

  return {
    twiml: emptyResponse(),
    status: "message",
    followUp: async () => {
      if (isDemo && !shouldRunAi) return;
      if (optedOut) {
        // Stored for the owner, never answered by text (guardContext blocks any send).
        await track("opted_out_contact_texted", { contact_id: contact.id, conversation_id: conversation.id }, { accountId: account.id });
        await alertOwnerAboutReply({ ...alertBase, why: "they opted out of texts, so we can't reply", note: "This customer replied STOP earlier - please call them." });
        return;
      }
      if (!shouldRunAi) {
        await alertOwnerAboutReply({ ...alertBase, why: conversation.ai_paused ? "AI is paused on this thread" : "text-back is off for this account" });
        return;
      }
      const result = await runAiTurn(conversation.id);
      console.info("[sms/inbound] ai turn", { conversationId: conversation.id, ...result });
      if (result.action === "skipped" && result.reason === "turn_cap_reached") {
        await alertOwnerAboutReply({ ...alertBase, why: "the assistant reached its turn limit" });
      } else if (result.action === "skipped" && result.reason === "ai_paused") {
        await alertOwnerAboutReply({ ...alertBase, why: "AI is paused on this thread" });
      }
    },
  };
}
