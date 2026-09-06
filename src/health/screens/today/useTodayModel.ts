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
 *
 * v3 (plan 2b): the context is built with `workouts` so the training, load,
 * stress and energy blocks are filled — the check-ins ride along on the daily
 * records (`qs`/`qf`/`qt`/`qo`/`qsk`) and `settings.checkIn`, which the engine
 * reads itself. The cards this screen shows are then recorded once a day via
 * `recordInsightsShown`, which is what makes the decaying insight priority
 * work: a card that held slot 1 yesterday starts today 4 points down.
 */
import { useEffect, useMemo } from 'react';
import type { AppSettings, BaselineDelta, CoachContext, DailyRecord, Insight, ISODate, Workout } from '../../data/types';
import { useHealth, useNow, useRecords, useWorkouts } from '../../data/store';
import {
  baselineDelta,
  bedtimeCountdown,
  buildCoachContext,
  buildInsights,
  computeEwmaTrend,
  computeKalmanTrend,
  emptyStates,
  kalmanRate,
  habitualWakeWindow,
  lateEatingCheck,
  metricSeries,
  smoothKalman,
  suggestedPrompts,
  tobaccoOf,
  tobaccoStats,
  trendAt,
  type BedtimeCountdown,
  type EmptyStates,
  type LateEatingCheck,
  type SuggestedPrompts,
  type TobaccoStats,
} from '../../engine';
import { parseISODate, toISODate } from '../../lib/dates';
import { selectTodayBanners, type TodayBanner } from './banners';

/** Sparkline window for the HRV tile (§1 "7-day sparkline"). */
export const HRV_SPARK_DAYS = 7;
/** §0 baseline window for the intake tiles ("30-day avg 176 g/day"). */
export const NUTRITION_BASELINE_DAYS = 30;
/**
 * From this hour the day's intake is essentially complete, so a ▲/▼ delta vs
 * the 30-day mean is fair; earlier it would read as "▼ 120 g" at breakfast
 * (review R1-4), so the tiles show the average as a caption instead.
 */
export const DAY_COMPLETE_HOUR = 21;

export interface NutritionBaseline {
  /** Protein eaten today vs the previous 30 days' daily mean (g). */
  protein: BaselineDelta;
  /** Calories eaten today vs the previous 30 days' daily mean (kcal). */
  kcal: BaselineDelta;
  /** True from DAY_COMPLETE_HOUR — the intraday delta is meaningful. */
  dayComplete: boolean;
}
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
  /** Logged and imported sessions, oldest first — what fills `ctx.training`. */
  workouts: Workout[];
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
  /**
   * The composition-aware posterior even when it is too wide to publish, so
   * the calorie tile can label it rather than reaching for the deprecated v2
   * estimator, whose fixed 3,500 kcal/lb overstated a lean user's expenditure
   * by about 500 kcal a day on the home screen.
   */
  provisionalTdee: number | null;
  countdown: BedtimeCountdown | null;
  late: LateEatingCheck;
  /** §0 "vs your 30-day average" for the Protein / Calories tiles (R1-4). */
  nutritionBaseline: NutritionBaseline;
  /**
   * The engine's sentence for a slope it will not publish yet ("Rate
   * unavailable — about 3 more weigh-ins"), or null once the rate is
   * available. `ctx.weight` carries the interval but not this string, so the
   * same `kalmanRate` call is repeated — with the same options — only in the
   * state where the context has nothing to show. The count is the filter's.
   */
  rateReason: string | null;
}

export function useTodayModel(): TodayModel & {
  actions: ReturnType<typeof useHealth>['actions'];
  storage: ReturnType<typeof useHealth>['state']['storage'];
  /** Header banners (escalation → storage/backup → retest, max 2) — screens/today/banners.ts. */
  banners: TodayBanner[];
} {
  const { state, actions } = useHealth();
  const records = useRecords();
  const workouts = useWorkouts();
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
    const ctx = buildCoachContext({ records, settings, today, now, workouts });
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

    // Only when the context has no rate to show: the same filter, the same
    // options, so the sentence and the (absent) interval can never disagree.
    const rateReason =
      ctx.weight.rateAvailable === false
        ? kalmanRate(
            smoothKalman(computeKalmanTrend(records, today, { cycle: { enabled: profile.tracksCycle === true } })),
            today,
            profile.weightLb,
          ).reason
        : null;

    return {
      today,
      now,
      settings,
      records,
      workouts,
      todayRecord,
      ctx,
      insights: buildInsights(ctx, settings),
      prompts: suggestedPrompts(ctx),
      empty: emptyStates(ctx),
      hrv7,
      weight,
      tobacco: tobaccoStats(records, today),
      tobaccoToday: tobaccoOf(todayRecord),
      provisionalTdee: ctx.expenditure.provisionalTdee ?? null,
      countdown: bedtimeCountdown(now, profile.bedTarget, profile.wakeTarget),
      // Anchored to the user's own habitual wake window, exactly as the engine
      // does it. Calling this without the window silently reverts to the
      // fixed-clock rule, which told a 10:00–02:00 sleeper to finish eating by
      // 20:00 when their own late window does not start until 22:48.
      late: lateEatingCheck(todayRecord?.meals, profile.bedTarget, ctx.nowHHMM, habitualWakeWindow(records, today, profile)),
      nutritionBaseline: {
        protein: baselineDelta(records, 'p', today, NUTRITION_BASELINE_DAYS),
        kcal: baselineDelta(records, 'kc', today, NUTRITION_BASELINE_DAYS),
        dayComplete: now.getHours() >= DAY_COMPLETE_HOUR,
      },
      rateReason,
    };
  }, [records, workouts, settings, today, now]);

  // The decaying priority (engine/insights.ts) needs to know which cards were
  // actually on screen: `insightHistory[d]` is read as "what the app showed on
  // day d", so it is written from the screen that shows them, keyed on the day
  // and the template ids. The store no-ops when the ids are unchanged, so this
  // settles after one write however often the model rebuilds; the ids stored
  // are the TEMPLATE ids, which is what `insightStreak` matches on.
  const shown = model.insights.map((i) => i.template).join(',');
  const { recordInsightsShown } = actions;
  useEffect(() => {
    recordInsightsShown(today, shown === '' ? [] : shown.split(','));
  }, [recordInsightsShown, today, shown]);

  // R7-13: "Going to bed" creates tomorrow's record before midnight; that
  // future-dated stub is not a day with data for the backup reminder.
  const recordCount = useMemo(() => records.filter((r) => r.d <= today).length, [records, today]);

  // Banners depend on the storage status, which changes on every save — kept
  // out of the per-minute model memo so a write never rebuilds the engine context.
  const storage = state.storage;
  const banners = useMemo(
    () =>
      selectTodayBanners({
        bloodwork: settings.profile.bloodwork,
        today,
        acknowledgedEscalations: settings.acknowledgedEscalations,
        storage,
        lastExportAt: settings.lastExportAt,
        backupReminderSnoozedUntil: settings.backupReminderSnoozedUntil,
        recordCount,
        nowMs: now.getTime(),
      }),
    [settings.profile.bloodwork, settings.acknowledgedEscalations, settings.lastExportAt, settings.backupReminderSnoozedUntil, storage, recordCount, today, now],
  );

  return { ...model, actions, storage, banners };
}
