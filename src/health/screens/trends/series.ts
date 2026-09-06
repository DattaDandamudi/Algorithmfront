/**
 * Trends screen — pure series builders (SPEC §3).
 *
 * Why this module exists: every card on the Trends screen re-renders against
 * ONE shared range — 7D / 30D daily, 90D weekly buckets, 1Y monthly buckets
 * (the Apple Health Trends pattern). The engine hands us null-gapped *daily*
 * series (baseline.metricSeries, hrv.swcBandSeries, weight.computeEwmaTrend,
 * sleep.sleepSummary …) and the chart kit hands us the bucketing
 * (charts.aggregateByBucket / fillDaily); this file is the thin, testable glue
 * between them so the card components stay declarative and never do maths.
 *
 * Pure & deterministic: records + an explicit window in, plain data out —
 * never NaN, never throws, never reads the clock. Weights are stored in lb
 * (data/types.ts); `weightSeries` converts to the profile unit for display.
 */
import type {
  AppSettings,
  Band,
  CoachContext,
  DailyRecord,
  HHMM,
  HrvBand,
  ISODate,
  MetricKey,
  Profile,
  Targets,
} from '../../data/types';
import { MONTH_SHORT, addDays, diffDays, formatDateShort, lastNDates, minutesSinceNoon, parseISODate } from '../../lib/dates';
import { LB_PER_KG, fmt, mean, round } from '../../lib/format';
import {
  KCAL_HIT_OVER_G,
  KCAL_HIT_UNDER_G,
  PROTEIN_HIT_TOLERANCE_G,
  computeEwmaTrend,
  isWeight,
  lnSeries,
  mealOccasions,
  metricSeries,
  rollingMean,
  sleepSummary,
  swcBandSeries,
  waterNoiseBand,
  type DayAdherence,
} from '../../engine';
import {
  RANGE_DAYS,
  aggregateByBucket,
  bucketForRange,
  bucketStart,
  formatTickDate,
  type Aggregation,
  type BarDatum,
  type Bucket,
  type ChartRange,
  type DatedValue,
  type HeatLevel,
  type HeatmapDay,
  type TimeSeriesBandPoint,
} from '../../ui/charts';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const num = (v: unknown): number | null => (isNum(v) ? v : null);

// ---------------------------------------------------------------------------
// Range window
// ---------------------------------------------------------------------------

export interface RangeWindow {
  range: ChartRange;
  /** Calendar days in the window (7 / 30 / 90 / 365). */
  days: number;
  /** First day shown (inclusive). */
  start: ISODate;
  /** Last day shown — today. */
  end: ISODate;
  /** Aggregation bucket: daily up to 30D, weekly at 90D, monthly at 1Y. */
  bucket: Bucket;
  /** Weekly TDEE blocks to evaluate (INTEGRATION_NOTES: 13 for 90D, 52 for 1Y). */
  tdeeWeeks: number;
  /** Human label, e.g. "last 30 days". */
  label: string;
}

/**
 * Weekly TDEE blocks per range. The estimate updates weekly (§6.2), so 7D
 * and 30D show the last few updates rather than a single point.
 */
export const TDEE_WEEKS: Record<ChartRange, number> = { '7D': 4, '30D': 5, '90D': 13, '1Y': 52 };
export const RANGE_LABEL: Record<ChartRange, string> = {
  '7D': 'last 7 days',
  '30D': 'last 30 days',
  '90D': 'last 90 days',
  '1Y': 'last year',
};
export const BUCKET_LABEL: Record<Bucket, string> = { day: 'daily', week: 'weekly averages', month: 'monthly averages' };

export function rangeWindow(range: ChartRange, today: ISODate): RangeWindow {
  const days = RANGE_DAYS[range];
  return {
    range,
    days,
    start: addDays(today, -(days - 1)),
    end: today,
    bucket: bucketForRange(range),
    tdeeWeeks: TDEE_WEEKS[range],
    label: RANGE_LABEL[range],
  };
}

/** Tooltip date header per bucket: 'Sat 6 Sep' / 'Week of 1 Sep' / 'Sep 2026'. */
export function bucketDateFormat(bucket: Bucket): (d: ISODate) => string {
  if (bucket === 'week') {
    return (d) => {
      const dt = parseISODate(d);
      return `Week of ${dt.getDate()} ${MONTH_SHORT[dt.getMonth()]}`;
    };
  }
  if (bucket === 'month') {
    return (d) => {
      const dt = parseISODate(d);
      return `${MONTH_SHORT[dt.getMonth()]} ${dt.getFullYear()}`;
    };
  }
  return formatDateShort;
}

/** Props every Trends card receives from the screen. */
export interface TrendCardProps {
  /** All records, ascending by date (store `useRecords()`). */
  records: DailyRecord[];
  settings: AppSettings;
  /** The shared per-render snapshot (engine/context.ts). */
  ctx: CoachContext;
  win: RangeWindow;
}

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

/** Null-gapped daily metric series over the window, bucketed for 90D / 1Y. */
export function metricChartSeries(records: DailyRecord[], key: MetricKey, win: RangeWindow, agg: Aggregation = 'mean'): DatedValue[] {
  const daily = metricSeries(records, key, win.end, win.days).map((p) => ({ d: p.d, value: p.v }));
  return aggregateByBucket(daily, win.bucket, agg);
}

function zipBand(lo: DatedValue[], hi: DatedValue[]): TimeSeriesBandPoint[] {
  return lo.map((p, i) => ({ d: p.d, lo: p.value, hi: hi[i] ? hi[i].value : null }));
}

/** Bars for BarSeries: axis label per range ('Sat' / '6 Sep' / 'Sep'), whole-number values. */
export function toBars(points: DatedValue[], range: ChartRange): BarDatum[] {
  return points.map((p) => ({ label: formatTickDate(p.d, range), value: p.value === null ? null : round(p.value) }));
}

/** Servings per week from a count over `days` calendar days (1 dp). */
export function perWeek(count: number, days: number): number {
  return days > 0 ? round((count * 7) / days, 1) : 0;
}

// ---------------------------------------------------------------------------
// Weight (§6.1)
// ---------------------------------------------------------------------------

export type WeightUnits = Profile['units'];

/** Multiply a stored lb value by this to get the display unit. */
export function weightFactor(units: WeightUnits): number {
  return units === 'kg' ? 1 / LB_PER_KG : 1;
}

export interface WeightSeries {
  /** Daily scale weights (bucket means at 90D/1Y), display units. */
  dots: DatedValue[];
  /** EWMA trend (bucket end value at 90D/1Y), display units. */
  trend: DatedValue[];
  /** trend ± water-noise half-width. */
  band: TimeSeriesBandPoint[];
  /** Half-width of the noise band, display units. */
  noise: number;
  /** Weigh-ins inside the window. */
  weighIns: number;
}

export function weightSeries(records: DailyRecord[], win: RangeWindow, alpha: number, units: WeightUnits): WeightSeries {
  const k = weightFactor(units);
  const conv = (v: number | null | undefined): number | null => (isNum(v) ? round(v * k, 2) : null);
  // `through = win.end` so today has a trend value even before today's weigh-in.
  const trendMap = computeEwmaTrend(records, alpha, win.end);
  const noise = round(waterNoiseBand(records, win.end) * k, 2);
  const scale = metricSeries(records, 'w', win.end, win.days);
  let weighIns = 0;
  const dotsDaily: DatedValue[] = scale.map((p) => {
    const ok = isWeight(p.v);
    if (ok) weighIns++;
    return { d: p.d, value: ok ? conv(p.v) : null };
  });
  const trendDaily: DatedValue[] = scale.map((p) => ({ d: p.d, value: conv(trendMap.get(p.d)) }));
  const dots = aggregateByBucket(dotsDaily, win.bucket, 'mean');
  // 'last' so the final bucket equals today's trend readout exactly.
  const trend = aggregateByBucket(trendDaily, win.bucket, 'last');
  const band = trend.map((p) => ({
    d: p.d,
    lo: p.value === null ? null : round(p.value - noise, 2),
    hi: p.value === null ? null : round(p.value + noise, 2),
  }));
  return { dots, trend, band, noise, weighIns };
}

/**
 * Where the weekly rate sits vs the 0.5–1 %BW/wk band (§6.1), as a semantic
 * tone + one line of copy. `rateLb` is signed (negative = losing).
 */
export function rateBandState(inBand: CoachContext['weight']['inBand'], rateLb: number | null): { tone: Band; text: string } {
  if (inBand === 'in') return { tone: 'green', text: 'Inside your target band' };
  if (inBand === 'above') return { tone: 'yellow', text: 'Faster than target — protect lean mass' };
  if (inBand === 'below') {
    return rateLb !== null && rateLb > 0
      ? { tone: 'yellow', text: 'Trend is rising — review intake' }
      : { tone: 'yellow', text: 'Losing slower than target' };
  }
  return { tone: 'neutral', text: 'Needs 8+ days of weigh-ins' };
}

// ---------------------------------------------------------------------------
// HRV (§6.3) & RHR
// ---------------------------------------------------------------------------

export interface BandedSeries {
  dots: DatedValue[];
  line: DatedValue[];
  band: TimeSeriesBandPoint[];
}

/** Daily rMSSD dots, 7-day geometric mean line and the SWC band, bucketed. */
export function hrvSeries(records: DailyRecord[], win: RangeWindow): BandedSeries {
  const ln = lnSeries(records, win.end, win.days);
  const swc = swcBandSeries(records, win.end, win.days);
  const dots = aggregateByBucket(ln.map((p) => ({ d: p.d, value: p.ms })), win.bucket, 'mean');
  const line = aggregateByBucket(swc.map((p) => ({ d: p.d, value: p.mean7Ms })), win.bucket, 'mean');
  const lo = aggregateByBucket(swc.map((p) => ({ d: p.d, value: p.lowerMs })), win.bucket, 'mean');
  const hi = aggregateByBucket(swc.map((p) => ({ d: p.d, value: p.upperMs })), win.bucket, 'mean');
  return { dots, line, band: zipBand(lo, hi) };
}

/** Garmin-style band → semantic tone (SPEC §6.3; 'poor' suppresses "balanced" only). */
export function hrvBandTone(band: HrvBand): Band {
  switch (band) {
    case 'balanced':
      return 'green';
    case 'low':
      return 'red';
    case 'unbalanced':
    case 'poor':
      return 'yellow';
    default:
      return 'neutral';
  }
}

export function hrvBandName(band: HrvBand): string {
  switch (band) {
    case 'balanced':
      return 'Balanced';
    case 'low':
      return 'Low';
    case 'unbalanced':
      return 'Unbalanced';
    case 'poor':
      return 'Poor';
    default:
      return 'Baseline forming';
  }
}

export interface LinedSeries {
  dots: DatedValue[];
  line: DatedValue[];
  /** Trailing `window`-day mean at the window end (1 dp); null without readings. */
  meanLast: number | null;
}

/**
 * Daily dots + trailing rolling mean (default 7 days). The mean is computed
 * with `window − 1` days of run-in before the window so its first point is a
 * true 7-day figure, not a 1-day one.
 */
export function rollingMeanSeries(records: DailyRecord[], key: MetricKey, win: RangeWindow, window = 7): LinedSeries {
  const daily = metricSeries(records, key, win.end, win.days + window - 1);
  const rolled = rollingMean(daily.map((p) => p.v), window, 1);
  const offset = Math.max(0, daily.length - win.days);
  const dots: DatedValue[] = [];
  const line: DatedValue[] = [];
  for (let i = offset; i < daily.length; i++) {
    dots.push({ d: daily[i].d, value: daily[i].v });
    const m = rolled[i];
    line.push({ d: daily[i].d, value: m === null ? null : round(m, 1) });
  }
  const last = rolled.length ? rolled[rolled.length - 1] : null;
  return {
    dots: aggregateByBucket(dots, win.bucket, 'mean'),
    line: aggregateByBucket(line, win.bucket, 'mean'),
    meanLast: last === null ? null : round(last, 1),
  };
}

// ---------------------------------------------------------------------------
// Sleep (§6.4)
// ---------------------------------------------------------------------------

export interface SleepSeries {
  /** Hours slept per night (record `slh` — the sleep that ended that morning). */
  hours: DatedValue[];
  /** Need for that night: imported `sln`, else the engine's computed need (null on unlogged nights). */
  need: DatedValue[];
  /** Mean hours over the last 7 nights with data (2 dp). */
  mean7: number | null;
  /** Nights with sleep data in the window. */
  nights: number;
}

export function sleepSeries(records: DailyRecord[], win: RangeWindow, profile: Profile): SleepSeries {
  const byDate = new Map<ISODate, DailyRecord>();
  for (const r of records) byDate.set(r.d, r);
  const hoursDaily: DatedValue[] = [];
  const needDaily: DatedValue[] = [];
  let nights = 0;
  for (const d of lastNDates(win.end, win.days)) {
    const r = byDate.get(d);
    const slh = num(r?.slh);
    hoursDaily.push({ d, value: slh });
    let need: number | null = null;
    if (slh !== null) {
      nights++;
      // sleepSummary(d).need is *last night's* need whenever slh is logged on d.
      need = num(r?.sln) ?? sleepSummary(records, d, profile).need;
    }
    needDaily.push({ d, value: need });
  }
  const last7 = hoursDaily.slice(-7).map((p) => p.value).filter(isNum);
  const m = mean(last7);
  return {
    hours: aggregateByBucket(hoursDaily, win.bucket, 'mean'),
    need: aggregateByBucket(needDaily, win.bucket, 'mean'),
    mean7: m === null ? null : round(m, 2),
    nights,
  };
}

/** §6.4: flag when the 7-night bedtime SD exceeds ~30–60 min. */
export const BEDTIME_SD_OK_MIN = 30;
export const BEDTIME_SD_WARN_MIN = 60;

export function bedtimeSdTone(sdMin: number | null): Band {
  if (sdMin === null || !isNum(sdMin)) return 'neutral';
  if (sdMin < BEDTIME_SD_OK_MIN) return 'green';
  if (sdMin <= BEDTIME_SD_WARN_MIN) return 'yellow';
  return 'red';
}

/**
 * Nightly bedtime offset from the target in minutes (positive = late), on the
 * noon-anchored axis so 00:20 vs a 23:00 target is +80, not −22 h. Bucketed
 * to weekly / monthly means for 90D / 1Y.
 */
export function bedtimeOffsetSeries(records: DailyRecord[], win: RangeWindow, bedTarget: HHMM): DatedValue[] {
  const target = minutesSinceNoon(bedTarget);
  const byDate = new Map<ISODate, DailyRecord>();
  for (const r of records) byDate.set(r.d, r);
  const daily = lastNDates(win.end, win.days).map((d) => {
    const bt = minutesSinceNoon(byDate.get(d)?.bt);
    return { d, value: target === null || bt === null ? null : bt - target };
  });
  return aggregateByBucket(daily, win.bucket, 'mean');
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

export interface StepsStats {
  loggedDays: number;
  /** Days at or above the lower goal. */
  goalDays: number;
  meanSteps: number | null;
}

export function stepsStats(records: DailyRecord[], win: RangeWindow, goalMin: number): StepsStats {
  const vals = metricSeries(records, 'st', win.end, win.days)
    .map((p) => p.v)
    .filter(isNum);
  const m = mean(vals);
  return { loggedDays: vals.length, goalDays: vals.filter((v) => v >= goalMin).length, meanSteps: m === null ? null : round(m) };
}

// ---------------------------------------------------------------------------
// Adherence heatmap (§3)
// ---------------------------------------------------------------------------

export type HeatMode = 'protein' | 'kcal' | 'logging';
export const HEAT_WEEKS = 12;

/** Calendar days needed so the grid covers 12 Monday-start weeks ending with today's week. */
export function heatWindowDays(today: ISODate): number {
  const firstMonday = addDays(bucketStart(today, 'week'), -(HEAT_WEEKS - 1) * 7);
  return diffDays(firstMonday, today) + 1;
}

const level = (n: 0 | 1 | 2 | 3): HeatLevel => n;

/** Heatmap cell for one day under the selected lens. Unlogged days are outlined (`null`). */
export function heatDay(mode: HeatMode, cell: DayAdherence, rec: DailyRecord | undefined, targets: Targets): HeatmapDay {
  const kind = cell.dayType === 'lift' ? 'lift day' : 'rest day';
  if (!cell.logged) return { d: cell.d, level: null, title: `Not logged · ${kind}` };

  if (mode === 'protein') {
    const p = cell.proteinG ?? 0;
    const t = targets.protein;
    const lv = p >= t ? 3 : p >= t - PROTEIN_HIT_TOLERANCE_G ? 2 : p >= t * 0.75 ? 1 : 0;
    return { d: cell.d, level: level(lv), title: `${fmt(p)} g protein — ${cell.proteinHit ? 'hit' : 'missed'} · ${kind}` };
  }

  if (mode === 'kcal') {
    const kc = cell.kcal ?? 0;
    const over = kc - targets.kcal;
    let lv: 0 | 1 | 2 | 3;
    if (cell.kcalHit) lv = 3;
    else if (over > KCAL_HIT_OVER_G && over <= 150) lv = 2;
    else if ((over > 150 && over <= 300) || over < -KCAL_HIT_UNDER_G) lv = 1;
    else lv = 0;
    const verdict =
      over > KCAL_HIT_OVER_G ? `${fmt(over)} over` : over < -KCAL_HIT_UNDER_G ? `${fmt(-over)} under` : 'on target';
    return { d: cell.d, level: level(lv), title: `${fmt(kc)} kcal — ${verdict} · ${kind}` };
  }

  // logging: how complete the day's log is (occasions, not entries — §6.5 "≥4 meals").
  const occasions = mealOccasions(rec?.meals).length;
  const lv = occasions >= 4 ? 3 : occasions >= 2 ? 2 : occasions === 1 ? 1 : 0;
  const what = occasions === 0 ? 'Totals logged' : `${occasions} meal${occasions === 1 ? '' : 's'} logged`;
  return { d: cell.d, level: level(lv), title: `${what}${cell.weighed ? ' · weighed in' : ''}` };
}

/** Legend labels for levels 0–3 under each lens. */
export function heatLegend(mode: HeatMode, targets: Targets): string[] {
  if (mode === 'protein') {
    const t = targets.protein;
    const hit = t - PROTEIN_HIT_TOLERANCE_G;
    return [`< ${fmt(round(t * 0.75))} g`, `${fmt(round(t * 0.75))}–${fmt(hit - 1)} g`, `${fmt(hit)}–${fmt(t - 1)} g`, `≥ ${fmt(t)} g`];
  }
  if (mode === 'kcal') return ['> 300 over', '≤ 300 over / far under', '≤ 150 over', 'On target'];
  return ['Totals only', '1 meal', '2–3 meals', '4+ meals'];
}
