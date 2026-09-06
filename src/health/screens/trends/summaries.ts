/**
 * Trends screen — pure derivations that are not plain metric series (SPEC §3):
 *   • adherence heatmap cells + legends (§3, engine/adherence tolerances),
 *   • the expenditure posterior with its credible band and update markers
 *     (§1b `weeklyExpenditureV3` — v2's smoothed point estimate is gone),
 *   • the one-line intake suggestion for the TDEE readout (§1b recommendIntakeV3),
 *   • nutrition-frequency table rows for the labs (§3, §7 #13/#14).
 *
 * Split out of ./series.ts to keep both modules under the ~400-line guide.
 * Same contract: records / engine output in, plain data out — never NaN,
 * never throws, never reads the clock. Tested in series.test.ts.
 */
import type { Band, CoachContext, DailyRecord, ISODate, Profile, Targets, Workout } from '../../data/types';
import { MONTH_SHORT, addDays, diffDays, parseISODate } from '../../lib/dates';
import { clamp, fmt, round } from '../../lib/format';
import {
  KCAL_HIT_OVER_G,
  KCAL_HIT_UNDER_G,
  MIN_BLOCK_LOG_DAYS,
  MIN_BLOCK_WEIGH_INS,
  PROTEIN_HIT_TOLERANCE_G,
  TDEE_CI_Z,
  mealOccasions,
  weeklyExpenditureV3,
  type DayAdherence,
  type ExpenditureV3Result,
  type FrequencyCounters,
  type KalmanResult,
} from '../../engine';
import { bucketStart, type ChartRange, type DatedValue, type HeatLevel, type HeatmapDay, type TimeSeriesAnnotation, type TimeSeriesBandPoint } from '../../ui/charts';
import { perWeek, type RangeWindow } from './series';

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

// ---------------------------------------------------------------------------
// Expenditure (§1b) — the posterior, its credible band and update markers
// ---------------------------------------------------------------------------

/**
 * The band drawn round each block is the engine's own published coverage
 * (`TDEE_CI_Z` → 90%), so the shaded ribbon and the "± N kcal (90%)" line in
 * `result.reason` are the same interval measured the same way.
 */
export const TDEE_BAND_Z = TDEE_CI_Z;

export interface TdeeSeriesOpts {
  profile: Profile;
  targets: Targets;
  /**
   * §1a's **filtered** Kalman result — the same object `buildCoachContext`
   * hands the engine. It is not optional: without it `weeklyExpenditureV3`
   * falls back to the v2 EWMA trend and the chart would publish a different
   * posterior from the one Today and the coach quote.
   */
  kalman: KalmanResult;
  /** Sessions, for the steps observation. Must match what the context was built with. */
  workouts?: Workout[];
  /** EWMA α, forwarded for the glycogen pass. Defaults to `targets.ewmaAlpha`. */
  alpha?: number;
}

export interface TdeeSeries {
  /**
   * Posterior mean expenditure after each completed 7-day block, oldest first,
   * plotted at the block's END date (the day the estimate moved). Never null:
   * a block that failed its gate is *predict-only* — the posterior still
   * exists, it just widened rather than moved, which is what the band shows.
   */
  points: DatedValue[];
  /** The 90% credible interval around each of those points. */
  band: TimeSeriesBandPoint[];
  /** ▼ markers on the blocks whose weight observation actually moved the posterior. */
  annotations: TimeSeriesAnnotation[];
  /** Today's engine result — the same evaluation as `ctx.expenditure`. */
  result: ExpenditureV3Result;
}

/**
 * Engine v3 (§1b): one Bayesian posterior over TDEE rather than a smoothed
 * point estimate, so the chart plots `block.tdee` with the `±TDEE_CI_Z·sd`
 * band around it and never draws a gap where the engine still has a belief.
 *
 * `weeks` only decides how many COMPLETED blocks come back — the posterior
 * always runs over every block since the first weigh-in — so a point has the
 * same value at every range and the last one is exactly `result.tdee`, which
 * is `ctx.expenditure.tdee` whenever the interval is tight enough to publish
 * (review R2-1). This is why `opts.kalman` and `opts.workouts` must be the
 * ones the context used: they are inputs to the posterior, not decoration.
 *
 * At 1Y the 52 weekly points sit ~5 px apart, so only the latest update keeps
 * its ▼ marker (the tooltip and hidden table still carry every block).
 */
export function tdeeSeries(records: DailyRecord[], win: RangeWindow, opts: TdeeSeriesOpts): TdeeSeries {
  const result = weeklyExpenditureV3(records, win.end, {
    profile: opts.profile,
    targets: opts.targets,
    kalman: opts.kalman,
    ...(opts.workouts ? { workouts: opts.workouts } : {}),
    ...(opts.alpha === undefined ? {} : { alpha: opts.alpha }),
    weeks: win.tdeeWeeks,
  });
  const points: DatedValue[] = [];
  const band: TimeSeriesBandPoint[] = [];
  let annotations: TimeSeriesAnnotation[] = [];
  for (const b of result.blocks) {
    const half = round(TDEE_BAND_Z * b.tdeeSd);
    points.push({ d: b.end, value: b.tdee });
    band.push({ d: b.end, lo: b.tdee - half, hi: b.tdee + half });
    if (b.valid) {
      annotations.push({ d: b.end, label: `Updated · ${b.weighIns} weigh-ins, ${b.loggedDays} of ${b.spanDays} days logged` });
    }
  }
  if (win.range === '1Y' && annotations.length > 1) annotations = annotations.slice(-1);
  return { points, band, annotations, result };
}

/** "5 of 7 days logged" — the coverage caption the posterior's latest block earned. */
export function coverageCaption(coverage: { logged: number; days: number } | undefined): string {
  const logged = coverage && Number.isFinite(coverage.logged) ? coverage.logged : 0;
  const days = coverage && Number.isFinite(coverage.days) && coverage.days > 0 ? coverage.days : 7;
  return `${fmt(logged)} of ${fmt(days)} days logged`;
}

/**
 * Fields the block-gate copy reads. Both expenditure engines expose them (v2
 * calls the second one `intakeDaysThisWeek`, v3 `loggedDaysThisWeek`), so the
 * Log screen's v2 cross-check and this screen's v3 card share one function.
 */
export interface BlockGateResult {
  weighInsThisWeek: number;
  intakeDaysThisWeek?: number;
  loggedDaysThisWeek?: number;
  firstWeighIn: ISODate | null;
}

export interface BlockProgress {
  weighIns: number;
  /** Days of the block with an intake logged. */
  intakeDays: number;
  /** Days of the in-progress block still to come after today (0–6); null before the first weigh-in. */
  daysLeft: number | null;
  /** Both gates already met, so the block will produce a weight observation when it closes. */
  met: boolean;
  /** A gate can no longer be met in this block even with an entry on every remaining day (today included). */
  unreachable: boolean;
  tone: Band;
  /** State line without the date — the card appends "next update <date>". */
  text: string;
}

/**
 * Copy for the in-progress expenditure block. Blocks are anchored to the first
 * weigh-in, so `weighInsThisWeek` counts a block that may be one day old —
 * "1/7, gate not met" on day 2 is not a failure, it is progress. The tone is
 * only yellow once a gate is arithmetically out of reach and only green once
 * both are met; anything in between is neutral (coordinator note on R2-1/R2-8).
 *
 * v3 gates the two sides differently (`MIN_BLOCK_WEIGH_INS` weigh-ins,
 * `MIN_BLOCK_LOG_DAYS` logged days) and missing the gate no longer voids the
 * block: the posterior simply predicts and widens, which is what the card's
 * band shows. The defaults are v2's symmetric 5/5 so the Log screen's
 * cross-check keeps its meaning.
 */
export function blockProgress(result: BlockGateResult, today: ISODate, weighInGate = 5, logGate = weighInGate): BlockProgress {
  const w = result.weighInsThisWeek;
  const i = result.loggedDaysThisWeek ?? result.intakeDaysThisWeek ?? 0;
  let daysLeft: number | null = null;
  if (result.firstWeighIn) {
    const since = Math.max(0, diffDays(result.firstWeighIn, today));
    const start = addDays(result.firstWeighIn, 7 * Math.floor(since / 7));
    daysLeft = clamp(diffDays(today, addDays(start, 6)), 0, 6);
  }
  const met = w >= weighInGate && i >= logGate;
  // Today may still get an entry, so it counts as a chance.
  const chances = daysLeft === null ? 7 : daysLeft + 1;
  const unreachable = !met && (w + chances < weighInGate || i + chances < logGate);
  const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`;
  const tail = daysLeft === null ? '' : daysLeft === 0 ? ' · block closes tonight' : ` · ${days(daysLeft)} left`;
  const counts = `${w}/7 weigh-ins, ${i}/7 logged days`;
  if (met) return { weighIns: w, intakeDays: i, daysLeft, met, unreachable: false, tone: 'green', text: `Gate met — ${counts}${tail}` };
  if (unreachable) {
    const what = w + chances < weighInGate ? 'weigh-ins' : 'logged days';
    return { weighIns: w, intakeDays: i, daysLeft, met, unreachable, tone: 'yellow', text: `Too few ${what} for a measured block — the estimate holds and widens${tail}` };
  }
  return { weighIns: w, intakeDays: i, daysLeft, met, unreachable, tone: 'neutral', text: `${counts} so far${tail}` };
}

/** The v3 gate a Trends block is measured against: 3 weigh-ins and 4 logged days. */
export function v3BlockProgress(result: BlockGateResult, today: ISODate): BlockProgress {
  return blockProgress(result, today, MIN_BLOCK_WEIGH_INS, MIN_BLOCK_LOG_DAYS);
}

/** The TDEE chart always plots weekly points, so its date labels use the '6 Sep' (90D) or 'Sep' (1Y) format. */
export function tdeeChartRange(range: ChartRange): ChartRange {
  return range === '1Y' ? '1Y' : '90D';
}

/** Tooltip header for a weekly TDEE point: 'Week ending 6 Sep'. */
export function weekEndingFormat(d: ISODate): string {
  const dt = parseISODate(d);
  return `Week ending ${dt.getDate()} ${MONTH_SHORT[dt.getMonth()]}`;
}

export interface IntakeSuggestion {
  /** "Hold 1,950 kcal" / "Adjust to 1,850 kcal — losing slower than target". */
  text: string;
  tone: Band;
  hold: boolean;
  /** Which tier of evidence fired: a one-block nudge, a two-block move, or neither. */
  tier: 'none' | 'fine' | 'coarse';
}

/**
 * One-line version of `recommendIntakeV3` for the readout row. Null when the
 * posterior is not tight enough to publish — an unreliable interval must not
 * move the target (§1b), so there is nothing to suggest.
 * `ctx.expenditure.reason` carries the full sentence (P(outside band), the
 * coverage and the energy-density factor) for the detail line.
 */
export function intakeSuggestion(ctx: CoachContext): IntakeSuggestion | null {
  const exp = ctx.expenditure;
  const tier = exp.tier ?? 'none';
  if (!exp.valid || exp.suggestedKcal === null || exp.suggestedDelta === null || exp.suggestedKcal === undefined || exp.suggestedDelta === undefined) return null;
  if (exp.suggestedDelta === 0) return { text: `Hold ${fmt(exp.suggestedKcal)} kcal`, tone: 'green', hold: true, tier };
  const rate = ctx.weight.weeklyRateLb;
  const why =
    ctx.weight.inBand === 'above'
      ? 'losing faster than target'
      : rate !== null && rate > 0
        ? 'trend is rising'
        : 'losing slower than target';
  return { text: `Adjust to ${fmt(exp.suggestedKcal)} kcal — ${why}`, tone: 'yellow', hold: false, tier };
}

// ---------------------------------------------------------------------------
// Nutrition frequency counters (§3, §7 #13/#14)
// ---------------------------------------------------------------------------

export interface FrequencyRow {
  key: 'red-meat' | 'fish' | 'home' | 'fiber';
  label: string;
  /** Trailing 7 days. */
  week: string;
  /** The selected range, normalised per week where it is a count. */
  range: string;
  hint: string;
}

/**
 * Rows for the frequency table. Counts are shown as servings per week —
 * whole numbers for the 7-day column, 1 dp when normalised over a longer
 * range — so 90D and 1Y stay comparable with "this week".
 */
export function frequencyRows(week: FrequencyCounters, range: FrequencyCounters, fiberTarget: number): FrequencyRow[] {
  const perWk = (n: number, c: FrequencyCounters) => `${fmt(perWeek(n, c.days), c.days <= 7 ? 0 : 1)}×/wk`;
  const pct = (v: number | null) => (v === null ? '—' : `${fmt(v)}%`);
  const fib = (v: number | null) => (v === null ? '—' : `${fmt(v, 1)} g`);
  return [
    { key: 'red-meat', label: 'Red meat', week: perWk(week.redMeatServings, week), range: perWk(range.redMeatServings, range), hint: 'servings' },
    { key: 'fish', label: 'Fish', week: perWk(week.fishServings, week), range: perWk(range.fishServings, range), hint: 'servings' },
    { key: 'home', label: 'Home-cooked', week: pct(week.homeCookedPct), range: pct(range.homeCookedPct), hint: 'of meals' },
    { key: 'fiber', label: 'Fiber', week: fib(week.fiberAvg), range: fib(range.fiberAvg), hint: `avg/day · ${fmt(fiberTarget)} g target` },
  ];
}
