import type { DailyRecord, ISODate } from '../data/types';
import { addDays } from '../lib/dates';

/**
 * §6.1 EWMA weight trend (Hacker's Diet / TrendWeight).
 *
 *   Trend_today = Trend_yesterday + α × (Weight_today − Trend_yesterday)
 *
 * Pure & deterministic: records may arrive in any order (the store passes an
 * unsorted object-values list); we sort locally and never look at the clock.
 *
 * Only days with a scale weight advance the trend; days without a weigh-in
 * carry the previous trend forward, so the returned map has an entry for every
 * date from the first weigh-in to max(last weigh-in, `through`) — pass `asOf`
 * so "today" has a trend even before today's weigh-in; without it
 * `weeklyRate(trend, today)` would be null on an unlogged day. A record dated
 * AFTER `through` that carries no weigh-in (a bedtime logged for tomorrow,
 * R7-13) gets no entry: a trend value for a day that has not happened is not
 * data. When `through` is omitted the window runs to the last record instead.
 * The first weigh-in seeds the trend. Values are rounded to 0.01 lb for
 * display, but the running trend keeps full precision so rounding never drifts.
 */
export function computeEwmaTrend(
  records: DailyRecord[],
  alpha = 0.1,
  through?: ISODate,
): Map<ISODate, number> {
  const out = new Map<ISODate, number>();
  const sorted = [...records].sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  const byDate = new Map(sorted.map((r) => [r.d, r]));
  const first = sorted.find((r) => isWeight(r.w));
  if (!first) return out;
  let lastWeighIn = first.d;
  for (const r of sorted) if (isWeight(r.w)) lastWeighIn = r.d;
  const end = through || sorted[sorted.length - 1].d;
  const last = end > lastWeighIn ? end : lastWeighIn;
  const a = clampAlpha(alpha);

  let trend = first.w as number;
  let cur = first.d;
  let guard = 0;
  // 20 000 days ≈ 55 years — a hard stop against a malformed date loop.
  while (cur <= last && guard++ < 20000) {
    const r = byDate.get(cur);
    if (r && isWeight(r.w)) {
      trend = trend + a * ((r.w as number) - trend);
    }
    out.set(cur, round2(trend));
    cur = addDays(cur, 1);
  }
  return out;
}

/** A usable scale weight: a finite, positive number of pounds. */
export function isWeight(w: unknown): w is number {
  return typeof w === 'number' && Number.isFinite(w) && w > 0;
}

/**
 * Settings expose 0.10–0.25 (§6.1); the engine tolerates a wider range so a
 * hand-edited import can't produce a frozen (α=0) or non-smoothing (α≥1) trend.
 */
export function clampAlpha(alpha: number): number {
  if (!Number.isFinite(alpha)) return 0.1;
  return Math.min(0.9, Math.max(0.01, alpha));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Trend value on `d`, carrying the latest earlier value forward when the map
 * has no entry for that exact day (a day without a weigh-in is a day the
 * trend simply doesn't move). Undefined before the first weigh-in.
 */
export function trendAt(trend: Map<ISODate, number>, d: ISODate): number | undefined {
  const exact = trend.get(d);
  if (exact !== undefined) return exact;
  let bestDate: ISODate | undefined;
  let bestVal: number | undefined;
  for (const [k, v] of trend) {
    if (k <= d && (bestDate === undefined || k > bestDate)) {
      bestDate = k;
      bestVal = v;
    }
  }
  return bestVal;
}

export interface WeeklyRate {
  /** Trend today − trend 7 days ago (lb). Negative = losing. */
  lbPerWk: number;
  /** As % of trend body weight per week. Negative = losing. */
  pctPerWk: number;
  trendToday: number;
  trend7dAgo: number;
}

/**
 * Weekly rate = Trend_today − Trend_7d_ago (§6.1). Requires a trend value on
 * or before both endpoints (i.e. at least 8 days since the first weigh-in);
 * returns null otherwise.
 */
export function weeklyRate(trend: Map<ISODate, number>, asOf: ISODate): WeeklyRate | null {
  const today = trendAt(trend, asOf);
  const prior = trendAt(trend, addDays(asOf, -7));
  if (today === undefined || prior === undefined || prior <= 0) return null;
  const lb = today - prior;
  return {
    lbPerWk: round2(lb),
    pctPerWk: round2((lb / prior) * 100),
    trendToday: today,
    trend7dAgo: prior,
  };
}

/**
 * Target loss band in lb/wk for a body weight and a %BW/wk band, e.g.
 * 172 lb × [0.5, 1.0]% → [0.86, 1.72] (§6.1).
 */
export function targetLbPerWeek(bodyWeightLb: number, pctBand: [number, number]): [number, number] {
  return [round2((bodyWeightLb * pctBand[0]) / 100), round2((bodyWeightLb * pctBand[1]) / 100)];
}

/**
 * Where a weekly loss rate sits vs the target band. `rateLbPerWk` is signed
 * (negative = losing). For a fat-loss phase, "in" means losing between the
 * band's bounds; "below" means losing too slowly (or gaining); "above" means
 * losing faster than the band.
 */
export function rateBand(
  rateLbPerWk: number | null,
  bodyWeightLb: number,
  pctBand: [number, number],
): 'below' | 'in' | 'above' | null {
  if (rateLbPerWk === null || !Number.isFinite(rateLbPerWk)) return null;
  const [lo, hi] = targetLbPerWeek(bodyWeightLb, pctBand);
  const loss = -rateLbPerWk;
  if (loss < lo) return 'below';
  if (loss > hi) return 'above';
  return 'in';
}

/** Count of scale weigh-ins in the 7 days ending at `asOf` (inclusive). */
export function weighInsInWeek(records: DailyRecord[], asOf: ISODate): number {
  const start = addDays(asOf, -6);
  return records.filter((r) => r.d >= start && r.d <= asOf && isWeight(r.w)).length;
}

/** Latest scale weight on or before `asOf`. */
export function latestWeight(records: DailyRecord[], asOf: ISODate): { d: ISODate; w: number } | null {
  let best: { d: ISODate; w: number } | null = null;
  for (const r of records) {
    if (r.d <= asOf && isWeight(r.w) && (!best || r.d > best.d)) best = { d: r.d, w: r.w };
  }
  return best;
}

/** Cap for `weeksOutsideBand` — beyond two months the count adds nothing. */
export const MAX_WEEKS_OUTSIDE = 8;

/**
 * How many whole weeks the weekly rate has sat outside the target band in the
 * same direction, counting back from `asOf` over consecutive daily
 * evaluations (§6.2 adjusts intake only after a *full* week outside — R3-3).
 * The run ends at the first day that is inside the band, has no rate yet, or
 * is outside in the other direction; 0 while the run is shorter than 7 days.
 * `bodyWeightLb` is the caller's reference weight (a % band moves negligibly
 * over a few weeks, so one weight keeps the answer deterministic).
 */
export function weeksOutsideBand(
  trend: Map<ISODate, number>,
  asOf: ISODate,
  bodyWeightLb: number,
  pctBand: [number, number],
  maxWeeks = MAX_WEEKS_OUTSIDE,
): number {
  const today = weeklyRate(trend, asOf);
  const dir = rateBand(today ? today.lbPerWk : null, bodyWeightLb, pctBand);
  if (dir === null || dir === 'in') return 0;
  const cap = Math.max(1, Math.floor(maxWeeks));
  let run = 0;
  while (run < cap * 7) {
    const rate = weeklyRate(trend, addDays(asOf, -run));
    if (rateBand(rate ? rate.lbPerWk : null, bodyWeightLb, pctBand) !== dir) break;
    run++;
  }
  return Math.floor(run / 7);
}
