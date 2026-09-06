/**
 * Trends-screen view model — one memoised snapshot per (minute, range).
 *
 * Why two memos: the CoachContext (engine/context.ts) does not depend on the
 * range toggle, so flipping 7D → 90D must not rebuild it; the chart series do,
 * so they live in a second memo keyed on the range. Neither reads the clock —
 * `useNow()` supplies it and the memo is keyed on the minute (brief: "never
 * rebuild on every keystroke"). Every number on the screen comes from here.
 *
 * Every series is built by `./series.ts` from engine helpers (metricSeries,
 * swcBandSeries, computeKalmanTrend, weeklyExpenditureV3, adherenceGrid …) so
 * the Trends charts can never disagree with the Today tiles or the coach.
 *
 * Three engine passes are repeated here rather than read off the context,
 * because the context publishes their *conclusions* and the charts need their
 * *series*: the Kalman filter (weight band + the expenditure posterior's level
 * input), the daily training load (load card + the resilience scissors) and
 * the overnight strain index. Each is called with exactly the arguments
 * `buildCoachContext` uses, so the drawn line always ends on the published
 * number. The RTS smoother runs here and nowhere else: the store deliberately
 * stamps only the causal filter, since a smoothed level would keep changing
 * under the user after the fact.
 */
import { useMemo } from 'react';
import type { AppSettings, CoachContext, DailyRecord, ISODate, Workout } from '../../data/types';
import { useHealth, useNow, useRecords, useWorkouts } from '../../data/store';
import {
  RHR_BASELINE_DAYS,
  acwrSeries,
  adherenceGrid,
  buildCoachContext,
  computeKalmanTrend,
  dailyLoadSeries,
  fitWhoopScale,
  frequencyCounters,
  labLinkedHabits,
  median,
  metricSeries,
  resilienceSummary,
  smoothKalman,
  weighInStreak,
  type FrequencyCounters,
} from '../../engine';
import { parseISODate, toISODate } from '../../lib/dates';
import type { ChartRange, DatedValue, HeatmapDay } from '../../ui/charts';
import {
  baselineBand,
  bedtimeOffsetSeries,
  bedtimeSdSeries,
  hrvSeries,
  loadSeries,
  metricChartSeries,
  rangeWindow,
  resilienceCurves,
  rollingMeanSeries,
  sleepSeries,
  stepsStats,
  stressSeries,
  volumeWeeks,
  weightSeries,
  type BandedSeries,
  type BaselineBand,
  type BedtimeSdSeries,
  type LinedSeries,
  type LoadSeries,
  type RangeWindow,
  type SleepSeries,
  type StepsStats,
  type StressSeries,
  type VolumeWeek,
  type WeightSeries,
} from './series';
import { frequencyRows, heatDay, heatLegend, heatWindowDays, tdeeSeries, type FrequencyRow, type HeatMode, type TdeeSeries } from './summaries';

export const HEAT_MODES: HeatMode[] = ['protein', 'kcal', 'logging'];

export interface TrendsModel {
  today: ISODate;
  settings: AppSettings;
  records: DailyRecord[];
  workouts: Workout[];
  ctx: CoachContext;
  win: RangeWindow;
  weight: WeightSeries;
  tdee: TdeeSeries;
  hrv: BandedSeries;
  rhr: LinedSeries;
  /** 28-day RHR mean ± SD (the baseline band drawn behind the RHR chart). */
  rhrBand: BaselineBand | null;
  sleep: SleepSeries;
  /** Rolling 7-night bedtime SD over the window + today's gated value. */
  bedSd: BedtimeSdSeries;
  /** Nightly bedtime offset from the target, minutes (+ late / − early), bucketed. */
  bedOffsets: DatedValue[];
  steps: { series: DatedValue[]; stats: StepsStats };
  /** Daily load, the two EWMAs and the descriptive ACWR (§1e). */
  load: LoadSeries;
  /** 15 muscles × 12 Mon-start weeks of hard sets with their landmark status. */
  volume: VolumeWeek[];
  /** Overnight strain with its interval, plus the Hooper overlay (§1h). */
  stress: StressSeries;
  /** The resilience scissors — the two curves behind `ctx.stress.resilience`. */
  resilience: { load: DatedValue[]; recovery: DatedValue[] };
  adherence: {
    heat: Record<HeatMode, HeatmapDay[]>;
    legend: Record<HeatMode, string[]>;
    loggingStreak: number;
    weighInStreak: number;
  };
  frequency: {
    week: FrequencyCounters;
    range: FrequencyCounters;
    rows: FrequencyRow[];
    /** §7 #13/#14-style lines tying this week's counters to the user's own labs. */
    habits: string[];
  };
}

export function useTrendsModel(range: ChartRange): TrendsModel {
  const { state } = useHealth();
  const records = useRecords();
  const workouts = useWorkouts();
  const wall = useNow();
  const today = toISODate(wall);
  const hh = wall.getHours();
  const mm = wall.getMinutes();
  // A Date whose identity changes once a minute, so it can key the memo
  // without dragging the per-render `wall` object into the dependency list.
  const now = useMemo(() => {
    const d = parseISODate(today);
    d.setHours(hh, mm, 0, 0);
    return d;
  }, [today, hh, mm]);
  const settings = state.settings;

  const ctx = useMemo(
    () => buildCoachContext({ records, settings, today, now, workouts }),
    [records, settings, today, now, workouts],
  );

  // Kalman and load do not depend on the range toggle, so they sit in their own
  // memo: flipping 7D → 1Y must not re-filter a year of weigh-ins.
  const engine = useMemo(() => {
    const { profile } = settings;
    const filtered = computeKalmanTrend(records, today, { cycle: { enabled: profile.tracksCycle === true } });
    const restHr = median(metricSeries(records, 'rhr', today, RHR_BASELINE_DAYS).map((p) => p.v));
    const loadOpts = { profile, restHr };
    const whoopFit = fitWhoopScale(records, workouts, loadOpts);
    const loads = dailyLoadSeries(records, workouts, today, { ...loadOpts, whoopFit });
    return {
      filtered,
      smoothed: smoothKalman(filtered),
      loads,
      acwr: acwrSeries(loads),
      // The context's own resilience pass also sees its private readiness
      // series; this one falls back to the stored `rec`/`osi` for that
      // component. The curves are therefore the shape of the scissors, while
      // every number the card prints comes from `ctx.stress.resilience`.
      resilience: resilienceSummary(records, today, { profile, loads, sleepNeedHrs: ctx.sleep.tonightNeed ?? null }).series,
    };
  }, [records, workouts, settings, today, ctx.sleep.tonightNeed]);

  const series = useMemo(() => {
    const { profile, targets, training, checkIn } = settings;
    const win = rangeWindow(range, today);
    const alpha = targets.ewmaAlpha;

    const byDate = new Map<ISODate, DailyRecord>();
    for (const r of records) byDate.set(r.d, r);

    // Adherence heatmap is a fixed 12-week calendar (§3), independent of the range.
    const grid = adherenceGrid(records, today, heatWindowDays(today), targets, profile);
    const heat = {} as Record<HeatMode, HeatmapDay[]>;
    const legend = {} as Record<HeatMode, string[]>;
    for (const mode of HEAT_MODES) {
      heat[mode] = grid.map((cell) => heatDay(mode, cell, byDate.get(cell.d), targets));
      legend[mode] = heatLegend(mode, targets);
    }

    const week = frequencyCounters(records, today, 7);
    const rangeCounters = win.days === 7 ? week : frequencyCounters(records, today, win.days);

    return {
      win,
      weight: weightSeries(records, win, engine.smoothed, profile.units),
      tdee: tdeeSeries(records, win, { profile, targets, kalman: engine.filtered, workouts, alpha }),
      hrv: hrvSeries(records, win),
      rhr: rollingMeanSeries(records, 'rhr', win, 7),
      rhrBand: baselineBand(records, 'rhr', today, RHR_BASELINE_DAYS),
      sleep: sleepSeries(records, win, profile),
      bedSd: bedtimeSdSeries(records, win),
      bedOffsets: bedtimeOffsetSeries(records, win, profile.bedTarget),
      steps: { series: metricChartSeries(records, 'st', win, 'mean'), stats: stepsStats(records, win, targets.stepsMin) },
      load: loadSeries(engine.loads, engine.acwr, win),
      volume: volumeWeeks(workouts, today, training.volumeLandmarks, undefined, training.customExercises),
      stress: stressSeries(records, win, checkIn),
      resilience: resilienceCurves(engine.resilience),
      adherence: { heat, legend, loggingStreak: 0, weighInStreak: weighInStreak(records, today) },
      frequency: {
        week,
        range: rangeCounters,
        rows: frequencyRows(week, rangeCounters, targets.fiber),
        habits: labLinkedHabits(week, Array.isArray(profile.bloodwork) ? profile.bloodwork : []),
      },
    };
  }, [records, workouts, settings, today, range, engine]);

  return {
    today,
    settings,
    records,
    workouts,
    ctx,
    ...series,
    // loggingStreak already lives on the context; read it from there so the
    // Today screen and this counter can never disagree.
    adherence: { ...series.adherence, loggingStreak: ctx.adherence.loggingStreak },
  };
}
