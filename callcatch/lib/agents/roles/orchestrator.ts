import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/db/client";
import type { AgentDefinition } from "@/lib/agents/core/types";
import { SCHEDULE } from "@/lib/agents/core/schedule";
import { COMPANY_CONTEXT, COMPLIANCE_RULES } from "./_shared";

const SYSTEM = `${COMPANY_CONTEXT}

ROLE: Orchestrator (chief of staff). Each morning you read the numbers, the approval queue and every role's last run, then write a 10-line plan: the one thing each role should optimize today, what is blocked on the founder (LLC/EIN/Stripe/Twilio/keys — from memory 'founder_blockers'), and the approvals waiting. You do not do the roles' work. You send one notify_founder email and store the plan in memory 'daily_plan'.
Stage awareness: at $0-10k MRR the priorities are founder outbound, demo-line calls, verification speed, and ad creative tests; do not let content or ads consume attention before 10 paying customers.

${COMPLIANCE_RULES}`;

export const definition: AgentDefinition = {
  role: "orchestrator",
  title: "Orchestrator",
  mission: "A daily plan that keeps every agent and the founder on the highest-leverage work.",
  kpi: "plan sent by 8:15am ET; blockers cleared within 2 days",
  cadence: "daily 12:00 UTC",
  effort: "medium",
  maxIterations: 8,
  budgetUsdPerRun: 1,
  systemPrompt: () => SYSTEM,
  task: () => `Build today's plan: role_status, list_open_tasks, get_metrics(7), recall founder_blockers. Then propose_task notify_founder {subject: 'CallCatch daily plan', body_text} and remember 'daily_plan'. Return the plan.`,
  tools: () => [
    betaZodTool({
      name: "role_status",
      description: "Last run per role (status, cost, summary excerpt) and the machine schedule.",
      inputSchema: z.object({}),
      run: async () => {
        const db = createAdminSupabase();
        const { data } = await db.from("agent_runs").select("role, status, cost_usd, summary, finished_at").order("created_at", { ascending: false }).limit(200);
        const last: Record<string, unknown> = {};
        for (const r of data ?? []) if (!last[r.role]) last[r.role] = { status: r.status, cost: r.cost_usd, finished_at: r.finished_at, summary: (r.summary ?? "").slice(0, 240) };
        return JSON.stringify({ last, schedule: SCHEDULE });
      },
    }),
    betaZodTool({
      name: "list_open_tasks",
      description: "Tasks waiting for founder approval (proposed) with kind/risk/title.",
      inputSchema: z.object({ limit: z.number().int().min(1).max(100).default(50) }),
      run: async (input) => {
        const db = createAdminSupabase();
        const { data } = await db.from("agent_tasks").select("id, role, kind, risk, title, created_at, estimated_cost_usd").eq("status", "proposed").order("created_at", { ascending: true }).limit(input.limit);
        return JSON.stringify(data ?? []);
      },
    }),
  ],
};
