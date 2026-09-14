/**
 * The qualification engine: one `runAiTurn(conversationId)` per inbound customer text.
 *
 * Order of operations (spec §4.4 + BUILD_CONTRACTS "Claude API rules"):
 *   1. guards: AI paused, opted out, account not live, number not SMS-enabled, no pending inbound
 *   2. turn cap (8 real / 3 demo) -> closing template, owner escalation
 *   3. emergency keyword pre-check -> safety template + owner voice call, model skipped
 *   4. Claude turn: cached business-profile system block + dynamic block, strict tools,
 *      adaptive thinking at low effort, tool loop (max 3 rounds)
 *   5. stop_reason refusal / max_tokens / API error -> safe template, never a crash
 *   6. post-filter (no prices, no ETAs, first-message disclosures, SMS length)
 *   7. send via sendCustomerMessage (opt-out / cap enforced there; quiet hours apply only to
 *      unsolicited sends — a reply to a customer's fresh text goes out at any hour and the
 *      emergency template always sends immediately), record usage
 *   8. fast-model extraction updates the lead; conversation.turn_count updated
 */
import Anthropic from "@anthropic-ai/sdk";
import { createAdminSupabase, type Db } from "@/lib/db/client";
import type { LeadRow, MessageRow } from "@/lib/db/types";
import { env } from "@/lib/env";
import { track } from "@/lib/events";
import { anthropic, chatRequestTuning } from "@/lib/ai/client";
import { addUsage, usageFromResponse, ZERO_USAGE, type TurnUsage } from "@/lib/ai/cost";
import { detectEmergency, safetyLine } from "@/lib/ai/emergency";
import { extractAndUpdateLead } from "@/lib/ai/extract";
import {
  buildBusinessProfileBlock,
  buildDynamicBlock,
  closingTemplate,
  DEMO_MAX_AI_TURNS,
  DEMO_PROFILE,
  demoClosingTemplate,
  demoFirstTextbackTemplate,
  demoRepeatTextbackTemplate,
  emergencyTemplate,
  ensureFirstOutboundDisclosure,
  firstTextbackTemplate,
  leadSummaryLine,
  repeatTextbackTemplate,
  MAX_AI_TURNS,
  profileFromAccount,
  safeTemplate,
  sanitizeReply,
  type BusinessProfile,
} from "@/lib/ai/prompts";
import { asUrgency, ensureLead, findLeadForConversation, patchLead, setLeadStatus } from "@/lib/leads/store";
import { placeOwnerVoiceCall, prettyPhone, renderAlertEmail, sendOwnerAlert } from "@/lib/telephony/alerts";
import {
  isDemoContext,
  loadConversationContext,
  sendCustomerMessage,
  type ConversationContext,
  type SendCustomerMessageResult,
} from "@/lib/telephony/outbound";
import { isWithinQuietHours, localTime, quietHoursLabel, safeTimeZone } from "@/lib/telephony/quietHours";

export type RunAiTurnResult = {
  ok: boolean;
  action: "sent" | "queued" | "skipped" | "failed" | "emergency" | "closed";
  reason?: string;
  messageId?: string;
};

const HISTORY_LIMIT = 20;
const MAX_TOOL_ROUNDS = 3;

// ---------------------------------------------------------------------------
// Tools (strict: the API guarantees the input matches the schema)
// ---------------------------------------------------------------------------

const nullable = (type: "string") => ({ anyOf: [{ type }, { type: "null" }] });

const TOOLS: Anthropic.Tool[] = [
  {
    name: "save_lead_fields",
    description:
      "Record details the customer just gave. Pass null for anything not mentioned in this turn. Call it as soon as you learn something new; you may call it together with other tools.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        name: nullable("string"),
        address: nullable("string"),
        zip: nullable("string"),
        issue: nullable("string"),
        urgency: { anyOf: [{ type: "string", enum: ["emergency", "today", "this_week", "flexible"] }, { type: "null" }] },
        preferred_window: nullable("string"),
      },
      required: ["name", "address", "zip", "issue", "urgency", "preferred_window"],
      additionalProperties: false,
    },
  },
  {
    name: "mark_qualified",
    description: "Mark the lead qualified once you know the issue, the address or ZIP, and how urgent it is. The owner is alerted.",
    strict: true,
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    name: "mark_booked",
    description: "Only when the customer explicitly confirms they booked or accepted a specific appointment. The owner is alerted.",
    strict: true,
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    name: "escalate_to_owner",
    description: "Alert the owner right away: the customer asked for a person, is upset, describes an emergency, or asks something outside qualification (pricing, warranty, legal).",
    strict: true,
    input_schema: {
      type: "object",
      properties: { reason: { type: "string", description: "One sentence for the owner" } },
      required: ["reason"],
      additionalProperties: false,
    },
  },
  {
    name: "send_booking_link",
    description: "Returns the business's booking link so you can include it in your reply. Use when the customer wants to book online and a link exists.",
    strict: true,
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadRecentMessages(db: Db, conversationId: string, limit = HISTORY_LIMIT): Promise<MessageRow[]> {
  const r = await db
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (r.data ?? []).reverse();
}

/**
 * Outbound rows that are not failed. `sentOnly` also ignores rows still waiting for the texting
 * window: a queued first text-back may be voided as superseded when the customer texts first,
 * so the reply to that text must carry the first-message disclosures itself.
 */
async function countOutbound(db: Db, conversationId: string, author?: "ai", opts: { sentOnly?: boolean } = {}): Promise<number> {
  let q = db
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId)
    .eq("direction", "out")
    .neq("status", "failed");
  if (opts.sentOnly) q = q.neq("status", "queued");
  if (author) q = q.eq("author", author);
  const r = await q;
  return r.count ?? 0;
}

function profileFor(ctx: ConversationContext): BusinessProfile {
  return isDemoContext(ctx) ? DEMO_PROFILE : profileFromAccount(ctx.account);
}

async function latestVoicemailSummary(db: Db, ctx: ConversationContext): Promise<string | null> {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const r = await db
    .from("calls")
    .select("summary, transcript")
    .eq("account_id", ctx.account.id)
    .eq("contact_id", ctx.contact.id)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const s = r.data?.summary ?? r.data?.transcript ?? null;
  return s ? s.slice(0, 300) : null;
}

/** Builds the Anthropic message array from the stored thread; guarantees it starts and ends with `user`. */
function historyToMessages(messages: MessageRow[], ctx: ConversationContext): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  const opener =
    ctx.conversation.source === "missed_call"
      ? "[Context: this customer called the business and nobody could answer. The assistant texted them back.]"
      : ctx.conversation.source === "inbound_sms"
        ? "[Context: this customer texted the business number directly.]"
        : "[Context: this customer submitted a lead form; the assistant texted them.]";
  out.push({ role: "user", content: opener });
  for (const m of messages) {
    if (m.status === "failed" || !m.body.trim()) continue;
    if (m.direction === "in") out.push({ role: "user", content: m.body });
    else out.push({ role: "assistant", content: m.author === "owner" ? `[Owner replied] ${m.body}` : m.body });
  }
  if (out[out.length - 1]?.role !== "user") out.push({ role: "user", content: "[The customer has not replied yet.]" });
  return out;
}

function textOf(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join(" ")
    .trim();
}

async function updateTurnCount(db: Db, conversationId: string, aiTurns: number): Promise<void> {
  await db.from("conversations").update({ turn_count: aiTurns, last_message_at: new Date().toISOString() }).eq("id", conversationId);
}

function inboxUrl(): string {
  return `${env.appUrl()}/inbox`;
}

async function alertOwnerAboutLead(
  ctx: ConversationContext,
  kind: "qualified" | "booked" | "escalation" | "turn_limit",
  lead: LeadRow | null,
  extra?: string
): Promise<void> {
  if (isDemoContext(ctx)) return;
  const who = lead?.name ?? ctx.contact.name ?? prettyPhone(ctx.contact.phone);
  const phone = prettyPhone(ctx.contact.phone);
  const summary = leadSummaryLine(lead);
  const headline =
    kind === "qualified"
      ? `Booking-ready lead: ${who}`
      : kind === "booked"
        ? `Booked: ${who}`
        : kind === "escalation"
          ? `${who} needs you`
          : `${who} — thread handed to you`;
  const sms = [`CallCatch: ${headline}.`, extra ? extra : summary !== "no details yet" ? summary : null, `Call ${phone} · ${inboxUrl()}`]
    .filter(Boolean)
    .join(" ");
  const email = renderAlertEmail({
    title: headline,
    intro: extra ?? undefined,
    rows: [
      { label: "Phone", value: phone },
      { label: "Issue", value: lead?.issue ?? "—" },
      { label: "Address", value: lead?.address ?? lead?.zip ?? "—" },
      { label: "Urgency", value: lead?.urgency ?? "—" },
      { label: "Window", value: lead?.preferred_window ?? "—" },
    ],
    ctaUrl: inboxUrl(),
    ctaLabel: "Open the thread",
  });
  await sendOwnerAlert({
    account: ctx.account,
    kind,
    sms: sms.slice(0, 320),
    email: { subject: headline, ...email },
    leadId: lead?.id ?? null,
  });
}

// ---------------------------------------------------------------------------
// Template sends (no model)
// ---------------------------------------------------------------------------

const REPEAT_TEXTBACK_MIN_GAP_MS = 10 * 60_000;

/**
 * Text-back after a missed call / demo call. On a fresh thread sends the first-message
 * template (business name + automated-assistant disclosure + STOP; the demo line identifies
 * CallCatch instead) and tracks `first_textback` on the account's first ever text-back. When
 * the caller already has an open thread (called again within 30 days) a short re-engagement
 * line is sent instead, at most once per 10 minutes.
 */
export async function sendFirstTextback(conversationId: string): Promise<SendCustomerMessageResult> {
  const db = createAdminSupabase();
  const ctx = await loadConversationContext(db, conversationId);
  if (!ctx) return { ok: false, reason: "conversation_not_found" };
  const demo = isDemoContext(ctx);
  const profile = profileFor(ctx);
  const priorOutbound = await countOutbound(db, conversationId);
  if (priorOutbound > 0) {
    const lastAt = ctx.conversation.last_message_at ? new Date(ctx.conversation.last_message_at).getTime() : 0;
    if (Date.now() - lastAt < REPEAT_TEXTBACK_MIN_GAP_MS) return { ok: false, reason: "already_texted" };
    const repeat = await sendCustomerMessage({
      accountId: ctx.account.id,
      conversationId,
      body: demo ? demoRepeatTextbackTemplate() : repeatTextbackTemplate(profile),
      author: "ai",
      usage: ZERO_USAGE("template"),
    });
    return repeat.ok ? repeat : { ok: false, reason: repeat.reason ?? "already_texted" };
  }
  const body = demo ? demoFirstTextbackTemplate() : firstTextbackTemplate(profile, ctx.contact.name);
  const result = await sendCustomerMessage({
    accountId: ctx.account.id,
    conversationId,
    body,
    author: "ai",
    usage: ZERO_USAGE("template"),
  });
  if (result.ok) {
    await updateTurnCount(db, conversationId, 1);
    if (!isDemoContext(ctx)) {
      const prior = await db.from("events").select("id", { count: "exact", head: true }).eq("account_id", ctx.account.id).eq("name", "first_textback");
      if ((prior.count ?? 0) === 0) {
        await track("first_textback", { conversation_id: conversationId, queued: Boolean(result.queued) }, { accountId: ctx.account.id });
      }
    }
  }
  return result;
}

/** `system` is reserved for the emergency safety template, which is never held for quiet hours. */
async function sendTemplate(ctx: ConversationContext, body: string, author: "ai" | "system"): Promise<SendCustomerMessageResult> {
  return sendCustomerMessage({
    accountId: ctx.account.id,
    conversationId: ctx.conversation.id,
    body,
    author,
    usage: ZERO_USAGE("template"),
    bypassQuietHours: author === "system",
  });
}

/**
 * Emergency branch: safety template (sent immediately, any hour), lead urgency, owner voice
 * call + alert. Model is skipped. When the customer's emergency text opens the thread, the
 * template is the first outbound and gets the business-name / automated-assistant / STOP lines.
 */
export async function handleEmergency(
  ctx: ConversationContext,
  kind: ReturnType<typeof detectEmergency> & { isEmergency: true },
  triggerText: string,
  db: Db,
  isFirstOutbound: boolean
): Promise<RunAiTurnResult> {
  const profile = profileFor(ctx);
  let body = emergencyTemplate(profile, safetyLine(kind.kind));
  if (isFirstOutbound) body = ensureFirstOutboundDisclosure(body, profile);
  const sent = await sendTemplate(ctx, body, "system");

  const lead = await ensureLead(db, {
    accountId: ctx.account.id,
    conversationId: ctx.conversation.id,
    contactId: ctx.contact.id,
    phone: ctx.contact.phone,
    source: ctx.conversation.source,
    name: ctx.contact.name,
  });
  await patchLead(db, lead, { urgency: "emergency", issue: lead.issue ?? triggerText.slice(0, 300) }, { overwrite: true });

  if (!isDemoContext(ctx)) {
    const phone = prettyPhone(ctx.contact.phone);
    const say = `CallCatch emergency alert for ${profile.businessName}. A customer at ${phone.replace(/\D/g, "").split("").join(" ")} texted: ${triggerText.slice(0, 200)}. Please call them back now.`;
    const [call] = await Promise.all([
      placeOwnerVoiceCall({ account: ctx.account, say, leadId: lead.id }),
      sendOwnerAlert({
        account: ctx.account,
        kind: "emergency",
        sms: `CallCatch EMERGENCY: ${phone} texted "${triggerText.slice(0, 120)}". Call them now. ${inboxUrl()}`,
        email: {
          subject: `EMERGENCY — ${phone}: ${kind.matched}`,
          ...renderAlertEmail({
            title: "Emergency text from a customer",
            intro: `"${triggerText.slice(0, 500)}"`,
            rows: [
              { label: "Phone", value: phone },
              { label: "Detected", value: kind.matched },
              { label: "We told them", value: body },
            ],
            ctaUrl: inboxUrl(),
            ctaLabel: "Open the thread",
          }),
        },
        leadId: lead.id,
      }),
    ]);
    await track("emergency_detected", { conversation_id: ctx.conversation.id, kind: kind.kind, owner_called: call.ok }, { accountId: ctx.account.id });
  }
  return { ok: sent.ok, action: "emergency", messageId: sent.messageId, reason: sent.ok ? undefined : sent.reason };
}

// ---------------------------------------------------------------------------
// The turn
// ---------------------------------------------------------------------------

type ToolOutcome = { bookingUrl: string | null; escalated: string | null; qualified: boolean; booked: boolean };

async function executeTool(
  db: Db,
  ctx: ConversationContext,
  profile: BusinessProfile,
  block: Anthropic.ToolUseBlock,
  outcome: ToolOutcome
): Promise<string> {
  const input = (block.input ?? {}) as Record<string, unknown>;
  const str = (k: string): string | null => (typeof input[k] === "string" && (input[k] as string).trim() ? (input[k] as string).trim() : null);
  switch (block.name) {
    case "save_lead_fields": {
      const lead = await ensureLead(db, {
        accountId: ctx.account.id,
        conversationId: ctx.conversation.id,
        contactId: ctx.contact.id,
        phone: ctx.contact.phone,
        source: ctx.conversation.source,
      });
      const updated = await patchLead(
        db,
        lead,
        { name: str("name"), address: str("address"), zip: str("zip"), issue: str("issue"), urgency: asUrgency(input.urgency), preferred_window: str("preferred_window") },
        { overwrite: true }
      );
      if (updated.name && updated.name !== ctx.contact.name) await db.from("contacts").update({ name: updated.name }).eq("id", ctx.contact.id);
      return JSON.stringify({ ok: true, known: leadSummaryLine(updated) });
    }
    case "mark_qualified": {
      const lead = await ensureLead(db, {
        accountId: ctx.account.id,
        conversationId: ctx.conversation.id,
        contactId: ctx.contact.id,
        phone: ctx.contact.phone,
        source: ctx.conversation.source,
      });
      if (lead.status === "new") {
        const updated = await setLeadStatus(db, lead, "qualified");
        await db.from("conversations").update({ status: "qualified" }).eq("id", ctx.conversation.id).eq("status", "open");
        outcome.qualified = true;
        await alertOwnerAboutLead(ctx, "qualified", updated);
      }
      return JSON.stringify({ ok: true, status: "qualified" });
    }
    case "mark_booked": {
      const lead = await ensureLead(db, {
        accountId: ctx.account.id,
        conversationId: ctx.conversation.id,
        contactId: ctx.contact.id,
        phone: ctx.contact.phone,
        source: ctx.conversation.source,
      });
      if (lead.status !== "booked") {
        const updated = await setLeadStatus(db, lead, "booked", { est_value_usd: lead.est_value_usd ?? profile.avgTicketUsd });
        await db.from("conversations").update({ status: "booked" }).eq("id", ctx.conversation.id);
        outcome.booked = true;
        await alertOwnerAboutLead(ctx, "booked", updated);
      }
      return JSON.stringify({ ok: true, status: "booked" });
    }
    case "escalate_to_owner": {
      const reason = str("reason") ?? "Customer needs a human";
      outcome.escalated = reason;
      const lead = await findLeadForConversation(db, ctx.conversation.id);
      await alertOwnerAboutLead(ctx, "escalation", lead, reason);
      return JSON.stringify({ ok: true, owner_alerted: !isDemoContext(ctx) });
    }
    case "send_booking_link": {
      if (profile.bookingUrl) {
        outcome.bookingUrl = profile.bookingUrl;
        return JSON.stringify({ ok: true, booking_url: profile.bookingUrl });
      }
      return JSON.stringify({ ok: false, note: "No booking link is configured; tell the customer the owner will call to schedule." });
    }
    default:
      return JSON.stringify({ ok: false, error: `unknown tool ${block.name}` });
  }
}

export async function runAiTurn(conversationId: string): Promise<RunAiTurnResult> {
  const db = createAdminSupabase();
  const ctx = await loadConversationContext(db, conversationId);
  if (!ctx) return { ok: false, action: "skipped", reason: "conversation_not_found" };
  const demo = isDemoContext(ctx);
  if (ctx.conversation.ai_paused) return { ok: true, action: "skipped", reason: "ai_paused" };
  if (ctx.contact.opted_out) return { ok: true, action: "skipped", reason: "opted_out" };
  if (!demo && ctx.account.status !== "live") return { ok: true, action: "skipped", reason: `account_${ctx.account.status}` };
  if (!ctx.number?.sms_enabled) return { ok: true, action: "skipped", reason: "sms_disabled" };

  const messages = await loadRecentMessages(db, conversationId);
  const last = messages[messages.length - 1];
  if (!last || last.direction !== "in") return { ok: true, action: "skipped", reason: "no_pending_inbound" };

  const profile = profileFor(ctx);
  const maxTurns = demo ? DEMO_MAX_AI_TURNS : MAX_AI_TURNS;
  const [aiTurns, outboundSent] = await Promise.all([countOutbound(db, conversationId, "ai"), countOutbound(db, conversationId, undefined, { sentOnly: true })]);
  // Nothing has actually reached the customer yet (a text-back still queued for the window does
  // not count: it is voided as superseded once this reply goes out).
  const isFirstOutbound = outboundSent === 0;

  // Operator kill-switch (RUNBOOK §11): during a model/API outage every turn sends the safe template,
  // pauses the thread and alerts the owner, so no customer is left without a human path.
  if (env.bool("AI_SAFE_TEMPLATE_MODE")) {
    const sent = await sendTemplate(ctx, safeTemplate(profile), "ai");
    if (sent.ok) {
      await db.from("conversations").update({ ai_paused: true }).eq("id", conversationId);
      if (!demo) {
        const lead = await findLeadForConversation(db, conversationId);
        await alertOwnerAboutLead(ctx, "escalation", lead, "AI safe mode is on (operator switch) — please reply to this customer yourself.");
      }
    }
    return { ok: sent.ok, action: "closed", messageId: sent.messageId, reason: "safe_template_mode" };
  }

  // 2. Turn cap: hand the thread to the owner (once).
  if (aiTurns >= maxTurns) {
    const closing = demo ? demoClosingTemplate() : closingTemplate(profile);
    const alreadyClosed = messages.some((m) => m.direction === "out" && m.body === closing);
    if (alreadyClosed) return { ok: true, action: "skipped", reason: "turn_cap_reached" };
    const sent = await sendTemplate(ctx, closing, "ai");
    if (sent.ok) {
      await updateTurnCount(db, conversationId, aiTurns + 1);
      if (demo) {
        await db.from("conversations").update({ status: "closed" }).eq("id", conversationId);
      } else {
        const lead = await findLeadForConversation(db, conversationId);
        await alertOwnerAboutLead(ctx, "turn_limit", lead, "The assistant reached its turn limit — please call the customer.");
      }
    }
    return { ok: sent.ok, action: "closed", messageId: sent.messageId, reason: sent.ok ? undefined : sent.reason };
  }

  // 3. Emergency pre-check (model skipped). Handled once per thread.
  const emergency = detectEmergency(last.body);
  const emergencyHandled = messages.some((m) => m.direction === "out" && m.author === "system");
  if (emergency.isEmergency && !emergencyHandled) {
    const result = await handleEmergency(ctx, emergency, last.body, db, isFirstOutbound);
    await updateTurnCount(db, conversationId, aiTurns + 1);
    await extractAndUpdateLead(ctx, [...messages], result.messageId ?? null, db);
    return result;
  }

  // 4. Model turn.
  const model = env.models().chat;
  const tz = safeTimeZone(demo ? "America/Chicago" : ctx.account.timezone);
  const now = new Date();
  const lead = await findLeadForConversation(db, conversationId);
  const voicemail = demo ? null : await latestVoicemailSummary(db, ctx);
  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: buildBusinessProfileBlock(profile), cache_control: { type: "ephemeral" } },
    {
      type: "text",
      text: buildDynamicBlock({
        localTimeLabel: localTime(now, tz).label,
        quietHoursLabel: demo ? "8:00 AM–9:00 PM" : quietHoursLabel(ctx.account),
        withinHours: demo ? true : isWithinQuietHours(ctx.account, now),
        turnCount: aiTurns,
        maxTurns,
        lead,
        voicemailSummary: voicemail,
        emergencyAlreadyHandled: emergencyHandled,
        contactName: ctx.contact.name,
      }),
    },
  ];
  const history = historyToMessages(messages, ctx);
  const outcome: ToolOutcome = { bookingUrl: null, escalated: null, qualified: false, booked: false };
  let usage: TurnUsage = ZERO_USAGE(model);
  let replyText: string | null = null;
  let fallbackReason: string | null = null;

  try {
    let rounds = 0;
    let lastText = "";
    while (rounds <= MAX_TOOL_ROUNDS) {
      const response = await anthropic().messages.create({
        model,
        max_tokens: 2048,
        ...chatRequestTuning(model),
        system,
        tools: TOOLS,
        messages: history,
      });
      usage = addUsage(usage, usageFromResponse(model, response.usage));
      const text = textOf(response.content);
      if (text) lastText = text;

      if (response.stop_reason === "refusal") {
        fallbackReason = `refusal:${response.stop_details?.category ?? "unknown"}`;
        break;
      }
      const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
        if (response.stop_reason === "max_tokens" && !text && !lastText) fallbackReason = "max_tokens";
        replyText = text || lastText || null;
        break;
      }
      history.push({ role: "assistant", content: response.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        let content: string;
        try {
          content = await executeTool(db, ctx, profile, tu, outcome);
        } catch (err) {
          console.error("[ai/engine] tool failed", tu.name, err instanceof Error ? err.message : err);
          content = JSON.stringify({ ok: false, error: "tool failed" });
        }
        results.push({ type: "tool_result", tool_use_id: tu.id, content });
      }
      history.push({ role: "user", content: results });
      rounds++;
      if (rounds > MAX_TOOL_ROUNDS) {
        replyText = lastText || null;
      }
    }
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) fallbackReason = "rate_limited";
    else if (err instanceof Anthropic.APIError) fallbackReason = `api_${err.status ?? "error"}`;
    else fallbackReason = "api_unreachable";
    console.error("[ai/engine] model call failed", { conversationId, reason: fallbackReason, err: err instanceof Error ? err.message : err });
  }

  let body: string;
  if (!replyText) {
    body = outcome.bookingUrl ? `Here's the booking link: ${outcome.bookingUrl}` : safeTemplate(profile);
    if (isFirstOutbound) body = ensureFirstOutboundDisclosure(body, profile);
    if (!fallbackReason) fallbackReason = "empty_reply";
  } else {
    body = sanitizeReply(replyText, { profile, isFirstOutbound, bookingUrlToInclude: outcome.bookingUrl });
  }

  // Someone (owner, or a parallel turn) may have replied while the model was thinking.
  const latest = await db
    .from("messages")
    .select("id, direction")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest.data && latest.data.id !== last.id && latest.data.direction === "out") {
    return { ok: true, action: "skipped", reason: "already_replied" };
  }

  const sent = await sendCustomerMessage({ accountId: ctx.account.id, conversationId, body, author: "ai", usage });
  if (!sent.ok) return { ok: false, action: "failed", reason: sent.reason };
  await updateTurnCount(db, conversationId, aiTurns + 1);

  if (fallbackReason && !demo) {
    const leadNow = await findLeadForConversation(db, conversationId);
    await alertOwnerAboutLead(ctx, "escalation", leadNow, `The assistant could not answer (${fallbackReason}); the customer was told you'll call.`);
  }

  // 8. Extraction (fast model) keeps the lead row current after every turn.
  const threadForExtraction: MessageRow[] = [...messages, { ...last, id: sent.messageId ?? "", direction: "out", author: "ai", body, status: "sent" }];
  const extracted = await extractAndUpdateLead(ctx, threadForExtraction, sent.messageId ?? null, db);
  if (extracted.wantsHuman && !outcome.escalated && !demo) {
    const leadNow = await findLeadForConversation(db, conversationId);
    await alertOwnerAboutLead(ctx, "escalation", leadNow, "The customer asked to speak with a person.");
  }

  return { ok: true, action: sent.queued ? "queued" : "sent", messageId: sent.messageId };
}
