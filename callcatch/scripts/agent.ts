#!/usr/bin/env tsx
/**
 * CallCatch Company OS CLI.
 *   npx tsx scripts/agent.ts run <role> [--input '{"city":"Houston"}'] [--autonomy draft_only]
 *   npx tsx scripts/agent.ts tasks list [--status proposed] | approve <id> | reject <id> [--reason "..."]
 *   npx tsx scripts/agent.ts prospects import <file.csv> [--source csv] | export [--status queued]
 *   npx tsx scripts/agent.ts metrics [today|YYYY-MM-DD]
 *   npx tsx scripts/agent.ts schedule
 * Loads .env.local (then .env) from the project root without extra dependencies.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

function loadEnv(): void {
  for (const f of [".env.local", ".env"]) {
    const p = path.resolve(process.cwd(), f);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i.exec(line);
      if (!m || line.trim().startsWith("#")) continue;
      let v = m[2].replace(/\s+#.*$/, "");
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (process.env[m[1]] === undefined) process.env[m[1]] = v;
    }
  }
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main(): Promise<void> {
  loadEnv();
  const [cmd, sub, ...rest] = process.argv.slice(2);
  const all = process.argv.slice(2);
  if (cmd === "schedule") {
    const { dueRoles, SCHEDULE } = await import("../lib/agents/core/schedule");
    const now = new Date();
    console.log("Schedule (UTC hours):", JSON.stringify(SCHEDULE, null, 1));
    for (let h = 0; h < 24; h++) {
      const t = new Date(now.getTime() + h * 3600_000);
      const roles = dueRoles(t);
      if (roles.length) console.log(`${t.toISOString().slice(0, 13)}:00Z -> ${roles.join(", ")}`);
    }
    return;
  }
  if (cmd === "run") {
    const { runAgent } = await import("../lib/agents/core/runner");
    const { AGENT_ROLES } = await import("../lib/agents/core/types");
    if (!sub || !(AGENT_ROLES as readonly string[]).includes(sub)) throw new Error(`role required: ${AGENT_ROLES.join("|")}`);
    const input = flag(all, "input") ? JSON.parse(flag(all, "input")!) : {};
    const autonomy = flag(all, "autonomy") as "draft_only" | "approval_required" | "autonomous" | undefined;
    const r = await runAgent(sub as (typeof AGENT_ROLES)[number], { trigger: "cli", input, autonomy });
    console.log(JSON.stringify(r, null, 2));
    return;
  }
  if (cmd === "tasks") {
    const { createAdminSupabase } = await import("../lib/db/client");
    const { approveTask, rejectTask } = await import("../lib/agents/core/tasks");
    const db = createAdminSupabase();
    if (sub === "list") {
      const status = flag(all, "status") ?? "proposed";
      const { data } = await db.from("agent_tasks").select("id, role, kind, risk, status, title, estimated_cost_usd, created_at").eq("status", status).order("created_at").limit(100);
      for (const t of data ?? []) console.log(`${t.id}  ${t.role.padEnd(12)} ${t.kind.padEnd(22)} ${t.risk.padEnd(6)} $${t.estimated_cost_usd}  ${t.title}`);
      return;
    }
    if (sub === "approve") {
      console.log(JSON.stringify(await approveTask(rest[0], null)));
      return;
    }
    if (sub === "reject") {
      await rejectTask(rest[0], null, flag(all, "reason"));
      console.log("rejected");
      return;
    }
  }
  if (cmd === "prospects") {
    if (sub === "import") {
      const { parseProspectsCsv } = await import("../lib/agents/pipelines/csv");
      const { upsertProspects } = await import("../lib/agents/pipelines/ingest");
      const text = readFileSync(rest[0], "utf8");
      const { rows, skipped } = parseProspectsCsv(text, { source: flag(all, "source") ?? "csv" });
      const r = await upsertProspects(rows, { source: flag(all, "source") ?? "csv" });
      console.log(JSON.stringify({ parsed: rows.length, skipped_rows: skipped, ...r }));
      return;
    }
    if (sub === "export") {
      const { createAdminSupabase } = await import("../lib/db/client");
      const { toCsv } = await import("../lib/agents/pipelines/csv");
      const db = createAdminSupabase();
      let q = db.from("prospects").select("business_name, trade, phone, phone_type, email, website, city, state, zip, rating, review_count, fit_score, status, source").order("fit_score", { ascending: false }).limit(5000);
      if (flag(all, "status")) q = q.eq("status", flag(all, "status")!);
      const { data } = await q;
      process.stdout.write(toCsv((data ?? []) as Record<string, unknown>[]));
      return;
    }
  }
  if (cmd === "metrics") {
    const { upsertDailyMetrics } = await import("../lib/agents/metrics/daily");
    const day = sub && sub !== "today" ? new Date(`${sub}T00:00:00Z`) : new Date();
    console.log(JSON.stringify(await upsertDailyMetrics(day), null, 2));
    return;
  }
  console.log("usage: agent.ts run <role> | tasks list|approve|reject | prospects import|export | metrics [date] | schedule");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
