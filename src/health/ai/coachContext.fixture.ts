/**
 * Test fixtures for the coach modules — a fully-populated CoachContext (the
 * spec persona on a Friday lift day) and an empty one (fresh install, nothing
 * logged). Not a test file itself; imported by *.test.ts in this folder.
 */
import type { CoachContext, DailyRecord } from '../data/types';
import { DEFAULT_BLOODWORK, DEFAULT_TARGETS } from '../data/defaults';

const last30: CoachContext['last30'] = [
  { d: '2026-08-06', w: 173.4, wt: 173.5, kc: 1900, p: 175, f: 62, c: 150, fi: 26, st: 8200, rec: 62, hrv: 50, rhr: 55, slh: 7.1, sln: 7.8, dbt: 45, bt: '23:20', tob: 4, mealCount: 4 },
  { d: '2026-08-20', w: 172.6, wt: 172.7, kc: 1960, p: 181, f: 64, c: 158, fi: 29, st: 9400, rec: 55, hrv: 49, rhr: 54, slh: 6.8, sln: 7.9, dbt: 60, bt: '23:45', tob: 3, mealCount: 4 },
  { d: '2026-09-03', w: 172.0, wt: 172.05, kc: 1940, p: 184, f: 61, c: 92, fi: 31, st: 8800, rec: 68, hrv: 53, rhr: 53, slh: 7.6, sln: 7.9, dbt: 20, bt: '23:05', tob: 2, mealCount: 4 },
];

const todayRecord: DailyRecord = {
  d: '2026-09-04',
  w: 171.8,
  wt: 171.9,
  kc: 1130,
  p: 98,
  f: 38,
  c: 95,
  fi: 14,
  st: 9120,
  rec: 71,
  hrv: 54,
  rhr: 52,
  slh: 7.4,
  sln: 7.9,
  dbt: 30,
  strn: 11.2,
  bt: '23:10',
  tob: 2,
  meals: [
    { id: 'm1', t: '08:30', n: 'eggs and roti', g: 200, kc: 430, p: 28, f: 18, c: 40, fi: 4, tags: ['egg', 'grain', 'home'] },
    { id: 'm2', t: '13:10', n: 'chicken tikka', g: 250, kc: 700, p: 70, f: 20, c: 55, fi: 10, tags: ['poultry', 'restaurant'] },
  ],
};

/** Friday 2026-09-04 → 'lower' on the default split. WHOOP recovery 71% (green). */
export function fullContext(): CoachContext {
  return {
    today: '2026-09-04',
    nowHHMM: '15:20',
    dayType: 'lift',
    sessionType: 'lower',
    readiness: { score: 71, band: 'green', source: 'whoop', verdict: 'Primed — progress loads today', training: 'Progress', detail: 'WHOOP recovery 71%' },
    hrv: {
      today: 54,
      baseline7: 52,
      lnMean7: 3.95,
      swcLower: 48,
      swcUpper: 56,
      band: 'balanced',
      cv7: 6.2,
      delta: { today: 54, baseline: 52, delta: 2, pct: 3.85, n: 30, good: true },
    },
    rhr: { today: 52, baseline: 54, delta: -2, pct: -3.7, n: 28, good: true },
    sleep: {
      hours: 7.4,
      need: 7.9,
      debtMin: 30,
      bedtimeSdMin: 38,
      midpointSdMin: 30,
      lastBedtime: '23:10',
      delta: { today: 7.4, baseline: 7.1, delta: 0.3, pct: 4.2, n: 30, good: true },
    },
    steps: { today: 9120, baseline: 8400, delta: 720, pct: 8.6, n: 30, good: true, goalMin: 8000, goalMax: 10000 },
    weight: { latest: 171.8, trend: 171.9, weeklyRateLb: -1.1, weeklyRatePct: -0.64, targetLbPerWk: [0.86, 1.72], inBand: 'in', weighInsThisWeek: 6 },
    expenditure: { tdee: 2480, valid: true, reason: 'ok', suggestedKcal: 1950, suggestedDelta: 0 },
    nutrition: {
      totals: { kc: 1130, p: 98, f: 38, c: 95, fi: 14 },
      targets: { kc: 1950, p: 180, f: 65, c: 160, fi: 30, fatFloor: 60, carbsRange: [150, 175] },
      remaining: { kc: 820, p: 82, f: 27, c: 65, fi: 16 },
      mealsLogged: 2,
      mealsLeft: 2,
      proteinPerMealNeeded: 41,
      lastMealTime: '13:10',
      fatBelowFloor: false,
      lateEating: false,
      hydrationCups: 6,
      hydrationTargetCups: 10,
      caffeineAfterCutoff: null,
    },
    tobacco: { today: 2, avg7: 3.1, avg30: 3.6, streakDays: 0, hrvSmokeFree: 56, hrvSmoking: 50 },
    frequency: { redMeatServings7d: 3, fishServings7d: 1, restaurantPct7d: 60, fiberAvg7d: 22, homeCookedPct7d: 40 },
    adherence: { loggingStreak: 12, proteinHitDays30: 21, kcalHitDays30: 19, weighInDays30: 26 },
    bloodwork: DEFAULT_BLOODWORK,
    last30,
    todayRecord,
  };
}

/** Sunday 2026-09-06 (rest day), fresh install: nothing logged, no wearable data, no bloodwork. */
export function emptyContext(): CoachContext {
  const t = DEFAULT_TARGETS;
  const zero = { kc: 0, p: 0, f: 0, c: 0, fi: 0 };
  const nullDelta = { today: null, baseline: null, delta: null, pct: null, n: 0, good: null };
  return {
    today: '2026-09-06',
    nowHHMM: '09:00',
    dayType: 'rest',
    sessionType: 'rest',
    readiness: { score: null, band: 'neutral', source: 'none', verdict: 'Log WHOOP recovery or HRV to see readiness', training: 'Train, hold loads', detail: '' },
    hrv: { today: null, baseline7: null, lnMean7: null, swcLower: null, swcUpper: null, band: 'insufficient', cv7: null, delta: nullDelta },
    rhr: nullDelta,
    sleep: { hours: null, need: null, debtMin: null, bedtimeSdMin: null, midpointSdMin: null, lastBedtime: null, delta: nullDelta },
    steps: { ...nullDelta, goalMin: t.stepsMin, goalMax: t.stepsMax },
    weight: { latest: null, trend: null, weeklyRateLb: null, weeklyRatePct: null, targetLbPerWk: [0.86, 1.72], inBand: null, weighInsThisWeek: 0 },
    expenditure: { tdee: null, valid: false, reason: 'Need 5+ weigh-ins this week', suggestedKcal: null, suggestedDelta: null },
    nutrition: {
      totals: zero,
      targets: { kc: t.kcal, p: t.protein, f: t.fatTarget, c: t.carbsRest[1], fi: t.fiber, fatFloor: t.fatFloor, carbsRange: t.carbsRest },
      remaining: { kc: t.kcal, p: t.protein, f: t.fatTarget, c: t.carbsRest[1], fi: t.fiber },
      mealsLogged: 0,
      mealsLeft: t.mealsPerDay,
      proteinPerMealNeeded: 45,
      lastMealTime: null,
      fatBelowFloor: false,
      lateEating: false,
      hydrationCups: 0,
      hydrationTargetCups: 10,
      caffeineAfterCutoff: null,
    },
    tobacco: { today: 0, avg7: null, avg30: null, streakDays: 0, hrvSmokeFree: null, hrvSmoking: null },
    frequency: { redMeatServings7d: 0, fishServings7d: 0, restaurantPct7d: null, fiberAvg7d: null, homeCookedPct7d: null },
    adherence: { loggingStreak: 0, proteinHitDays30: 0, kcalHitDays30: 0, weighInDays30: 0 },
    bloodwork: [],
    last30: [],
    todayRecord: null,
  };
}

/** The 8 quick-prompt chips from SPEC §4, in order. */
export const CHIPS = [
  'Should I train today?',
  'What should I eat now?',
  'Why is my recovery low?',
  "How's my weight trend — adjust calories?",
  'Plan my carbs for a lift day.',
  "How did last night's sleep affect me?",
  'Help me cut back tobacco today.',
  'Are my vitamin D / ferritin / omega-3 habits on track?',
] as const;
