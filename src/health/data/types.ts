/**
 * Core data contracts for the health/fitness logging app.
 *
 * Persisted records use the compact short-key schema from the spec (§10) so a
 * year of data stays well under 0.2 MB of localStorage. Everything else in the
 * app (engine, AI, screens) is written against these types — treat this file
 * as the single source of truth and keep it dependency-free.
 */

export const SCHEMA_VERSION = 1;

/** 'YYYY-MM-DD' in the user's local time zone. */
export type ISODate = string;
/** 'HH:MM' 24-hour local clock time. */
export type HHMM = string;

// ---------------------------------------------------------------------------
// Food & meals
// ---------------------------------------------------------------------------

export type MealSource = 'ai' | 'manual' | 'favorite' | 'recent' | 'repeat' | 'barcode' | 'photo';

/** Tags drive the nutrition-frequency counters (§3) and lab-linked insights (§7 #13/#14). */
export type FoodTag =
  | 'red-meat'
  | 'poultry'
  | 'fish'
  | 'seafood'
  | 'egg'
  | 'dairy'
  | 'veg'
  | 'grain'
  | 'legume'
  | 'home'
  | 'restaurant'
  | 'caffeine'
  | 'alcohol'
  | 'sweet';

export interface Macros {
  kc: number; // kcal
  p: number; // protein g
  f: number; // fat g
  c: number; // carbs g
  fi: number; // fiber g
}

/** A logged meal / food entry. Short keys are persisted verbatim. */
export interface Meal extends Macros {
  id: string;
  /** Time eaten, 'HH:MM'. */
  t: HHMM;
  /** Display name, e.g. "chicken tikka". */
  n: string;
  /** Grams. */
  g: number;
  src?: MealSource;
  /** AI confidence 0–1 (only for src 'ai'). */
  conf?: number;
  /** AI assumptions text, rendered as a tappable subtitle. */
  as?: string;
  tags?: FoodTag[];
}

/** A reusable library food (favorites, recents, local food DB). Macros are per 100 g. */
export interface FoodItem {
  id: string;
  name: string;
  per100: Macros;
  /** Default portion in grams when tapped from Favorites/Recents. */
  defaultGrams: number;
  /** Optional natural unit ("roti", "piece", "cup") and its gram weight for NL parsing. */
  unitName?: string;
  unitGrams?: number;
  aliases?: string[];
  cuisine?: 'indian' | 'middle-eastern' | 'western' | 'generic';
  tags?: FoodTag[];
  starred?: boolean;
  lastUsed?: ISODate;
  useCount?: number;
}

// ---------------------------------------------------------------------------
// Daily record (persisted, compact)
// ---------------------------------------------------------------------------

/**
 * One day of data. All fields optional except the date. Weights are stored in
 * POUNDS (the user's unit); convert for display via settings.profile.units.
 * Totals (kc/p/f/c/fi) are kept in sync with `meals` by the store whenever
 * meals exist; when a day has no itemized meals they may be entered directly.
 */
export interface DailyRecord {
  d: ISODate;
  /** Scale weight, lb. */
  w?: number;
  /** EWMA trend weight, lb — derived by the store, cached for display/export. */
  wt?: number;
  kc?: number;
  p?: number;
  f?: number;
  c?: number;
  fi?: number;
  /** Steps. */
  st?: number;
  /** WHOOP recovery %, 0–100. */
  rec?: number;
  /** HRV rMSSD, ms. */
  hrv?: number;
  /** Resting heart rate, bpm. */
  rhr?: number;
  /** Sleep hours (last night). */
  slh?: number;
  /** Sleep need hours (computed or imported). */
  sln?: number;
  /** Sleep debt, minutes. */
  dbt?: number;
  /** WHOOP day strain 0–21. */
  strn?: number;
  /** Actual bedtime 'HH:MM' (may be after midnight, e.g. '00:20'). */
  bt?: HHMM;
  /** Wake time 'HH:MM'. */
  wk?: HHMM;
  /** Nap minutes. */
  nap?: number;
  /** Tobacco count (cigarettes / uses). */
  tob?: number;
  /** Caffeine log times. */
  caf?: HHMM[];
  /** Hydration, cups (≈250 ml). */
  h2o?: number;
  /** Override for lift/rest day type; otherwise derived from the training split. */
  lift?: boolean;
  meals?: Meal[];
  note?: string;
}

export type MetricKey = keyof Omit<DailyRecord, 'd' | 'bt' | 'wk' | 'caf' | 'meals' | 'note' | 'lift'>;

// ---------------------------------------------------------------------------
// Profile, targets, settings
// ---------------------------------------------------------------------------

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // Sunday = 0 (JS Date convention)
export type SessionType = 'upper' | 'lower' | 'push' | 'pull' | 'legs' | 'full' | 'cardio' | 'rest';
export type TrainingSplit = Record<Weekday, SessionType>;

export type MarkerStatus = 'low' | 'low-normal' | 'normal' | 'high' | 'elevated';

export interface BloodMarker {
  key: string; // 'vitd' | 'ferritin' | 'omega3' | 'zinc' | 'testosterone' | 'lead' | custom
  label: string;
  value: number;
  unit: string;
  status: MarkerStatus;
  /** Date of the test 'YYYY-MM-DD'. */
  testedOn?: ISODate;
  /** Planned retest date. */
  retestOn?: ISODate;
  note?: string;
}

export interface Profile {
  name: string;
  age: number;
  sex: 'male' | 'female' | 'other';
  heightCm?: number;
  /** Reference body weight in lb (used for %BW rate and g/kg math when no recent weigh-in). */
  weightLb: number;
  units: 'lb' | 'kg';
  trainingLevel: 'beginner' | 'intermediate' | 'advanced';
  goalPhase: 'fat-loss' | 'maintenance' | 'muscle-gain';
  split: TrainingSplit;
  /** Cuisine priors fed to the food AI, e.g. ['indian','middle-eastern']. */
  cuisines: string[];
  foodNotes: string;
  bedTarget: HHMM; // '23:00'
  wakeTarget: HHMM; // '07:00'
  caffeineCutoff: HHMM; // '14:00'
  /** Baseline sleep need in hours before strain/debt adjustments. */
  sleepBaselineHrs: number;
  bloodwork: BloodMarker[];
  tobaccoQuitting: boolean;
  tobaccoBaselinePerDay?: number;
  wearable: 'whoop' | 'none' | 'other';
}

export interface Targets {
  kcal: number;
  protein: number;
  /** Hard fat floor (g) — never recommend below this. */
  fatFloor: number;
  fatTarget: number;
  carbsLift: [number, number];
  carbsRest: [number, number];
  fiber: number;
  stepsMin: number;
  stepsMax: number;
  /** Hydration baseline ml/kg. */
  waterMlPerKg: number;
  /** Target weekly rate band in %BW/wk, e.g. [0.5, 1.0]. */
  weeklyRatePct: [number, number];
  /** EWMA smoothing constant (0.10–0.25). */
  ewmaAlpha: number;
  /** Minimum meals per day for protein pacing. */
  mealsPerDay: number;
}

export type CoachTone = 'conversational' | 'direct';

export interface AISettings {
  /** 'none' = offline rule-based coach & local food DB only. */
  provider: 'none' | 'anthropic-direct' | 'proxy';
  /** Stored locally only (browser localStorage). Used with anthropic-direct. */
  apiKey?: string;
  /** Base URL of a same-origin or CORS-enabled proxy that injects the key (e.g. a Supabase Edge Function). */
  proxyUrl?: string;
  model: string;
  tone: CoachTone;
  appName: string;
}

export interface AppSettings {
  version: number;
  profile: Profile;
  targets: Targets;
  ai: AISettings;
  favorites: FoodItem[];
  recents: FoodItem[];
  /** Whether onboarding (fresh vs demo) has been completed. */
  onboarded: boolean;
  demoLoaded: boolean;
  lastExportAt?: number;
  /** Date of the last morning weigh-in prompt shown (so we prompt once a day). */
  lastWeighPromptDate?: ISODate;
  /**
   * Physician-escalation banners the user has dismissed on Today, keyed per
   * marker AND value (`escalationKey()` in screens/today/banners.ts) so a new
   * lab result re-surfaces the banner (SPEC Caveats: elevated lead escalates).
   */
  acknowledgedEscalations?: string[];
  /** Today's JSON-backup reminder (SPEC §10) is snoozed until this date. */
  backupReminderSnoozedUntil?: ISODate;
  whoop: { connected: boolean; lastImportAt?: number; source?: 'manual' | 'csv' };
}

// ---------------------------------------------------------------------------
// Coach chat
// ---------------------------------------------------------------------------

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** Epoch ms. */
  ts: number;
  /** Where an assistant reply came from. */
  source?: 'claude' | 'offline' | 'error' | 'guardrail';
  streaming?: boolean;
}

// ---------------------------------------------------------------------------
// Store state & status
// ---------------------------------------------------------------------------

export interface IntegrityReport {
  version: number;
  shards: number;
  records: number;
  /** Human-readable problems: missing shard, checksum mismatch, count mismatch, corrupt JSON. */
  problems: string[];
  checkedAt: number;
}

export interface StorageStatus {
  ok: boolean;
  available: boolean;
  bytesUsed: number;
  /** ~5 MiB soft quota; warn above 70%. */
  quotaWarning: boolean;
  lastError?: string;
  lastSavedAt?: number;
  integrity: IntegrityReport | null;
}

export interface HealthState {
  ready: boolean;
  settings: AppSettings;
  /** All loaded daily records keyed by ISO date. */
  days: Record<ISODate, DailyRecord>;
  chat: ChatMessage[];
  storage: StorageStatus;
}

export interface ImportResult {
  ok: boolean;
  recordsImported: number;
  settingsImported: boolean;
  chatImported: boolean;
  errors: string[];
}

export interface HealthActions {
  /** Shallow-merge a patch into a day (creates the day if needed). Undefined values delete keys. */
  patchDay(d: ISODate, patch: Partial<DailyRecord>): void;
  addMeal(d: ISODate, meal: Omit<Meal, 'id'> & { id?: string }): Meal;
  updateMeal(d: ISODate, id: string, patch: Partial<Meal>): void;
  removeMeal(d: ISODate, id: string): void;
  /** Copy all meals from one day onto another. Returns the number copied. */
  repeatDay(from: ISODate, to: ISODate): number;
  setWeight(d: ISODate, lb: number | null): void;
  adjustTobacco(d: ISODate, delta: number): void;
  logCaffeine(d: ISODate, time: HHMM): void;
  logBedtime(d: ISODate, time: HHMM): void;
  setSettings(update: Partial<AppSettings> | ((s: AppSettings) => AppSettings)): void;
  updateProfile(patch: Partial<Profile>): void;
  updateTargets(patch: Partial<Targets>): void;
  updateAI(patch: Partial<AISettings>): void;
  toggleFavorite(item: FoodItem): void;
  touchRecent(item: FoodItem): void;
  appendChat(msg: ChatMessage): void;
  updateChat(id: string, patch: Partial<ChatMessage>): void;
  clearChat(): void;
  importJSON(json: string, mode: 'merge' | 'replace'): ImportResult;
  exportJSON(): string;
  exportCSV(): string;
  loadDemoData(): void;
  clearAllData(): void;
  /** Force-persist pending writes immediately. */
  flush(): void;
  /** Re-run the integrity check against localStorage. */
  checkIntegrity(): IntegrityReport;
}

// ---------------------------------------------------------------------------
// Engine output shapes (shared so screens, insights and the coach agree)
// ---------------------------------------------------------------------------

export type Band = 'green' | 'yellow' | 'red' | 'neutral';
export type HrvBand = 'balanced' | 'low' | 'unbalanced' | 'poor' | 'insufficient';
export type DayType = 'lift' | 'rest';

export interface Readiness {
  /** 0–100, or null when no signal. */
  score: number | null;
  band: Band;
  source: 'whoop' | 'hrv' | 'none';
  /** One-line verdict, e.g. "Primed — progress loads today". */
  verdict: string;
  /** Training chip label: "Progress" | "Train, hold loads" | "Light day". */
  training: string;
  /** Short explanation of contributors. */
  detail: string;
  /** True when the red band was forced (recovery < 34 or HRV below lower SWC) although the score alone would be higher. */
  forced?: boolean;
}

export interface BaselineDelta {
  today: number | null;
  baseline: number | null;
  /** today − baseline (absolute). */
  delta: number | null;
  /** (today − baseline)/baseline × 100. */
  pct: number | null;
  /** Number of days contributing to the baseline. */
  n: number;
  /** Whether the observed direction is good for this metric. */
  good: boolean | null;
}

export interface Insight {
  id: string;
  /** Template id 1–14 from spec §7 (or a custom key). */
  template: string;
  band: Band;
  title: string;
  body: string;
  /** Optional coach prompt to open pre-filled when tapped. */
  coachPrompt?: string;
  /** Sort priority — higher first. */
  priority: number;
}

/**
 * Compact, JSON-serialisable snapshot of everything the coach and the insight
 * generator need. Built once per render by engine/context.ts.
 */
export interface CoachContext {
  today: ISODate;
  nowHHMM: HHMM;
  dayType: DayType;
  sessionType: SessionType;
  readiness: Readiness;
  hrv: {
    today: number | null;
    baseline7: number | null; // ms, geometric mean via ln
    lnMean7: number | null;
    swcLower: number | null; // ms
    swcUpper: number | null; // ms
    band: HrvBand;
    cv7: number | null;
    delta: BaselineDelta;
    /** Long-term geometric mean (ms) the SWC is centred on — engine/hrv.ts (additive, R3-1). */
    baseline28?: number | null;
    /** ≥ 21 readings in the last 30 days — the one "baseline established" gate (R3-10). */
    baselineEstablished?: boolean;
    /** HRV readings in the last 30 days (R3-10). */
    daysOfData?: number;
    /** Day-to-day CV rising or collapsing vs the reference — §6.3 overreaching flag (R3-8). */
    overreaching?: boolean;
  };
  rhr: BaselineDelta;
  sleep: {
    hours: number | null;
    need: number | null;
    debtMin: number | null;
    bedtimeSdMin: number | null;
    midpointSdMin: number | null;
    lastBedtime: HHMM | null;
    delta: BaselineDelta;
  };
  steps: BaselineDelta & { goalMin: number; goalMax: number };
  weight: {
    latest: number | null;
    trend: number | null;
    weeklyRateLb: number | null;
    weeklyRatePct: number | null;
    targetLbPerWk: [number, number];
    inBand: 'below' | 'in' | 'above' | null;
    weighInsThisWeek: number;
    /** Whole weeks the rate has sat outside the band in one direction (0 = < 7 days) — R3-3. */
    weeksOutsideBand?: number;
  };
  expenditure: {
    tdee: number | null;
    valid: boolean;
    reason: string;
    suggestedKcal: number | null;
    suggestedDelta: number | null;
    /** True while the first ~2 weeks of weigh-ins are still being collected (R3-5). */
    calibrating?: boolean;
    /** Day the in-progress weekly block publishes its estimate (R3-4). */
    nextUpdate?: ISODate | null;
  };
  nutrition: {
    totals: Macros;
    targets: Macros & { fatFloor: number; carbsRange: [number, number] };
    remaining: Macros;
    mealsLogged: number;
    mealsLeft: number;
    proteinPerMealNeeded: number | null;
    lastMealTime: HHMM | null;
    fatBelowFloor: boolean;
    lateEating: boolean;
    hydrationCups: number;
    hydrationTargetCups: number;
    caffeineAfterCutoff: HHMM | null;
    /** Most recent eating occasion delivered < 0.4 g/kg protein (§6.5 nudge) — R3-7. */
    lastMealBelowMin?: boolean;
    /** Protein in that last occasion, g (null when nothing logged). */
    lastMealProtein?: number | null;
    /** 0.4 / 0.55 g/kg × reference body weight, g per meal. */
    minPerMeal?: number;
    maxPerMeal?: number;
  };
  tobacco: {
    today: number;
    avg7: number | null;
    avg30: number | null;
    streakDays: number;
    hrvSmokeFree: number | null;
    hrvSmoking: number | null;
    /** Mean next-morning HRV after the last 3 smoke-free days (§7 #9) — R3-11. */
    hrvFree3?: number | null;
    /** hrvFree3 − mean next-morning HRV after smoking days. */
    hrvDelta3?: number | null;
  };
  frequency: {
    redMeatServings7d: number;
    fishServings7d: number;
    restaurantPct7d: number | null;
    fiberAvg7d: number | null;
    homeCookedPct7d: number | null;
  };
  adherence: {
    loggingStreak: number;
    proteinHitDays30: number;
    kcalHitDays30: number;
    weighInDays30: number;
  };
  bloodwork: BloodMarker[];
  /** Last 30 daily records (compact, meals summarised) for the LLM. */
  last30: Array<Omit<DailyRecord, 'meals'> & { mealCount?: number }>;
  /** Today's record including meals. */
  todayRecord: DailyRecord | null;
}

// ---------------------------------------------------------------------------
// Food AI output (§9)
// ---------------------------------------------------------------------------

export interface FoodEstimateItem {
  name: string;
  grams: number;
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  fiber_g: number;
  /** 0–1 */
  confidence: number;
  assumptions: string;
  tags?: FoodTag[];
}

export interface FoodEstimate {
  items: FoodEstimateItem[];
  /** One short question, or null. */
  clarify: string | null;
  /** 'barcode' = Open Food Facts lookup; 'photo' = Claude vision estimate. */
  source: 'claude' | 'local' | 'barcode' | 'photo';
}
