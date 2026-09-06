/**
 * Baseline framing — SPEC §0 "every secondary metric shows 'vs your 30-day
 * average' with a ▲/▼ delta coloured by whether the direction is good".
 *
 * Personal baselines, not population norms (WHOOP/Oura/Garmin all key off the
 * user's own history). The baseline is the mean of a metric over the `days`
 * calendar days strictly before `asOf`, so today's reading is compared with
 * the past rather than with itself. Everything here is pure: sorted
 * `DailyRecord[]` in, plain numbers (or null) out — never NaN, never throws.
 */
import type { BaselineDelta, DailyRecord, ISODate, MetricKey, Profile } from '../data/types';
import { addDays, lastNDates } from '../lib/dates';
import { mean, round } from '../lib/format';

export type GoodDirection = 'up' | 'down' | 'none';

/**
 * Which way is "good" for each metric during the spec persona's fat-loss
 * phase. Weight (`w`/`wt`) is 'down' here; callers in a muscle-gain phase
 * should pass `opts.direction = weightDirection(goalPhase)` instead.
 * Intake metrics (`kc`, `f`, `c`) are targets, not more-is-better, so 'none'.
 */
export const METRIC_DIRECTION: Partial<Record<MetricKey, GoodDirection>> = {
  hrv: 'up',
  rec: 'up',
  rhr: 'down',
  slh: 'up',
  sln: 'none',
  dbt: 'down',
  st: 'up',
  tob: 'down',
  w: 'down',
  wt: 'down',
  p: 'up',
  fi: 'up',
  kc: 'none',
  f: 'none',
  c: 'none',
  strn: 'none',
  nap: 'none',
  h2o: 'up',
};

/** Good direction for scale/trend weight given the goal phase (§6.1). */
export function weightDirection(goalPhase: Profile['goalPhase']): GoodDirection {
  if (goalPhase === 'fat-loss') return 'down';
  if (goalPhase === 'muscle-gain') return 'up';
  return 'none';
}

/** Finite numeric value of a metric on a record, else null. */
export function metricValue(rec: DailyRecord | undefined | null, key: MetricKey): number | null {
  if (!rec) return null;
  const v = rec[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export interface SeriesPoint {
  d: ISODate;
  v: number | null;
}

/**
 * One entry per calendar day for the `days` days ending at `asOf` (inclusive),
 * ascending, with null gaps where no reading exists. Charts and sparklines
 * consume this directly so missing days render as gaps, not as zeros.
 */
export function metricSeries(records: DailyRecord[], key: MetricKey, asOf: ISODate, days: number): SeriesPoint[] {
  const n = Math.max(0, Math.floor(days));
  if (n === 0) return [];
  const dates = lastNDates(asOf, n);
  const start = dates[0];
  const byDate = new Map<ISODate, DailyRecord>();
  for (const r of records) {
    if (r.d >= start && r.d <= asOf) byDate.set(r.d, r);
  }
  return dates.map((d) => ({ d, v: metricValue(byDate.get(d), key) }));
}

export interface BaselineOpts {
  /** Include `asOf` in the baseline window (default false — today is compared against the past). */
  includeToday?: boolean;
  /** Override the metric's default good direction (e.g. weight during muscle gain). */
  direction?: GoodDirection;
}

/**
 * Today's value vs the mean of the previous `days` calendar days.
 *
 * - baseline: mean over [asOf − days, asOf − 1] (or [asOf − days + 1, asOf]
 *   when `includeToday`), rounded to 2 dp; null when no readings.
 * - delta / pct: today − baseline (2 dp) and its % of baseline (1 dp); pct is
 *   null when the baseline is 0.
 * - good: true/false when the delta moves in/against the good direction,
 *   null for a zero delta, a 'none' metric, or missing data.
 * - n: number of days that contributed to the baseline.
 */
export function baselineDelta(
  records: DailyRecord[],
  key: MetricKey,
  asOf: ISODate,
  days = 30,
  opts: BaselineOpts = {},
): BaselineDelta {
  const includeToday = opts.includeToday ?? false;
  const direction: GoodDirection = opts.direction ?? METRIC_DIRECTION[key] ?? 'none';
  const end = includeToday ? asOf : addDays(asOf, -1);
  const values = metricSeries(records, key, end, days)
    .map((p) => p.v)
    .filter((v): v is number => v !== null);
  const baselineRaw = mean(values);
  const today = metricValue(records.find((r) => r.d === asOf), key);

  if (baselineRaw === null || today === null) {
    return {
      today,
      baseline: baselineRaw === null ? null : round(baselineRaw, 2),
      delta: null,
      pct: null,
      n: values.length,
      good: null,
    };
  }

  const deltaRaw = today - baselineRaw;
  const delta = round(deltaRaw, 2);
  const pct = baselineRaw === 0 ? null : round((deltaRaw / baselineRaw) * 100, 1);
  let good: boolean | null = null;
  if (direction !== 'none' && delta !== 0) {
    good = delta > 0 ? direction === 'up' : direction === 'down';
  }
  return { today, baseline: round(baselineRaw, 2), delta, pct, n: values.length, good };
}

/**
 * Trailing rolling mean over a null-gapped series. Each output is the mean of
 * the non-null values in the `window` entries ending at that index (fewer at
 * the start), or null when fewer than `minCount` values are available.
 */
export function rollingMean(values: Array<number | null>, window: number, minCount = 1): Array<number | null> {
  const w = Math.max(1, Math.floor(window));
  const min = Math.max(1, Math.floor(minCount));
  const out: Array<number | null> = new Array(values.length);
  for (let i = 0; i < values.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - w + 1); j <= i; j++) {
      const v = values[j];
      if (v !== null && Number.isFinite(v)) {
        sum += v;
        count++;
      }
    }
    out[i] = count >= min ? sum / count : null;
  }
  return out;
}
