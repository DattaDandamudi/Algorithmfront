/**
 * Task executors: one handler per TaskKind. Builders register real handlers here
 * (email via Resend, Meta Marketing API, Stripe, prospect updates...). A kind without a
 * handler can still be proposed and approved; execution then fails loudly with `no_executor`.
 */
import type { TaskExecutor, TaskKind } from "@/lib/agents/core/types";

export const EXECUTORS: Partial<Record<TaskKind, TaskExecutor>> = {
  draft: async () => ({ ok: true, result: { stored: true } }),
};

export function getExecutor(kind: TaskKind): TaskExecutor | null {
  return EXECUTORS[kind] ?? null;
}
