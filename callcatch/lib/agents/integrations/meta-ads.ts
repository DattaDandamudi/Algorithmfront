/** Meta Marketing API (Graph v21.0) — read insights, list ad sets/ads, change budgets, pause. */
import { z } from "zod";
import { env } from "@/lib/env";

const GRAPH = "https://graph.facebook.com/v21.0";

function creds() {
  const token = env.get("META_ADS_ACCESS_TOKEN");
  const account = env.get("META_AD_ACCOUNT_ID");
  if (!token || !account) throw new Error("META_ADS_ACCESS_TOKEN and META_AD_ACCOUNT_ID must be set");
  return { token, account: account.startsWith("act_") ? account : `act_${account}` };
}

async function graph<T>(path: string, params: Record<string, string> = {}, init: RequestInit = {}): Promise<T> {
  const { token } = creds();
  const url = new URL(`${GRAPH}/${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  url.searchParams.set("access_token", token);
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } } & T;
  if (!res.ok || body.error) throw new Error(`Meta API ${path}: ${body.error?.message ?? res.status}`);
  return body;
}

const ActionSchema = z.object({ action_type: z.string(), value: z.string() });
const InsightSchema = z.object({
  date_start: z.string().optional(),
  date_stop: z.string().optional(),
  adset_id: z.string().optional(),
  adset_name: z.string().optional(),
  ad_id: z.string().optional(),
  ad_name: z.string().optional(),
  campaign_name: z.string().optional(),
  spend: z.string().optional(),
  impressions: z.string().optional(),
  clicks: z.string().optional(),
  cpc: z.string().optional(),
  cpm: z.string().optional(),
  actions: z.array(ActionSchema).optional(),
  cost_per_action_type: z.array(ActionSchema).optional(),
});
export type Insight = z.infer<typeof InsightSchema> & { leads: number; cpl: number | null; spendUsd: number };

export async function getInsights(opts: { level: "adset" | "ad" | "campaign"; datePreset?: string; since?: string; until?: string }): Promise<Insight[]> {
  const { account } = creds();
  const params: Record<string, string> = {
    level: opts.level,
    fields: `${opts.level}_id,${opts.level}_name,campaign_name,spend,impressions,clicks,cpc,cpm,actions,cost_per_action_type,date_start,date_stop`,
    limit: "200",
  };
  if (opts.since && opts.until) params.time_range = JSON.stringify({ since: opts.since, until: opts.until });
  else params.date_preset = opts.datePreset ?? "yesterday";
  const body = await graph<{ data: unknown[] }>(`${account}/insights`, params);
  return body.data.map((raw) => {
    const row = InsightSchema.parse(raw);
    const leads = Number(row.actions?.find((a) => a.action_type === "lead" || a.action_type === "onsite_conversion.lead_grouped")?.value ?? 0);
    const spendUsd = Number(row.spend ?? 0);
    return { ...row, leads, spendUsd, cpl: leads > 0 ? spendUsd / leads : null };
  });
}

const AdSetSchema = z.object({ id: z.string(), name: z.string(), status: z.string(), effective_status: z.string().optional(), daily_budget: z.string().optional(), lifetime_budget: z.string().optional(), campaign_id: z.string().optional() });
export type AdSet = z.infer<typeof AdSetSchema> & { dailyBudgetUsd: number | null };

export async function listAdSets(): Promise<AdSet[]> {
  const { account } = creds();
  const body = await graph<{ data: unknown[] }>(`${account}/adsets`, { fields: "id,name,status,effective_status,daily_budget,lifetime_budget,campaign_id", limit: "200" });
  return body.data.map((raw) => {
    const a = AdSetSchema.parse(raw);
    return { ...a, dailyBudgetUsd: a.daily_budget ? Number(a.daily_budget) / 100 : null };
  });
}

export async function updateAdSetDailyBudget(adSetId: string, dailyBudgetUsd: number): Promise<{ ok: boolean }> {
  if (!Number.isFinite(dailyBudgetUsd) || dailyBudgetUsd < 1) throw new Error("daily budget must be >= $1");
  const form = new URLSearchParams({ daily_budget: String(Math.round(dailyBudgetUsd * 100)) });
  const body = await graph<{ success?: boolean }>(adSetId, {}, { method: "POST", body: form });
  return { ok: body.success !== false };
}

export async function setStatus(objectId: string, status: "PAUSED" | "ACTIVE"): Promise<{ ok: boolean }> {
  const form = new URLSearchParams({ status });
  const body = await graph<{ success?: boolean }>(objectId, {}, { method: "POST", body: form });
  return { ok: body.success !== false };
}

export function metaAdsConfigured(): boolean {
  return Boolean(env.get("META_ADS_ACCESS_TOKEN") && env.get("META_AD_ACCOUNT_ID"));
}
