/**
 * CoachContext builder — the one place that turns raw `DailyRecord[]`,
 * `Workout[]` and `AppSettings` into the compact, JSON-serialisable snapshot
 * that the Today screen, the insight generator (§7) and the coach prompt (§8)
 * all read.
 *
 * This module computes nothing new: every number comes from an engine module
 * (weight §6.1, Kalman §1a, expenditure §6.2/§1b, hrv/readiness §6.3, sleep
 * §6.4, nutrition §6.5, tobacco §6.6, adherence §3, load/strength §1e, stress
 * and energy §1h, behaviour impact and regime detection §1i) so screens,
 * insights and the LLM can never disagree with each other. It only decides
 * *which* window each module sees, in what order they run, and how their
 * output maps onto `CoachContext` (data/types.ts).
 *
 * Contract:
 * - Pure and deterministic. `today` and `now` are inputs; the clock is never
 *   read here (`nowHHMM(input.now)` formats the caller's Date).
 * - Null-safe on an empty records array (fresh install), on a single partial
 *   record for today, and with no workouts and no check-ins at all: every
 *   block is still built, nothing throws, and no value is NaN (missing data is
 *   `null`, counts are 0).
 * - Body weight for g/kg and %BW math (§6.5 protein pacing, §6.1 rate band,
 *   hydration): the EWMA trend when one exists (§6.1 "trust the trend line,
 *   never a single dot" — a 2 lb glycogen bump must not move the lb/wk band,
 *   R3-12), else the latest scale weight within the last 14 days, else
 *   `profile.weightLb`.
 * - The published weekly rate is the **Kalman** (decision) rate with its own
 *   90% interval; it is null while the slope is too uncertain to publish
 *   (§1a). `weight.trend` stays the EWMA display trend so the v2 tile and the
 *   `wt` cache keep working (`kalmanLevel` carries the smoothed level the
 *   chart draws).
 * - The calorie suggestion is §1b's two-tier rule (fine ±50/100 from one
 *   block, coarse ≥150 after two, frozen for a fortnight after a change), and
 *   nothing is suggested before a block has actually closed.
 *
 * Ordering matters and is the only interesting thing in here:
 *   Kalman → changepoints → HRV (reference truncated at a confirmed shift)
 *   → training load → readiness map → sleep (learned baseline needs the map)
 *   → stress (needs load + readiness) → readiness (needs form/stress/illness)
 *   → energy, impact, training block → the rest.
 */
import type {
  AppSettings,
  BaselineDelta,
  CoachContext,
  DailyRecord,
  ISODate,
  Insight,
  Macros,
  Muscle,
  PlannedExercise,
  Profile,
  Program,
  ResilienceBand,
  StressContext,
  TrainingContext,
  VolumeLandmark,
  Workout,
} from '../data/types';
import { DEFAULT_PROFILE } from '../data/defaults';
import { addDays, hhmmToMinutes, nowHHMM } from '../lib/dates';
import { adherenceCounts, adherenceGrid, loggingStreak } from './adherence';
import { baselineDelta, metricSeries } from './baseline';
import { detectRegimeShifts } from './changepoint';
import { energyForecast } from './energy';
import { DEFAULT_PROGRAM, exerciseById, landmarkDefaults } from './exerciseDb';
import { recommendIntakeV3, weeklyExpenditureV3 } from './expenditure';
import { hrvStatus } from './hrv';
import { behaviourImpact, isConfirmedEffect } from './impact';
import { generateInsights } from './insights';
import { computeKalmanTrend, kalmanAt, kalmanLevelMap, kalmanRate, smoothKalman } from './kalman';
import {
  type ExerciseLookup,
  type SessionLoadOpts,
  dailyLoadSeries,
  estimateVo2max,
  fitWhoopScale,
  muscleReadiness,
  trainingLoadSummary,
} from './load';
import {
  dayTotals,
  dayTypeFor,
  fatFloorCheck,
  frequencyCounters,
  habitualWakeWindow,
  hydrationTarget,
  lateEatingCheck,
  macroTargetsFor,
  proteinPacing,
  remainingMacros,
} from './nutrition';
import { RHR_BASELINE_DAYS, bandOf, readiness } from './readiness';
import { caffeineCheck, sleepSummary } from './sleep';
import { median } from './stats';
import {
  balanceRatios,
  deloadCheck,
  detectPRs,
  detectPlateau,
  suggestProgression,
  weeklySetsByMuscle,
} from './strength';
import { resilienceSummary, stressSummary } from './stress';
import { tobaccoHrvComparison, tobaccoInsightNumbers, tobaccoStats } from './tobacco';
import {
  computeEwmaTrend,
  isWeight,
  latestWeight,
  rateBand,
  targetLbPerWeek,
  trendAt,
  weeksOutsideBand,
  weighInsInWeek,
} from './weight';

/**
 * Bump when the shape or semantics of the built context change in a way the
 * coach prompt / cached insights would notice (e.g. a window length changes).
 */
export const ENGINE_VERSION = '3';

/** Baseline windows (§0 "vs your 30-day average"; §1 "RHR vs 28-day baseline"). */
export const BASELINE_DAYS = 30;
/** `last30` covers the 30 calendar days strictly before today (§8 LAST_30_DAYS; TODAY is sent separately). */
export const LAST_N_DAYS = 30;
/** Nutrition-frequency counters look at the trailing week (§3, §7 #13/#14). */
export const FREQUENCY_DAYS = 7;
/** Adherence heatmap / hit-day counts window (§3). */
export const ADHERENCE_DAYS = 30;
/** A scale weight older than this no longer drives per-kg math. */
export const RECENT_WEIGHT_DAYS = 14;
/**
 * Days of readiness the derived series covers. 90 = `IMPACT_WINDOW_DAYS`, the
 * longest window any consumer needs (the learned sleep baseline wants 60, the
 * resilience scissors 42). One pass serves all three.
 */
export const READINESS_MAP_DAYS = 90;
/**
 * Extra history the readiness pass is given beyond `READINESS_MAP_DAYS`, so
 * each day's HRV reference and 28-day baselines are complete: `hrv`'s span is
 * 98 days and nothing else looks back further.
 */
const READINESS_MAP_LEAD_DAYS = 98;
/** PRs reported on Today are this week's (§1e). */
const PR_WINDOW_DAYS = 7;
/** Cap on `accumulationWeeks` — beyond three months the count says nothing new. */
const ACCUMULATION_MAX_WEEKS = 12;
/**
 * A 7-day block counts as a break rather than accumulated load when it carries
 * no load at all, or less than this share of the mean of the blocks since it.
 * Sized against `strength.DELOAD_SET_CUT_PCT` (a real deload cuts sets ~40%, so
 * its week lands near 0.6 of normal) while leaving ordinary week-to-week
 * variation alone. **Heuristic** — no published rule defines "weeks since your
 * last deload"; it exists so `deloadCheck` has an input, and it only ever
 * contributes alongside a second trigger.
 */
const BREAK_LOAD_SHARE = 0.7;
/** Consecutive red days are only searched this far back (deload trigger). */
const RED_STREAK_LOOKBACK_DAYS = 21;
/**
 * Meals logged before 04:00 belong to the previous *eating* day: someone who
 * eats at 00:20 has not started a new day of macros. The whole nutrition block
 * follows that axis (§6.5); every other block stays on the calendar day.
 */
export const EATING_DAY_ROLLOVER_MIN = 4 * 60;
/** Neutral clock used only when the caller's Date is invalid (keeps "HH:MM" fields parseable). */
const FALLBACK_NOW = '12:00';
/** Behaviour effects carried into the context — the five strongest survivors of BH correction. */
export const MAX_IMPACT_EFFECTS = 5;
/**
 * History the regime detector scans. The context is the only caller, so it
 * picks the window: the HRV reference a confirmed shift truncates is at most
 * 97 days long (`REF_LAG_DAYS + REF_WINDOW_MAX_DAYS`), and a "your baseline
 * moved" card about last spring is not news. A quarter, plus a month of
 * lead-in for the detector, covers everything the context does with a shift.
 */
export const CHANGEPOINT_SCAN_DAYS = 120;

export interface BuildContextInput {
  /** All records, sorted ascending by `d` (the store's `useRecords()` shape). */
  records: DailyRecord[];
  settings: AppSettings;
  /** The day being described — usually today, but any date for history views. */
  today: ISODate;
  /** Wall-clock "now" supplied by the caller (`useNow()`); never read here. */
  now: Date;
  /**
   * Logged and imported sessions (the store's `useWorkouts()` shape). Absent
   * means "none": every training number then reports its own empty state
   * rather than throwing.
   */
  workouts?: Workout[];
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * The previous evaluation's resilience band, per built context. `generateInsights`
 * needs it for the "resilience moved" card and the engine holds no state, so
 * the value is derived here (yesterday's `resilienceSummary`, same inputs) and
 * parked beside the context object it belongs to. A `WeakMap` keyed by the
 * context means nothing outlives the object, `buildInsights(ctx, settings)`
 * keeps its two-argument shape, and a hand-built context simply has no
 * previous band — which is the honest answer for one.
 */
const previousResilience = new WeakMap<CoachContext, ResilienceBand | null>();

/**
 * Build the full context for `input.today`. See the module header for the
 * contract and the ordering; each block below names the engine call it
 * delegates to.
 */
export function buildCoachContext(input: BuildContextInput): CoachContext {
  const { settings, today } = input;
  const records = Array.isArray(input.records) ? input.records : [];
  const workouts = Array.isArray(input.workouts) ? input.workouts : [];
  const profile = settings.profile ?? DEFAULT_PROFILE;
  const targets = settings.targets;
  const training = settings.training;
  const todayRecord = records.find((r) => r.d === today) ?? null;
  const rec = todayRecord ?? undefined;

  // `nowHHMM()` formats whatever Date it is given; an invalid Date would yield
  // "NaN:NaN", so fall back to a neutral clock rather than leak NaN into copy.
  const rawNow = nowHHMM(input.now);
  const nowMin = hhmmToMinutes(rawNow);
  const now = nowMin === null ? FALLBACK_NOW : rawNow;

  // --- Day type (§6.5 carb cycling; `record.lift` overrides the split) -------
  const day = dayTypeFor(today, profile, rec);

  // --- Weight: EWMA (display) and Kalman (decision) --------------------------
  const alpha = targets.ewmaAlpha;
  const trendMap = computeEwmaTrend(records, alpha, today);
  const latest = latestWeight(records, today);
  // The store caches the EWMA on `wt`; prefer it so the tile matches the chart,
  // else read the freshly computed map (carrying the last value forward).
  const trend = finite(rec?.wt) && rec.wt > 0 ? rec.wt : trendAt(trendMap, today) ?? null;
  const bodyWeightLb = referenceBodyWeight(latest, today, trend, profile.weightLb);

  const filtered = computeKalmanTrend(records, today, {
    cycle: { enabled: profile.tracksCycle === true },
  });
  // The drawn trend is the RTS-smoothed level (§1a); at `today` the smoother
  // and the filter agree, so the rate is the same either way.
  const kalman = smoothKalman(filtered);
  const kalmanPoint = kalmanAt(kalman, today);
  const rate = kalmanRate(kalman, today, bodyWeightLb);
  const weeklyRateLb = rate.available ? rate.lbPerWk : null;
  const levelMap = kalmanLevelMap(kalman);
  const weeksOutside = weeksOutsideBand(levelMap, today, bodyWeightLb, targets.weeklyRatePct);

  // --- Regime shifts (§1i) ---------------------------------------------------
  // `detectRegimeShifts` reads the stamped `kl` (Kalman level) for the weight
  // series. The store stamps it, but an import or a test fixture may not, so
  // fill the gaps from the filter that just ran — same quantity, same filter.
  const changepoints = detectRegimeShifts(withKalmanLevel(records, filtered), today, {
    days: CHANGEPOINT_SCAN_DAYS,
  });
  // A confirmed HRV level change truncates the 60-day reference: the newest
  // one wins, and only HRV shifts may move the HRV reference.
  const hrvShift = newestShift(changepoints, 'hrv');

  // --- HRV / readiness (§6.3) — one HrvStatus shared by both -----------------
  const hrv = hrvStatus(records, today, {
    age: profile.age,
    ...(hrvShift ? { referenceStart: hrvShift.d } : {}),
  });
  const hrvDelta: BaselineDelta = {
    ...baselineDelta(records, 'hrv', today, BASELINE_DAYS),
    // insights.emptyStates reads `hrv.delta.n` as "days of HRV logged", so it
    // must be the reading count in the 30-day window (today included), which
    // is exactly what hrvStatus already counts for its baseline gate.
    n: hrv.daysOfData,
  };
  const rhr = baselineDelta(records, 'rhr', today, RHR_BASELINE_DAYS);

  // --- Training load (§1e) — needed before readiness (form/ACWR modifiers) ---
  const restHr = median(metricSeries(records, 'rhr', today, RHR_BASELINE_DAYS).map((p) => p.v));
  const loadOpts: SessionLoadOpts = { profile, restHr };
  const whoopFit = fitWhoopScale(records, workouts, loadOpts);
  const loadSeries = dailyLoadSeries(records, workouts, today, { ...loadOpts, whoopFit });
  // `whoopFit.fitted` is the difference between "your own strain curve" and the
  // assumed a = 25 / b = 3.5 prior, and every WHOOP-derived load in the block
  // below went through one of them. It travels with the numbers (as
  // `tauIsPrior` already does) so the gauge can hedge a series built on the
  // prior instead of printing it like a measurement.
  const trainingLoad: TrainingContext['load'] = {
    ...trainingLoadSummary(records, workouts, today, { ...loadOpts, whoopFit }),
    whoopIsPrior: !whoopFit.fitted,
  };

  // --- Readiness series (derived, not stored) --------------------------------
  // The learned sleep baseline, the resilience scissors and the N-of-1 impact
  // engine all want "readiness on day d". Modifiers (form, stress, illness)
  // only ever move the *band*, never the score, so the historical pass runs
  // without them and today's entry equals the final score below.
  const readinessScores = readinessSeries(records, today, profile, hrv);
  const readinessByDate: Record<ISODate, number | null> = {};
  for (const p of readinessScores) readinessByDate[p.d] = p.score;

  // --- Sleep (§6.4) — the learned baseline needs the readiness map -----------
  const sleep = sleepSummary(records, today, profile, { readiness: readinessByDate });

  // --- Stress (§1h) ----------------------------------------------------------
  const stressOpts = {
    profile,
    checkIn: settings.checkIn,
    loads: loadSeries,
    readinessScores,
    sleepNeedHrs: sleep.tonightNeed,
  };
  const stressRaw = stressSummary(records, today, stressOpts);
  const stress: StressContext = {
    ...stressRaw,
    checkIn: {
      ...stressRaw.checkIn,
      // A deliberate skip (`qsk`) is an answer: the Today prompt must stop
      // asking. Only an untouched day still counts as missing.
      missingToday: stressRaw.checkIn.missingToday && rec?.qsk !== true,
    },
  };

  // --- Readiness (§1/§6.3) ---------------------------------------------------
  const ready = readiness(records, today, profile, {
    hrv,
    formBand: trainingLoad.formBand,
    acwr: trainingLoad.acwr,
    acwrBand: trainingLoad.acwrBand,
    stressBand: stress.band,
    illness: stress.illness.flag,
  });

  // --- Predicted energy (§1h) — the only consumer of the caller's clock ------
  const yesterdayLoad = loadSeries.find((p) => p.d === addDays(today, -1))?.load ?? null;
  const energy = energyForecast(records, settings, { d: today, hhmm: now }, {
    osi: stress.osi,
    yesterdayLoad,
  });

  // --- Behaviour impact (§1i) ------------------------------------------------
  const impactAll = behaviourImpact(records, workouts, today, {
    profile,
    readinessScores,
    loads: loadSeries,
  });
  // `behaviourImpact` already sorts by q ascending, so the first five
  // survivors of the q ≤ 0.05 bar are the five strongest.
  const impact = {
    effects: impactAll.effects.filter(isConfirmedEffect).slice(0, MAX_IMPACT_EFFECTS),
    pending: impactAll.pending,
  };

  // --- Training block (§1e) --------------------------------------------------
  const trainingCtx = buildTraining({
    workouts,
    today,
    profile,
    training,
    session: day.session,
    load: trainingLoad,
    loadSeries,
    readinessBand: ready.band,
    readinessScores,
    records,
  });

  // --- Expenditure & calorie adjustment (§6.2 / §1b) -------------------------
  const exp = weeklyExpenditureV3(records, today, {
    profile,
    targets,
    kalman: filtered,
    workouts,
    alpha,
  });
  const suggestion = recommendIntakeV3({ result: exp, targets, currentKcal: targets.kcal, bodyWeightLb });
  // A suggestion needs a block that actually closed: an in-progress week must
  // never move the target (§6.2), so the coach sees "no suggestion" not "hold".
  const hasBlock = exp.blocks.some((b) => b.valid);

  // --- Nutrition (§6.5) ------------------------------------------------------
  // Meals logged before 04:00 belong to the previous eating day.
  const eatingDay = nowMin !== null && nowMin < EATING_DAY_ROLLOVER_MIN ? addDays(today, -1) : today;
  const eatingRec = eatingDay === today ? rec : records.find((r) => r.d === eatingDay);
  // Macro targets follow the eating day too, so a 01:00 snack is measured
  // against the carb range of the day it belongs to. `ctx.dayType` stays the
  // calendar day's — that is the day being trained.
  const eatingDayType = eatingDay === today ? day : dayTypeFor(eatingDay, profile, eatingRec);
  const macro = macroTargetsFor(eatingDayType.type, targets);
  const totals: Macros = dayTotals(eatingRec);
  const remaining = remainingMacros(totals, macro);
  const pacing = proteinPacing({
    record: eatingRec,
    targets,
    weightLb: bodyWeightLb,
    nowHHMM: now,
    bedTarget: profile.bedTarget,
  });
  // The circadian late-eating rule needs the user's own wake period; without
  // it `lateEatingCheck` silently falls back to the fixed-clock rule.
  const wakeWindow = habitualWakeWindow(records, today, profile);
  const late = lateEatingCheck(eatingRec?.meals, profile.bedTarget, now, wakeWindow);
  const fat = fatFloorCheck(totals, remaining.kc, targets, now);
  const water = hydrationTarget(bodyWeightLb, targets, rec?.st, rec?.strn);
  const caffeine = caffeineCheck(rec?.caf, profile.bedTarget, profile.caffeineCutoff);

  // --- Tobacco (§6.6) --------------------------------------------------------
  const tob = tobaccoStats(records, today);
  const tobCmp = tobaccoHrvComparison(records, today, BASELINE_DAYS);
  // §7 #9 quotes the last 3 smoke-free mornings; the 30-day comparison stays for the coach.
  const tobNums = tobaccoInsightNumbers(records, today);

  // --- Frequency counters (§3) & adherence (§3) --------------------------------
  const freq = frequencyCounters(records, today, FREQUENCY_DAYS);
  const counts = adherenceCounts(adherenceGrid(records, today, ADHERENCE_DAYS, targets, profile));

  const ctx: CoachContext = {
    today,
    nowHHMM: now,
    dayType: day.type,
    sessionType: day.session,
    readiness: ready,
    hrv: {
      today: hrv.todayMs,
      baseline7: hrv.mean7Ms,
      lnMean7: hrv.mean7Ln,
      swcLower: hrv.swcLowerMs,
      swcUpper: hrv.swcUpperMs,
      band: hrv.band,
      cv7: hrv.cv7,
      delta: hrvDelta,
      baseline28: hrv.baselineMs,
      baselineEstablished: hrv.baselineEstablished,
      daysOfData: hrv.daysOfData,
      overreaching: hrv.overreachingFlag,
      refMedianMs: hrv.baselineMs,
      refSdLn: hrv.sdLn,
      nRef: hrv.nBaseline,
      // The first day the reference actually draws on: the confirmed shift
      // when one truncated it, else the window's own start.
      referenceStart: hrv.reference.truncatedAt ?? hrv.reference.start,
      nWindow: hrv.n7,
      forcing: hrv.forcing,
      forcingReason: hrv.forcingReason,
      // The clause's evidence travels with the verdict it forced: the Today
      // card that repeats a forced "keep it light" has to be able to say the
      // rule is our own heuristic (FORCING_EVIDENCE) rather than a finding.
      forcingSupport: hrv.forcingSupport,
      forcingLabel: hrv.forcingLabel,
      saturated: hrv.saturated,
    },
    rhr,
    sleep: {
      hours: sleep.hours,
      need: sleep.need,
      debtMin: sleep.debtMin,
      bedtimeSdMin: sleep.consistency.bedtimeSdMin,
      midpointSdMin: sleep.consistency.midpointSdMin,
      bedtimeNights: sleep.consistency.n,
      lastBedtime: sleep.lastBedtime,
      delta: baselineDelta(records, 'slh', today, BASELINE_DAYS),
      tonightNeed: sleep.tonightNeed,
      learnedBaselineHrs: sleep.learnedBaselineHrs,
      baselineSource: sleep.baselineSource,
      sri: sleep.sri,
      sriNights: sleep.sriNights,
      socialJetlagMin: sleep.socialJetlagMin,
    },
    steps: {
      // Like every other tile: the previous 30 days, never today's partial count (R3-9).
      ...baselineDelta(records, 'st', today, BASELINE_DAYS),
      goalMin: targets.stepsMin,
      goalMax: targets.stepsMax,
    },
    weight: {
      latest: latest ? latest.w : null,
      trend,
      weeklyRateLb,
      weeklyRatePct: rate.available ? rate.pctPerWk : null,
      targetLbPerWk: targetLbPerWeek(bodyWeightLb, targets.weeklyRatePct),
      inBand: rateBand(weeklyRateLb, bodyWeightLb, targets.weeklyRatePct),
      weighInsThisWeek: weighInsInWeek(records, today),
      weeksOutsideBand: weeksOutside,
      kalmanLevel: kalmanPoint ? kalmanPoint.level : null,
      levelSd: kalmanPoint ? kalmanPoint.levelSd : null,
      rateSdLb: rate.sdLbPerWk,
      rateLow90: rate.lo90,
      rateHigh90: rate.hi90,
      rateAvailable: rate.available,
      suspectToday: kalmanPoint?.suspect === true || rec?.ws === true,
    },
    expenditure: {
      // The posterior is always defined; it is only published once its 90%
      // interval is tight enough to move a calorie target on (§1b).
      tdee: exp.valid ? exp.tdee : null,
      valid: exp.valid,
      // Once a block has closed the suggestion's own line is the fuller one: it
      // quotes P(outside band), the coverage and the energy-density factor.
      reason: hasBlock ? suggestion.reason : exp.reason,
      suggestedKcal: hasBlock ? suggestion.kcal : null,
      suggestedDelta: hasBlock ? suggestion.delta : null,
      calibrating: exp.calibrating,
      nextUpdate: exp.nextUpdate,
      ci: exp.ci,
      low: exp.lo,
      high: exp.hi,
      pOutside: exp.pOutside,
      // Whether that probability localises the rate against the band at all.
      // Measured on a noiseless fixture the block rate's own spread is about
      // 1.27 lb/wk against a 0.85-wide band, so this is routinely false and the
      // probability routinely sits near its 0.5 no-information point. Suppressing
      // it would strip the reason strings of the number they quote, so it travels
      // with the flag instead and the coach is told not to read it as evidence.
      pOutsideComparable: exp.bandComparable,
      blocksOutside: exp.blocksOutside,
      frozenUntil: exp.frozenUntil,
      coverage: exp.coverage,
      energyDensityKcalPerLb: exp.density.kcalPerLb,
      provisionalTdee: exp.tdee,
      tier: suggestion.tier === 'hold' ? 'none' : suggestion.tier,
    },
    nutrition: {
      totals,
      targets: {
        kc: macro.kc,
        p: macro.p,
        f: macro.f,
        c: macro.c,
        fi: macro.fi,
        fatFloor: macro.fatFloor,
        carbsRange: macro.carbsRange,
      },
      remaining,
      mealsLogged: pacing.mealsLogged,
      mealsLeft: pacing.mealsLeft,
      proteinPerMealNeeded: pacing.perMealNeeded,
      lastMealTime: late.lastMealTime,
      fatBelowFloor: fat.belowFloor,
      lateEating: late.late,
      hydrationCups: finite(rec?.h2o) && rec.h2o > 0 ? rec.h2o : 0,
      hydrationTargetCups: water.cups,
      caffeineAfterCutoff: caffeine.afterCutoff,
      lastMealBelowMin: pacing.lastMealBelowMin,
      lastMealProtein: pacing.lastMealProtein,
      minPerMeal: pacing.minPerMeal,
      maxPerMeal: pacing.maxPerMeal,
      slots: pacing.slots,
      lateSharePct: late.score ? late.score.sharePct : null,
      lateSeverity: late.score ? late.score.severity : 'none',
      eatingDay,
    },
    tobacco: {
      today: tob.today,
      avg7: tob.avg7,
      avg30: tob.avg30,
      streakDays: tob.streakDays,
      hrvSmokeFree: tobCmp ? tobCmp.hrvSmokeFree : null,
      hrvSmoking: tobCmp ? tobCmp.hrvSmoking : null,
      hrvFree3: tobNums.hrvFree,
      hrvDelta3: tobNums.delta,
      nFree: tobNums.nFree,
      nSmoke: tobNums.nSmoke,
    },
    frequency: {
      redMeatServings7d: freq.redMeatServings,
      fishServings7d: freq.fishServings,
      restaurantPct7d: freq.restaurantPct,
      fiberAvg7d: freq.fiberAvg,
      homeCookedPct7d: freq.homeCookedPct,
    },
    adherence: {
      loggingStreak: loggingStreak(records, today),
      proteinHitDays30: counts.proteinHitDays,
      kcalHitDays30: counts.kcalHitDays,
      weighInDays30: counts.weighInDays,
    },
    bloodwork: Array.isArray(profile.bloodwork) ? profile.bloodwork : [],
    last30: compactHistory(records, today, LAST_N_DAYS),
    todayRecord,
    training: trainingCtx,
    stress,
    energy,
    impact,
    changepoints,
  };

  // The "resilience moved" card compares against the previous evaluation, and
  // the engine holds no state — so yesterday's band is derived here from the
  // same inputs and parked beside this context (see `previousResilience`).
  previousResilience.set(
    ctx,
    resilienceSummary(records, addDays(today, -1), stressOpts).band,
  );
  return ctx;
}

/**
 * The EWMA trend when one exists (R3-12 — checklist S6.1-05: the band is
 * "recomputed from current trend weight"), else the latest scale weight within
 * `RECENT_WEIGHT_DAYS` of `today`, else the profile's reference weight. The
 * spec persona default is the very last resort so per-kg math stays finite
 * even on a hand-edited import with a blank profile weight (the store's
 * `mergeSettings` normally guarantees it).
 */
function referenceBodyWeight(
  latest: { d: ISODate; w: number } | null,
  today: ISODate,
  trend: number | null,
  profileLb: number,
): number {
  if (trend !== null && isWeight(trend)) return trend;
  if (latest && latest.d >= addDays(today, -(RECENT_WEIGHT_DAYS - 1))) return latest.w;
  if (isWeight(profileLb)) return profileLb;
  return DEFAULT_PROFILE.weightLb;
}

/**
 * `records` with the Kalman level stamped on days that are missing it. The
 * store writes `kl` on every save; an import, a fixture or a test does not,
 * and without it the weight-trend regime detector has no series to watch.
 * The *filtered* (causal) level is used, matching what the store stamps.
 */
function withKalmanLevel(
  records: DailyRecord[],
  filtered: ReturnType<typeof computeKalmanTrend>,
): DailyRecord[] {
  if (filtered.byDate.size === 0) return records;
  let touched = false;
  const out = records.map((r) => {
    if (finite(r.kl)) return r;
    const p = filtered.byDate.get(r.d);
    if (!p) return r;
    touched = true;
    return { ...r, kl: p.level };
  });
  return touched ? out : records;
}

/** The newest confirmed shift for one metric, or null. `detectRegimeShifts` sorts ascending. */
function newestShift(
  shifts: ReadonlyArray<{ d: ISODate; metric: string }>,
  metric: string,
): { d: ISODate } | null {
  let best: { d: ISODate } | null = null;
  for (const s of shifts) if (s.metric === metric && (best === null || s.d > best.d)) best = s;
  return best;
}

/**
 * Readiness for each of the last `READINESS_MAP_DAYS` days that has a record,
 * newest last. Days with nothing logged are reported as `null` rather than
 * scored: readiness on a day the user did not log is not a measurement.
 *
 * Only the *score* is used downstream (the learned sleep baseline, the
 * resilience scissors and the impact engine all read a number), and modifiers
 * never move the score — so this pass deliberately skips the form/stress/
 * illness opts that today's call gets, and today's entry is identical to it.
 */
function readinessSeries(
  records: DailyRecord[],
  today: ISODate,
  profile: Profile,
  todayHrv: ReturnType<typeof hrvStatus>,
): Array<{ d: ISODate; score: number | null }> {
  const first = addDays(today, -(READINESS_MAP_DAYS - 1));
  // Sorted so each day can be given just its own lead-in: every window this
  // pass needs is at most `READINESS_MAP_LEAD_DAYS` long, and handing 90 calls
  // the whole history instead costs more than the scoring does.
  const window = records
    .filter((r) => r.d >= addDays(first, -READINESS_MAP_LEAD_DAYS) && r.d <= today)
    .sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  const at = new Map<ISODate, number>();
  window.forEach((r, i) => at.set(r.d, i));
  const out: Array<{ d: ISODate; score: number | null }> = [];
  for (let i = READINESS_MAP_DAYS - 1; i >= 0; i--) {
    const d = addDays(today, -i);
    const hi = at.get(d);
    if (hi === undefined) {
      // Nothing logged: readiness on a day the user did not log is not a
      // measurement, and imputing one would leak into three other modules.
      out.push({ d, score: null });
      continue;
    }
    // At least `READINESS_MAP_LEAD_DAYS` records back — never fewer days than
    // the HRV reference needs, and more when the log is sparse.
    const lead = window.slice(Math.max(0, hi - READINESS_MAP_LEAD_DAYS), hi + 1);
    const opts = d === today ? { hrv: todayHrv } : {};
    out.push({ d, score: readiness(lead, d, profile, opts).score });
  }
  return out;
}

interface TrainingInput {
  workouts: Workout[];
  records: DailyRecord[];
  today: ISODate;
  profile: Profile;
  training: AppSettings['training'];
  session: TrainingContext['todaySession'];
  load: TrainingContext['load'];
  loadSeries: ReturnType<typeof dailyLoadSeries>;
  readinessBand: CoachContext['readiness']['band'];
  readinessScores: Array<{ d: ISODate; score: number | null }>;
}

/** The `training` block (§1e): today's plan, this week's volume and the callouts. */
function buildTraining(input: TrainingInput): TrainingContext {
  const { workouts, records, today, profile, training, session, load, loadSeries } = input;
  const custom = training?.customExercises;
  const lookup: ExerciseLookup = (id) => exerciseById(id, custom) ?? undefined;
  const landmarks: Record<Muscle, VolumeLandmark> =
    training?.volumeLandmarks ?? landmarkDefaults(profile.trainingLevel);

  const muscleReady = muscleReadiness(workouts, today, { lookup, custom });
  const plateaus = detectPlateau(workouts, today, { custom });
  const program = activeProgram(training);
  const planned: PlannedExercise[] = suggestProgression({
    program,
    session,
    workouts,
    asOf: today,
    training,
    readinessBand: input.readinessBand,
    formBand: load.formBand,
    muscleReadiness: muscleReady,
  });

  const vo2 = estimateVo2max(workouts, profile, records, today);
  const sorted = [...workouts]
    .filter((w) => !!w && typeof w.d === 'string' && w.d <= today)
    .sort((a, b) => (a.d !== b.d ? (a.d < b.d ? -1 : 1) : (a.start ?? '') < (b.start ?? '') ? -1 : 1));

  return {
    todaySession: session,
    plannedExercises: planned,
    todayWorkouts: sorted.filter((w) => w.d === today),
    load,
    weeklySets: weeklySetsByMuscle(workouts, today, landmarks, { custom }),
    muscleReadiness: muscleReady,
    balance: balanceRatios(workouts, today, { custom }),
    prs7d: detectPRs(workouts, today, { custom, days: PR_WINDOW_DAYS }),
    plateaus,
    deload: deloadCheck({
      formBand: load.formBand,
      plateaus,
      redReadinessStreak: redStreak(input.readinessScores, today, input.readinessBand),
      accumulationWeeks: accumulationWeeks(loadSeries, today),
    }),
    lastSession: sorted.length > 0 ? sorted[sorted.length - 1] : null,
    // §1e: the engine returns the estimate; stamping `vo2` on the day is the
    // store's job, so the context only carries it.
    vo2max: { value: vo2.value, lo: vo2.lo, hi: vo2.hi, method: vo2.method },
  };
}

/** The user's active program, the first they defined, or the built-in default. */
function activeProgram(training: AppSettings['training']): Program {
  const programs = training?.programs ?? [];
  const active = programs.find((p) => p && p.id === training?.activeProgramId);
  return active ?? programs[0] ?? DEFAULT_PROGRAM;
}

/**
 * Consecutive red-readiness days ending at `today`. Today's band is the one
 * the context publishes (modifiers included); earlier days are banded from
 * their score, which is all the derived series carries.
 */
function redStreak(
  scores: Array<{ d: ISODate; score: number | null }>,
  today: ISODate,
  todayBand: CoachContext['readiness']['band'],
): number {
  const byDate = new Map(scores.map((p) => [p.d, p.score]));
  let streak = 0;
  for (let i = 0; i < RED_STREAK_LOOKBACK_DAYS; i++) {
    const d = addDays(today, -i);
    const band = i === 0 ? todayBand : bandOf(byDate.get(d) ?? null);
    if (band !== 'red') break;
    streak++;
  }
  return streak;
}

/**
 * Whole 7-day blocks of accumulated load ending at `today`, counting back to
 * the last break. See `BREAK_LOAD_SHARE` — this is a heuristic, and it only
 * ever contributes to `deloadCheck` alongside a second trigger.
 */
function accumulationWeeks(
  loadSeries: ReadonlyArray<{ d: ISODate; load: number }>,
  today: ISODate,
): number {
  const byDate = new Map<ISODate, number>();
  for (const p of loadSeries) if (finite(p.load)) byDate.set(p.d, p.load);
  const blockLoad = (offsetWeeks: number): number => {
    let total = 0;
    for (let i = 0; i < 7; i++) total += byDate.get(addDays(today, -(offsetWeeks * 7 + i))) ?? 0;
    return total;
  };
  let weeks = 0;
  let total = 0;
  for (let b = 0; b < ACCUMULATION_MAX_WEEKS; b++) {
    const load = blockLoad(b);
    if (load <= 0) break;
    // Compared with the mean of the blocks since it, so one heavy week does not
    // read as a break and a genuine cut does.
    if (weeks > 0 && load < (total / weeks) * BREAK_LOAD_SHARE) break;
    weeks++;
    total += load;
  }
  return weeks;
}

/**
 * The `days` calendar days strictly before `today`, existing records only,
 * ascending, with `meals` collapsed to `mealCount` so the LLM payload stays a
 * few KB (§8 sends TODAY separately with its itemised meals).
 */
function compactHistory(records: DailyRecord[], today: ISODate, days: number): CoachContext['last30'] {
  const start = addDays(today, -days);
  return records
    .filter((r) => r.d >= start && r.d < today)
    .sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0))
    .map((r) => {
      const { meals, ...rest } = r;
      return meals && meals.length > 0 ? { ...rest, mealCount: meals.length } : rest;
    });
}

export interface BuildInsightsOpts {
  /** Cards to return, highest priority first. Default 3. */
  max?: number;
  /**
   * Overrides the band `buildCoachContext` derived for this context. Pass it
   * when the caller holds the previous evaluation itself.
   */
  previousResilienceBand?: ResilienceBand | null;
}

/**
 * Top insight cards (§7) for a built context — thin wrapper so screens import
 * one module. The shown-history drives the decaying priority (a yellow card
 * cannot hold the top slot all week) and the previous resilience band drives
 * the "resilience moved" card.
 */
export function buildInsights(
  ctx: CoachContext,
  settings: AppSettings,
  opts: BuildInsightsOpts = {},
): Insight[] {
  const resilienceBand =
    opts.previousResilienceBand !== undefined
      ? opts.previousResilienceBand
      : previousResilience.get(ctx) ?? null;
  return generateInsights(ctx, settings.profile, settings.targets, {
    ...(opts.max === undefined ? {} : { max: opts.max }),
    history: settings.insightHistory,
    previous: { resilienceBand },
  });
}

/** Context for an arbitrary date (history views, tests); `now` still comes from the caller. */
export function contextForDate(
  records: DailyRecord[],
  settings: AppSettings,
  d: ISODate,
  now: Date,
  workouts?: Workout[],
): CoachContext {
  return buildCoachContext({ records, settings, today: d, now, workouts });
}
