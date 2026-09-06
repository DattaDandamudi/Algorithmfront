/**
 * §3 Adherence heatmap + streaks, and the Trends range-toggle aggregation.
 *
 * Why: the self-monitoring evidence (SPEC §2) says *consistency* of logging
 * and weighing — not precision — drives outcomes (daily weighers −6.1 kg vs
 * less-than-daily; dietary self-monitoring only pays off at >3 days/week;
 * breaks >1 month risk regain). So the app rewards streaks and "hit" days
 * with generous tolerances rather than exact numbers:
 *
 * - proteinHit: protein ≥ target − 10 g (a rounding-noise tolerance).
 * - kcalHit:    target − 400 ≤ kcal ≤ target + 50 — a logged day *under*
 *               target still counts during a fat-loss phase; only a clear
 *               overshoot (> +50) misses.
 * - logged:     ≥ 1 meal or a positive kcal total (partial days count).
 *
 * Everything is pure: sorted `DailyRecord[]` + explicit `asOf` in, plain data
 * out. Missing days are present in the grid with `logged: false` and nulls.
 */
import type { DailyRecord, DayType, ISODate, Profile, Targets } from '../data/types';
import { addDays, lastNDates, weekdayOf } from '../lib/dates';
import { mean, round } from '../lib/format';
import { isWeight } from './weight';
import { dayTotals, dayTypeFor, isLoggedDay } from './nutrition';

/** Tolerances for a "hit" day (see module comment). */
export const PROTEIN_HIT_TOLERANCE_G = 10;
export const KCAL_HIT_OVER_G = 50;
export const KCAL_HIT_UNDER_G = 400;

export interface DayAdherence {
  d: ISODate;
  logged: boolean;
  /** null when the day is not logged. */
  proteinHit: boolean | null;
  kcalHit: boolean | null;
  weighed: boolean;
  proteinG: number | null;
  kcal: number | null;
  /** Lift/rest for the heatmap tooltip (from `profile.split`, `record.lift` override). */
  dayType: DayType;
}

/**
 * One cell per calendar day for the `days` days ending at `asOf` (inclusive),
 * oldest first. Days without a record are present but unlogged.
 */
export function adherenceGrid(
  records: DailyRecord[],
  asOf: ISODate,
  days: number,
  targets: Targets,
  profile: Profile,
): DayAdherence[] {
  const n = Math.max(0, Math.floor(days));
  if (n === 0) return [];
  const dates = lastNDates(asOf, n);
  const start = dates[0];
  const byDate = new Map<ISODate, DailyRecord>();
  for (const r of records) if (r.d >= start && r.d <= asOf) byDate.set(r.d, r);

  return dates.map((d) => {
    const r = byDate.get(d);
    const logged = isLoggedDay(r);
    const weighed = !!r && isWeight(r.w);
    const dayType = dayTypeFor(d, profile, r).type;
    if (!logged) {
      return { d, logged, proteinHit: null, kcalHit: null, weighed, proteinG: null, kcal: null, dayType };
    }
    const t = dayTotals(r);
    return {
      d,
      logged,
      proteinHit: t.p >= targets.protein - PROTEIN_HIT_TOLERANCE_G,
      kcalHit: t.kc <= targets.kcal + KCAL_HIT_OVER_G && t.kc >= targets.kcal - KCAL_HIT_UNDER_G,
      weighed,
      proteinG: t.p,
      kcal: t.kc,
      dayType,
    };
  });
}

/**
 * Consecutive days satisfying `pred`, ending at `asOf` or — so an unlogged
 * "today" doesn't zero the streak before breakfast — at `asOf − 1`.
 */
function streak(records: DailyRecord[], asOf: ISODate, pred: (r: DailyRecord) => boolean): number {
  const byDate = new Map<ISODate, DailyRecord>();
  for (const r of records) if (r.d <= asOf) byDate.set(r.d, r);
  const ok = (d: ISODate) => {
    const r = byDate.get(d);
    return !!r && pred(r);
  };
  let cur = asOf;
  if (!ok(cur)) {
    cur = addDays(asOf, -1);
    if (!ok(cur)) return 0;
  }
  let count = 0;
  let guard = 0;
  while (ok(cur) && guard++ < 20000) {
    count++;
    cur = addDays(cur, -1);
  }
  return count;
}

/** Consecutive logged days (≥1 meal or kcal > 0) ending at `asOf` or `asOf − 1`. */
export function loggingStreak(records: DailyRecord[], asOf: ISODate): number {
  return streak(records, asOf, (r) => isLoggedDay(r));
}

/** Consecutive days with a scale weigh-in ending at `asOf` or `asOf − 1`. */
export function weighInStreak(records: DailyRecord[], asOf: ISODate): number {
  return streak(records, asOf, (r) => isWeight(r.w));
}

export interface AdherenceCounts {
  loggedDays: number;
  proteinHitDays: number;
  kcalHitDays: number;
  weighInDays: number;
  /** loggedDays ÷ grid length, 0–1 (2 dp); 0 for an empty grid. */
  loggingRate: number;
}

export function adherenceCounts(grid: DayAdherence[]): AdherenceCounts {
  let loggedDays = 0;
  let proteinHitDays = 0;
  let kcalHitDays = 0;
  let weighInDays = 0;
  for (const c of grid) {
    if (c.logged) loggedDays++;
    if (c.proteinHit) proteinHitDays++;
    if (c.kcalHit) kcalHitDays++;
    if (c.weighed) weighInDays++;
  }
  return {
    loggedDays,
    proteinHitDays,
    kcalHitDays,
    weighInDays,
    loggingRate: grid.length ? round(loggedDays / grid.length, 2) : 0,
  };
}

// ---------------------------------------------------------------------------
// Range-toggle aggregation (§3: 7D/30D daily, 90D weekly, 1Y monthly)
// ---------------------------------------------------------------------------

export interface AggregatePoint {
  /** Bucket start: the Monday of the week, or the 1st of the month. */
  d: ISODate;
  /** Mean of the non-null values in the bucket (2 dp); null when none. */
  v: number | null;
  /** Number of non-null values that contributed. */
  n: number;
}

/** Monday of the week containing `d` (ISO week start). */
export function weekStartOf(d: ISODate): ISODate {
  const dow = weekdayOf(d); // Sun = 0
  return addDays(d, -((dow + 6) % 7));
}

/** First of the month containing `d`. */
export function monthStartOf(d: ISODate): ISODate {
  return `${d.slice(0, 7)}-01`;
}

/**
 * Collapse a daily null-gapped series into weekly or monthly buckets so a
 * 90-day or 1-year chart shows one point per week/month (Apple Health Trends
 * pattern). Buckets with no readings still appear with `v: null` so gaps stay
 * visible. Output is ascending by bucket start.
 */
export function weeklyAggregate(
  points: Array<{ d: ISODate; v: number | null }>,
  mode: 'weekly' | 'monthly',
): AggregatePoint[] {
  const bucketOf = mode === 'weekly' ? weekStartOf : monthStartOf;
  const buckets = new Map<ISODate, number[]>();
  for (const p of points) {
    if (!p.d) continue;
    const key = bucketOf(p.d);
    const arr = buckets.get(key) ?? [];
    if (typeof p.v === 'number' && Number.isFinite(p.v)) arr.push(p.v);
    buckets.set(key, arr);
  }
  return [...buckets.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([d, vals]) => {
      const m = mean(vals);
      return { d, v: m === null ? null : round(m, 2), n: vals.length };
    });
}
