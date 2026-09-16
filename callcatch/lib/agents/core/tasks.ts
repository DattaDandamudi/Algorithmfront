/**
 * Proposed actions: agents call propose_task; policy decides auto-execute vs approval; the
 * executor runs approved tasks. Every transition is persisted in agent_tasks.
 */
import { createAdminSupabase } from "@/lib/db/client";
import type { AgentTaskRow, Json } from "@/lib/db/types";
import { getExecutor } from "@/lib/agents/executors";
import { dailyCapFor, decide } from "./policy";
import { executedTodayCount } from "./budget";
import type { AgentRole, Autonomy, TaskKind } from "./types";

export type ProposeInput = {
  runId: string | null;
  role: AgentRole;
  kind: TaskKind;
  title: string;
  rationale?: string;
  payload: Record<string, unknown>;
  estimatedCostUsd?: number;
  autonomy: Autonomy;
  /** Hours until an unapproved task expires (default 72). */
  ttlHours?: number;
};

export type ProposeOutcome = { taskId: string; status: string; executed: boolean; requiresApproval: boolean; reason: string; result?: Json; error?: string };

export async function proposeTask(input: ProposeInput): Promise<ProposeOutcome> {
  const db = createAdminSupabase();
  const decision = decide(input.kind, input.autonomy, input.payload);
  let requiresApproval = decision.requiresApproval;
  let reason = decision.reason;
  const cap = dailyCapFor(input.kind);
  if (!requiresApproval && cap !== null) {
    const done = await executedTodayCount(input.kind);
    if (done >= cap) {
      requiresApproval = true;
      reason = `daily cap reached (${done}/${cap})`;
    }
  }
  const expires = new Date(Date.now() + (input.ttlHours ?? 72) * 3600 * 1000).toISOString();
  const { data, error } = await db
    .from("agent_tasks")
    .insert({
      run_id: input.runId,
      role: input.role,
      kind: input.kind,
      title: input.title.slice(0, 200),
      rationale: input.rationale ?? null,
      payload: input.payload as Json,
      status: requiresApproval ? "proposed" : "approved",
      requires_approval: requiresApproval,
      risk: decision.risk,
      estimated_cost_usd: input.estimatedCostUsd ?? 0,
      expires_at: expires,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(`agent_tasks insert failed: ${error?.message ?? "no row"}`);
  if (requiresApproval) return { taskId: data.id, status: "proposed", executed: false, requiresApproval: true, reason };
  const exec = await executeTask(data);
  return { taskId: data.id, status: exec.status, executed: exec.status === "executed", requiresApproval: false, reason, result: exec.result ?? undefined, error: exec.error };
}

export async function approveTask(taskId: string, userId: string | null): Promise<{ status: string; error?: string }> {
  const db = createAdminSupabase();
  const { data: task } = await db.from("agent_tasks").select("*").eq("id", taskId).maybeSingle();
  if (!task) return { status: "missing", error: "task not found" };
  if (task.status !== "proposed") return { status: task.status, error: `task is ${task.status}` };
  const { data: updated } = await db
    .from("agent_tasks")
    .update({ status: "approved", approved_by: userId, approved_at: new Date().toISOString() })
    .eq("id", taskId)
    .eq("status", "proposed")
    .select("*")
    .single();
  if (!updated) return { status: "conflict", error: "task changed concurrently" };
  const exec = await executeTask(updated);
  return { status: exec.status, error: exec.error };
}

export async function rejectTask(taskId: string, userId: string | null, reason?: string): Promise<void> {
  const db = createAdminSupabase();
  await db
    .from("agent_tasks")
    .update({ status: "rejected", approved_by: userId, approved_at: new Date().toISOString(), error: reason ?? null })
    .eq("id", taskId)
    .in("status", ["proposed", "approved"]);
}

/** Runs the executor for an approved task with atomic claim + status bookkeeping. */
export async function executeTask(task: AgentTaskRow): Promise<{ status: "executed" | "failed" | "skipped"; result?: Json | null; error?: string }> {
  const db = createAdminSupabase();
  const claim = await db.from("agent_tasks").update({ status: "executing" }).eq("id", task.id).eq("status", "approved").select("id").maybeSingle();
  if (!claim.data) return { status: "skipped", error: "not claimable" };
  const executor = getExecutor(task.kind as TaskKind);
  const payload = (task.payload ?? {}) as Record<string, unknown>;
  if (!executor) {
    await db.from("agent_tasks").update({ status: "failed", error: "no_executor" }).eq("id", task.id);
    return { status: "failed", error: "no_executor" };
  }
  try {
    const out = await executor({ id: task.id, role: task.role, kind: task.kind as TaskKind, title: task.title, payload });
    await db
      .from("agent_tasks")
      .update({ status: out.ok ? "executed" : "failed", result: out.result ?? null, error: out.ok ? null : (out.error ?? "failed"), executed_at: new Date().toISOString() })
      .eq("id", task.id);
    return out.ok ? { status: "executed", result: out.result ?? null } : { status: "failed", error: out.error };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.from("agent_tasks").update({ status: "failed", error: message, executed_at: new Date().toISOString() }).eq("id", task.id);
    return { status: "failed", error: message };
  }
}

/** Marks stale proposals expired (called by the agents cron). */
export async function expireStaleTasks(): Promise<number> {
  const db = createAdminSupabase();
  const { data } = await db
    .from("agent_tasks")
    .update({ status: "expired" })
    .eq("status", "proposed")
    .lt("expires_at", new Date().toISOString())
    .select("id");
  return data?.length ?? 0;
}
