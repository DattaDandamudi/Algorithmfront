/**
 * Hourly Company OS tick: expire stale proposals, dispatch scheduled outreach, run every role due this hour.
 * `?role=<role>` (with the cron secret) forces one role — handy for manual tests.
 */
import type { NextRequest } from "next/server";
import { authorizeCron, cronError, cronResponse } from "@/app/api/cron/_lib/cron";
import { AGENT_ROLES, dueRoles, expireStaleTasks, runAgent, type AgentRole } from "@/lib/agents/core";
import { dispatchScheduledOutreach } from "@/lib/agents/core/dispatch";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const denied = authorizeCron(request);
  if (denied) return denied;
  const startedAt = Date.now();
  const counts = { expired: 0, dispatched: 0, roles: 0, succeeded: 0, failed: 0, skipped: 0 };
  const results: Record<string, unknown> = {};
  try {
    counts.expired = await expireStaleTasks();
    const d = await dispatchScheduledOutreach();
    counts.dispatched = d.sent;
    const forced = request.nextUrl.searchParams.get("role");
    const roles: AgentRole[] = forced && (AGENT_ROLES as readonly string[]).includes(forced) ? [forced as AgentRole] : dueRoles(new Date());
    for (const role of roles) {
      if (Date.now() - startedAt > 240_000) {
        results[role] = "deferred: out of time";
        continue;
      }
      counts.roles++;
      try {
        const r = await runAgent(role, { trigger: "cron" });
        results[role] = { status: r.status, cost: r.costUsd, tasks: r.proposedTaskIds.length, summary: r.summary.slice(0, 200) };
        if (r.status === "succeeded") counts.succeeded++;
        else if (r.status === "skipped") counts.skipped++;
        else counts.failed++;
      } catch (err) {
        counts.failed++;
        results[role] = { status: "failed", error: err instanceof Error ? err.message : String(err) };
      }
    }
    return cronResponse("agents", startedAt, counts, { results });
  } catch (err) {
    return cronError("agents", startedAt, err, counts);
  }
}
