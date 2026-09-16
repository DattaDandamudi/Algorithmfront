import type { NextRequest } from "next/server";
import { authorizeCron, cronError, cronResponse } from "@/app/api/cron/_lib/cron";
import { upsertDailyMetrics } from "@/lib/agents/metrics/daily";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const denied = authorizeCron(request);
  if (denied) return denied;
  const startedAt = Date.now();
  try {
    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 3600_000);
    const y = await upsertDailyMetrics(yesterday);
    const t = await upsertDailyMetrics(today);
    return cronResponse("metrics-daily", startedAt, { days: 2 }, { yesterday: y, today: t });
  } catch (err) {
    return cronError("metrics-daily", startedAt, err);
  }
}
