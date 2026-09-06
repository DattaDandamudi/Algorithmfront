import type { AISettings, AppSettings, BloodMarker, FoodItem, Profile, Targets, TrainingSplit } from './types';
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

export const DEFAULT_BLOODWORK: BloodMarker[] = [
  { key: 'vitd', label: 'Vitamin D (25-OH)', value: 19, unit: 'ng/mL', status: 'low', note: 'General range for 12–20 ng/mL: 800–2,000 IU/day; retest ~3 months. Confirm dosing with your doctor.' },
  { key: 'ferritin', label: 'Ferritin', value: 23, unit: 'ng/mL', status: 'low', note: 'Low iron stores — review iron status and retest. Confirm with your doctor before supplementing.' },
  { key: 'omega3', label: 'Omega-3 index', value: 3.0, unit: '%', status: 'low', note: 'General target ~8%. More oily fish (2–3×/wk) or EPA+DHA. Confirm with your doctor.' },
  { key: 'zinc', label: 'Zinc', value: 0, unit: '', status: 'low-normal', note: 'Low-normal. Red meat, seafood, legumes; confirm any supplement with your doctor.' },
  { key: 'testosterone', label: 'Testosterone (total)', value: 382, unit: 'ng/dL', status: 'low-normal', note: 'Low-normal. Sleep ≥7 h, keep fat ≥60 g/day, resistance training. Discuss with your doctor.' },
  { key: 'lead', label: 'Lead (blood)', value: 4.3, unit: 'µg/dL', status: 'elevated', note: 'Elevated — this needs physician follow-up, not app management.' },
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
  };
}
