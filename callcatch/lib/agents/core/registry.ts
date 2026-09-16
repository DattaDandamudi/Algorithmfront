import type { AgentDefinition, AgentRole } from "./types";

/** Static map so bundlers include every role. Each module exports `definition`. */
const LOADERS: Record<AgentRole, () => Promise<{ definition: AgentDefinition }>> = {
  orchestrator: () => import("@/lib/agents/roles/orchestrator"),
  prospector: () => import("@/lib/agents/roles/prospector"),
  outreach: () => import("@/lib/agents/roles/outreach"),
  closer: () => import("@/lib/agents/roles/closer"),
  ads: () => import("@/lib/agents/roles/ads"),
  content: () => import("@/lib/agents/roles/content"),
  support: () => import("@/lib/agents/roles/support"),
  revops: () => import("@/lib/agents/roles/revops"),
  compliance: () => import("@/lib/agents/roles/compliance"),
  board: () => import("@/lib/agents/roles/board"),
};

export async function loadDefinition(role: AgentRole): Promise<AgentDefinition> {
  const mod = await LOADERS[role]();
  if (!mod.definition || mod.definition.role !== role) throw new Error(`role module ${role} has no matching definition`);
  return mod.definition;
}

export async function loadAllDefinitions(): Promise<AgentDefinition[]> {
  const out: AgentDefinition[] = [];
  for (const role of Object.keys(LOADERS) as AgentRole[]) out.push(await loadDefinition(role));
  return out;
}
