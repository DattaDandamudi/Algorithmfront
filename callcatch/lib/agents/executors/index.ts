/** Task executors: one handler per TaskKind, merged from the sales / growth / ops modules. */
import type { TaskExecutor, TaskKind } from "@/lib/agents/core/types";
import { executors as sales } from "./sales";
import { executors as growth } from "./growth";
import { executors as ops } from "./ops";

export const EXECUTORS: Partial<Record<TaskKind, TaskExecutor>> = {
  draft: async () => ({ ok: true, result: { stored: true } }),
  ...sales,
  ...growth,
  ...ops,
};

export function getExecutor(kind: TaskKind): TaskExecutor | null {
  return EXECUTORS[kind] ?? null;
}
