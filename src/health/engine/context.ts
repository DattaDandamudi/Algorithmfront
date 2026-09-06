/**
 * CoachContext builder — the one place that turns raw `DailyRecord[]` +
 * `AppSettings` into the compact, JSON-serialisable snapshot that the Today
 * screen, the insight generator (§7) and the coach prompt (§8) all read.
 *
 * This module computes nothing new: every number comes from an engine module
 * (weight §6.1, expenditure §6.2, hrv/readiness §6.3, sleep §6.4, nutrition
 * §6.5, tobacco §6.6, adherence §3) so screens, insights and the LLM can never
 * disagree with each other. It only decides *which* window each module sees
 * and how its output maps onto `CoachContext` (data/types.ts).
 *
 * Contract:
 * - Pure and deterministic. `today` and `now` are inputs; the clock is never
 *   read here (`nowHHMM(input.now)` formats the caller's Date).
 * - Null-safe on an empty records array (fresh install) and on a single
 *   partial record for today: every field is filled, nothing throws, and no
 *   value is NaN (missing data is `null`, counts are 0).
 * - Body weight for g/kg and %BW math (§6.5 protein pacing, §6.1 rate band,
 *   hydration): the EWMA trend when one exists (§6.1 "trust the trend line,
 *   never a single dot" — a 2 lb glycogen bump must not move the lb/wk band,
 *   R3-12), else the latest scale weight within the last 14 days, else
 *   `profile.weightLb`.
 * - The calorie-adjustment suggestion only fires after the weekly rate has sat
 *   outside the band for a full week of daily evaluations (R3-3).
 */
import type {
  AppSettings,
  BaselineDelta,
  CoachContext,
  DailyRecord,
  Insight,
  ISODate,
  Macros,
} from '../data/types';
import { DEFAULT_PROFILE } from '../data/defaults';
import { addDays, hhmmToMinutes, nowHHMM } from '../lib/dates';
import { fmt } from '../lib/format';
import { adherenceCounts, adherenceGrid, loggingStreak } from './adherence';
import { baselineDelta } from './baseline';
import { recommendIntake, weeklyExpenditure } from './expenditure';
import { hrvStatus } from './hrv';
import { generateInsights } from './insights';
import {
  dayTotals,
  dayTypeFor,
  fatFloorCheck,
  frequencyCounters,
  hydrationTarget,
  lateEatingCheck,
  macroTargetsFor,
  proteinPacing,
  remainingMacros,
} from './nutrition';
import { RHR_BASELINE_DAYS, readiness } from './readiness';
import { caffeineCheck, sleepSummary } from './sleep';
import { tobaccoHrvComparison, tobaccoInsightNumbers, tobaccoStats } from './tobacco';
import {
  computeEwmaTrend,
  isWeight,
  latestWeight,
  rateBand,
  targetLbPerWeek,
  trendAt,
  weeklyRate,
  weeksOutsideBand,
  weighInsInWeek,
} from './weight';

/**
 * Bump when the shape or semantics of the built context change in a way the
 * coach prompt / cached insights would notice (e.g. a window length changes).
 */
export const ENGINE_VERSION = '2';

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
/** Neutral clock used only when the caller's Date is invalid (keeps "HH:MM" fields parseable). */
const FALLBACK_NOW = '12:00';

export interface BuildContextInput {
  /** All records, sorted ascending by `d` (the store's `useRecords()` shape). */
  records: DailyRecord[];
  settings: AppSettings;
  /** The day being described — usually today, but any date for history views. */
  today: ISODate;
  /** Wall-clock "now" supplied by the caller (`useNow()`); never read here. */
  now: Date;
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Build the full context for `input.today`. See the module header for the
 * contract; each block below names the engine call it delegates to.
 */
export function buildCoachContext(input: BuildContextInput): CoachContext {
  const { settings, today } = input;
  const records = Array.isArray(input.records) ? input.records : [];
  const profile = settings.profile ?? DEFAULT_PROFILE;
  const targets = settings.targets;
  const todayRecord = records.find((r) => r.d === today) ?? null;
  const rec = todayRecord ?? undefined;

  // `nowHHMM()` formats whatever Date it is given; an invalid Date would yield
  // "NaN:NaN", so fall back to a neutral clock rather than leak NaN into copy.
  const rawNow = nowHHMM(input.now);
  const now = hhmmToMinutes(rawNow) === null ? FALLBACK_NOW : rawNow;

  // --- Day type (§6.5 carb cycling; `record.lift` overrides the split) -------
  const day = dayTypeFor(today, profile, rec);

  // --- HRV / readiness (§6.3) — one HrvStatus shared by both -----------------
  const hrv = hrvStatus(records, today, { age: profile.age });
  const ready = readiness(records, today, profile, { hrv });
  const hrvDelta: BaselineDelta = {
    ...baselineDelta(records, 'hrv', today, BASELINE_DAYS),
    // insights.emptyStates reads `hrv.delta.n` as "days of HRV logged", so it
    // must be the reading count in the 30-day window (today included), which
    // is exactly what hrvStatus already counts for its baseline gate.
    n: hrv.daysOfData,
  };
  const rhr = baselineDelta(records, 'rhr', today, RHR_BASELINE_DAYS);

  // --- Sleep (§6.4) ----------------------------------------------------------
  // sleepSummary already embeds bedtimeConsistency(records, today, 7).
  const sleep = sleepSummary(records, today, profile);

  // --- Weight trend (§6.1) ---------------------------------------------------
  const alpha = targets.ewmaAlpha;
  const trendMap = computeEwmaTrend(records, alpha, today);
  const latest = latestWeight(records, today);
  // The store caches the EWMA on `wt`; prefer it so the tile matches the chart,
  // else read the freshly computed map (carrying the last value forward).
  const trend = finite(rec?.wt) && rec.wt > 0 ? rec.wt : trendAt(trendMap, today) ?? null;
  const rate = weeklyRate(trendMap, today);
  const weeklyRateLb = rate ? rate.lbPerWk : null;
  const bodyWeightLb = referenceBodyWeight(latest, today, trend, profile.weightLb);
  const weeksOutside = weeksOutsideBand(trendMap, today, bodyWeightLb, targets.weeklyRatePct);

  // --- Expenditure & calorie adjustment (§6.2) --------------------------------
  const exp = weeklyExpenditure(records, today, { alpha });
  const rec2 = recommendIntake({
    result: exp,
    currentKcal: targets.kcal,
    weeklyRateLb,
    bodyWeightLb,
    targets,
    consecutiveWeeksOutside: weeksOutside,
  });
  let expReason = exp.valid ? rec2.reason : exp.reason;
  if (!exp.valid && exp.smoothedTdee !== null) {
    // The type only carries one `tdee`, and it must be null when this week's
    // gate failed — so the last calibrated estimate rides along in the text.
    expReason += ` Last calibrated estimate: ${fmt(exp.smoothedTdee)} kcal/day.`;
  }

  // --- Nutrition (§6.5) ------------------------------------------------------
  const macro = macroTargetsFor(day.type, targets);
  const totals: Macros = dayTotals(rec);
  const remaining = remainingMacros(totals, macro);
  const pacing = proteinPacing({ record: rec, targets, weightLb: bodyWeightLb, nowHHMM: now, bedTarget: profile.bedTarget });
  const late = lateEatingCheck(rec?.meals, profile.bedTarget, now);
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

  return {
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
    },
    rhr,
    sleep: {
      hours: sleep.hours,
      need: sleep.need,
      debtMin: sleep.debtMin,
      bedtimeSdMin: sleep.consistency.bedtimeSdMin,
      midpointSdMin: sleep.consistency.midpointSdMin,
      lastBedtime: sleep.lastBedtime,
      delta: baselineDelta(records, 'slh', today, BASELINE_DAYS),
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
      weeklyRatePct: rate ? rate.pctPerWk : null,
      targetLbPerWk: targetLbPerWeek(bodyWeightLb, targets.weeklyRatePct),
      inBand: rateBand(weeklyRateLb, bodyWeightLb, targets.weeklyRatePct),
      weighInsThisWeek: weighInsInWeek(records, today),
      weeksOutsideBand: weeksOutside,
    },
    expenditure: {
      tdee: exp.tdee,
      valid: exp.valid,
      reason: expReason,
      // No recommendation without a valid week — an unreliable estimate must
      // not move the target (§6.2), so the coach sees "no suggestion", not "hold".
      suggestedKcal: exp.valid ? rec2.kcal : null,
      suggestedDelta: exp.valid ? rec2.delta : null,
      calibrating: exp.calibrating,
      nextUpdate: exp.nextUpdate,
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
  };
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

/** Top insight cards (§7) for a built context — thin wrapper so screens import one module. */
export function buildInsights(ctx: CoachContext, settings: AppSettings): Insight[] {
  return generateInsights(ctx, settings.profile, settings.targets);
}

/** Context for an arbitrary date (history views, tests); `now` still comes from the caller. */
export function contextForDate(records: DailyRecord[], settings: AppSettings, d: ISODate, now: Date): CoachContext {
  return buildCoachContext({ records, settings, today: d, now });
}
