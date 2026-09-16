/**
 * Runs one agent: loads its definition + memory, builds a cached system prompt, drives the
 * Anthropic tool runner, records usage/cost and the summary in agent_runs.
 */
import { agentClient } from "./client";
import { supportsAdaptiveThinking } from "@/lib/ai/client";
import { computeCostUsd } from "@/lib/ai/cost";
import { createAdminSupabase } from "@/lib/db/client";
import type { Json } from "@/lib/db/types";
import { env } from "@/lib/env";
import { dailyBudgetUsd, remainingTodayUsd } from "./budget";
import { loadMemory } from "./memory";
import { currentAutonomy } from "./policy";
import { loadDefinition } from "./registry";
import { sharedTools, webSearchTool } from "./tools";
import type { AgentContext, AgentRole, Autonomy, RunResult } from "./types";

export type RunOptions = {
  trigger?: "cron" | "manual" | "event" | "cli";
  input?: Record<string, unknown>;
  autonomy?: Autonomy;
  model?: string;
};

export async function runAgent(role: AgentRole, opts: RunOptions = {}): Promise<RunResult> {
  const db = createAdminSupabase();
  const def = await loadDefinition(role);
  const model = opts.model ?? env.models().chat;
  const autonomy = opts.autonomy ?? currentAutonomy();
  const trigger = opts.trigger ?? "manual";
  const input = opts.input ?? {};

  const remaining = await remainingTodayUsd();
  const perRun = def.budgetUsdPerRun ?? 2;
  if (remaining < Math.min(perRun, 0.5)) {
    const { data } = await db
      .from("agent_runs")
      .insert({ role, trigger, status: "skipped", input: input as Json, summary: `skipped: daily budget exhausted (${dailyBudgetUsd()} USD)`, model })
      .select("id")
      .single();
    return { runId: data?.id ?? "", status: "skipped", summary: "daily budget exhausted", costUsd: 0, tokensIn: 0, tokensOut: 0, iterations: 0, proposedTaskIds: [] };
  }

  const { data: runRow, error: insertErr } = await db
    .from("agent_runs")
    .insert({ role, trigger, status: "running", input: input as Json, model, started_at: new Date().toISOString() })
    .select("id")
    .single();
  if (insertErr || !runRow) throw new Error(`agent_runs insert failed: ${insertErr?.message}`);

  const ctx: AgentContext = {
    runId: runRow.id,
    role,
    now: new Date(),
    autonomy,
    input,
    memory: await loadMemory(role),
    notes: [],
    proposedTaskIds: [],
  };

  let tokensIn = 0;
  let tokensOut = 0;
  let costUsd = 0;
  let iterations = 0;
  let summary = "";
  let status: RunResult["status"] = "succeeded";
  let error: string | undefined;

  try {
    const stable = await def.systemPrompt(ctx);
    const dynamic = [
      `Current time (UTC): ${ctx.now.toISOString()}.`,
      `Autonomy level: ${autonomy} (draft_only = only 'draft' tasks execute; approval_required = low-risk tasks execute, others wait for the founder; autonomous = policy caps apply).`,
      `Remaining model budget today: $${remaining.toFixed(2)} of $${dailyBudgetUsd()}. Per-run budget: $${perRun}.`,
      `Durable memory keys: ${Object.keys(ctx.memory).join(", ") || "(none)"}.`,
      `Run id: ${ctx.runId}.`,
    ].join("\n");
    const roleTools = await def.tools(ctx);
    const tools = [...roleTools, ...sharedTools(ctx), ...(def.webSearch ? [webSearchTool()] : [])];
    const task = await def.task(ctx);

    const tuning = supportsAdaptiveThinking(model)
      ? { thinking: { type: "adaptive" as const }, output_config: { effort: def.effort ?? "medium" } }
      : {};

    const runner = agentClient().beta.messages.toolRunner({
      model,
      max_tokens: 16000,
      max_iterations: def.maxIterations ?? 12,
      system: [
        { type: "text", text: stable, cache_control: { type: "ephemeral" } },
        { type: "text", text: dynamic },
      ],
      messages: [{ role: "user", content: task }],
      tools,
      ...tuning,
    });

    let lastText = "";
    for await (const message of runner) {
      iterations++;
      tokensIn += (message.usage.input_tokens ?? 0) + (message.usage.cache_read_input_tokens ?? 0) + (message.usage.cache_creation_input_tokens ?? 0);
      tokensOut += message.usage.output_tokens ?? 0;
      costUsd += computeCostUsd(model, {
        input_tokens: message.usage.input_tokens ?? 0,
        output_tokens: message.usage.output_tokens ?? 0,
        cache_read_input_tokens: message.usage.cache_read_input_tokens ?? 0,
        cache_creation_input_tokens: message.usage.cache_creation_input_tokens ?? 0,
      });
      const text = message.content
        .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      if (text) lastText = text;
      if (message.stop_reason === "pause_turn") runner.pushMessages({ role: "assistant", content: message.content });
      if (message.stop_reason === "refusal") {
        status = "failed";
        error = `refusal:${message.stop_details?.category ?? "unknown"}`;
        break;
      }
      if (costUsd > perRun * 1.5) {
        ctx.notes.push(`run stopped: per-run budget exceeded ($${costUsd.toFixed(2)} > $${perRun})`);
        break;
      }
    }
    summary = lastText.slice(0, 4000) || "(no final text)";
  } catch (err) {
    status = "failed";
    error = err instanceof Error ? err.message : String(err);
    console.error(`[agents] ${role} run ${ctx.runId} failed`, error);
  }

  const output: Json = { summary, notes: ctx.notes, proposed_task_ids: ctx.proposedTaskIds, input: input as Json };
  await db
    .from("agent_runs")
    .update({ status, summary, output, tokens_in: tokensIn, tokens_out: tokensOut, cost_usd: Number(costUsd.toFixed(4)), iterations, error: error ?? null, finished_at: new Date().toISOString() })
    .eq("id", ctx.runId);

  return { runId: ctx.runId, status, summary, costUsd, tokensIn, tokensOut, iterations, proposedTaskIds: ctx.proposedTaskIds, error };
}
