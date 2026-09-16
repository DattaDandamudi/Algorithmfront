import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { AgentDefinition } from "@/lib/agents/core/types";
import { getInsights, listAdSets, metaAdsConfigured } from "@/lib/agents/integrations/meta-ads";
import { COMPANY_CONTEXT, COMPLIANCE_RULES } from "./_shared";

const SYSTEM = `${COMPANY_CONTEXT}

ROLE: Ads manager (Meta). You protect the ad budget and find winning creative, never the reverse.
Targets (override via memory 'targets'): CPL target $45 (range $30-55 for home-service owners), kill at CPL > $90 after >= $60 spend, scale +20%/day for ad sets under target for 3 days, warm-up cap $30/day for the first 14 days of a new account, hard cap $85/day per ad set without founder approval, never touch an ad set with < $60 lifetime spend.
Documented failure modes to avoid: concentrating the whole budget into one ad, editing creatives without approval, spending above the daily cap. You may only propose pause_ad, update_ad_budget (within the change cap), and 'draft' tasks for new creative angles; create_ad is always founder-approved.
Creative angles that work for this buyer: the LSA math ("you pay Google $51 per call; miss 20 and $1,020 is gone"), the voicemail-vs-text side-by-side, the owner in the truck, "your competitor's text-back says sorry we missed you".

${COMPLIANCE_RULES}`;

export const definition: AgentDefinition = {
  role: "ads",
  title: "Ads manager",
  mission: "Keep Meta CPL under $45 while scaling winners inside the caps; feed the founder new creative angles weekly.",
  kpi: "CPL, lead->customer %, spend vs plan",
  cadence: "daily 13:00 and 22:00 UTC",
  effort: "low",
  maxIterations: 10,
  budgetUsdPerRun: 0.75,
  systemPrompt: () => SYSTEM,
  task: () => `Review performance: get_ad_insights for yesterday and last_7d at ad set level, list_ad_sets for budgets/status. Apply the kill/scale rules; propose pause_ad / update_ad_budget with the numbers in the payload (ad_set_id, current_daily_budget_usd, new_daily_budget_usd, reason). If Meta is not configured, say so and instead draft (propose_task kind 'draft') two creative concepts with hook/body/headline/CTA/shot list. remember 'learnings'. Report CPL by ad set and actions.`,
  tools: () => [
    betaZodTool({
      name: "get_ad_insights",
      description: "Meta insights by level for a preset (yesterday, last_7d, last_30d). Returns spend, leads, CPL per row.",
      inputSchema: z.object({ level: z.enum(["campaign", "adset", "ad"]).default("adset"), preset: z.enum(["yesterday", "last_7d", "last_30d", "today"]).default("yesterday") }),
      run: async (input) => {
        if (!metaAdsConfigured()) return "Meta Marketing API not configured (META_ADS_ACCESS_TOKEN / META_AD_ACCOUNT_ID missing)";
        const rows = await getInsights({ level: input.level, datePreset: input.preset });
        return JSON.stringify(rows.map((r) => ({ id: r.adset_id ?? r.ad_id, name: r.adset_name ?? r.ad_name ?? r.campaign_name, spend: r.spendUsd, leads: r.leads, cpl: r.cpl, clicks: r.clicks, cpm: r.cpm })));
      },
    }),
    betaZodTool({
      name: "list_ad_sets",
      description: "Ad sets with status and daily budget (USD).",
      inputSchema: z.object({}),
      run: async () => {
        if (!metaAdsConfigured()) return "Meta Marketing API not configured";
        const rows = await listAdSets();
        return JSON.stringify(rows.map((a) => ({ id: a.id, name: a.name, status: a.effective_status ?? a.status, daily_budget_usd: a.dailyBudgetUsd })));
      },
    }),
  ],
};
