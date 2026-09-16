import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/db/client";
import type { AgentDefinition } from "@/lib/agents/core/types";
import { COMPANY_CONTEXT, COMPLIANCE_RULES } from "./_shared";

const SYSTEM = `${COMPANY_CONTEXT}

ROLE: Board. Every Monday you write the board memo the founder would want from a COO: numbers first, then the three decisions that matter, then risks. Format: 1) Scorecard (customers, MRR, collected, ad spend, CPL, pipeline: contacted/replies/demos, verification SLAs, agent cost and cost as % of MRR). 2) What moved and why (max 5 bullets). 3) Three decisions with a recommendation each. 4) Risks/compliance. 5) Next week's plan per role. Under 500 words. No filler, no praise.

${COMPLIANCE_RULES}`;

export const definition: AgentDefinition = {
  role: "board",
  title: "Board memo",
  mission: "A Monday memo that lets the founder run the week from one page.",
  kpi: "memo delivered by 8:30am ET Monday; decisions acted on",
  cadence: "Mondays 12:00 UTC",
  effort: "high",
  maxIterations: 8,
  budgetUsdPerRun: 2,
  systemPrompt: () => SYSTEM,
  task: () => `Compile the memo from week_summary (+ get_metrics 14 days for trend), propose_task notify_founder {subject: 'Board memo <week>', body_text: memo}, and remember 'last_memo'. Return the memo as your final text.`,
  tools: () => [
    betaZodTool({
      name: "week_summary",
      description: "Last 7 days: agent runs/cost by role, tasks by status, pipeline counts by prospect status, verification statuses.",
      inputSchema: z.object({}),
      run: async () => {
        const db = createAdminSupabase();
        const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
        const [{ data: runs }, { data: tasks }, { data: prospects }, { data: numbers }] = await Promise.all([
          db.from("agent_runs").select("role, status, cost_usd").gte("created_at", since).limit(2000),
          db.from("agent_tasks").select("role, kind, status").gte("created_at", since).limit(2000),
          db.from("prospects").select("status").limit(5000),
          db.from("numbers").select("verification_status").eq("purpose", "customer").limit(2000),
        ]);
        const by = <T extends Record<string, unknown>>(rows: T[] | null, key: keyof T) => {
          const m: Record<string, number> = {};
          for (const r of rows ?? []) m[String(r[key])] = (m[String(r[key])] ?? 0) + 1;
          return m;
        };
        const cost: Record<string, number> = {};
        for (const r of runs ?? []) cost[r.role] = Number(((cost[r.role] ?? 0) + Number(r.cost_usd)).toFixed(2));
        return JSON.stringify({ runs_by_status: by(runs, "status"), cost_by_role: cost, tasks_by_status: by(tasks, "status"), tasks_by_kind: by(tasks, "kind"), prospects_by_status: by(prospects, "status"), numbers_by_verification: by(numbers, "verification_status") });
      },
    }),
    betaZodTool({ name: "noop", description: "Unused placeholder to keep the tool list stable for caching.", inputSchema: z.object({}), run: async () => "ok" }),
  ],
};
