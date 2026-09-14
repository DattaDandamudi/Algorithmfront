/**
 * Customer-facing outbound SMS (contract: BUILD_CONTRACTS.md "Module c exposes").
 *
 *   sendCustomerMessage({ accountId, conversationId, body, author })
 *     -> enforces opt-out, sms_enabled, account status, the 3-unanswered cap (AI only) and
 *        quiet hours for UNSOLICITED sends (first/repeat text-backs, nudges: queued with
 *        `messages.send_after`), inserts the `messages` row and sends from the conversation's
 *        number. Replies inside an active conversation (owner or AI, within 15 minutes of the
 *        customer's own text) and emergency safety templates (`author: "system"` /
 *        `bypassQuietHours`) go out at any hour.
 *   pauseAi(conversationId, userId) / resumeAi(conversationId)
 *
 * Queued rows are released by /api/cron/ai-followups via `deliverQueuedMessage`. A row is
 * claimed atomically (queued -> sending) before Twilio is called so the cron and an inline send
 * can never both transmit it. Owner takeover voids the thread's not-yet-sent AI rows.
 */
import { createAdminSupabase, type Db } from "@/lib/db/client";
import type { AccountRow, ContactRow, ConversationRow, MessageRow, NumberRow } from "@/lib/db/types";
import { env } from "@/lib/env";
import { sendSms } from "@/lib/telephony/client";
import { INBOUND_REPLY_GRACE_MINUTES, isSendingAllowedNow, nextSendWindowStart } from "@/lib/telephony/quietHours";
import type { TurnUsage } from "@/lib/ai/cost";

export { INBOUND_REPLY_GRACE_MINUTES };

export type CustomerMessageAuthor = "owner" | "ai" | "system";

export type SendCustomerMessageInput = {
  accountId: string;
  conversationId: string;
  body: string;
  author: CustomerMessageAuthor;
  /** Model accounting for AI turns (written to messages.model/tokens_in/tokens_out/cost_usd). */
  usage?: TurnUsage | null;
  /**
   * Send now even outside the texting window. Only for a safety reply to a customer-initiated
   * contact (emergency templates); never for text-backs or nudges. `author: "system"` implies it.
   */
  bypassQuietHours?: boolean;
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
/** A queued AI row older than this is stale by definition (e.g. released after an account pause). */
const QUEUED_AI_MAX_AGE_MS = 24 * 3600_000;
/** error_code written on queued AI/system rows voided by an owner takeover / AI pause. */
export const CANCELED_BY_OWNER = "canceled_by_owner";
/** error_code written on queued AI rows dropped because the thread moved on (newer message, pause, too old). */
export const SUPERSEDED = "superseded";
/** error_code written by the cron sweep on rows stuck in `sending` (Twilio may or may not have accepted them). */
export const SEND_STATE_UNKNOWN = "send_state_unknown";

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

/** Postgres SQLSTATE for a CHECK-constraint violation (surfaced by PostgREST as `error.code`). */
const CHECK_VIOLATION = "23514";

/**
 * Atomically claims a queued row for transmission (`queued` -> `sending`); returns null when
 * somebody else (the cron or an inline send) already claimed it. Falls back to claiming with
 * `sent` when the database does not yet allow `sending` in `messages.status` (older CHECK) —
 * still atomic, only the interim status differs.
 */
async function claimForSending(db: Db, messageId: string): Promise<MessageRow | null> {
  const claim = (status: "sending" | "sent") =>
    db.from("messages").update({ status }).eq("id", messageId).eq("status", "queued").select("*").maybeSingle();
  let r = await claim("sending");
  if (r.error?.code === CHECK_VIOLATION) r = await claim("sent");
  if (r.error) {
    console.error("[outbound] claim failed", { messageId, err: r.error.message });
    return null;
  }
  return r.data ?? null;
}

/**
 * Claims one already-inserted `messages` row, sends it via Twilio and records the outcome.
 * The claim happens BEFORE the Twilio call so a concurrent cron tick can never send it twice.
 */
async function transmit(db: Db, ctx: ConversationContext, message: MessageRow): Promise<SendCustomerMessageResult> {
  if (!ctx.number) return { ok: false, messageId: message.id, reason: "no_number" };
  const claimed = await claimForSending(db, message.id);
  if (!claimed) return { ok: false, messageId: message.id, reason: "not_queued" };
  try {
    const { sid, segments } = await sendSms({
      to: ctx.contact.phone,
      from: ctx.number.phone_number,
      body: claimed.body,
      statusCallback: `${env.appUrl()}/api/twilio/sms/status`,
    });
    const patch = { status: "sent", twilio_sid: sid, segments: Math.max(1, segments), send_after: null };
    let upd = await db.from("messages").update(patch).eq("id", message.id);
    if (upd.error) {
      // Twilio accepted the message; never leave the row claimable again — retry the bookkeeping once.
      console.error("[outbound] sent-update failed, retrying", { messageId: message.id, twilioSid: sid, err: upd.error.message });
      upd = await db.from("messages").update(patch).eq("id", message.id);
      if (upd.error) console.error("[outbound] sent-update failed twice", { messageId: message.id, twilioSid: sid, err: upd.error.message });
    }
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

/**
 * Voids the not-yet-sent AI/system rows of a thread (status `failed`, error_code
 * `canceled_by_owner`). Called on every owner-takeover path so the cron never sends a stale
 * assistant reply after the owner already answered (spec §4.4). Returns the number voided.
 */
export async function cancelQueuedAiMessages(db: Db, conversationId: string): Promise<number> {
  const r = await db
    .from("messages")
    .update({ status: "failed", error_code: CANCELED_BY_OWNER, send_after: null })
    .eq("conversation_id", conversationId)
    .eq("direction", "out")
    .eq("status", "queued")
    .in("author", ["ai", "system"])
    .select("id");
  if (r.error) console.error("[outbound] cancelQueuedAiMessages failed", { conversationId, err: r.error.message });
  return r.data?.length ?? 0;
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
  // Emergency safety templates (the only "system" sends) answer a customer who just contacted us
  // about a hazard; they are never held for quiet hours.
  const bypass = input.bypassQuietHours === true || input.author === "system";
  let allowedNow = isDemoContext(ctx) || bypass || isSendingAllowedNow(ctx.account, now);
  if (!allowedNow) {
    // A reply (owner or AI) inside an active conversation answers the customer's own text and is
    // not a solicitation. Unsolicited sends (first/repeat text-back, nudges) have no recent
    // inbound row and stay queued for the next window.
    const last = await lastInboundAt(db, ctx.conversation.id);
    if (last && now.getTime() - last.getTime() <= INBOUND_REPLY_GRACE_MINUTES * 60_000) allowedNow = true;
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

  if (input.author === "owner") {
    // Owner takeover: any owner message pauses the AI in this thread and voids its pending replies (spec §4.4).
    await cancelQueuedAiMessages(db, ctx.conversation.id);
    if (!ctx.conversation.ai_paused) {
      await db.from("conversations").update({ ai_paused: true }).eq("id", ctx.conversation.id);
    }
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

/** Cron path: (re)validates guards and quiet hours for a queued row, then claims and sends or re-defers it. */
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

  if (row.data.author === "ai" || row.data.author === "system") {
    // A queued assistant row is stale once the owner took over, once anyone (owner, customer)
    // added a newer message to the thread, or once it is a day old (released after a pause).
    // Checked before the quiet-hours re-defer so a paused thread's row is voided, not re-deferred forever.
    const newer = await db
      .from("messages")
      .select("id")
      .eq("conversation_id", ctx.conversation.id)
      .neq("id", messageId)
      .gt("created_at", row.data.created_at)
      .limit(1)
      .maybeSingle();
    const tooOld = Date.now() - new Date(row.data.created_at).getTime() > QUEUED_AI_MAX_AGE_MS;
    if (ctx.conversation.ai_paused || newer.data || tooOld) {
      await db.from("messages").update({ status: "failed", error_code: SUPERSEDED, send_after: null }).eq("id", messageId);
      return { status: "dropped", reason: SUPERSEDED };
    }
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
  if (sent.ok) return { status: "sent" };
  return sent.reason === "not_queued" ? { status: "dropped", reason: "not_queued" } : { status: "failed", reason: sent.reason };
}

/**
 * Cron safety sweep: a row stuck in `sending` for longer than `olderThanMs` means the process
 * died between the claim and the bookkeeping. Twilio may or may not have accepted it, so it is
 * marked failed with `send_state_unknown` and never re-sent. Returns the number swept.
 */
export async function sweepStuckSending(db: Db, olderThanMs = 10 * 60_000): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs).toISOString();
  const r = await db
    .from("messages")
    .update({ status: "failed", error_code: SEND_STATE_UNKNOWN })
    .eq("status", "sending")
    .eq("direction", "out")
    .lt("updated_at", cutoff)
    .select("id");
  if (r.error) console.error("[outbound] sweepStuckSending failed", r.error.message);
  return r.data?.length ?? 0;
}

export async function pauseAi(conversationId: string, userId: string): Promise<void> {
  const db = createAdminSupabase();
  const { error } = await db
    .from("conversations")
    .update({ ai_paused: true, paused_by_user_id: userId })
    .eq("id", conversationId);
  if (error) throw new Error(`pauseAi failed: ${error.message}`);
  await cancelQueuedAiMessages(db, conversationId);
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
  for (const c of r.data ?? []) await cancelQueuedAiMessages(db, c.id);
  return r.data?.length ?? 0;
}
