/**
 * Trends screen — pure derivations that are not plain metric series (SPEC §3):
 *   • adherence heatmap cells + legends (§3, engine/adherence tolerances),
 *   • weekly expenditure points with update markers (§6.2),
 *   • the one-line intake suggestion for the TDEE readout (§6.2 recommendIntake),
 *   • nutrition-frequency table rows for the labs (§3, §7 #13/#14).
 *
 * Split out of ./series.ts to keep both modules under the ~400-line guide.
 * Same contract: records / engine output in, plain data out — never NaN,
 * never throws, never reads the clock. Tested in series.test.ts.
 */
import type { Band, CoachContext, DailyRecord, ISODate, Targets } from '../../data/types';
import { MONTH_SHORT, addDays, diffDays, parseISODate } from '../../lib/dates';
import { fmt, round } from '../../lib/format';
import {
  KCAL_HIT_OVER_G,
  KCAL_HIT_UNDER_G,
  PROTEIN_HIT_TOLERANCE_G,
  mealOccasions,
  weeklyExpenditure,
  type DayAdherence,
  type ExpenditureResult,
  type FrequencyCounters,
} from '../../engine';
import { bucketStart, type ChartRange, type DatedValue, type HeatLevel, type HeatmapDay, type TimeSeriesAnnotation } from '../../ui/charts';
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
// Expenditure (§6.2) — weekly points + update markers
// ---------------------------------------------------------------------------

export interface TdeeSeries {
  /**
   * One point per 7-day block, oldest first, plotted at the block's END date
   * (the day the estimate updated). Blocks that failed the ≥5 weigh-in /
   * ≥5 intake-day gate are `null` so the gap stays visible.
   */
  points: DatedValue[];
  /** ▼ markers on the weeks whose estimate actually updated (valid blocks). */
  annotations: TimeSeriesAnnotation[];
  /** The full engine result — current/last-calibrated TDEE, this week's gate counts, reasons. */
  result: ExpenditureResult;
}

/**
 * `expenditureSeries` is a filter over `weeklyExpenditure(...).weeks`; we call
 * the latter directly so the invalid weeks (gaps) and the gate counts for the
 * annotations come from the same pass. `alpha` must be the store's EWMA α
 * (INTEGRATION_NOTES) so the chart matches the Today tile. At 1Y the 52 weekly
 * points sit ~5 px apart, so only the latest update keeps its ▼ marker (the
 * tooltip and hidden table still carry every week).
 */
export function tdeeSeries(records: DailyRecord[], win: RangeWindow, alpha: number): TdeeSeries {
  const result = weeklyExpenditure(records, win.end, { alpha, weeks: win.tdeeWeeks });
  const points: DatedValue[] = [];
  let annotations: TimeSeriesAnnotation[] = [];
  for (const wk of result.weeks) {
    const ok = wk.valid && wk.smoothedTdee !== null;
    points.push({ d: wk.end, value: ok ? wk.smoothedTdee : null });
    if (ok) annotations.push({ d: wk.end, label: `Updated · ${wk.weighIns} weigh-ins, ${wk.intakeDays} intake days` });
  }
  if (win.range === '1Y' && annotations.length > 1) annotations = annotations.slice(-1);
  return { points, annotations, result };
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
}

/**
 * One-line version of `recommendIntake` for the readout row. Null when this
 * week's expenditure is not valid — an unreliable week must not move the
 * target (§6.2), so there is nothing to suggest. `ctx.expenditure.reason`
 * carries the full sentence for the detail line.
 */
export function intakeSuggestion(ctx: CoachContext): IntakeSuggestion | null {
  const exp = ctx.expenditure;
  if (!exp.valid || exp.suggestedKcal === null || exp.suggestedDelta === null) return null;
  if (exp.suggestedDelta === 0) return { text: `Hold ${fmt(exp.suggestedKcal)} kcal`, tone: 'green', hold: true };
  const rate = ctx.weight.weeklyRateLb;
  const why =
    ctx.weight.inBand === 'above'
      ? 'losing faster than target'
      : rate !== null && rate > 0
        ? 'trend is rising'
        : 'losing slower than target';
  return { text: `Adjust to ${fmt(exp.suggestedKcal)} kcal — ${why}`, tone: 'yellow', hold: false };
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
