"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { isAdminEmail, requireUser } from "@/lib/auth/session";
import { AGENT_ROLES, approveTask, rejectTask, runAgent } from "@/lib/agents/core";
import { remember } from "@/lib/agents/core/memory";

export type AgentActionState = { ok?: string; error?: string } | null;

async function requireAdmin() {
  const user = await requireUser();
  if (!isAdminEmail(user.email)) redirect("/dashboard");
  return user;
}

export async function runRoleAction(_prev: AgentActionState, formData: FormData): Promise<AgentActionState> {
  try {
    await requireAdmin();
    const role = z.enum(AGENT_ROLES).parse(formData.get("role"));
    const inputRaw = String(formData.get("input") ?? "").trim();
    const input = inputRaw ? (JSON.parse(inputRaw) as Record<string, unknown>) : {};
    const r = await runAgent(role, { trigger: "manual", input });
    revalidatePath("/admin/agents");
    return r.status === "failed" ? { error: `${role} failed: ${r.error ?? "unknown"}` } : { ok: `${role}: ${r.status} · $${r.costUsd.toFixed(2)} · ${r.proposedTaskIds.length} task(s) · ${r.summary.slice(0, 160)}` };
  } catch (err) {
    unstable_rethrow(err);
    return { error: err instanceof Error ? err.message : "Could not run the agent." };
  }
}

export async function approveTaskAction(_prev: AgentActionState, formData: FormData): Promise<AgentActionState> {
  try {
    const user = await requireAdmin();
    const id = z.string().uuid().parse(formData.get("taskId"));
    const r = await approveTask(id, user.id);
    revalidatePath("/admin/agents");
    return r.status === "executed" ? { ok: "Approved and executed." } : { error: `Task ${r.status}: ${r.error ?? ""}` };
  } catch (err) {
    unstable_rethrow(err);
    return { error: err instanceof Error ? err.message : "Could not approve." };
  }
}

export async function rejectTaskAction(_prev: AgentActionState, formData: FormData): Promise<AgentActionState> {
  try {
    const user = await requireAdmin();
    const id = z.string().uuid().parse(formData.get("taskId"));
    const reason = String(formData.get("reason") ?? "").slice(0, 500) || undefined;
    await rejectTask(id, user.id, reason);
    revalidatePath("/admin/agents");
    return { ok: "Rejected." };
  } catch (err) {
    unstable_rethrow(err);
    return { error: err instanceof Error ? err.message : "Could not reject." };
  }
}

export async function saveBlockersAction(_prev: AgentActionState, formData: FormData): Promise<AgentActionState> {
  try {
    await requireAdmin();
    const text = String(formData.get("blockers") ?? "").slice(0, 4000);
    const items = text.split("\n").map((s) => s.trim()).filter(Boolean);
    await remember("orchestrator", "founder_blockers", items);
    revalidatePath("/admin/agents");
    return { ok: `Saved ${items.length} blocker(s).` };
  } catch (err) {
    unstable_rethrow(err);
    return { error: err instanceof Error ? err.message : "Could not save." };
  }
}
