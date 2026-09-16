/**
 * Company KPI snapshot per UTC day, upserted into metrics_daily. Read by the orchestrator, revops and
 * board agents and by /admin/agents. Ad spend comes from the Meta Marketing API when configured.
 */
import { createAdminSupabase, type Db } from "@/lib/db/client";
import type { Json } from "@/lib/db/types";
import { PLANS } from "@/lib/plans";

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

function dayBounds(day: Date): { start: string; end: string; iso: string } {
  const start = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
  const end = new Date(start.getTime() + 24 * 3600_000);
  return { start: start.toISOString(), end: end.toISOString(), iso: start.toISOString().slice(0, 10) };
}

async function countRows(q: PromiseLike<{ count: number | null }>): Promise<number> {
  const { count } = await q;
  return count ?? 0;
}

export async function computeDailyMetrics(day: Date, db: Db = createAdminSupabase()): Promise<DailyMetrics> {
  const { start, end, iso } = dayBounds(day);
  const between = <T extends { gte: (c: string, v: string) => T; lt: (c: string, v: string) => T }>(q: T, col: string) => q.gte(col, start).lt(col, end);

  const [subs, active, trialing] = await Promise.all([
    db.from("subscriptions").select("plan, interval, status").in("status", ["active", "past_due", "trialing"]).limit(10000),
    countRows(db.from("accounts").select("id", { count: "exact", head: true }).eq("status", "live")),
    countRows(db.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "trialing")),
  ]);
  let mrr = 0;
  for (const s of subs.data ?? []) {
    if (s.status === "trialing") continue;
    const plan = PLANS[(s.plan as keyof typeof PLANS) ?? "starter"] ?? PLANS.starter;
    mrr += s.interval === "year" ? plan.priceAnnualUsd / 12 : plan.priceMonthlyUsd;
  }

  const [newSignups, newPaid, churned, leads, calls, textbacks, booked, contacted, replies, demos, agentCost, pending, breaches] = await Promise.all([
    countRows(between(db.from("events").select("id", { count: "exact", head: true }).eq("name", "signup"), "occurred_at")),
    countRows(between(db.from("events").select("id", { count: "exact", head: true }).eq("name", "checkout_completed"), "occurred_at")),
    countRows(between(db.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "canceled"), "updated_at")),
    countRows(between(db.from("leads").select("id", { count: "exact", head: true }), "created_at")),
    countRows(between(db.from("calls").select("id", { count: "exact", head: true }).in("status", ["missed", "voicemail", "answered_by_greeting"]), "created_at")),
    countRows(between(db.from("messages").select("id", { count: "exact", head: true }).eq("direction", "out").eq("author", "ai").in("status", ["sent", "delivered"]), "created_at")),
    countRows(between(db.from("leads").select("id", { count: "exact", head: true }).eq("status", "booked"), "booked_at")),
    countRows(between(db.from("outreach").select("id", { count: "exact", head: true }).eq("status", "sent"), "sent_at")),
    countRows(between(db.from("outreach").select("id", { count: "exact", head: true }).eq("status", "replied"), "updated_at")),
    countRows(between(db.from("prospects").select("id", { count: "exact", head: true }).eq("status", "demo_booked"), "updated_at")),
    db.from("agent_runs").select("cost_usd").gte("created_at", start).lt("created_at", end).limit(5000).then((r) => (r.data ?? []).reduce((s, x) => s + Number(x.cost_usd ?? 0), 0)),
    countRows(db.from("numbers").select("id", { count: "exact", head: true }).in("verification_status", ["pending", "in_review"])),
    countRows(db.from("numbers").select("id", { count: "exact", head: true }).in("verification_status", ["pending", "in_review"]).lt("verification_submitted_at", new Date(Date.now() - 7 * 24 * 3600_000).toISOString())),
  ]);

  let ad_spend_usd = 0;
  let ad_leads = 0;
  try {
    const meta = await import("@/lib/agents/integrations/meta-ads");
    if (meta.metaAdsConfigured()) {
      const rows = await meta.getInsights({ level: "campaign", since: iso, until: iso });
      for (const r of rows) {
        ad_spend_usd += r.spendUsd;
        ad_leads += r.leads;
      }
    }
  } catch (err) {
    console.warn("[metrics] meta insights unavailable", err instanceof Error ? err.message : err);
  }

  return {
    day: iso,
    customers_active: active,
    customers_trialing: trialing,
    mrr_usd: Math.round(mrr),
    new_signups: newSignups,
    new_paid: newPaid,
    churned,
    leads_created: leads,
    calls_missed: calls,
    textbacks_sent: textbacks,
    booked,
    ad_spend_usd: Number(ad_spend_usd.toFixed(2)),
    ad_leads,
    cpl_usd: ad_leads > 0 ? Number((ad_spend_usd / ad_leads).toFixed(2)) : null,
    prospects_contacted: contacted,
    replies,
    demos_booked: demos,
    agent_cost_usd: Number(agentCost.toFixed(2)),
    verification_pending: pending,
    verification_sla_breaches: breaches,
  };
}

export async function upsertDailyMetrics(day: Date): Promise<DailyMetrics> {
  const db = createAdminSupabase();
  const m = await computeDailyMetrics(day, db);
  await db.from("metrics_daily").upsert({ day: m.day, metrics: m as unknown as Json, computed_at: new Date().toISOString() }, { onConflict: "day" });
  return m;
}
