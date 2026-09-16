import type { AgentRole } from "./types";

/**
 * When each role runs (UTC). The agents cron fires hourly at :05 and runs every role whose
 * hour matches; dayOfWeek 0 = Sunday. Keep total daily runs modest — the daily budget is the cap.
 */
export type Slot = { hoursUtc: number[]; daysOfWeek?: number[] };

export const SCHEDULE: Record<AgentRole, Slot> = {
  orchestrator: { hoursUtc: [12] }, // 8am ET: plan the day
  prospector: { hoursUtc: [13], daysOfWeek: [1, 2, 3, 4, 5] },
  outreach: { hoursUtc: [14, 20], daysOfWeek: [1, 2, 3, 4, 5] }, // 10am + 4pm ET send windows
  closer: { hoursUtc: [15, 21], daysOfWeek: [1, 2, 3, 4, 5] },
  ads: { hoursUtc: [13, 22] },
  content: { hoursUtc: [16], daysOfWeek: [2, 4] },
  support: { hoursUtc: [12, 15, 18, 21, 0] },
  revops: { hoursUtc: [11] },
  compliance: { hoursUtc: [11] },
  board: { hoursUtc: [12], daysOfWeek: [1] }, // Monday board memo
};

export function dueRoles(now: Date): AgentRole[] {
  const h = now.getUTCHours();
  const d = now.getUTCDay();
  return (Object.keys(SCHEDULE) as AgentRole[]).filter((r) => {
    const s = SCHEDULE[r];
    return s.hoursUtc.includes(h) && (!s.daysOfWeek || s.daysOfWeek.includes(d));
  });
}
