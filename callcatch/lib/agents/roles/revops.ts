import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/db/client";
import type { AgentDefinition } from "@/lib/agents/core/types";
import { upsertDailyMetrics } from "@/lib/agents/metrics/daily";
import { COMPANY_CONTEXT, COMPLIANCE_RULES } from "./_shared";

const SYSTEM = `${COMPANY_CONTEXT}

ROLE: RevOps. You keep the numbers true and catch revenue leaks: metrics snapshot, dunning, trials ending unverified, churn risk, overage not billed.
Churn-risk rubric: live account with 0 calls in 14 days (forwarding probably off) = high; verification pending > 10 days = high; past_due = high; no logins/alerts opened is unknown (not tracked). Propose flag_account with a suggested action (e.g. "call and re-test forwarding"), and one notify_founder digest per run, never per account.

${COMPLIANCE_RULES}`;

export const definition: AgentDefinition = {
  role: "revops",
  title: "RevOps",
  mission: "Daily truth: metrics computed, every at-risk account flagged with a next action, no revenue leak older than a day.",
  kpi: "metrics freshness, at-risk accounts resolved, dunning recovery",
  cadence: "daily 11:00 UTC",
  effort: "low",
  maxIterations: 10,
  budgetUsdPerRun: 0.75,
  systemPrompt: () => SYSTEM,
  task: () => `1) compute_metrics for yesterday and today. 2) list_at_risk and propose flag_account for new risks (skip ones flagged in memory 'flagged' within 7 days). 3) Compare the last 7 days of get_metrics and write a 6-line digest via notify_founder (email) only when something changed materially (new customer, churn, CPL > $55, SLA breach). 4) remember 'flagged' and 'weekly' (cohort notes). Report.`,
  tools: () => [
    betaZodTool({
      name: "compute_metrics",
      description: "Compute and store metrics_daily for a date (YYYY-MM-DD, default today).",
      inputSchema: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }),
      run: async (input) => JSON.stringify(await upsertDailyMetrics(input.date ? new Date(`${input.date}T00:00:00Z`) : new Date())),
    }),
    betaZodTool({
      name: "list_at_risk",
      description: "Accounts with churn/revenue-risk signals: no calls 14d, verification > 10 days, past_due/unpaid, trial ending unverified.",
      inputSchema: z.object({}),
      run: async () => {
        const db = createAdminSupabase();
        const cutoff14 = new Date(Date.now() - 14 * 24 * 3600_000).toISOString();
        const cutoff10 = new Date(Date.now() - 10 * 24 * 3600_000).toISOString();
        const { data: live } = await db.from("accounts").select("id, dba, legal_name, status, plan, created_at, alert_email").eq("status", "live").limit(500);
        const out: Record<string, unknown>[] = [];
        for (const a of live ?? []) {
          const { count } = await db.from("calls").select("id", { count: "exact", head: true }).eq("account_id", a.id).gte("created_at", cutoff14);
          if ((count ?? 0) === 0 && a.created_at < cutoff14) out.push({ account_id: a.id, name: a.dba ?? a.legal_name, risk: "no_calls_14d" });
        }
        const { data: stuck } = await db.from("numbers").select("account_id, phone_number, verification_status, verification_submitted_at").in("verification_status", ["pending", "in_review"]).lt("verification_submitted_at", cutoff10);
        for (const n of stuck ?? []) out.push({ account_id: n.account_id, risk: "verification_over_10d", phone: n.phone_number, submitted: n.verification_submitted_at });
        const { data: dun } = await db.from("subscriptions").select("account_id, status, current_period_end").in("status", ["past_due", "unpaid"]);
        for (const s of dun ?? []) out.push({ account_id: s.account_id, risk: s.status, period_end: s.current_period_end });
        const soon = new Date(Date.now() + 3 * 24 * 3600_000).toISOString();
        const { data: trials } = await db.from("subscriptions").select("account_id, trial_end").eq("status", "trialing").lte("trial_end", soon);
        for (const t of trials ?? []) {
          const { data: n } = await db.from("numbers").select("verification_status").eq("account_id", t.account_id).eq("purpose", "customer").maybeSingle();
          if (n && n.verification_status !== "verified") out.push({ account_id: t.account_id, risk: "trial_ending_unverified", trial_end: t.trial_end });
        }
        return JSON.stringify(out);
      },
    }),
  ],
};
