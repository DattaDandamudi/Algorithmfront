/**
 * Shared tools every agent gets. Role-specific tools live next to each role.
 * Tools return strings (or content blocks) — keep results compact; the model pays for every token.
 */
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/db/client";
import type { Json } from "@/lib/db/types";
import { remember } from "./memory";
import { proposeTask } from "./tasks";
import { TASK_KINDS, type AgentContext, type RunnableTool, type TaskKind } from "./types";

const READ_TABLES = ["prospects", "outreach", "agent_tasks", "agent_runs", "metrics_daily", "accounts", "leads", "conversations", "calls", "subscriptions", "usage_monthly", "numbers", "events"] as const;

export function proposeTaskTool(ctx: AgentContext): RunnableTool {
  return betaZodTool({
    name: "propose_task",
    description:
      "Propose a concrete action. Policy decides whether it executes immediately or waits for founder approval. " +
      `Kinds: ${TASK_KINDS.join(", ")}. Put every field the executor needs in payload (e.g. prospect_id, to, subject, body; ad_set_id, new_daily_budget_usd, current_daily_budget_usd; account_id, message).`,
    inputSchema: z.object({
      kind: z.enum(TASK_KINDS),
      title: z.string().min(3).max(200),
      rationale: z.string().max(2000).optional(),
      payload: z.record(z.string(), z.unknown()).default({}),
      estimated_cost_usd: z.number().min(0).max(10000).optional(),
    }),
    run: async (input) => {
      const out = await proposeTask({
        runId: ctx.runId,
        role: ctx.role,
        kind: input.kind as TaskKind,
        title: input.title,
        rationale: input.rationale,
        payload: input.payload,
        estimatedCostUsd: input.estimated_cost_usd,
        autonomy: ctx.autonomy,
      });
      ctx.proposedTaskIds.push(out.taskId);
      return JSON.stringify({ task_id: out.taskId, status: out.status, executed: out.executed, requires_approval: out.requiresApproval, reason: out.reason, result: out.result ?? null, error: out.error ?? null });
    },
  });
}

export function memoryTools(ctx: AgentContext): RunnableTool[] {
  const rememberTool = betaZodTool({
    name: "remember",
    description: "Store a durable note for your role (survives runs). Use short keys like 'learnings', 'best_subject_lines', 'blocked_domains'. Overwrites the key.",
    inputSchema: z.object({ key: z.string().min(1).max(80), value: z.unknown() }),
    run: async (input) => {
      await remember(ctx.role, input.key, input.value as Json);
      ctx.memory[input.key] = input.value as Json;
      return `remembered ${input.key}`;
    },
  });
  const recallTool = betaZodTool({
    name: "recall",
    description: "Read your durable notes. Omit key to list all keys.",
    inputSchema: z.object({ key: z.string().optional() }),
    run: async (input) => {
      if (input.key) return JSON.stringify(ctx.memory[input.key] ?? null);
      return JSON.stringify(Object.keys(ctx.memory));
    },
  });
  return [rememberTool, recallTool];
}

export function queryTableTool(): RunnableTool {
  return betaZodTool({
    name: "query_table",
    description:
      `Read-only query on internal tables (${READ_TABLES.join(", ")}). Filters are ANDed. ops: eq, neq, gt, gte, lt, lte, like, ilike, is, in. Max 200 rows. Select only the columns you need.`,
    inputSchema: z.object({
      table: z.enum(READ_TABLES),
      select: z.string().default("*"),
      filters: z.array(z.object({ column: z.string(), op: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "in"]), value: z.unknown() })).default([]),
      order: z.object({ column: z.string(), ascending: z.boolean().default(false) }).optional(),
      limit: z.number().int().min(1).max(200).default(50),
    }),
    run: async (input) => {
      const db = createAdminSupabase();
      let q = db.from(input.table).select(input.select).limit(input.limit);
      for (const f of input.filters) {
        const v = f.value as never;
        switch (f.op) {
          case "eq": q = q.eq(f.column, v); break;
          case "neq": q = q.neq(f.column, v); break;
          case "gt": q = q.gt(f.column, v); break;
          case "gte": q = q.gte(f.column, v); break;
          case "lt": q = q.lt(f.column, v); break;
          case "lte": q = q.lte(f.column, v); break;
          case "like": q = q.like(f.column, String(f.value)); break;
          case "ilike": q = q.ilike(f.column, String(f.value)); break;
          case "is": q = q.is(f.column, v); break;
          case "in": q = q.in(f.column, Array.isArray(f.value) ? (f.value as never[]) : [v]); break;
        }
      }
      if (input.order) q = q.order(input.order.column, { ascending: input.order.ascending });
      const { data, error } = await q;
      if (error) return `error: ${error.message}`;
      return JSON.stringify(data ?? []);
    },
  });
}

export function metricsTool(): RunnableTool {
  return betaZodTool({
    name: "get_metrics",
    description: "Daily company metrics (customers, MRR, leads, trials, spend, CPL, churn...) for the last N days, newest first.",
    inputSchema: z.object({ days: z.number().int().min(1).max(90).default(14) }),
    run: async (input) => {
      const db = createAdminSupabase();
      const { data } = await db.from("metrics_daily").select("day, metrics").order("day", { ascending: false }).limit(input.days);
      return JSON.stringify(data ?? []);
    },
  });
}

export function logNoteTool(ctx: AgentContext): RunnableTool {
  return betaZodTool({
    name: "log_note",
    description: "Append a short note to this run's log (visible to the founder in /admin/agents). Use for findings, decisions and blockers.",
    inputSchema: z.object({ text: z.string().min(1).max(2000) }),
    run: async (input) => {
      ctx.notes.push(input.text);
      return "noted";
    },
  });
}

/** Anthropic server-side web search (no run function; executes on Anthropic's servers). */
export function webSearchTool(maxUses = 8): RunnableTool {
  return { type: "web_search_20260209", name: "web_search", max_uses: maxUses };
}

export function sharedTools(ctx: AgentContext): RunnableTool[] {
  return [proposeTaskTool(ctx), ...memoryTools(ctx), queryTableTool(), metricsTool(), logNoteTool(ctx)];
}
