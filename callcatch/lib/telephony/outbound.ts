/**
 * Customer-facing outbound SMS (contract: BUILD_CONTRACTS.md "Module c exposes").
 *
 *   sendCustomerMessage({ accountId, conversationId, body, author })
 *     -> enforces opt-out, sms_enabled, account status, the 3-unanswered cap (AI only) and
 *        quiet hours (queues with `messages.send_after`), inserts the `messages` row and sends
 *        from the conversation's number.
 *   pauseAi(conversationId, userId) / resumeAi(conversationId)
 *
 * Queued rows are released by /api/cron/ai-followups via `deliverQueuedMessage`.
 */
import { createAdminSupabase, type Db } from "@/lib/db/client";
import type { AccountRow, ContactRow, ConversationRow, MessageRow, NumberRow } from "@/lib/db/types";
import { env } from "@/lib/env";
import { sendSms } from "@/lib/telephony/client";
import { isSendingAllowedNow, nextSendWindowStart } from "@/lib/telephony/quietHours";
import type { TurnUsage } from "@/lib/ai/cost";

export type CustomerMessageAuthor = "owner" | "ai" | "system";

export type SendCustomerMessageInput = {
  accountId: string;
  conversationId: string;
  body: string;
  author: CustomerMessageAuthor;
  /** Model accounting for AI turns (written to messages.model/tokens_in/tokens_out/cost_usd). */
  usage?: TurnUsage | null;
};

export type SendCustomerMessageResult = {
  ok: boolean;
  messageId?: string;
  reason?: string;
  /** True when the message was queued for the next quiet-hours window instead of sent. */
  queued?: boolean;
  twilioSid?: string;
};

export type ConversationContext = {
  conversation: ConversationRow;
  account: AccountRow;
  contact: ContactRow;
  /** The sending number (conversation.number_id, else the account's first SMS-enabled customer number). */
  number: NumberRow | null;
};

export const MAX_UNANSWERED_OUTBOUND = 3;
/** Owner replies within this many minutes of a customer text bypass quiet hours (active conversation). */
const OWNER_REPLY_GRACE_MINUTES = 15;

export async function loadConversationContext(db: Db, conversationId: string): Promise<ConversationContext | null> {
  const conv = await db.from("conversations").select("*").eq("id", conversationId).maybeSingle();
  if (conv.error || !conv.data) return null;
  const [account, contact] = await Promise.all([
    db.from("accounts").select("*").eq("id", conv.data.account_id).maybeSingle(),
    db.from("contacts").select("*").eq("id", conv.data.contact_id).maybeSingle(),
  ]);
  if (!account.data || !contact.data) return null;

  let number: NumberRow | null = null;
  if (conv.data.number_id) {
    const n = await db.from("numbers").select("*").eq("id", conv.data.number_id).maybeSingle();
    number = n.data ?? null;
  }
  if (!number || (!number.sms_enabled && number.purpose === "customer")) {
    const fallback = await db
      .from("numbers")
      .select("*")
      .eq("account_id", conv.data.account_id)
      .eq("purpose", "customer")
      .eq("sms_enabled", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (fallback.data) {
      number = fallback.data;
      if (conv.data.number_id !== fallback.data.id) {
        await db.from("conversations").update({ number_id: fallback.data.id }).eq("id", conversationId);
      }
    }
  }
  return { conversation: conv.data, account: account.data, contact: contact.data, number };
}

export function isDemoContext(ctx: ConversationContext): boolean {
  return ctx.number?.purpose === "demo";
}

/** Count of outbound messages since the customer's last inbound message (failed sends excluded). */
export async function unansweredOutboundCount(db: Db, conversationId: string): Promise<number> {
  const recent = await db
    .from("messages")
    .select("direction, status")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(20);
  let n = 0;
  for (const m of recent.data ?? []) {
    if (m.direction === "in") break;
    if (m.status !== "failed") n++;
  }
  return n;
}

async function lastInboundAt(db: Db, conversationId: string): Promise<Date | null> {
  const r = await db
    .from("messages")
    .select("created_at")
    .eq("conversation_id", conversationId)
    .eq("direction", "in")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return r.data ? new Date(r.data.created_at) : null;
}

type Guard = { ok: true } | { ok: false; reason: string };

function guardContext(ctx: ConversationContext): Guard {
  if (ctx.contact.opted_out) return { ok: false, reason: "opted_out" };
  const demo = isDemoContext(ctx);
  if (!demo && ctx.account.status !== "live") return { ok: false, reason: `account_${ctx.account.status}` };
  if (!ctx.number) return { ok: false, reason: "no_number" };
  if (!ctx.number.sms_enabled) return { ok: false, reason: "sms_disabled" };
  return { ok: true };
}

/** Twilio SDK errors carry a numeric `code` (e.g. 30032, 21610). */
function twilioErrorCode(err: unknown): string | null {
  if (err && typeof err === "object" && "code" in err) {
    const c = (err as { code?: unknown }).code;
    if (typeof c === "number" || typeof c === "string") return String(c);
  }
  return null;
}

/** Sends one already-inserted `messages` row via Twilio and records the outcome. */
async function transmit(db: Db, ctx: ConversationContext, message: MessageRow): Promise<SendCustomerMessageResult> {
  if (!ctx.number) return { ok: false, messageId: message.id, reason: "no_number" };
  try {
    const { sid, segments } = await sendSms({
      to: ctx.contact.phone,
      from: ctx.number.phone_number,
      body: message.body,
      statusCallback: `${env.appUrl()}/api/twilio/sms/status`,
    });
    await db
      .from("messages")
      .update({ status: "sent", twilio_sid: sid, segments: Math.max(1, segments), send_after: null })
      .eq("id", message.id);
    await db
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", ctx.conversation.id);
    return { ok: true, messageId: message.id, twilioSid: sid };
  } catch (err) {
    const code = twilioErrorCode(err);
    console.error("[outbound] twilio send failed", { messageId: message.id, code, err: err instanceof Error ? err.message : err });
    await db.from("messages").update({ status: "failed", error_code: code }).eq("id", message.id);
    if (code === "21610") {
      // Recipient has opted out at the carrier level — mirror it so we never retry.
      await db.from("contacts").update({ opted_out: true, opted_out_at: new Date().toISOString() }).eq("id", ctx.contact.id);
    }
    return { ok: false, messageId: message.id, reason: code ? `twilio_${code}` : "twilio_error" };
  }
}

export async function sendCustomerMessage(input: SendCustomerMessageInput): Promise<SendCustomerMessageResult> {
  const body = input.body.trim();
  if (!body) return { ok: false, reason: "empty_body" };
  const db = createAdminSupabase();
  const ctx = await loadConversationContext(db, input.conversationId);
  if (!ctx) return { ok: false, reason: "conversation_not_found" };
  if (ctx.conversation.account_id !== input.accountId) return { ok: false, reason: "account_mismatch" };

  const guard = guardContext(ctx);
  if (!guard.ok) return { ok: false, reason: guard.reason };

  if (input.author === "ai") {
    const unanswered = await unansweredOutboundCount(db, ctx.conversation.id);
    if (unanswered >= MAX_UNANSWERED_OUTBOUND) return { ok: false, reason: "unanswered_cap" };
  }

  const now = new Date();
  let allowedNow = isDemoContext(ctx) || isSendingAllowedNow(ctx.account, now);
  if (!allowedNow && input.author === "owner") {
    const last = await lastInboundAt(db, ctx.conversation.id);
    if (last && now.getTime() - last.getTime() <= OWNER_REPLY_GRACE_MINUTES * 60_000) allowedNow = true;
  }

  const usage = input.usage ?? null;
  const inserted = await db
    .from("messages")
    .insert({
      conversation_id: ctx.conversation.id,
      account_id: ctx.account.id,
      direction: "out",
      author: input.author,
      body,
      status: "queued",
      send_after: allowedNow ? null : nextSendWindowStart(ctx.account, now).toISOString(),
      model: usage?.model ?? null,
      tokens_in: usage?.tokensIn ?? 0,
      tokens_out: usage?.tokensOut ?? 0,
      cost_usd: usage?.costUsd ?? 0,
    })
    .select("*")
    .single();
  if (inserted.error || !inserted.data) return { ok: false, reason: `insert_failed:${inserted.error?.message ?? "unknown"}` };

  if (input.author === "owner" && !ctx.conversation.ai_paused) {
    // Owner takeover: any owner message pauses the AI in this thread (spec §4.4).
    await db.from("conversations").update({ ai_paused: true }).eq("id", ctx.conversation.id);
  }

  if (!allowedNow) {
    await db.from("conversations").update({ last_message_at: now.toISOString() }).eq("id", ctx.conversation.id);
    return { ok: true, messageId: inserted.data.id, queued: true, reason: "queued_quiet_hours" };
  }
  return transmit(db, ctx, inserted.data);
}

/**
 * Inserts a queued outbound row without sending (used when a send must wait for the next
 * quiet-hours window regardless of the current time, e.g. the cron re-deferring a message).
 */
export async function enqueueOutbound(input: SendCustomerMessageInput & { sendAfter: Date }): Promise<SendCustomerMessageResult> {
  const db = createAdminSupabase();
  const ctx = await loadConversationContext(db, input.conversationId);
  if (!ctx) return { ok: false, reason: "conversation_not_found" };
  const guard = guardContext(ctx);
  if (!guard.ok) return { ok: false, reason: guard.reason };
  const inserted = await db
    .from("messages")
    .insert({
      conversation_id: ctx.conversation.id,
      account_id: ctx.account.id,
      direction: "out",
      author: input.author,
      body: input.body.trim(),
      status: "queued",
      send_after: input.sendAfter.toISOString(),
      model: input.usage?.model ?? null,
      tokens_in: input.usage?.tokensIn ?? 0,
      tokens_out: input.usage?.tokensOut ?? 0,
      cost_usd: input.usage?.costUsd ?? 0,
    })
    .select("id")
    .single();
  if (inserted.error || !inserted.data) return { ok: false, reason: "insert_failed" };
  return { ok: true, messageId: inserted.data.id, queued: true };
}

export type DeliverResult = { status: "sent" | "deferred" | "dropped" | "failed"; reason?: string };

/** Cron path: (re)validates guards and quiet hours for a queued row, then sends or re-defers it. */
export async function deliverQueuedMessage(messageId: string): Promise<DeliverResult> {
  const db = createAdminSupabase();
  const row = await db.from("messages").select("*").eq("id", messageId).maybeSingle();
  if (!row.data) return { status: "dropped", reason: "not_found" };
  if (row.data.status !== "queued" || row.data.direction !== "out") return { status: "dropped", reason: "not_queued" };
  const ctx = await loadConversationContext(db, row.data.conversation_id);
  if (!ctx) {
    await db.from("messages").update({ status: "failed", error_code: "no_context" }).eq("id", messageId);
    return { status: "failed", reason: "no_context" };
  }
  const guard = guardContext(ctx);
  if (!guard.ok) {
    if (guard.reason === "opted_out") {
      await db.from("messages").update({ status: "failed", error_code: "opted_out" }).eq("id", messageId);
      return { status: "dropped", reason: guard.reason };
    }
    // Account paused / number not yet verified: keep waiting (re-checked on the next run).
    return { status: "deferred", reason: guard.reason };
  }
  const now = new Date();
  if (!isDemoContext(ctx) && !isSendingAllowedNow(ctx.account, now)) {
    const next = nextSendWindowStart(ctx.account, now).toISOString();
    if (row.data.send_after !== next) await db.from("messages").update({ send_after: next }).eq("id", messageId);
    return { status: "deferred", reason: "quiet_hours" };
  }
  if (row.data.author === "ai") {
    const unanswered = await unansweredOutboundCount(db, ctx.conversation.id);
    // The queued row itself is not counted (status queued is excluded only if failed; keep the cap honest).
    if (unanswered > MAX_UNANSWERED_OUTBOUND) {
      await db.from("messages").update({ status: "failed", error_code: "unanswered_cap" }).eq("id", messageId);
      return { status: "dropped", reason: "unanswered_cap" };
    }
  }
  const sent = await transmit(db, ctx, row.data);
  return sent.ok ? { status: "sent" } : { status: "failed", reason: sent.reason };
}

export async function pauseAi(conversationId: string, userId: string): Promise<void> {
  const db = createAdminSupabase();
  const { error } = await db
    .from("conversations")
    .update({ ai_paused: true, paused_by_user_id: userId })
    .eq("id", conversationId);
  if (error) throw new Error(`pauseAi failed: ${error.message}`);
}

export async function resumeAi(conversationId: string): Promise<void> {
  const db = createAdminSupabase();
  const { error } = await db
    .from("conversations")
    .update({ ai_paused: false, paused_by_user_id: null })
    .eq("id", conversationId);
  if (error) throw new Error(`resumeAi failed: ${error.message}`);
}

/** Pauses the AI on every open conversation of an account (used when the subscription lapses). */
export async function pauseAllAiForAccount(accountId: string): Promise<number> {
  const db = createAdminSupabase();
  const r = await db
    .from("conversations")
    .update({ ai_paused: true })
    .eq("account_id", accountId)
    .eq("ai_paused", false)
    .select("id");
  return r.data?.length ?? 0;
}
