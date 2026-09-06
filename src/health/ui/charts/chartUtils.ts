/**
 * Pure chart math shared by the Trends charts (SPEC §3) — no React, no DOM.
 *
 * Why a hand-rolled layer instead of a chart library: no new dependencies are
 * allowed, the charts are small (one series + a smoothed line + a band), and
 * the dataviz mark rules (hairline solid grids, 2 px round-joined lines, null
 * gaps, selective labels) are easier to guarantee with explicit SVG paths.
 *
 * Conventions
 * - Dates are 'YYYY-MM-DD' strings and are positioned evenly BY INDEX, so a
 *   series must contain one entry per day/bucket (fill gaps with `null` via
 *   `fillDaily`) for the x-axis to be linear in time.
 * - 7D/30D plot daily points; 90D aggregates to weeks and 1Y to months
 *   (Apple Health Trends pattern) — see `bucketForRange` / `aggregateByBucket`.
 * - Paths round coordinates to 0.01 px to keep `d` strings short and stable.
 */
import type { ISODate } from '../../data/types';
import { MONTH_SHORT, WEEKDAY_SHORT, addDays, dateRange, parseISODate, weekdayOf } from '../../lib/dates';
import { fmt } from '../../lib/format';

export type ChartRange = '7D' | '30D' | '90D' | '1Y';
export type Bucket = 'day' | 'week' | 'month';

/** A point already projected into pixel space; `y: null` is a gap. */
export interface Pt {
  x: number;
  y: number | null;
}

/** A dated value before projection; `null` = no reading that day. */
export interface DatedValue {
  d: ISODate;
  value: number | null;
}

export const RANGE_DAYS: Record<ChartRange, number> = { '7D': 7, '30D': 30, '90D': 90, '1Y': 365 };

/** Aggregation bucket per range: daily up to 30D, weekly at 90D, monthly at 1Y. */
export function bucketForRange(range: ChartRange): Bucket {
  return range === '90D' ? 'week' : range === '1Y' ? 'month' : 'day';
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

// ---------------------------------------------------------------------------
// Ticks & scales
// ---------------------------------------------------------------------------

/** Round a raw step up to the nearest 1 / 2 / 5 × 10^k (Heckbert "nice numbers"). */
export function niceStep(raw: number): number {
  if (!isNum(raw) || raw <= 0) return 1;
  const exp = Math.floor(Math.log10(raw));
  const base = 10 ** exp;
  const f = raw / base;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nice * base;
}

/** Decimal places needed to print a step exactly (0.5 → 1, 0.25 → 2, 25 → 0). */
function stepDecimals(step: number): number {
  if (!isNum(step) || step <= 0) return 0;
  for (let dp = 0; dp < 6; dp++) {
    const scaled = step * 10 ** dp;
    if (Math.abs(scaled - Math.round(scaled)) < 1e-9) return dp;
  }
  return 6;
}

/**
 * Clean, rounded axis ticks that cover [min, max]. Returns ~`count` values
 * (never fewer than 2) on a 1/2/5 step, e.g. niceTicks(163, 176, 4) →
 * [160, 165, 170, 175, 180]. Degenerate input (min === max) is padded so a
 * single reading still gets an axis.
 */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!isNum(min) || !isNum(max)) return [];
  let lo = Math.min(min, max);
  let hi = Math.max(min, max);
  if (hi - lo === 0) {
    const pad = Math.max(Math.abs(lo) * 0.02, 1);
    lo -= pad;
    hi += pad;
  }
  const n = Math.min(12, Math.max(2, Math.round(count)));
  const step = niceStep((hi - lo) / (n - 1));
  const dp = stepDecimals(step);
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const out: number[] = [];
  for (let i = 0; i <= 40; i++) {
    const v = Number((start + i * step).toFixed(dp));
    out.push(v);
    if (v >= end - step * 1e-9) break;
  }
  return out;
}

/** Decimal places that distinguish adjacent ticks (for tick label formatting). */
export function tickDecimals(ticks: number[]): number {
  if (ticks.length < 2) return 0;
  return stepDecimals(Math.abs(ticks[1] - ticks[0]));
}

/** Tick label: thousands-comma'd, fixed decimals ("1,950", "7.5"). */
export function formatTick(v: number, decimals = 0): string {
  return fmt(v, decimals);
}

/**
 * [min, max] of the finite values, padded by `padFraction` of the span on
 * each side so marks never sit on the frame. Null when nothing is finite.
 */
export function extent(
  values: Array<number | null | undefined>,
  padFraction = 0.1,
): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (!isNum(v)) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (lo === Infinity) return null;
  const pad = hi === lo ? Math.max(Math.abs(lo) * 0.02, 1) : (hi - lo) * padFraction;
  return [lo - pad, hi + pad];
}

export interface LinearScale {
  (v: number): number;
  domain: [number, number];
  range: [number, number];
  invert(px: number): number;
}

/** d3-style linear scale. A zero-span domain maps everything to the range midpoint. */
export function scaleLinear(domain: [number, number], range: [number, number]): LinearScale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  const scale = ((v: number) => (span === 0 ? (r0 + r1) / 2 : r0 + ((v - d0) / span) * (r1 - r0))) as LinearScale;
  scale.domain = [d0, d1];
  scale.range = [r0, r1];
  scale.invert = (px: number) => (r1 - r0 === 0 ? d0 : d0 + ((px - r0) / (r1 - r0)) * span);
  return scale;
}

// ---------------------------------------------------------------------------
// X positions, labels
// ---------------------------------------------------------------------------

/** `n` x positions evenly spaced by index from x0 to x1 (inclusive); one point sits centred. */
export function xPositions(n: number, x0: number, x1: number): number[] {
  if (!Number.isInteger(n) || n <= 0) return [];
  if (n === 1) return [(x0 + x1) / 2];
  const step = (x1 - x0) / (n - 1);
  return Array.from({ length: n }, (_, i) => x0 + i * step);
}

/** Up to `max` indices spread evenly over 0..n−1, always including both ends. */
export function sparseIndices(n: number, max: number): number[] {
  if (n <= 0) return [];
  if (max <= 1 || n <= max) return Array.from({ length: n }, (_, i) => i);
  const out: number[] = [];
  for (let i = 0; i < max; i++) {
    const idx = Math.round((i * (n - 1)) / (max - 1));
    if (out[out.length - 1] !== idx) out.push(idx);
  }
  return out;
}

/**
 * Which x labels to draw for a range (sparse: start / mid / end, or ~monthly).
 * 7D shows every weekday; 30D/90D three labels; 1Y four.
 */
export function xLabelIndices(n: number, range: ChartRange): number[] {
  if (range === '7D') return sparseIndices(n, 7);
  if (range === '1Y') return sparseIndices(n, 4);
  return sparseIndices(n, 3);
}

/** Axis date label per range: 7D → 'Sat', 30D/90D → '6 Sep', 1Y → 'Sep'. */
export function formatTickDate(d: ISODate, range: ChartRange): string {
  const dt = parseISODate(d);
  if (Number.isNaN(dt.getTime())) return '';
  if (range === '7D') return WEEKDAY_SHORT[dt.getDay()];
  if (range === '1Y') return MONTH_SHORT[dt.getMonth()];
  return `${dt.getDate()} ${MONTH_SHORT[dt.getMonth()]}`;
}

/**
 * Index of the x position closest to `px` (for crosshair snapping). `xs` must
 * be ascending. Ties resolve to the lower index; −1 for empty/invalid input.
 */
export function nearestIndex(xs: number[], px: number): number {
  if (!xs.length || !isNum(px)) return -1;
  let lo = 0;
  let hi = xs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] < px) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && px - xs[lo - 1] <= xs[lo] - px) return lo - 1;
  return lo;
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const r2 = (v: number) => String(Math.round(v * 100) / 100);

/**
 * SVG `d` for a polyline that lifts the pen at null gaps: consecutive finite
 * points are joined with `L`, each run after a gap restarts with `M`. An
 * isolated point yields a bare `M` (invisible — dots carry lone readings).
 */
export function buildPath(points: Pt[]): string {
  let d = '';
  let pen = false;
  for (const p of points) {
    if (p.y === null || !isNum(p.y) || !isNum(p.x)) {
      pen = false;
      continue;
    }
    d += `${pen ? 'L' : 'M'}${r2(p.x)} ${r2(p.y)}`;
    pen = true;
  }
  return d;
}

/**
 * Closed SVG path filling between `lower` and `upper` (same length, same x).
 * Each run where BOTH bounds are finite becomes its own closed sub-path:
 * along the upper edge forward, back along the lower edge, `Z`.
 */
export function buildAreaBetween(lower: Pt[], upper: Pt[]): string {
  const n = Math.min(lower.length, upper.length);
  let d = '';
  let i = 0;
  while (i < n) {
    while (i < n && !(isNum(lower[i].y) && isNum(upper[i].y))) i++;
    const start = i;
    while (i < n && isNum(lower[i].y) && isNum(upper[i].y)) i++;
    if (start >= i) continue;
    let seg = '';
    for (let k = start; k < i; k++) seg += `${k === start ? 'M' : 'L'}${r2(upper[k].x)} ${r2(upper[k].y as number)}`;
    for (let k = i - 1; k >= start; k--) seg += `L${r2(lower[k].x)} ${r2(lower[k].y as number)}`;
    d += `${seg}Z`;
  }
  return d;
}

// ---------------------------------------------------------------------------
// Buckets (weekly / monthly aggregation for 90D / 1Y)
// ---------------------------------------------------------------------------

/** First day of the bucket containing `d`: Monday for weeks, the 1st for months. */
export function bucketStart(d: ISODate, bucket: Bucket): ISODate {
  if (bucket === 'week') return addDays(d, -((weekdayOf(d) + 6) % 7));
  if (bucket === 'month') return `${d.slice(0, 7)}-01`;
  return d;
}

export type Aggregation = 'mean' | 'sum' | 'last' | 'count';

/**
 * Collapse daily points into buckets keyed by `bucketStart`, preserving the
 * order of first appearance (input should be ascending). Nulls are ignored;
 * a bucket with no finite value yields `null` ('count' yields the number of
 * finite readings, so it is 0 rather than null).
 */
export function aggregateByBucket(points: DatedValue[], bucket: Bucket, agg: Aggregation = 'mean'): DatedValue[] {
  if (bucket === 'day') return points.map((p) => ({ d: p.d, value: isNum(p.value) ? p.value : null }));
  const order: ISODate[] = [];
  const groups = new Map<ISODate, number[]>();
  for (const p of points) {
    const key = bucketStart(p.d, bucket);
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    if (isNum(p.value)) (groups.get(key) as number[]).push(p.value);
  }
  return order.map((d) => {
    const xs = groups.get(d) as number[];
    if (agg === 'count') return { d, value: xs.length };
    if (!xs.length) return { d, value: null };
    if (agg === 'sum') return { d, value: xs.reduce((a, b) => a + b, 0) };
    if (agg === 'last') return { d, value: xs[xs.length - 1] };
    return { d, value: xs.reduce((a, b) => a + b, 0) / xs.length };
  });
}

/** One entry per day from start to end (inclusive); days without a point get `null`. */
export function fillDaily(points: DatedValue[], start: ISODate, end: ISODate): DatedValue[] {
  const byDate = new Map<ISODate, number | null>();
  for (const p of points) byDate.set(p.d, isNum(p.value) ? p.value : null);
  return dateRange(start, end).map((d) => ({ d, value: byDate.get(d) ?? null }));
}

/** Last finite value in a series with its index, or null. */
export function lastDefined(values: Array<number | null>): { index: number; value: number } | null {
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i];
    if (isNum(v)) return { index: i, value: v };
  }
  return null;
}

/** Indices whose value is finite. */
export function definedIndices(values: Array<number | null>): number[] {
  const out: number[] = [];
  values.forEach((v, i) => {
    if (isNum(v)) out.push(i);
  });
  return out;
}

/** Rough text width for layout (no DOM): Inter tabular digits ≈ 0.6 em. */
export function textWidth(s: string, fontSize: number): number {
  return Math.ceil(s.length * fontSize * 0.6);
}

/**
 * Decimals for displayed values: 0 when every reading is an integer (HRV ms,
 * RHR bpm, steps), otherwise 1 while the data spans < 20 units (weight in lb,
 * sleep hours) and 0 beyond that (kcal, a year of weight).
 */
export function autoDecimals(values: Array<number | null | undefined>): number {
  const xs = values.filter(isNum);
  if (!xs.length || xs.every((v) => Number.isInteger(v))) return 0;
  return Math.max(...xs) - Math.min(...xs) < 20 ? 1 : 0;
}
