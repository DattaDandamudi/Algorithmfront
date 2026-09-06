/**
 * Test fixtures for the coach modules — a fully-populated CoachContext (the
 * spec persona on a Friday lift day) and an empty one (fresh install, nothing
 * logged). Not a test file itself; imported by *.test.ts in this folder and by
 * the Today tile renderers.
 *
 * v3 note: the five new blocks (`training`, `stress`, `energy`, `impact`,
 * `changepoints`) are populated here, but the *optional* fields v3 added inside
 * the existing sub-objects (hrv.baseline28, weight.kalmanLevel, expenditure.ci,
 * nutrition.slots, tobacco.nFree …) are deliberately left off. Several tests
 * outside this folder use this fixture as their "context without the 28-day
 * reference" / "context without the Kalman block" case, and the offline coach
 * changes its wording when those fields appear. Whoever teaches those callers
 * the new fields should add them here in the same change.
 */
import type { CoachContext, DailyRecord, EnergyContext, ImpactContext, MuscleVolume, StressContext, TrainingContext } from '../data/types';
import { DEFAULT_BLOODWORK, DEFAULT_LANDMARKS, DEFAULT_TARGETS } from '../data/defaults';
import { MUSCLES } from '../engine/exerciseDb';
import { volumeStatus } from '../engine/strength';

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
    training: fullTraining(),
    stress: fullStress(),
    energy: fullEnergy(),
    impact: fullImpact(),
    changepoints: [
      { d: '2026-08-14', metric: 'rhr', label: 'resting heart rate', prob: 0.91, meanBefore: 55.4, meanAfter: 52.6 },
    ],
  };
}

// ---------------------------------------------------------------------------
// v3 blocks (§1e training, §1h stress & energy, §1i impact)
// ---------------------------------------------------------------------------

/** Sets trained this week, keyed by muscle; everything else reads 0. */
const WEEK_SETS: Partial<Record<(typeof MUSCLES)[number], number>> = {
  chest: 8, back: 11, quads: 9, hamstrings: 6, glutes: 5, 'side-delts': 6,
  'front-delts': 4, 'rear-delts': 3, biceps: 6, triceps: 7, calves: 4, abs: 3,
};

function weeklySets(): MuscleVolume[] {
  return MUSCLES.map((muscle) => {
    const sets = WEEK_SETS[muscle] ?? 0;
    const landmark = DEFAULT_LANDMARKS[muscle];
    return { muscle, sets, ...landmark, status: volumeStatus(sets, landmark) };
  });
}

/** Friday lower day: quads and hamstrings are the freshest thing about to be trained. */
function fullTraining(): TrainingContext {
  return {
    todaySession: 'lower',
    plannedExercises: [
      { exerciseId: 'back-squat', name: 'Back squat', sets: 4, reps: [5, 8], loadKg: 102.5, mode: 'progress', reason: 'You hit 8 reps on every set at RPE 8 last time — up 5 kg.', last: { loadKg: 97.5, reps: [8, 8, 8], rpe: 8, d: '2026-09-01' } },
      { exerciseId: 'romanian-deadlift', name: 'Romanian deadlift', sets: 3, reps: [6, 10], loadKg: 90, mode: 'hold', reason: 'Same load — the top of the range is not there on every set yet.', last: { loadKg: 90, reps: [9, 8, 8], rpe: 8, d: '2026-09-01' } },
      { exerciseId: 'leg-press', name: 'Leg press', sets: 3, reps: [10, 15], loadKg: 180, mode: 'progress', reason: '15 reps on the top set at RPE 8 — add a plate.', last: { loadKg: 170, reps: [15, 14, 13], rpe: 8, d: '2026-09-01' } },
    ],
    todayWorkouts: [],
    load: {
      today: 0,
      acute7: 342,
      chronic28: 318,
      acwr: 1.08,
      acwrBand: 'sweet',
      weekOverWeekPct: 6.4,
      fitness: 318,
      fatigue: 305,
      form: 13,
      formBand: 'fresh',
      monotony: 1.4,
      weeklyLoad: 2394,
      source: 'mixed',
      tauIsPrior: false,
    },
    weeklySets: weeklySets(),
    muscleReadiness: MUSCLES.map((muscle, i) => ({
      muscle,
      pct: [88, 74, 96, 100, 92][i % 5],
      hoursSince: [42, 18, 66, null, 90][i % 5],
    })),
    balance: { pushPull: 0.92, squatHinge: 1.2 },
    prs7d: [
      { d: '2026-09-01', exerciseId: 'back-squat', name: 'Back squat', kind: 'e1rm', value: 121.6, previous: 118.4 },
    ],
    plateaus: [],
    deload: { recommended: false, reasons: [] },
    lastSession: {
      id: 'wk-2026-09-01', d: '2026-09-01', start: '18:10', durationMin: 62, kind: 'strength',
      session: 'lower', source: 'manual', srpe: 8, load: 496,
    },
    vo2max: { value: 46.2, lo: 42.7, hi: 49.7, method: 'pace-on-HR regression + Uth–Sørensen' },
  };
}

function fullStress(): StressContext {
  return {
    osi: 28,
    osiLo: 19,
    osiHi: 37,
    signalsDeviating: 1,
    signalsAvailable: 5,
    band: 'none',
    outliers: [
      { key: 'hrv', label: 'HRV', value: 54, z: -0.4, threshold: 1.282, deviating: false },
      { key: 'rhr', label: 'Resting HR', value: 52, z: -0.6, threshold: 1.282, deviating: false },
      { key: 'rr', label: 'Breathing rate', value: 14.9, z: 1.4, threshold: 1.282, deviating: true },
      { key: 'skt', label: 'Skin temp', value: 33.6, z: 0.3, threshold: 1.282, deviating: false },
      { key: 'spo', label: 'Blood oxygen', value: 96, z: -0.2, threshold: 1.282, deviating: false },
      { key: 'debt', label: 'Sleep debt', value: 30, z: 0.4, threshold: 1.282, deviating: false },
    ],
    checkIn: { sleepQ: 3, fatigue: 3, stress: 2, soreness: 4, total: 12, band: 'green', nDays: 26, worseRun: 0, missingToday: false },
    resilience: { score: 62, band: 'solid', loadEwma: 0.44, recoveryEwma: 0.63, balance: 0.19, nDays: 14, alStyleCount: 1 },
    illness: { flag: false, since: null, reasons: [] },
    calibrating: false,
    nRef: 58,
  };
}

function fullEnergy(): EnergyContext {
  const shape = [62, 74, 82, 86, 84, 78, 68, 58, 54, 60, 69, 74, 72, 64, 52, 40];
  return {
    now: 72,
    atWake: 58,
    forecast: shape.map((value, i) => ({
      hhmm: `${String(7 + i).padStart(2, '0')}:00` as EnergyContext['forecast'][number]['hhmm'],
      value,
      lo: Math.max(0, value - 8),
      hi: Math.min(100, value + 8),
    })),
    trough: { hhmm: '15:00', value: 54 },
    bedtimeReadyAt: '22:40',
    caffeineActiveMg: 42,
    drivers: ['7.4 h of sleep', 'one coffee at 08:30', 'yesterday was a lower day'],
    confidence: 'medium',
  };
}

function fullImpact(): ImpactContext {
  return {
    effects: [
      { behaviour: 'alcohol', metric: 'hrv', label: 'on the 9 days you drank, next-morning HRV averaged 6.2 ms lower (95% CI 2.8–9.6)', deltaMean: -6.2, lo95: -9.6, hi95: -2.8, nYes: 9, nNo: 71, shrunkToPrior: 0.34, qValue: 0.011 },
      { behaviour: 'lateCaffeine', metric: 'sleepHrs', label: 'on the 14 days you had caffeine after 14:00, you slept 0.6 h less (95% CI 0.2–1.0)', deltaMean: -0.6, lo95: -1, hi95: -0.2, nYes: 14, nNo: 62, shrunkToPrior: 0.41, qValue: 0.03, confound: 'those days were also harder training days' },
    ],
    pending: ['late eating'],
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
    // The v3 blocks exist on a fresh install too — as empty states, never absent.
    training: {
      todaySession: 'rest',
      plannedExercises: [],
      todayWorkouts: [],
      load: { today: 0, acute7: 0, chronic28: 0, acwr: null, acwrBand: null, weekOverWeekPct: null, fitness: 0, fatigue: 0, form: 0, formBand: null, monotony: null, weeklyLoad: 0, source: 'none', tauIsPrior: true },
      weeklySets: MUSCLES.map((muscle) => ({ muscle, sets: 0, ...DEFAULT_LANDMARKS[muscle], status: volumeStatus(0, DEFAULT_LANDMARKS[muscle]) })),
      muscleReadiness: MUSCLES.map((muscle) => ({ muscle, pct: 100, hoursSince: null })),
      balance: { pushPull: null, squatHinge: null },
      prs7d: [],
      plateaus: [],
      deload: { recommended: false, reasons: [] },
      lastSession: null,
      vo2max: { value: null, lo: null, hi: null, method: 'needs 8 steady runs or a measured max HR (have 0 runs)' },
    },
    stress: {
      osi: null, osiLo: null, osiHi: null, signalsDeviating: 0, signalsAvailable: 0, band: null, outliers: [],
      checkIn: { sleepQ: null, fatigue: null, stress: null, soreness: null, total: null, band: 'neutral', nDays: 0, worseRun: 0, missingToday: true },
      resilience: { score: null, band: null, loadEwma: null, recoveryEwma: null, balance: null, nDays: 0, alStyleCount: null },
      illness: { flag: false, since: null, reasons: [] },
      calibrating: true,
      nRef: 0,
    },
    energy: { now: null, atWake: null, forecast: [], trough: null, bedtimeReadyAt: null, caffeineActiveMg: null, drivers: [], confidence: 'low' },
    impact: { effects: [], pending: [] },
    changepoints: [],
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
