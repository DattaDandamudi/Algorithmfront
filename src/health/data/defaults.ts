import type {
  AISettings,
  AppSettings,
  BloodMarker,
  CheckInSettings,
  FoodItem,
  Muscle,
  Profile,
  Targets,
  TrainingSettings,
  TrainingSplit,
  VolumeLandmark,
} from './types';
import { SCHEMA_VERSION } from './types';

/** 4-day upper/lower split: Mon upper, Tue lower, Thu upper, Fri lower. */
export const DEFAULT_SPLIT: TrainingSplit = {
  0: 'rest',
  1: 'upper',
  2: 'lower',
  3: 'rest',
  4: 'upper',
  5: 'lower',
  6: 'rest',
};

/**
 * The spec persona's labs (§6.7). `note` is deliberately absent: it is the
 * USER's field ("what your doctor said, dose agreed…"), and the general
 * ranges / doctor cue are rendered from engine/micronutrients.markerGuidance,
 * so shipping app-authored dosing text here would present it as the user's
 * own note (review R2-11). No test date is invented either — the Bloodwork
 * section asks for it so a retest can be scheduled.
 */
export const DEFAULT_BLOODWORK: BloodMarker[] = [
  { key: 'vitd', label: 'Vitamin D (25-OH)', value: 19, unit: 'ng/mL', status: 'low' },
  { key: 'ferritin', label: 'Ferritin', value: 23, unit: 'ng/mL', status: 'low' },
  { key: 'omega3', label: 'Omega-3 index', value: 3.0, unit: '%', status: 'low' },
  { key: 'zinc', label: 'Zinc', value: 0, unit: '', status: 'low-normal' },
  { key: 'testosterone', label: 'Testosterone (total)', value: 382, unit: 'ng/dL', status: 'low-normal' },
  { key: 'lead', label: 'Lead (blood)', value: 4.3, unit: 'µg/dL', status: 'elevated' },
];

export const DEFAULT_PROFILE: Profile = {
  name: 'You',
  age: 26,
  sex: 'male',
  heightCm: undefined,
  weightLb: 172,
  units: 'lb',
  trainingLevel: 'beginner',
  goalPhase: 'fat-loss',
  split: DEFAULT_SPLIT,
  cuisines: ['indian', 'middle-eastern'],
  foodNotes: 'Mostly Indian / Middle Eastern restaurant food; weighs portions in grams.',
  bedTarget: '23:00',
  wakeTarget: '07:00',
  caffeineCutoff: '14:00',
  sleepBaselineHrs: 7.75,
  bloodwork: DEFAULT_BLOODWORK,
  tobaccoQuitting: true,
  tobaccoBaselinePerDay: 5,
  wearable: 'whoop',
};

export const DEFAULT_TARGETS: Targets = {
  kcal: 1950,
  protein: 180,
  fatFloor: 60,
  fatTarget: 65,
  carbsLift: [150, 175],
  carbsRest: [70, 100],
  fiber: 30,
  stepsMin: 8000,
  stepsMax: 10000,
  waterMlPerKg: 32,
  weeklyRatePct: [0.5, 1.0],
  ewmaAlpha: 0.1,
  mealsPerDay: 4,
};

export const DEFAULT_AI: AISettings = {
  provider: 'none',
  apiKey: undefined,
  proxyUrl: undefined,
  model: 'claude-opus-5',
  tone: 'conversational',
  appName: 'Pulse',
};

/** Starred staples from the spec §2. Macros per 100 g (restaurant-style priors). */
export const DEFAULT_FAVORITES: FoodItem[] = [
  { id: 'fav_chicken_tikka', name: 'Chicken tikka', per100: { kc: 165, p: 25, f: 6, c: 3, fi: 0.5 }, defaultGrams: 200, unitName: 'piece', unitGrams: 35, aliases: ['tikka', 'murgh tikka'], cuisine: 'indian', tags: ['poultry', 'restaurant'], starred: true },
  { id: 'fav_seekh_kebab', name: 'Seekh kebab', per100: { kc: 240, p: 18, f: 17, c: 4, fi: 1 }, defaultGrams: 150, unitName: 'skewer', unitGrams: 75, aliases: ['seekh', 'kabab'], cuisine: 'indian', tags: ['red-meat', 'restaurant'], starred: true },
  { id: 'fav_tandoori_prawns', name: 'Tandoori prawns', per100: { kc: 120, p: 20, f: 3.5, c: 2, fi: 0.3 }, defaultGrams: 150, unitName: 'prawn', unitGrams: 20, aliases: ['tandoori shrimp', 'prawns'], cuisine: 'indian', tags: ['seafood', 'restaurant'], starred: true },
  { id: 'fav_lamb_chops', name: 'Lamb chops', per100: { kc: 290, p: 24, f: 21, c: 0, fi: 0 }, defaultGrams: 180, unitName: 'chop', unitGrams: 60, aliases: ['lamb chop', 'mutton chops'], cuisine: 'middle-eastern', tags: ['red-meat', 'restaurant'], starred: true },
  { id: 'fav_chicken_biryani', name: 'Chicken biryani', per100: { kc: 180, p: 9, f: 7, c: 20, fi: 1 }, defaultGrams: 350, unitName: 'plate', unitGrams: 350, aliases: ['biryani'], cuisine: 'indian', tags: ['poultry', 'grain', 'restaurant'], starred: true },
  { id: 'fav_chicken_shawarma', name: 'Chicken shawarma', per100: { kc: 200, p: 18, f: 10, c: 10, fi: 1 }, defaultGrams: 300, unitName: 'wrap', unitGrams: 300, aliases: ['shawarma'], cuisine: 'middle-eastern', tags: ['poultry', 'restaurant'], starred: true },
  { id: 'fav_roti', name: 'Roti', per100: { kc: 300, p: 9, f: 6, c: 52, fi: 6 }, defaultGrams: 40, unitName: 'roti', unitGrams: 40, aliases: ['chapati', 'phulka'], cuisine: 'indian', tags: ['grain'], starred: true },
  { id: 'fav_naan', name: 'Naan', per100: { kc: 310, p: 9, f: 8, c: 50, fi: 2 }, defaultGrams: 90, unitName: 'naan', unitGrams: 90, aliases: ['garlic naan', 'butter naan'], cuisine: 'indian', tags: ['grain', 'restaurant'], starred: true },
  { id: 'fav_rice', name: 'Basmati rice (cooked)', per100: { kc: 130, p: 2.7, f: 0.3, c: 28, fi: 0.4 }, defaultGrams: 150, unitName: 'cup', unitGrams: 160, aliases: ['rice', 'white rice', 'steamed rice'], cuisine: 'indian', tags: ['grain'], starred: true },
];

/**
 * Beginner weekly-set landmarks per muscle (sets/week).
 *
 * ADVISORY BANDS, NOT CAPS. The 2025 Sports Medicine meta-regression found
 * hypertrophy keeps increasing with weekly sets with diminishing returns and no
 * clear plateau, and MRV in particular has no RCT support — it is shown as
 * context, never enforced. `engine/exerciseDb.landmarkDefaults(level)` scales
 * this table (intermediate ×1.4, advanced ×1.7); users can override any row.
 */
export const DEFAULT_LANDMARKS: Record<Muscle, VolumeLandmark> = {
  chest: { mev: 6, mav: 10, mrv: 16 },
  back: { mev: 8, mav: 12, mrv: 18 },
  'front-delts': { mev: 0, mav: 4, mrv: 8 },
  'side-delts': { mev: 4, mav: 8, mrv: 14 },
  'rear-delts': { mev: 4, mav: 8, mrv: 14 },
  biceps: { mev: 4, mav: 8, mrv: 14 },
  triceps: { mev: 4, mav: 8, mrv: 14 },
  forearms: { mev: 0, mav: 4, mrv: 8 },
  traps: { mev: 0, mav: 4, mrv: 10 },
  'lower-back': { mev: 0, mav: 4, mrv: 8 },
  abs: { mev: 0, mav: 6, mrv: 12 },
  quads: { mev: 6, mav: 10, mrv: 16 },
  hamstrings: { mev: 4, mav: 8, mrv: 14 },
  glutes: { mev: 2, mav: 6, mrv: 12 },
  calves: { mev: 4, mav: 8, mrv: 12 },
};

/**
 * `programs` ships empty: the built-in 4-day upper/lower program lives in
 * `engine/exerciseDb.DEFAULT_PROGRAM` so the data layer never imports the
 * engine. The Train screen falls back to it when no program is saved, and
 * "edit" saves an editable copy here.
 */
export const DEFAULT_TRAINING: TrainingSettings = {
  units: 'lb',
  volumeLandmarks: DEFAULT_LANDMARKS,
  progression: {
    targetRpe: [7, 8],
    loadStepPctUpper: 2.5,
    // Lower body takes a bigger step: one 2.5% notch under-loads squats and deadlifts.
    loadStepPctLower: 5,
    repRange: [6, 10],
  },
  customExercises: [],
  programs: [],
  activeProgramId: undefined,
  restTimerSec: 120,
};

/**
 * Daily check-in defaults to the full Hooper index — sleep quality, fatigue,
 * stress and soreness, 1–7 each. Subjective measures track training load with
 * better sensitivity than the objective ones (Saw 2016), so this is a
 * first-class input to readiness, not a decoration. Every item is skippable.
 */
export const DEFAULT_CHECKIN: CheckInSettings = {
  enabled: true,
  items: ['qs', 'qf', 'qt', 'qo'],
  promptAfter: '07:00',
  weeklySrss: false,
  monthlyPss: false,
};

export const DEFAULT_SETTINGS: AppSettings = {
  version: SCHEMA_VERSION,
  profile: DEFAULT_PROFILE,
  targets: DEFAULT_TARGETS,
  ai: DEFAULT_AI,
  favorites: DEFAULT_FAVORITES,
  recents: [],
  onboarded: false,
  demoLoaded: false,
  whoop: { connected: false },
  training: DEFAULT_TRAINING,
  checkIn: DEFAULT_CHECKIN,
};

/** Deep-ish merge of stored settings over defaults so new fields get defaults. */
export function mergeSettings(stored: Partial<AppSettings> | null | undefined): AppSettings {
  if (!stored) return DEFAULT_SETTINGS;
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    version: SCHEMA_VERSION,
    profile: { ...DEFAULT_PROFILE, ...(stored.profile ?? {}), split: { ...DEFAULT_SPLIT, ...(stored.profile?.split ?? {}) }, bloodwork: stored.profile?.bloodwork ?? DEFAULT_BLOODWORK },
    targets: { ...DEFAULT_TARGETS, ...(stored.targets ?? {}) },
    ai: { ...DEFAULT_AI, ...(stored.ai ?? {}) },
    favorites: stored.favorites ?? DEFAULT_FAVORITES,
    recents: stored.recents ?? [],
    whoop: { ...DEFAULT_SETTINGS.whoop, ...(stored.whoop ?? {}) },
    training: mergeTraining(stored.training),
    checkIn: { ...DEFAULT_CHECKIN, ...(stored.checkIn ?? {}), items: stored.checkIn?.items ?? DEFAULT_CHECKIN.items },
    insightHistory: stored.insightHistory ?? undefined,
  };
}

/**
 * Training settings merge one level deeper: `progression` gained fields in
 * engine v3 (separate upper/lower load steps), and a v1 blob that predates
 * `volumeLandmarks` must still get the full 15-muscle table rather than a
 * partial one, or `weeklySetsByMuscle` would read `undefined` landmarks.
 */
function mergeTraining(stored: Partial<TrainingSettings> | undefined): TrainingSettings {
  if (!stored) return DEFAULT_TRAINING;
  return {
    ...DEFAULT_TRAINING,
    ...stored,
    volumeLandmarks: { ...DEFAULT_LANDMARKS, ...(stored.volumeLandmarks ?? {}) },
    progression: { ...DEFAULT_TRAINING.progression, ...(stored.progression ?? {}) },
    customExercises: stored.customExercises ?? [],
    programs: stored.programs ?? [],
  };
}
