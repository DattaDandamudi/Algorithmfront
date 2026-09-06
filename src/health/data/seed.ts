/**
 * Demo data generator — PLACEHOLDER to be implemented in Phase 1.
 *
 * Contract: return ~45 days of plausible DailyRecords ending at `endDate`
 * (inclusive) for the spec persona (172 lb → slow trend down, WHOOP recovery,
 * HRV ~50–65 ms, RHR ~52, sleep ~7.2 h vs ~7.9 need, steps 6–11k, 3–5 Indian /
 * Middle-Eastern meals a day totalling ~1,900–2,100 kcal and 160–190 g protein,
 * tobacco 2–6/day trending down with a couple of smoke-free days, bedtimes
 * 22:40–00:20). Must be deterministic (seeded PRNG) so screenshots are stable.
 */
import type { AppSettings, DailyRecord, ISODate } from './types';

export function generateDemoData(_settings: AppSettings, _endDate: ISODate, _days = 45): DailyRecord[] {
  return [];
}
