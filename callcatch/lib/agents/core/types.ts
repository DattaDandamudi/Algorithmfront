/**
 * CallCatch Company OS — shared types for the multi-agent operating system.
 * Each role lives in lib/agents/roles/<role>.ts and exports `definition: AgentDefinition`.
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { Json } from "@/lib/db/types";

/** Anything the beta tool runner accepts: zod/JSON-schema runnable tools and Anthropic server tools. */
type ToolRunnerParams = Parameters<Anthropic["beta"]["messages"]["toolRunner"]>[0];
export type RunnableTool = ToolRunnerParams["tools"][number];

export const AGENT_ROLES = [
  "orchestrator",
  "prospector",
  "outreach",
  "closer",
  "ads",
  "content",
  "support",
  "revops",
  "compliance",
  "board",
] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];

export type Autonomy = "draft_only" | "approval_required" | "autonomous";

export const TASK_KINDS = [
  "send_outreach_email",
  "schedule_call",
  "update_prospect",
  "update_ad_budget",
  "pause_ad",
  "create_ad",
  "publish_content",
  "reply_support_email",
  "apply_credit",
  "flag_account",
  "notify_founder",
  "draft",
] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

export type AgentContext = {
  runId: string;
  role: AgentRole;
  now: Date;
  autonomy: Autonomy;
  input: Record<string, unknown>;
  /** Durable per-role notes loaded from agent_memory at run start. */
  memory: Record<string, Json>;
  /** Free-form notes the agent logs during the run (persisted in agent_runs.output.notes). */
  notes: string[];
  /** Ids of agent_tasks proposed during this run. */
  proposedTaskIds: string[];
};

export type AgentDefinition = {
  role: AgentRole;
  title: string;
  /** One paragraph: what this agent owns and the outcome it is measured on. */
  mission: string;
  kpi: string;
  /** Human-readable cadence; the machine schedule lives in lib/agents/core/schedule.ts. */
  cadence: string;
  /**
   * Stable system prompt (cached across runs — keep timestamps and run-specific data OUT of it;
   * the runner appends a dynamic block with the current time, autonomy and budget).
   */
  systemPrompt: (ctx: AgentContext) => string | Promise<string>;
  /** The user message for this run: the concrete job, with any input parameters rendered. */
  task: (ctx: AgentContext) => string | Promise<string>;
  /** Role-specific tools. The runner adds the shared tools (propose_task, remember/recall, query_table, get_metrics, log_note). */
  tools: (ctx: AgentContext) => RunnableTool[] | Promise<RunnableTool[]>;
  /** Grants the Anthropic server-side web_search tool. */
  webSearch?: boolean;
  maxIterations?: number; // default 12
  effort?: "low" | "medium" | "high"; // default medium
  budgetUsdPerRun?: number; // default 2.00
};

export type RunResult = {
  runId: string;
  status: "succeeded" | "failed" | "skipped";
  summary: string;
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
  iterations: number;
  proposedTaskIds: string[];
  error?: string;
};

export type TaskExecutorResult = { ok: boolean; result?: Json; error?: string };
export type TaskExecutor = (task: {
  id: string;
  role: string;
  kind: TaskKind;
  title: string;
  payload: Record<string, unknown>;
}) => Promise<TaskExecutorResult>;
