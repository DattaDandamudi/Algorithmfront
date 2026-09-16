import { z } from "zod";
import { metaAdsConfigured, setStatus, updateAdSetDailyBudget } from "@/lib/agents/integrations/meta-ads";
import type { TaskExecutor, TaskKind } from "@/lib/agents/core/types";
import type { Json } from "@/lib/db/types";

const Budget = z.object({ ad_set_id: z.string().min(3), current_daily_budget_usd: z.number().min(0), new_daily_budget_usd: z.number().min(1).max(10000), reason: z.string().max(1000) });
const updateAdBudget: TaskExecutor = async (task) => {
  const p = Budget.safeParse(task.payload);
  if (!p.success) return { ok: false, error: `payload: ${p.error.issues[0]?.message}` };
  if (!metaAdsConfigured()) return { ok: false, error: "Meta Marketing API not configured (META_ADS_ACCESS_TOKEN / META_AD_ACCOUNT_ID)" };
  const r = await updateAdSetDailyBudget(p.data.ad_set_id, p.data.new_daily_budget_usd);
  return { ok: r.ok, result: { ad_set_id: p.data.ad_set_id, daily_budget_usd: p.data.new_daily_budget_usd } };
};

const Pause = z.object({ ad_id: z.string().optional(), ad_set_id: z.string().optional(), reason: z.string().max(1000) });
const pauseAd: TaskExecutor = async (task) => {
  const p = Pause.safeParse(task.payload);
  if (!p.success) return { ok: false, error: `payload: ${p.error.issues[0]?.message}` };
  const id = p.data.ad_id ?? p.data.ad_set_id;
  if (!id) return { ok: false, error: "ad_id or ad_set_id required" };
  if (!metaAdsConfigured()) return { ok: false, error: "Meta Marketing API not configured" };
  const r = await setStatus(id, "PAUSED");
  return { ok: r.ok, result: { paused: id } };
};

const CreateAd = z.object({
  campaign_id: z.string().optional(),
  ad_set: z.record(z.string(), z.unknown()).default({}),
  creative: z.object({ primary_text: z.string().max(1000), headline: z.string().max(120), description: z.string().max(200).optional(), cta: z.string().max(40), image_hash: z.string().optional(), video_id: z.string().optional() }),
  daily_budget_usd: z.number().min(1).max(1000),
});
/** Ads are never created by API in v1 — the executor delivers a paste-ready spec (always founder-approved). */
const createAd: TaskExecutor = async (task) => {
  const p = CreateAd.safeParse(task.payload);
  if (!p.success) return { ok: false, error: `payload: ${p.error.issues[0]?.message}` };
  return { ok: true, result: { manual_required: true, instructions: "Create in Ads Manager: use the creative/ad_set/daily_budget below; the ads agent monitors it once live.", spec: p.data as unknown as Json } };
};

const Publish = z.object({ slug: z.string().regex(/^[a-z0-9-]{3,80}$/), title: z.string().max(140), kind: z.enum(["city_page", "blog", "comparison"]), markdown: z.string().min(200).max(60000), meta_description: z.string().max(200) });
/** v1 stores the draft in the task result; a content_pages table + renderer is the next iteration (docs/COMPANY_OS.md). */
const publishContent: TaskExecutor = async (task) => {
  const p = Publish.safeParse(task.payload);
  if (!p.success) return { ok: false, error: `payload: ${p.error.issues[0]?.message}` };
  return { ok: true, result: { stored: true, slug: p.data.slug, kind: p.data.kind, title: p.data.title, words: p.data.markdown.split(/\s+/).length, markdown: p.data.markdown, meta_description: p.data.meta_description } };
};

export const executors: Partial<Record<TaskKind, TaskExecutor>> = {
  update_ad_budget: updateAdBudget,
  pause_ad: pauseAd,
  create_ad: createAd,
  publish_content: publishContent,
};
