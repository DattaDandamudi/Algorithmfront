/**
 * §6.6 Tobacco — counts/day, smoke-free streak, 7-day trend, and the cost
 * reflected back in the user's OWN physiology.
 *
 * Nicotine shows up the NEXT morning (WHOOP: ~3 ms lower HRV, ~1 bpm higher
 * RHR, ~2.5% lower next-day recovery; SPEC §2 "Nicotine, HRV, RHR, sleep"),
 * so every comparison pairs day D's `tob` with the `hrv`/`rhr`/`rec` recorded
 * on D + 1. Today's count can't be scored yet — its morning hasn't happened.
 *
 * Streak semantics: consecutive logged days with `tob === 0`, ending at asOf
 * (or asOf − 1 when today has no entry yet). Days with no `tob` value are
 * unverified: they neither count nor break the streak; any day with tob > 0
 * ends it. A smoke-free day therefore needs an explicit 0 (store
 * `adjustTobacco(d, 0)` writes one).
 *
 * Every comparison of means ships its counts (`nFree`/`nSmoke`): a difference
 * between two averages with no n behind it is not a finding, and the insight
 * copy is required to quote both.
 *
 * Pure: records in any order (indexed by date), null for missing data, never
 * NaN, never throws, no clock access.
 */
import type { DailyRecord, ISODate } from '../data/types';
import { addDays, lastNDates } from '../lib/dates';
import { mean, round } from '../lib/format';

/** Minimum paired days per group before the HRV comparison is shown. */
export const TOBACCO_MIN_GROUP_N = 3;

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Tobacco count on a record: a finite, non-negative number, else null (unlogged). */
export function tobaccoOf(r: DailyRecord | undefined | null): number | null {
  const t = num(r?.tob);
  return t !== null && t >= 0 ? t : null;
}

function indexByDate(records: DailyRecord[]): Map<ISODate, DailyRecord> {
  const m = new Map<ISODate, DailyRecord>();
  for (const r of records) m.set(r.d, r);
  return m;
}

const nonNull = (v: number | null): v is number => v !== null;

export interface TobaccoStats {
  /** Today's count (0 when nothing logged yet). */
  today: number;
  /** Mean over logged days in the last 7 / 30 days ending at asOf, 1 dp. */
  avg7: number | null;
  avg30: number | null;
  streakDays: number;
  /** Last 7 days ascending; null where nothing was logged. */
  trend7: Array<{ d: ISODate; count: number | null }>;
  /** Lowest logged count in the last 30 days. */
  best30: number | null;
}

/** Smoke-free streak: walk logged days backwards from asOf; 0 counts, > 0 breaks, unlogged is skipped. */
export function smokeFreeStreak(records: DailyRecord[], asOf: ISODate): number {
  const logged = records
    .filter((r) => r.d <= asOf && tobaccoOf(r) !== null)
    .sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0));
  let streak = 0;
  for (const r of logged) {
    if (tobaccoOf(r) === 0) streak++;
    else break;
  }
  return streak;
}

export function tobaccoStats(records: DailyRecord[], asOf: ISODate): TobaccoStats {
  const byDate = indexByDate(records);
  const today = tobaccoOf(byDate.get(asOf)) ?? 0;
  const trend7 = lastNDates(asOf, 7).map((d) => ({ d, count: tobaccoOf(byDate.get(d)) }));
  const vals7 = trend7.map((p) => p.count).filter(nonNull);
  const vals30 = lastNDates(asOf, 30)
    .map((d) => tobaccoOf(byDate.get(d)))
    .filter(nonNull);
  const m7 = mean(vals7);
  const m30 = mean(vals30);
  return {
    today,
    avg7: m7 === null ? null : round(m7, 1),
    avg30: m30 === null ? null : round(m30, 1),
    streakDays: smokeFreeStreak(records, asOf),
    trend7,
    best30: vals30.length ? Math.min(...vals30) : null,
  };
}

export interface TobaccoHrvComparison {
  /** Next-morning means (1 dp) after smoke-free vs smoking days. */
  hrvSmokeFree: number | null;
  hrvSmoking: number | null;
  rhrSmokeFree: number | null;
  rhrSmoking: number | null;
  recSmokeFree: number | null;
  recSmoking: number | null;
  /** Paired days per group (a day counts when its next morning has any of hrv/rhr/rec). */
  nFree: number;
  nSmoke: number;
  /** hrvSmokeFree − hrvSmoking (positive = HRV is higher after smoke-free days). */
  hrvDelta: number | null;
}

interface Group {
  hrv: number[];
  rhr: number[];
  rec: number[];
  n: number;
}

function meanOrNull(xs: number[]): number | null {
  const m = mean(xs);
  return m === null ? null : round(m, 1);
}

/**
 * Pair each logged tobacco day in the `days` days before asOf with the
 * following morning's readings. Runs whatever the group sizes are — the counts
 * are part of the answer, so callers can say "3 smoke-free days" instead of
 * quoting a difference of means with no n behind it.
 */
function pairedGroups(records: DailyRecord[], asOf: ISODate, days: number): { free: Group; smoke: Group } {
  const n = Math.max(1, Math.floor(days));
  const byDate = indexByDate(records);
  const free: Group = { hrv: [], rhr: [], rec: [], n: 0 };
  const smoke: Group = { hrv: [], rhr: [], rec: [], n: 0 };

  for (const d of lastNDates(addDays(asOf, -1), n)) {
    const t = tobaccoOf(byDate.get(d));
    if (t === null) continue;
    const next = byDate.get(addDays(d, 1));
    const hrv = num(next?.hrv);
    const rhr = num(next?.rhr);
    const rec = num(next?.rec);
    if (hrv === null && rhr === null && rec === null) continue;
    const g = t === 0 ? free : smoke;
    g.n++;
    if (hrv !== null) g.hrv.push(hrv);
    if (rhr !== null) g.rhr.push(rhr);
    if (rec !== null) g.rec.push(rec);
  }
  return { free, smoke };
}

/**
 * Pair each logged tobacco day in the `days` days before asOf with the
 * following morning's readings (which must be on or before asOf). Null until
 * both groups have ≥ TOBACCO_MIN_GROUP_N paired days.
 */
export function tobaccoHrvComparison(records: DailyRecord[], asOf: ISODate, days = 30): TobaccoHrvComparison | null {
  const { free, smoke } = pairedGroups(records, asOf, days);

  if (free.n < TOBACCO_MIN_GROUP_N || smoke.n < TOBACCO_MIN_GROUP_N) return null;
  const hrvSmokeFree = meanOrNull(free.hrv);
  const hrvSmoking = meanOrNull(smoke.hrv);
  return {
    hrvSmokeFree,
    hrvSmoking,
    rhrSmokeFree: meanOrNull(free.rhr),
    rhrSmoking: meanOrNull(smoke.rhr),
    recSmokeFree: meanOrNull(free.rec),
    recSmoking: meanOrNull(smoke.rec),
    nFree: free.n,
    nSmoke: smoke.n,
    hrvDelta: hrvSmokeFree === null || hrvSmoking === null ? null : round(hrvSmokeFree - hrvSmoking, 1),
  };
}

export interface TobaccoInsightNumbers {
  /** Today's count. */
  count: number;
  /** 7-day average, 1 dp. */
  avg: number | null;
  /** Mean next-morning HRV after the last 3 smoke-free days (null until there are 3). */
  hrvFree: number | null;
  /** hrvFree − mean next-morning HRV after smoking days (needs ≥ 3 smoking days). */
  delta: number | null;
  /**
   * Paired days behind each mean over the 30-day window. **A comparison of
   * means without its counts is not a finding** — the insight quotes both, and
   * they are reported even when the comparison itself is below its minimum so
   * the UI can say how far off it is.
   */
  nFree: number;
  nSmoke: number;
}

/**
 * Numbers for insight template #9: "{count} today vs your {avg} average. On
 * your last 3 smoke-free days HRV averaged {hrv_free} ms — {delta} higher than
 * your {nSmoke} smoking days." Looks back 30 days before asOf.
 */
export function tobaccoInsightNumbers(records: DailyRecord[], asOf: ISODate): TobaccoInsightNumbers {
  const stats = tobaccoStats(records, asOf);
  const cmp = tobaccoHrvComparison(records, asOf, 30);
  const groups = pairedGroups(records, asOf, 30);
  const byDate = indexByDate(records);

  const recentFree: number[] = [];
  const window = lastNDates(addDays(asOf, -1), 30);
  for (let i = window.length - 1; i >= 0 && recentFree.length < 3; i--) {
    const d = window[i];
    if (tobaccoOf(byDate.get(d)) !== 0) continue;
    const hrv = num(byDate.get(addDays(d, 1))?.hrv);
    if (hrv !== null) recentFree.push(hrv);
  }
  const hrvFree = recentFree.length === 3 ? meanOrNull(recentFree) : null;
  const delta = hrvFree !== null && cmp?.hrvSmoking != null ? round(hrvFree - cmp.hrvSmoking, 1) : null;

  return { count: stats.today, avg: stats.avg7, hrvFree, delta, nFree: groups.free.n, nSmoke: groups.smoke.n };
}
