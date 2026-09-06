/**
 * Train-screen view model (plan §2a) — two memos, on purpose.
 *
 * `useTrainModel` builds the CoachContext once per (data change, minute). It
 * carries today's plan, the load block, this week's volume and the callouts,
 * and it is what Today / Log / History read. Nothing on those views recomputes
 * an engine number: `ctx.training` is the single source, so the Train tab, the
 * Today tile and the coach can never disagree about what to lift.
 *
 * `useAnalysisModel` is the second memo. The e1RM history, the 12-week volume
 * grid and the load series depend on the exercise picker and the range toggle,
 * which the context does not — flipping 90D → 1Y or picking a different lift
 * must not rebuild readiness, sleep and the stress stack. It re-derives the
 * load series (rather than reading `ctx.training.load`, which is one day)
 * exactly the way `engine/context.ts` does — same `restHr` median, same WHOOP
 * fit — so the chart's last point equals the number Today shows.
 *
 * Neither memo reads the clock: `useNow()` supplies it and the key is the
 * minute, so a keystroke in the logger never rebuilds the engine.
 */
import { useMemo } from 'react';
import type {
  AppSettings,
  CoachContext,
  DailyRecord,
  Exercise,
  ISODate,
  Muscle,
  MuscleVolume,
  PersonalRecord,
  TrainingContext,
  VolumeLandmark,
  Workout,
} from '../../data/types';
import { useHealth, useNow, useRecords, useWorkouts } from '../../data/store';
import {
  RHR_BASELINE_DAYS,
  acwrSeries,
  banisterSeries,
  buildCoachContext,
  dailyLoadSeries,
  detectPRs,
  exerciseById,
  exerciseHistory,
  fitBanisterTau,
  fitWhoopScale,
  landmarkDefaults,
  loadChartSeries,
  median,
  metricSeries,
  weekStartMonday,
  weeklySetsByMuscle,
  type ExerciseHistory,
  type LoadChartPoint,
  type SessionLoadOpts,
} from '../../engine';
import { addDays, toISODate } from '../../lib/dates';
import type { Units } from './trainUtils';

/** Weeks in the volume grid (plan §2a: 15 muscles × 12 weeks). */
export const VOLUME_WEEKS = 12;
/** PR list window on the Analysis view. */
export const PR_LIST_DAYS = 90;
/** History the load series is built from before the chart window is sliced out. */
const LOAD_HISTORY_DAYS = 400;

export interface TrainModel {
  today: ISODate;
  /** Wall clock as epoch ms, refreshed once a minute by `useNow`. */
  nowMs: number;
  settings: AppSettings;
  records: DailyRecord[];
  workouts: Workout[];
  ctx: CoachContext;
  /** `ctx.training`, or an all-empty block on a build that has none. */
  training: TrainingContext;
  units: Units;
  custom: readonly Exercise[];
  landmarks: Record<Muscle, VolumeLandmark>;
  restTimerSec: number;
}

/**
 * The training block a context without one implies: no plan, no load, no
 * volume. Every field is the honest "nothing logged yet" value so the views
 * render their empty states instead of guarding on undefined.
 */
export function emptyTraining(): TrainingContext {
  return {
    todaySession: 'rest',
    plannedExercises: [],
    todayWorkouts: [],
    load: {
      today: 0,
      acute7: 0,
      chronic28: 0,
      acwr: null,
      acwrBand: null,
      weekOverWeekPct: null,
      fitness: 0,
      fatigue: 0,
      form: 0,
      formBand: null,
      monotony: null,
      weeklyLoad: 0,
      source: 'none',
      tauIsPrior: true,
    },
    weeklySets: [],
    muscleReadiness: [],
    balance: { pushPull: null, squatHinge: null },
    prs7d: [],
    plateaus: [],
    deload: { recommended: false, reasons: [] },
    lastSession: null,
    vo2max: null,
  };
}

export function useTrainModel(): TrainModel {
  const { state } = useHealth();
  const records = useRecords();
  const workouts = useWorkouts();
  const now = useNow();
  const settings = state.settings;
  // Key on the minute, not the Date: `useNow` returns a new object each tick.
  const minuteKey = Math.floor(now.getTime() / 60_000);

  return useMemo(() => {
    const nowMs = minuteKey * 60_000;
    const clock = new Date(nowMs);
    const today = toISODate(clock);
    const ctx = buildCoachContext({ records, settings, today, now: clock, workouts });
    const training = ctx.training ?? emptyTraining();
    const trainingSettings = settings.training;
    return {
      today,
      nowMs: now.getTime(),
      settings,
      records,
      workouts,
      ctx,
      training,
      units: trainingSettings?.units === 'kg' ? 'kg' : 'lb',
      custom: trainingSettings?.customExercises ?? [],
      landmarks: trainingSettings?.volumeLandmarks ?? landmarkDefaults(settings.profile?.trainingLevel),
      restTimerSec: Number.isFinite(trainingSettings?.restTimerSec) ? trainingSettings.restTimerSec : 90,
    };
    // `now.getTime()` is deliberately excluded: the memo is keyed on the minute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, workouts, settings, minuteKey]);
}

// ---------------------------------------------------------------------------
// Analysis memo
// ---------------------------------------------------------------------------

/** One column of the volume grid. */
export interface VolumeWeek {
  weekStart: ISODate;
  muscles: MuscleVolume[];
}

export interface ExerciseOption {
  id: string;
  name: string;
  /** Sessions the exercise appears in (the picker's sort key). */
  sessions: number;
  /** Most recent day it was trained. */
  last: ISODate;
}

export interface AnalysisModel {
  /** Exercises with any logged history, most-trained first. */
  options: ExerciseOption[];
  /** e1RM history for the picked exercise; null when nothing is logged. */
  history: ExerciseHistory | null;
  /** PRs on the picked exercise inside the window, for the chart's markers. */
  exercisePrs: PersonalRecord[];
  /** All PRs in the last `PR_LIST_DAYS` days, for the list. */
  prs: PersonalRecord[];
  /** 15 muscles × 12 weeks, oldest week first. */
  volumeWeeks: VolumeWeek[];
  /** Daily load / acute / chronic / ACWR / fitness / fatigue / form. */
  load: LoadChartPoint[];
}

/**
 * Everything the Analysis view draws, keyed on the picked exercise and the
 * chart window. Kept out of `useTrainModel` so the picker and the range
 * toggle are cheap.
 */
export function useAnalysisModel(model: TrainModel, exerciseId: string | null, days: number): AnalysisModel {
  const { workouts, records, today, custom, landmarks, settings } = model;

  return useMemo(() => {
    const options = exerciseOptions(workouts, custom);
    const picked = exerciseId && options.some((o) => o.id === exerciseId) ? exerciseId : options[0]?.id ?? null;
    const history = picked ? exerciseHistory(workouts, picked, today, { custom, days }) : null;

    const prs = detectPRs(workouts, today, { custom, days: PR_LIST_DAYS });
    const windowStart = addDays(today, -(days - 1));
    const exercisePrs = picked ? prs.filter((p) => p.exerciseId === picked && p.d >= windowStart) : [];

    const thisWeek = weekStartMonday(today);
    const volumeWeeks: VolumeWeek[] = [];
    for (let i = VOLUME_WEEKS - 1; i >= 0; i--) {
      const weekStart = addDays(thisWeek, -7 * i);
      volumeWeeks.push({ weekStart, muscles: weeklySetsByMuscle(workouts, today, landmarks, { custom, weekStart }) });
    }

    // Same construction as engine/context.ts, so the last point of the chart
    // is the number `ctx.training.load` publishes.
    const profile = settings.profile;
    const restHr = median(metricSeries(records, 'rhr', today, RHR_BASELINE_DAYS).map((p) => p.v));
    const loadOpts: SessionLoadOpts = { profile, restHr };
    const whoopFit = fitWhoopScale(records, workouts, loadOpts);
    const series = dailyLoadSeries(records, workouts, today, { ...loadOpts, whoopFit, days: LOAD_HISTORY_DAYS });
    const tau = fitBanisterTau(series);
    const load = loadChartSeries(series, banisterSeries(series, tau), acwrSeries(series), today, days);

    return { options, history, exercisePrs, prs, volumeWeeks, load };
  }, [workouts, records, today, custom, landmarks, settings, exerciseId, days]);
}

/** Every exercise with logged sets, most-trained first then most-recent. */
function exerciseOptions(workouts: readonly Workout[], custom: readonly Exercise[]): ExerciseOption[] {
  const seen = new Map<string, { sessions: number; last: ISODate }>();
  for (const w of workouts ?? []) {
    if (!w?.exercises) continue;
    const perSession = new Set<string>();
    for (const we of w.exercises) {
      if (!we?.exerciseId || (we.sets ?? []).length === 0) continue;
      perSession.add(we.exerciseId);
    }
    for (const id of perSession) {
      const cur = seen.get(id);
      if (cur) {
        cur.sessions += 1;
        if (w.d > cur.last) cur.last = w.d;
      } else {
        seen.set(id, { sessions: 1, last: w.d });
      }
    }
  }
  return [...seen.entries()]
    .map(([id, v]) => ({ id, name: exerciseById(id, custom)?.name ?? id, sessions: v.sessions, last: v.last }))
    .sort((a, b) => (a.sessions !== b.sessions ? b.sessions - a.sessions : a.name < b.name ? -1 : 1));
}
