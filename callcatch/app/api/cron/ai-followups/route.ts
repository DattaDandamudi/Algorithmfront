/**
 * GET /api/cron/ai-followups — every 5 minutes.
 *  1. Releases queued outbound messages whose quiet-hours window has opened (`messages.send_after`).
 *     Each row is claimed atomically (queued -> sending) before Twilio is called, so a row that
 *     an inline send is transmitting at the same moment is skipped, never duplicated.
 *  2. Sweeps rows stuck in `sending` for 10+ minutes (process died mid-send) to failed /
 *     `send_state_unknown` — never re-sent, since Twilio may have accepted them.
 *  3. Sends the single 20-minute nudge after an unanswered first text-back (max 1 nudge; the
 *     3-unanswered-outbound cap is enforced in sendCustomerMessage).
 * Idempotent: queued rows flip to sent/failed; nudges only fire when exactly one outbound and
 * zero inbound messages exist.
 */
import type { NextRequest } from "next/server";
import { createAdminSupabase } from "@/lib/db/client";
import { nudgeTemplate, profileFromAccount } from "@/lib/ai/prompts";
import { ZERO_USAGE } from "@/lib/ai/cost";
import { deliverQueuedMessage, isDemoContext, loadConversationContext, sendCustomerMessage, sweepStuckSending } from "@/lib/telephony/outbound";
import { authorizeCron, cronError, cronResponse } from "../_lib/cron";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const NUDGE_AFTER_MINUTES = 20;
const NUDGE_WINDOW_HOURS = 24;

export async function GET(request: NextRequest) {
  const denied = authorizeCron(request);
  if (denied) return denied;
  const started = Date.now();
  const counts = { queued_seen: 0, sent: 0, deferred: 0, dropped: 0, failed: 0, swept_sending: 0, nudge_candidates: 0, nudged: 0, nudge_queued: 0, nudge_skipped: 0 };
  const db = createAdminSupabase();
  try {
    // 1. Queue drain. Rows inserted in the last few seconds are normally mid-flight in an inline
    //    send; the atomic claim inside deliverQueuedMessage makes that safe, this just avoids churn.
    const nowIso = new Date().toISOString();
    const queued = await db
      .from("messages")
      .select("id")
      .eq("status", "queued")
      .eq("direction", "out")
      .or(`send_after.is.null,send_after.lte.${nowIso}`)
      .lt("created_at", new Date(Date.now() - 30_000).toISOString())
      .order("created_at", { ascending: true })
      .limit(200);
    for (const row of queued.data ?? []) {
      counts.queued_seen++;
      if (Date.now() - started > 45_000) break;
      const r = await deliverQueuedMessage(row.id);
      counts[r.status]++;
    }

    // 2. Stuck `sending` rows (claimed, then the process died before bookkeeping).
    counts.swept_sending = await sweepStuckSending(db);

    // 3. Nudges.
    const now = Date.now();
    const oldest = new Date(now - NUDGE_WINDOW_HOURS * 3600_000).toISOString();
    const newest = new Date(now - NUDGE_AFTER_MINUTES * 60_000).toISOString();
    const candidates = await db
      .from("conversations")
      .select("id, account_id")
      .eq("status", "open")
      .eq("ai_paused", false)
      .eq("turn_count", 1)
      .in("source", ["missed_call", "lead_form", "web_form"])
      .gte("created_at", oldest)
      .lte("created_at", newest)
      .order("created_at", { ascending: true })
      .limit(100);
    for (const conv of candidates.data ?? []) {
      counts.nudge_candidates++;
      if (Date.now() - started > 50_000) break;
      const msgs = await db.from("messages").select("direction, status, created_at, updated_at, author").eq("conversation_id", conv.id).order("created_at", { ascending: true }).limit(10);
      const list = msgs.data ?? [];
      const inbound = list.filter((m) => m.direction === "in").length;
      const outbound = list.filter((m) => m.direction === "out" && m.status !== "failed");
      const first = outbound[0];
      if (inbound > 0 || outbound.length !== 1 || !first || !["sent", "delivered"].includes(first.status)) {
        counts.nudge_skipped++;
        continue;
      }
      // updated_at moves when the row flips queued -> sent, so a quiet-hours release still waits 20 minutes.
      if (new Date(first.updated_at).getTime() > now - NUDGE_AFTER_MINUTES * 60_000) {
        counts.nudge_skipped++;
        continue;
      }
      const ctx = await loadConversationContext(db, conv.id);
      if (!ctx || isDemoContext(ctx)) {
        counts.nudge_skipped++;
        continue;
      }
      const sent = await sendCustomerMessage({
        accountId: conv.account_id,
        conversationId: conv.id,
        body: nudgeTemplate(profileFromAccount(ctx.account)),
        author: "ai",
        usage: ZERO_USAGE("template"),
      });
      if (sent.ok) {
        await db.from("conversations").update({ turn_count: 2 }).eq("id", conv.id);
        if (sent.queued) counts.nudge_queued++;
        else counts.nudged++;
      } else {
        counts.nudge_skipped++;
      }
    }
    return cronResponse("ai-followups", started, counts);
  } catch (err) {
    return cronError("ai-followups", started, err, counts);
  }
}
