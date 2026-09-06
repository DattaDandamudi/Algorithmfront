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
 * swcBandSeries, computeEwmaTrend, weeklyExpenditure, adherenceGrid …) so the
 * Trends charts can never disagree with the Today tiles or the coach.
 */
import { useMemo } from 'react';
import type { AppSettings, CoachContext, DailyRecord, ISODate } from '../../data/types';
import { useHealth, useNow, useRecords } from '../../data/store';
import {
  RHR_BASELINE_DAYS,
  adherenceGrid,
  buildCoachContext,
  frequencyCounters,
  labLinkedHabits,
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
  metricChartSeries,
  rangeWindow,
  rollingMeanSeries,
  sleepSeries,
  stepsStats,
  weightSeries,
  type BandedSeries,
  type BaselineBand,
  type BedtimeSdSeries,
  type LinedSeries,
  type RangeWindow,
  type SleepSeries,
  type StepsStats,
  type WeightSeries,
} from './series';
import { frequencyRows, heatDay, heatLegend, heatWindowDays, tdeeSeries, type FrequencyRow, type HeatMode, type TdeeSeries } from './summaries';

export const HEAT_MODES: HeatMode[] = ['protein', 'kcal', 'logging'];

export interface TrendsModel {
  today: ISODate;
  settings: AppSettings;
  records: DailyRecord[];
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

  const ctx = useMemo(() => buildCoachContext({ records, settings, today, now }), [records, settings, today, now]);

  const series = useMemo(() => {
    const { profile, targets } = settings;
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
      weight: weightSeries(records, win, alpha, profile.units),
      tdee: tdeeSeries(records, win, alpha),
      hrv: hrvSeries(records, win),
      rhr: rollingMeanSeries(records, 'rhr', win, 7),
      rhrBand: baselineBand(records, 'rhr', today, RHR_BASELINE_DAYS),
      sleep: sleepSeries(records, win, profile),
      bedSd: bedtimeSdSeries(records, win),
      bedOffsets: bedtimeOffsetSeries(records, win, profile.bedTarget),
      steps: { series: metricChartSeries(records, 'st', win, 'mean'), stats: stepsStats(records, win, targets.stepsMin) },
      adherence: { heat, legend, loggingStreak: 0, weighInStreak: weighInStreak(records, today) },
      frequency: {
        week,
        range: rangeCounters,
        rows: frequencyRows(week, rangeCounters, targets.fiber),
        habits: labLinkedHabits(week, Array.isArray(profile.bloodwork) ? profile.bloodwork : []),
      },
    };
  }, [records, settings, today, range]);

  return {
    today,
    settings,
    records,
    ctx,
    ...series,
    // loggingStreak already lives on the context; read it from there so the
    // Today screen and this counter can never disagree.
    adherence: { ...series.adherence, loggingStreak: ctx.adherence.loggingStreak },
  };
}
