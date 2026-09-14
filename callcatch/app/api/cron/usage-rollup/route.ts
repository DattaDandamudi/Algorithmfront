/**
 * GET /api/cron/usage-rollup — nightly. Computes `usage_monthly` for the current (and previous)
 * period per account:
 *   conversations     counted once (conversations.counted_for_usage flips when a conversation has
 *                     its first sent/delivered outbound message), attributed to the month created
 *   sms_segments_out  sum of segments on sent/delivered outbound messages
 *   sms_segments_in   sum of segments on inbound messages
 *   voice_minutes     voicemail recording seconds / 60 (greeting time is not billed by us)
 *   ai_cost_usd       sum of messages.cost_usd
 * Every run first sweeps closed periods whose overage is still unreported
 * (`usage_monthly.overage_reported = false`, last two closed periods) and reports them via module
 * d's reportOverageForPeriod — idempotent through that flag — so a Stripe outage, a missed cron run
 * or the time budget on the 1st never silently loses a month of overage. The sweep runs before the
 * per-account rollup loop (with its own budget) so the loop's `break` cannot starve it, and it
 * re-marks/re-rolls the closed period for that account first so the count is complete.
 */
import type { NextRequest } from "next/server";
import { createAdminSupabase, type Db } from "@/lib/db/client";
import { reportOverageForPeriod } from "@/lib/billing/usage";
import { authorizeCron, cronError, cronResponse, nextPeriod, periodOf, previousPeriod } from "../_lib/cron";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

async function markBillableConversations(db: Db, accountId: string): Promise<number> {
  const candidates = await db.from("conversations").select("id").eq("account_id", accountId).eq("counted_for_usage", false).limit(1000);
  const ids = (candidates.data ?? []).map((c) => c.id);
  if (ids.length === 0) return 0;
  const withOutbound = await db
    .from("messages")
    .select("conversation_id")
    .in("conversation_id", ids)
    .eq("direction", "out")
    .in("status", ["sent", "delivered"])
    .limit(5000);
  const billable = [...new Set((withOutbound.data ?? []).map((m) => m.conversation_id))];
  if (billable.length === 0) return 0;
  await db.from("conversations").update({ counted_for_usage: true }).in("id", billable);
  return billable.length;
}

async function rollupPeriod(db: Db, accountId: string, period: string): Promise<void> {
  const start = `${period}T00:00:00Z`;
  const end = `${nextPeriod(period)}T00:00:00Z`;
  const [convs, outMsgs, inMsgs, calls, costMsgs] = await Promise.all([
    db.from("conversations").select("id", { count: "exact", head: true }).eq("account_id", accountId).eq("counted_for_usage", true).gte("created_at", start).lt("created_at", end),
    db.from("messages").select("segments").eq("account_id", accountId).eq("direction", "out").in("status", ["sent", "delivered"]).gte("created_at", start).lt("created_at", end).limit(10000),
    db.from("messages").select("segments").eq("account_id", accountId).eq("direction", "in").gte("created_at", start).lt("created_at", end).limit(10000),
    db.from("calls").select("recording_duration").eq("account_id", accountId).gte("created_at", start).lt("created_at", end).limit(10000),
    db.from("messages").select("cost_usd").eq("account_id", accountId).gte("created_at", start).lt("created_at", end).gt("cost_usd", 0).limit(10000),
  ]);
  const sum = (rows: Array<Record<string, number | null>> | null, key: string) => (rows ?? []).reduce((acc, r) => acc + (Number(r[key]) || 0), 0);
  const row = {
    account_id: accountId,
    period,
    conversations: convs.count ?? 0,
    sms_segments_out: sum(outMsgs.data, "segments"),
    sms_segments_in: sum(inMsgs.data, "segments"),
    voice_minutes: Math.round((sum(calls.data, "recording_duration") / 60) * 100) / 100,
    ai_cost_usd: Math.round(sum(costMsgs.data, "cost_usd") * 1_000_000) / 1_000_000,
  };
  const r = await db.from("usage_monthly").upsert(row, { onConflict: "account_id,period" });
  if (r.error) throw new Error(`usage_monthly upsert failed: ${r.error.message}`);
}

/** Time the overage sweep may use before handing over to the rollup loop (ms). */
const SWEEP_BUDGET_MS = 25_000;
const TOTAL_BUDGET_MS = 50_000;

type Counts = Record<string, number>;

/**
 * Reports every closed period still owed to Stripe. Only the last two closed periods are retried;
 * anything older is logged as an error (and left unreported) so a human decides — meter events are
 * stamped "now", and billing a customer for a months-old period without looking is not acceptable.
 */
async function sweepUnreportedOverage(db: Db, started: number, current: string, counts: Counts): Promise<void> {
  const oldestRetry = previousPeriod(previousPeriod(current));
  const pending = await db
    .from("usage_monthly")
    .select("account_id, period")
    .eq("overage_reported", false)
    .lt("period", current)
    .order("period", { ascending: true })
    .limit(500);
  if (pending.error) throw new Error(`usage_monthly pending lookup failed: ${pending.error.message}`);

  for (const row of pending.data ?? []) {
    if (Date.now() - started > SWEEP_BUDGET_MS) {
      console.warn("[cron:usage-rollup] overage sweep out of budget; remaining rows are retried tomorrow");
      break;
    }
    if (row.period < oldestRetry) {
      counts.overage_stale++;
      console.error("[cron:usage-rollup] overage unreported for a period outside the retry window — reconcile by hand", row);
      continue;
    }
    counts.overage_checked++;
    try {
      // The closed period must be complete before it is billed: flag the last conversations of the
      // month (they are only marked after their first sent text) and re-roll the row.
      counts.conversations_marked += await markBillableConversations(db, row.account_id);
      await rollupPeriod(db, row.account_id, row.period);
      const r = await reportOverageForPeriod(row.account_id, row.period);
      if (r.reported) counts.overage_reported++;
      else console.warn("[cron:usage-rollup] overage not reported", { accountId: row.account_id, period: row.period, reason: r.reason });
    } catch (err) {
      counts.errors++;
      console.error("[cron:usage-rollup] overage report failed", { accountId: row.account_id, period: row.period, err: err instanceof Error ? err.message : err });
    }
  }
}

export async function GET(request: NextRequest) {
  const denied = authorizeCron(request);
  if (denied) return denied;
  const started = Date.now();
  const counts: Counts = { accounts: 0, conversations_marked: 0, rolled_up: 0, overage_checked: 0, overage_reported: 0, overage_stale: 0, errors: 0 };
  const db = createAdminSupabase();
  const now = new Date();
  const current = periodOf(now);
  const previous = previousPeriod(current);
  try {
    // 1. Money first: closed periods still owed to Stripe (nightly, until reported).
    try {
      await sweepUnreportedOverage(db, started, current, counts);
    } catch (err) {
      counts.errors++;
      console.error("[cron:usage-rollup] overage sweep failed", { err: err instanceof Error ? err.message : err });
    }

    // 2. Rollups for the current period (and the just-closed one for the first days of the month).
    const accounts = await db.from("accounts").select("id, status").neq("status", "onboarding").limit(5000);
    for (const account of accounts.data ?? []) {
      counts.accounts++;
      if (Date.now() - started > TOTAL_BUDGET_MS) break;
      try {
        counts.conversations_marked += await markBillableConversations(db, account.id);
        await rollupPeriod(db, account.id, current);
        if (now.getUTCDate() <= 3) await rollupPeriod(db, account.id, previous);
        counts.rolled_up++;
      } catch (err) {
        counts.errors++;
        console.error("[cron:usage-rollup] account failed", { accountId: account.id, err: err instanceof Error ? err.message : err });
      }
    }
    return cronResponse("usage-rollup", started, counts, { period: current });
  } catch (err) {
    return cronError("usage-rollup", started, err, counts);
  }
}
