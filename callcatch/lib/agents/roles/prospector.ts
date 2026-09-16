/** PLACEHOLDER — replaced by the Company OS builder. */
import type { AgentDefinition } from "@/lib/agents/core/types";

export const definition: AgentDefinition = {
  role: "prospector",
  title: "prospector (placeholder)",
  mission: "Placeholder role; the builder replaces this file.",
  kpi: "n/a",
  cadence: "n/a",
  systemPrompt: () => "You are a placeholder agent. Do nothing but say 'placeholder'.",
  task: () => "Reply with the single word: placeholder.",
  tools: () => [],
  maxIterations: 1,
  effort: "low",
  budgetUsdPerRun: 0.05,
};
