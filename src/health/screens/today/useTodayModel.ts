/**
 * Today-screen view model — one memoised snapshot per minute.
 *
 * Every number on the dashboard comes from the store via the engine: the
 * CoachContext (engine/context.ts) carries readiness, deltas, macros, weight
 * and tobacco; the extra series below (7-day HRV, 30-day weight dots + EWMA
 * line, 7-day tobacco counts) are the same engine helpers the Trends screen
 * uses, so both screens can never disagree. Nothing here reads the clock:
 * `useNow()` supplies it, and the memo is keyed on the minute (brief: "never
 * rebuild on every keystroke") so the bedtime countdown and protein pacing
 * refresh once a minute and not on every store write in between.
 */
import { useMemo } from 'react';
import type { AppSettings, CoachContext, DailyRecord, Insight, ISODate } from '../../data/types';
import { useHealth, useNow, useRecords } from '../../data/store';
import {
  bedtimeCountdown,
  buildCoachContext,
  buildInsights,
  computeEwmaTrend,
  emptyStates,
  lateEatingCheck,
  metricSeries,
  suggestedPrompts,
  tobaccoOf,
  tobaccoStats,
  trendAt,
  weeklyExpenditure,
  type BedtimeCountdown,
  type EmptyStates,
  type LateEatingCheck,
  type SuggestedPrompts,
  type TobaccoStats,
} from '../../engine';
import { parseISODate, toISODate } from '../../lib/dates';

/** Sparkline window for the HRV tile (§1 "7-day sparkline"). */
export const HRV_SPARK_DAYS = 7;
/** Weight trend card window (§1 #6 — "last 30 days"). */
export const WEIGHT_CARD_DAYS = 30;
/** Weigh-ins needed in the window before the trend card draws (task: "< 2 weigh-ins" → empty state). */
export const MIN_WEIGH_INS_FOR_CHART = 2;

export interface WeightSeries {
  /** Daily scale weights (lb), null gaps — the faint dots. */
  dots: Array<{ d: ISODate; value: number | null }>;
  /** EWMA trend carried forward over the same dates (lb). */
  line: Array<{ d: ISODate; value: number | null }>;
  /** Scale weigh-ins inside the window. */
  weighIns: number;
}

export interface TodayModel {
  today: ISODate;
  /** The wall clock, truncated to the minute the model was built on. */
  now: Date;
  settings: AppSettings;
  records: DailyRecord[];
  todayRecord: DailyRecord | null;
  ctx: CoachContext;
  insights: Insight[];
  prompts: SuggestedPrompts;
  empty: EmptyStates;
  /** Last 7 days of HRV (ms), ascending, null gaps. */
  hrv7: Array<number | null>;
  weight: WeightSeries;
  tobacco: TobaccoStats;
  /** Today's tobacco count, or null when nothing has been logged yet (demo data leaves today undefined). */
  tobaccoToday: number | null;
  /** Last calibrated TDEE even when this week's gate failed (null until a block has ever been valid). */
  smoothedTdee: number | null;
  countdown: BedtimeCountdown | null;
  late: LateEatingCheck;
}

export function useTodayModel(): TodayModel & { actions: ReturnType<typeof useHealth>['actions']; storage: ReturnType<typeof useHealth>['state']['storage'] } {
  const { state, actions } = useHealth();
  const records = useRecords();
  const wall = useNow();
  const today = toISODate(wall);
  const hh = wall.getHours();
  const mm = wall.getMinutes();
  // A Date that only changes identity once a minute, so it can key the memo
  // without pulling the per-render `wall` object into the dependency list.
  const now = useMemo(() => {
    const d = parseISODate(today);
    d.setHours(hh, mm, 0, 0);
    return d;
  }, [today, hh, mm]);
  const settings = state.settings;

  const model = useMemo<TodayModel>(() => {
    const ctx = buildCoachContext({ records, settings, today, now });
    const profile = settings.profile;
    const alpha = settings.targets.ewmaAlpha;
    const todayRecord = ctx.todayRecord;

    const hrv7 = metricSeries(records, 'hrv', today, HRV_SPARK_DAYS).map((p) => p.v);

    const trendMap = computeEwmaTrend(records, alpha, today);
    const dotsRaw = metricSeries(records, 'w', today, WEIGHT_CARD_DAYS);
    const weight: WeightSeries = {
      dots: dotsRaw.map((p) => ({ d: p.d, value: p.v })),
      line: dotsRaw.map((p) => ({ d: p.d, value: trendAt(trendMap, p.d) ?? null })),
      weighIns: dotsRaw.filter((p) => p.v !== null).length,
    };

    const exp = weeklyExpenditure(records, today, { alpha });

    return {
      today,
      now,
      settings,
      records,
      todayRecord,
      ctx,
      insights: buildInsights(ctx, settings),
      prompts: suggestedPrompts(ctx),
      empty: emptyStates(ctx),
      hrv7,
      weight,
      tobacco: tobaccoStats(records, today),
      tobaccoToday: tobaccoOf(todayRecord),
      smoothedTdee: exp.smoothedTdee,
      countdown: bedtimeCountdown(now, profile.bedTarget, profile.wakeTarget),
      late: lateEatingCheck(todayRecord?.meals, profile.bedTarget, ctx.nowHHMM),
    };
  }, [records, settings, today, now]);

  return { ...model, actions, storage: state.storage };
}
