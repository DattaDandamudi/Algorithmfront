import { createAdminSupabase } from "@/lib/db/client";
import type { Json } from "@/lib/db/types";
import type { AgentRole } from "./types";

export async function loadMemory(role: AgentRole): Promise<Record<string, Json>> {
  const db = createAdminSupabase();
  const { data } = await db.from("agent_memory").select("key, value").eq("role", role).limit(200);
  const out: Record<string, Json> = {};
  for (const row of data ?? []) out[row.key] = row.value;
  return out;
}

export async function remember(role: AgentRole, key: string, value: Json): Promise<void> {
  const db = createAdminSupabase();
  const { error } = await db.from("agent_memory").upsert({ role, key, value, updated_at: new Date().toISOString() }, { onConflict: "role,key" });
  if (error) throw new Error(`agent_memory upsert failed: ${error.message}`);
}

export async function forget(role: AgentRole, key: string): Promise<void> {
  const db = createAdminSupabase();
  await db.from("agent_memory").delete().eq("role", role).eq("key", key);
}
