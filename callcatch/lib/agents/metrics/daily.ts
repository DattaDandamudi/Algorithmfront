/**
 * CONTRACT (implemented by the revops builder): computes the company KPI snapshot for a UTC day and
 * upserts metrics_daily. Consumed by the metrics-daily cron, the orchestrator/board agents and /admin/agents.
 */
import { createAdminSupabase } from "@/lib/db/client";
import type { Json } from "@/lib/db/types";

export type DailyMetrics = {
  day: string;
  customers_active: number;
  customers_trialing: number;
  mrr_usd: number;
  new_signups: number;
  new_paid: number;
  churned: number;
  leads_created: number;
  calls_missed: number;
  textbacks_sent: number;
  booked: number;
  ad_spend_usd: number;
  ad_leads: number;
  cpl_usd: number | null;
  prospects_contacted: number;
  replies: number;
  demos_booked: number;
  agent_cost_usd: number;
  verification_pending: number;
  verification_sla_breaches: number;
};

export async function computeDailyMetrics(day: Date): Promise<DailyMetrics> {
  // Stub: replaced by the revops builder. Keep the signature and the field list.
  const iso = day.toISOString().slice(0, 10);
  return {
    day: iso,
    customers_active: 0, customers_trialing: 0, mrr_usd: 0, new_signups: 0, new_paid: 0, churned: 0,
    leads_created: 0, calls_missed: 0, textbacks_sent: 0, booked: 0, ad_spend_usd: 0, ad_leads: 0, cpl_usd: null,
    prospects_contacted: 0, replies: 0, demos_booked: 0, agent_cost_usd: 0, verification_pending: 0, verification_sla_breaches: 0,
  };
}

export async function upsertDailyMetrics(day: Date): Promise<DailyMetrics> {
  const m = await computeDailyMetrics(day);
  const db = createAdminSupabase();
  await db.from("metrics_daily").upsert({ day: m.day, metrics: m as unknown as Json, computed_at: new Date().toISOString() }, { onConflict: "day" });
  return m;
}
