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
 * The non-chart derivations (heatmap cells, weekly TDEE points, intake copy,
 * frequency rows) live next door in ./summaries.ts.
 */
import type {
  AppSettings,
  Band,
  CheckInSettings,
  CoachContext,
  DailyRecord,
  Exercise,
  HHMM,
  HrvBand,
  ISODate,
  MetricKey,
  Muscle,
  MuscleVolume,
  Profile,
  VolumeLandmark,
  Workout,
} from '../../data/types';
import { MONTH_SHORT, addDays, formatDateShort, lastNDates, minutesSinceNoon, parseISODate } from '../../lib/dates';
import { LB_PER_KG, fmt, mean, round, stddev } from '../../lib/format';
import {
  BASELINE_DAYS,
  bedtimeConsistency,
  checkInSummary,
  isWeight,
  lnSeries,
  metricSeries,
  overnightStrainIndex,
  rollingMean,
  sleepSummary,
  swcBandSeries,
  weekStartMonday,
  weeklySetsByMuscle,
  type AcwrPoint,
  type KalmanResult,
  type LoadPoint,
} from '../../engine';
import {
  RANGE_DAYS,
  aggregateByBucket,
  bucketForRange,
  formatTickDate,
  type Aggregation,
  type BarDatum,
  type Bucket,
  type ChartRange,
  type DatedValue,
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

/** 'Last 30 days · daily · 8 Aug – 6 Sep' — the sticky header's second line. */
export function rangeCaption(win: RangeWindow): string {
  const day = (d: ISODate) => {
    const dt = parseISODate(d);
    return `${dt.getDate()} ${MONTH_SHORT[dt.getMonth()]}`;
  };
  const label = win.label.charAt(0).toUpperCase() + win.label.slice(1);
  return `${label} · ${BUCKET_LABEL[win.bucket]} · ${day(win.start)} – ${day(win.end)}`;
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
// Personal baseline band (§0 / §3 "each with a baseline band")
// ---------------------------------------------------------------------------

export interface BaselineBand {
  mean: number;
  sd: number;
  /** mean − sd / mean + sd. */
  lo: number;
  hi: number;
  /** Readings in the window. */
  n: number;
}

/** Readings needed before a ± SD band is drawn — a 2-reading SD is noise, a week is a range. */
export const BAND_MIN_READINGS = 7;

/**
 * Personal normal range: mean ± 1 SD over the `days` days BEFORE `asOf`
 * (today excluded — the same window `baselineDelta` uses for the ▲/▼
 * readout, so the band and the delta describe one baseline). Null until
 * `BAND_MIN_READINGS` readings exist. Used for RHR (28 days) and sleep hours
 * (30 nights) — review R2-7.
 */
export function baselineBand(records: DailyRecord[], key: MetricKey, asOf: ISODate, days: number): BaselineBand | null {
  const vals = metricSeries(records, key, addDays(asOf, -1), days)
    .map((p) => p.v)
    .filter(isNum);
  const m = mean(vals);
  const sd = stddev(vals);
  if (m === null || sd === null || vals.length < BAND_MIN_READINGS) return null;
  return { mean: round(m, 2), sd: round(sd, 2), lo: round(m - sd, 2), hi: round(m + sd, 2), n: vals.length };
}

// ---------------------------------------------------------------------------
// Weight (§6.1)
// ---------------------------------------------------------------------------

export type WeightUnits = Profile['units'];

/** Multiply a stored lb value by this to get the display unit. */
export function weightFactor(units: WeightUnits): number {
  return units === 'kg' ? 1 / LB_PER_KG : 1;
}

/**
 * z for the drawn weight band. The Kalman level's posterior is Gaussian, so
 * `level ± 1.645·levelSd` is the 90% credible interval — the same coverage
 * `ctx.weight.rateLow90/rateHigh90` publishes for the rate, so the two
 * uncertainties on the card are read the same way.
 */
export const WEIGHT_BAND_Z = 1.645;

export interface WeightSeries {
  /** Accepted daily scale weights (bucket means at 90D/1Y), display units. */
  dots: DatedValue[];
  /**
   * Weigh-ins the Kalman outlier gate rejected, on the same axis — drawn
   * hollow so a typo is visible without being folded into the trend.
   */
  suspect: DatedValue[];
  /** RTS-smoothed Kalman level (bucket end value at 90D/1Y), display units. */
  trend: DatedValue[];
  /** level ± `WEIGHT_BAND_Z`·levelSd — the smoothed 90% band (§1a). */
  band: TimeSeriesBandPoint[];
  /** Half-width of the band at the window end, display units; null without a level. */
  bandHalf: number | null;
  /** Accepted weigh-ins inside the window. */
  weighIns: number;
  /** Rejected weigh-ins inside the window. */
  suspectCount: number;
  /** Weigh-ins ever (up to the window end) — the trend gate, independent of the range (review R2-3). */
  totalWeighIns: number;
}

/**
 * The drawn weight trend is the **smoothed** Kalman level with its 90% band,
 * not the EWMA (§1a): the RTS pass uses every later weigh-in to place each
 * day's level, so the line a user reads back over is the best estimate we
 * have of where they actually were. It is deliberately not persisted — the
 * store stamps the causal filter (`kl`/`kv`) because a smoothed value would
 * change under the user retroactively — so `kalman` is smoothed at render
 * time by the caller and handed in here.
 *
 * Pass the result of `smoothKalman(computeKalmanTrend(records, win.end, …))`;
 * `computeEwmaTrend` survives for export continuity and the Log block line,
 * and a test pins the two within 1.5 lb on demo data.
 */
export function weightSeries(records: DailyRecord[], win: RangeWindow, kalman: KalmanResult, units: WeightUnits): WeightSeries {
  const k = weightFactor(units);
  const conv = (v: number | null | undefined): number | null => (isNum(v) ? round(v * k, 2) : null);
  const scale = metricSeries(records, 'w', win.end, win.days);
  const byDate = new Map<ISODate, DailyRecord>();
  for (const r of records) byDate.set(r.d, r);
  let totalWeighIns = 0;
  for (const r of records) if (r.d <= win.end && isWeight(r.w)) totalWeighIns++;

  let weighIns = 0;
  let suspectCount = 0;
  const dotsDaily: DatedValue[] = [];
  const suspectDaily: DatedValue[] = [];
  const trendDaily: DatedValue[] = [];
  const loDaily: DatedValue[] = [];
  const hiDaily: DatedValue[] = [];
  for (const p of scale) {
    const point = kalman.byDate.get(p.d);
    // Same test the context applies (`ctx.weight.suspectToday`): the filter's
    // own verdict, or the flag the store stamped when it ran.
    const rejected = point?.suspect === true || byDate.get(p.d)?.ws === true;
    const logged = isWeight(p.v);
    if (logged) {
      if (rejected) suspectCount++;
      else weighIns++;
    }
    dotsDaily.push({ d: p.d, value: logged && !rejected ? conv(p.v) : null });
    suspectDaily.push({ d: p.d, value: logged && rejected ? conv(p.v) : null });
    const level = point && isNum(point.level) ? point.level : null;
    const sd = point && isNum(point.levelSd) ? point.levelSd : null;
    const half = level === null || sd === null ? null : round(WEIGHT_BAND_Z * sd * k, 2);
    trendDaily.push({ d: p.d, value: conv(level) });
    loDaily.push({ d: p.d, value: level === null || half === null ? null : round(level * k - half, 2) });
    hiDaily.push({ d: p.d, value: level === null || half === null ? null : round(level * k + half, 2) });
  }

  const endPoint = kalman.byDate.get(win.end);
  const bandHalf = endPoint && isNum(endPoint.levelSd) ? round(WEIGHT_BAND_Z * endPoint.levelSd * k, 2) : null;
  // 'last' so the final bucket equals today's trend readout exactly.
  const trend = aggregateByBucket(trendDaily, win.bucket, 'last');
  return {
    dots: aggregateByBucket(dotsDaily, win.bucket, 'mean'),
    suspect: aggregateByBucket(suspectDaily, win.bucket, 'mean'),
    trend,
    band: zipBand(aggregateByBucket(loDaily, win.bucket, 'last'), aggregateByBucket(hiDaily, win.bucket, 'last')),
    bandHalf,
    weighIns,
    suspectCount,
    totalWeighIns,
  };
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

/**
 * Garmin-style band → semantic tone (SPEC §6.3). Matches the Today HRV tile
 * (screens/today/MetricTiles.tsx) so the two screens never disagree:
 * balanced green · unbalanced yellow · low / poor red · insufficient neutral.
 */
export function hrvBandTone(band: HrvBand): Band {
  switch (band) {
    case 'balanced':
      return 'green';
    case 'low':
    case 'poor':
      return 'red';
    case 'unbalanced':
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
  /** 30-night personal range (mean ± SD of hours before today); null under 7 nights. */
  band: BaselineBand | null;
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
    band: baselineBand(records, 'slh', win.end, BASELINE_DAYS),
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

/** §6.4 consistency: nights needed before a bedtime SD is shown — the card copy promises 3 (review R2-9). */
export const BEDTIME_SD_MIN_NIGHTS = 3;
/** Rolling window for the bedtime SD (§6.4 "rolling 7-day SD of bedtime"). */
export const BEDTIME_SD_NIGHTS = 7;

export interface BedtimeSdSeries {
  /** Rolling 7-night SD of bedtime (min) for each day in the window, bucketed; null under 3 nights. */
  series: DatedValue[];
  /** Today's 7-night SD — the same call the engine makes for ctx.sleep.bedtimeSdMin — null under 3 nights. */
  sdMin: number | null;
  /** Nights with a bedtime in the last 7. */
  nights: number;
}

/**
 * The sleep-consistency chart (§3 "Sleep consistency (SD of bedtime)"): the
 * rolling 7-night SD evaluated on every day of the window so drift is
 * visible over time, not just as today's number (review R2-4). Each point
 * uses `bedtimeConsistency(records, d, 7)` — the engine's own definition —
 * and is null until 3 nights carry a bedtime.
 */
export function bedtimeSdSeries(records: DailyRecord[], win: RangeWindow): BedtimeSdSeries {
  // Only the window plus the 6-night run-in can contribute, so pre-filter once.
  const from = addDays(win.start, -(BEDTIME_SD_NIGHTS - 1));
  const recs = records.filter((r) => r.d >= from && r.d <= win.end);
  const gate = (sd: number | null, n: number) => (n >= BEDTIME_SD_MIN_NIGHTS && isNum(sd) ? sd : null);
  const daily = lastNDates(win.end, win.days).map((d) => {
    const c = bedtimeConsistency(recs, d, BEDTIME_SD_NIGHTS);
    return { d, value: gate(c.bedtimeSdMin, c.n) };
  });
  const cur = bedtimeConsistency(recs, win.end, BEDTIME_SD_NIGHTS);
  return { series: aggregateByBucket(daily, win.bucket, 'mean'), sdMin: gate(cur.bedtimeSdMin, cur.n), nights: cur.n };
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

/** "8–10k" when both goals are whole thousands, else "8,000–10,000". */
export function goalBandLabel(lo: number, hi: number): string {
  if (lo % 1000 === 0 && hi % 1000 === 0) return `${lo / 1000}–${hi / 1000}k`;
  return `${fmt(lo)}–${fmt(hi)}`;
}

export function stepsStats(records: DailyRecord[], win: RangeWindow, goalMin: number): StepsStats {
  const vals = metricSeries(records, 'st', win.end, win.days)
    .map((p) => p.v)
    .filter(isNum);
  const m = mean(vals);
  return { loggedDays: vals.length, goalDays: vals.filter((v) => v >= goalMin).length, meanSteps: m === null ? null : round(m) };
}

// ---------------------------------------------------------------------------
// Training load (§1e) — absolute load leads, ACWR is descriptive
// ---------------------------------------------------------------------------

export interface LoadSeries {
  /** Daily session load (0 on a rest day — never a gap; the EWMAs need it). */
  daily: DatedValue[];
  /** Acute EWMA (λ = 2/8) — the line drawn over the daily bars. */
  acute: DatedValue[];
  /** Chronic EWMA (λ = 2/29). */
  chronic: DatedValue[];
  /** acute ÷ chronic; null for the first 28 days. Descriptive only. */
  acwr: DatedValue[];
  /**
   * Days actually plotted. The engine integrates load over its own window
   * (`DEFAULT_LOAD_WINDOW_DAYS`), and the EWMAs must start where the context's
   * do or the card would disagree with `ctx.training.load`, so a 1Y range
   * plots that window rather than a re-integrated year.
   */
  days: number;
  /** Days carrying any load at all. */
  trainedDays: number;
}

/**
 * The load card's three series, from the engine's own daily load and ACWR
 * passes. Both are handed in rather than computed here so the card can never
 * disagree with `ctx.training.load`: the caller builds them with exactly the
 * arguments `buildCoachContext` uses.
 */
export function loadSeries(loads: readonly LoadPoint[], acwr: readonly AcwrPoint[], win: RangeWindow): LoadSeries {
  const byDay = new Map<ISODate, AcwrPoint>();
  for (const p of acwr) byDay.set(p.d, p);
  const inWindow = loads.filter((p) => p.d >= win.start && p.d <= win.end);
  let trainedDays = 0;
  const daily: DatedValue[] = [];
  const acute: DatedValue[] = [];
  const chronic: DatedValue[] = [];
  const ratio: DatedValue[] = [];
  for (const p of inWindow) {
    const load = isNum(p.load) ? round(p.load, 1) : 0;
    if (load > 0) trainedDays++;
    const a = byDay.get(p.d);
    daily.push({ d: p.d, value: load });
    acute.push({ d: p.d, value: a && isNum(a.acute) ? a.acute : null });
    chronic.push({ d: p.d, value: a && isNum(a.chronic) ? a.chronic : null });
    ratio.push({ d: p.d, value: a && isNum(a.acwr) ? a.acwr : null });
  }
  return {
    daily: aggregateByBucket(daily, win.bucket, 'mean'),
    acute: aggregateByBucket(acute, win.bucket, 'mean'),
    chronic: aggregateByBucket(chronic, win.bucket, 'mean'),
    acwr: aggregateByBucket(ratio, win.bucket, 'mean'),
    days: inWindow.length,
    trainedDays,
  };
}

// ---------------------------------------------------------------------------
// Weekly volume (§1e) — the 15 × N muscle grid
// ---------------------------------------------------------------------------

/** Mon-start weeks the volume grid shows (plan §2a: 15 muscles × 12 weeks). */
export const VOLUME_WEEKS = 12;

export interface VolumeWeek {
  /** Monday the week starts on. */
  weekStart: ISODate;
  /** All 15 muscles, in `MUSCLES` order, so the grid never has holes. */
  muscles: MuscleVolume[];
}

/**
 * Weekly hard sets per muscle for the last `weeks` Mon–Sun weeks, oldest
 * first. The newest entry is the week containing `asOf`, so its counts are
 * partial — the card says so rather than pretending the week is over.
 */
export function volumeWeeks(
  workouts: Workout[],
  asOf: ISODate,
  landmarks: Record<Muscle, VolumeLandmark>,
  weeks = VOLUME_WEEKS,
  custom?: readonly Exercise[],
): VolumeWeek[] {
  const n = Math.max(1, Math.floor(weeks));
  const current = weekStartMonday(asOf);
  const out: VolumeWeek[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const weekStart = addDays(current, -7 * i);
    out.push({
      weekStart,
      muscles: weeklySetsByMuscle(workouts, asOf, landmarks, { weekStart, ...(custom ? { custom } : {}) }),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Overnight strain & check-in (§1h) — the StressCard's panels
// ---------------------------------------------------------------------------

/**
 * Days of overnight strain the card will draw, however long the range is.
 *
 * Unlike a metric series, each point here costs a full engine evaluation: the
 * index re-standardises six signals against a rolling 60-day personal
 * reference, so a year is ~365 of those and lands around 200 ms — a visible
 * stall on a range flip, for a curve that a monthly bucket flattens to four
 * points anyway. Four months is long enough to show a season and cheap enough
 * to build inside a memo. `StressSeries.days` reports what was actually built
 * so the caption never claims a window the chart does not cover.
 */
export const STRESS_SERIES_MAX_DAYS = 120;

export interface StressSeries {
  /** Overnight strain index 0–100, one entry per bucket. */
  osi: DatedValue[];
  /** Its credible interval. */
  osiBand: TimeSeriesBandPoint[];
  /** Hooper total 4–28 for the same axis — the check-in overlay panel. */
  checkIn: DatedValue[];
  /** Calendar days evaluated (`min(win.days, STRESS_SERIES_MAX_DAYS)`). */
  days: number;
  /** Days carrying an index. */
  osiDays: number;
  /** Days carrying a complete check-in. */
  checkInDays: number;
}

/**
 * The index, its interval and the Hooper total evaluated on every day of the
 * window with the engine's own functions and the engine's own defaults, so
 * the last point is exactly `ctx.stress.osi` / `ctx.stress.checkIn.total`.
 */
export function stressSeries(records: DailyRecord[], win: RangeWindow, checkIn?: CheckInSettings): StressSeries {
  const days = Math.min(win.days, STRESS_SERIES_MAX_DAYS);
  // The strain reference is 60 days and the check-in reference 30, so nothing
  // older than the longer of the two can move a point in the window.
  const from = addDays(win.end, -(days - 1 + 70));
  const recs = records.filter((r) => r.d >= from && r.d <= win.end);
  const items = checkIn?.items;
  const osiDaily: DatedValue[] = [];
  const loDaily: DatedValue[] = [];
  const hiDaily: DatedValue[] = [];
  const hooperDaily: DatedValue[] = [];
  let osiDays = 0;
  let checkInDays = 0;
  for (const d of lastNDates(win.end, days)) {
    const strain = overnightStrainIndex(recs, d);
    if (strain.osi !== null) osiDays++;
    osiDaily.push({ d, value: num(strain.osi) });
    loDaily.push({ d, value: num(strain.lo) });
    hiDaily.push({ d, value: num(strain.hi) });
    const total = checkInSummary(recs, d, items ? { items } : undefined).total;
    if (total !== null) checkInDays++;
    hooperDaily.push({ d, value: num(total) });
  }
  return {
    osi: aggregateByBucket(osiDaily, win.bucket, 'mean'),
    osiBand: zipBand(aggregateByBucket(loDaily, win.bucket, 'mean'), aggregateByBucket(hiDaily, win.bucket, 'mean')),
    checkIn: aggregateByBucket(hooperDaily, win.bucket, 'mean'),
    days,
    osiDays,
    checkInDays,
  };
}

/**
 * The resilience scissors as two plottable curves. `resilienceSummary` reports
 * them on the same 0–1 scale as `ctx.stress.resilience.loadEwma`, so nothing is
 * rescaled here — the card shades the gap between them and that gap IS the
 * balance the band word describes.
 */
export function resilienceCurves(
  series: ReadonlyArray<{ d: ISODate; load: number | null; recovery: number | null }>,
): { load: DatedValue[]; recovery: DatedValue[] } {
  return {
    load: series.map((p) => ({ d: p.d, value: num(p.load) })),
    recovery: series.map((p) => ({ d: p.d, value: num(p.recovery) })),
  };
}
