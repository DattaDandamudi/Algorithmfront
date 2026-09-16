import { createAdminSupabase } from "@/lib/db/client";
import { env } from "@/lib/env";

export function dailyBudgetUsd(): number {
  const n = Number(env.get("AGENT_DAILY_BUDGET_USD", "25"));
  return Number.isFinite(n) && n > 0 ? n : 25;
}

/** Model spend by all agents since 00:00 UTC today. */
export async function spentTodayUsd(): Promise<number> {
  const db = createAdminSupabase();
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const { data } = await db.from("agent_runs").select("cost_usd").gte("created_at", start.toISOString()).limit(5000);
  return (data ?? []).reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);
}

export async function remainingTodayUsd(): Promise<number> {
  return Math.max(0, dailyBudgetUsd() - (await spentTodayUsd()));
}

/** Executions of a task kind since 00:00 UTC (for daily caps). */
export async function executedTodayCount(kind: string): Promise<number> {
  const db = createAdminSupabase();
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const { count } = await db
    .from("agent_tasks")
    .select("id", { count: "exact", head: true })
    .eq("kind", kind)
    .in("status", ["executed", "executing"])
    .gte("executed_at", start.toISOString());
  return count ?? 0;
}
