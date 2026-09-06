/**
 * Core data contracts for the health/fitness logging app.
 *
 * Persisted records use the compact short-key schema from the spec (§10) so a
 * year of data stays well under 0.2 MB of localStorage. Everything else in the
 * app (engine, AI, screens) is written against these types — treat this file
 * as the single source of truth and keep it dependency-free.
 *
 * Migration v1 → v2 (engine v3: workouts, Kalman weight, stress stack) is
 * purely additive:
 *   • v1 day shards load unchanged — every new DailyRecord field is optional.
 *   • `mergeSettings` fills the new settings blocks with defaults, so a v1
 *     settings blob upgrades in place on first write.
 *   • `loadAll` tolerates a missing `index.workouts`; a library with no
 *     `hx:wk:*` shards simply has no workouts.
 *   • A v2 export opened by a v1 build warns and ignores `workouts` rather
 *     than failing, because v1's importer only reads known keys.
 * Nothing is renamed or removed, so downgrades lose data but never corrupt it.
 */

export const SCHEMA_VERSION = 2;

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

  // -- engine v3 derived (written by the store, never by hand) ---------------
  /** Kalman level (smoothed weight), lb. */
  kl?: number;
  /** Kalman slope, lb per day (×7 for lb/wk). */
  ks?: number;
  /** Kalman level variance, lb² — the uncertainty behind kl/ks. */
  kv?: number;
  /** Weigh-in rejected by the Kalman outlier gate (likely a typo/anomaly). */
  ws?: true;
  /** Total training load units for the day (Foster sRPE / TRIMP / Edwards). */
  ld?: number;
  /** Workouts logged on this day. */
  wko?: number;

  // -- stress stack ---------------------------------------------------------
  /** Check-in: sleep quality 1–7 (1 = very good). Hooper index item. */
  qs?: number;
  /** Check-in: fatigue 1–7 (1 = very fresh). */
  qf?: number;
  /** Check-in: stress 1–7 (1 = very low). */
  qt?: number;
  /** Check-in: muscle soreness 1–7 (1 = none). */
  qo?: number;
  /** Respiratory rate, breaths per minute (WHOOP import). */
  rr?: number;
  /** Skin temperature, °C (WHOOP import). */
  skt?: number;
  /** Blood oxygen saturation, % (WHOOP import). */
  spo?: number;
  /** Alcoholic drinks. */
  alc?: number;
  /** Overnight strain index 0–100 — derived. */
  osi?: number;
  /** Estimated VO₂max, ml/kg/min — derived. */
  vo2?: number;
  /**
   * Short Recovery and Stress Scale, stored as its two subscale totals rather
   * than the eight raw items: the scales are what the literature interprets,
   * and two numbers ride the series/baseline/CSV stack that an array could not.
   * Recovery = physical + mental performance capability, emotional balance,
   * overall recovery. Stress = muscular stress, lack of activation, negative
   * emotional state, overall stress. Each 0–24 (four items, 0–6).
   */
  srssR?: number;
  srssS?: number;
  /** PSS-4 total, 0–16. Asked monthly: its recall window is a month. */
  pss4?: number;
  /** The check-in was deliberately skipped, so the prompt stops asking. */
  qsk?: true;
  /** Menstruating today (only when profile.tracksCycle). */
  mens?: true;
}

/**
 * Every numeric day field — the series, baseline, heat-map and CSV stacks all
 * iterate this. Non-numeric fields MUST be listed in the Omit or they will be
 * treated as numbers: `bt`/`wk` are times, `caf` is a list, `meals`/`note` are
 * objects/strings, and `lift`/`ws`/`mens`/`qsk` are booleans.
 */
export type MetricKey = keyof Omit<
  DailyRecord,
  'd' | 'bt' | 'wk' | 'caf' | 'meals' | 'note' | 'lift' | 'ws' | 'mens' | 'qsk'
>;

// ---------------------------------------------------------------------------
// Training: exercises, sets, workouts, programs
// ---------------------------------------------------------------------------

/** Muscles tracked for weekly volume. Deliberately coarse — 15 buckets a lifter recognises. */
export type Muscle =
  | 'chest'
  | 'back'
  | 'front-delts'
  | 'side-delts'
  | 'rear-delts'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'traps'
  | 'lower-back'
  | 'abs'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves';

export type MovementPattern =
  | 'squat'
  | 'hinge'
  | 'push-h'
  | 'push-v'
  | 'pull-h'
  | 'pull-v'
  | 'lunge'
  | 'carry'
  | 'core'
  | 'isolation'
  | 'cardio'
  | 'mobility'
  | 'sport';

export type Equipment =
  | 'barbell'
  | 'dumbbell'
  | 'machine'
  | 'cable'
  | 'bodyweight'
  | 'kettlebell'
  | 'band'
  | 'other';

export type WorkoutKind = 'strength' | 'cardio' | 'mobility' | 'sport';

export type WorkoutSource = 'manual' | 'whoop' | 'strava' | 'apple' | 'demo';

export interface Exercise {
  id: string;
  name: string;
  muscles: { primary: Muscle[]; secondary: Muscle[] };
  pattern: MovementPattern;
  equipment: Equipment;
  /** Loads are per side / one limb at a time. */
  unilateral?: boolean;
  /** User-created (kept in settings.training.customExercises). */
  custom?: boolean;
  aliases?: string[];
}

/**
 * One set. Compact on purpose — a 6×4 session is ≈ 1 KB of JSON.
 * Working sets and completed sets are the omitted defaults.
 */
export interface SetEntry {
  /** Load in KILOGRAMS (display converts); 0 for bodyweight. */
  w: number;
  /** Reps. */
  r: number;
  /** Rating of perceived exertion, 6–10 in 0.5 steps. */
  rpe?: number;
  /** Reps in reserve (alternative to rpe). */
  rir?: number;
  /** Kind: warm-up, drop set, AMRAP. Working set = omitted. */
  k?: 'wu' | 'dr' | 'am';
  /** Skipped/not completed. Completed = omitted. */
  x?: true;
}

export interface WorkoutExercise {
  exerciseId: string;
  sets: SetEntry[];
  note?: string;
  /** Shared tag groups supersetted exercises. */
  superset?: string;
}

export interface CardioDetail {
  /** Free text sport ("run", "row", "cycle"). */
  sport?: string;
  distanceKm?: number;
  avgHr?: number;
  maxHr?: number;
  /** Minutes in HR zones 0–5. */
  zoneMin?: [number, number, number, number, number, number];
  elevM?: number;
  kcal?: number;
}

export interface Workout {
  id: string;
  /** Calendar day the session belongs to. */
  d: ISODate;
  /** Start time 'HH:MM'. */
  start: HHMM;
  durationMin: number;
  kind: WorkoutKind;
  /** Which split slot this session filled (for program tracking). */
  session?: SessionType;
  title?: string;
  exercises?: WorkoutExercise[];
  cardio?: CardioDetail;
  /** Session RPE 1–10 (Foster). */
  srpe?: number;
  /** Computed load units — stamped on finish/import so history is stable. */
  load?: number;
  source: WorkoutSource;
  /** Stable id from the import source, used for dedupe. */
  externalId?: string;
  programId?: string;
  note?: string;
}

export interface ProgramExercise {
  exerciseId: string;
  sets: number;
  /** Target rep range, e.g. [6, 10]. */
  reps: [number, number];
  /** Target RPE for the top set. */
  rpe?: number;
}

export interface Program {
  id: string;
  name: string;
  sessions: Partial<Record<SessionType, ProgramExercise[]>>;
  builtIn?: boolean;
}

/**
 * Weekly set landmarks per muscle. ADVISORY, never caps: the 2025 Sports
 * Medicine meta-regression found hypertrophy keeps rising with weekly sets
 * with no clear plateau, and MRV has no RCT support.
 */
export interface VolumeLandmark {
  /** Minimum effective volume. */
  mev: number;
  /** Maximum adaptive volume (the "productive" upper edge). */
  mav: number;
  /** Maximum recoverable volume — shown as context, never enforced. */
  mrv: number;
}

export interface TrainingSettings {
  /** Load units for display; defaults to profile.units. */
  units: 'lb' | 'kg';
  volumeLandmarks: Record<Muscle, VolumeLandmark>;
  progression: {
    /** Acceptable RPE window for the top set, e.g. [7, 8]. */
    targetRpe: [number, number];
    /** Upper-body load step, %. */
    loadStepPctUpper: number;
    /** Lower-body load step, % (bigger — a single step under-loads squats). */
    loadStepPctLower: number;
    repRange: [number, number];
  };
  customExercises: Exercise[];
  programs: Program[];
  activeProgramId?: string;
  restTimerSec: number;
  imports?: { whoopAt?: number; stravaAt?: number; appleAt?: number };
}

// ---------------------------------------------------------------------------
// Stress & check-in settings
// ---------------------------------------------------------------------------

/** Hooper index items — all optional, all skippable. */
export type CheckInItem = 'qs' | 'qf' | 'qt' | 'qo';

export interface CheckInSettings {
  enabled: boolean;
  /** Which of the four 1–7 items to ask for. */
  items: CheckInItem[];
  /** Prompt on Today only after this time. */
  promptAfter: HHMM;
  /** Weekly 8-item Short Recovery and Stress Scale (Sundays). */
  weeklySrss: boolean;
  /** Monthly PSS-4 (its recall window is a month; daily use is unvalidated). */
  monthlyPss: boolean;
}

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
  /**
   * Body fat %, optional. Drives the Forbes/Hall energy-density factor: a lean
   * lifter's true kcal per lb of weight change is ~30% below the folk 3,500,
   * which is the single largest bias in a naive TDEE estimate.
   */
  bodyFatPct?: number;
  /** Measured max HR, bpm. Without it the engine falls back to Tanaka 208 − 0.7·age. */
  maxHrMeasured?: number;
  /** Log menstrual days and let the weight filter account for cycle water shifts. */
  tracksCycle?: boolean;
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
  /**
   * When the calorie target last changed. The coach freezes coarse intake
   * suggestions for 14 days after a change so it cannot chase its own tail.
   */
  lastKcalChangeAt?: ISODate;
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
  training: TrainingSettings;
  checkIn: CheckInSettings;
  /**
   * Insight template ids shown per day for the last 14 days, newest first.
   * Feeds the decaying priority rule so one yellow card cannot hold the top
   * slot all week. `[date, ...ids]` is avoided — keep it keyed for cheap reads.
   */
  insightHistory?: Record<ISODate, string[]>;
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
  /** Workout shards (hx:wk:YYYY-MM) found and validated. */
  workoutShards: number;
  /** Workouts loaded across those shards. */
  workouts: number;
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
  /**
   * Bumped whenever the whole dataset is replaced out from under the UI —
   * "clear all data", or a replace-import. Screens holding local drafts of
   * user data (the live training session) watch this and drop them, otherwise
   * a draft that outlived the wipe would write itself straight back.
   */
  generation: number;
  settings: AppSettings;
  /** All loaded daily records keyed by ISO date. */
  days: Record<ISODate, DailyRecord>;
  /** All loaded workouts keyed by id (sharded by month, like days). */
  workouts: Record<string, Workout>;
  chat: ChatMessage[];
  storage: StorageStatus;
}

export interface ImportResult {
  ok: boolean;
  recordsImported: number;
  workoutsImported: number;
  settingsImported: boolean;
  chatImported: boolean;
  errors: string[];
}

export interface WorkoutImportResult {
  added: number;
  /** Skipped as duplicates of an existing workout. */
  skipped: number;
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
  exportWorkoutsCSV(): string;
  loadDemoData(): void;
  clearAllData(): void;

  // -- training -------------------------------------------------------------
  /** Create a workout (id generated when omitted). Returns the stored workout. */
  addWorkout(w: Omit<Workout, 'id'> & { id?: string }): Workout;
  updateWorkout(id: string, patch: Partial<Workout>): void;
  removeWorkout(id: string): void;
  /**
   * Close out a session: stamps duration, session RPE and the computed load,
   * then syncs the day's `ld`/`wko`/`lift`.
   */
  finishWorkout(id: string, done: { durationMin: number; srpe?: number; end?: HHMM }): void;
  /**
   * Bulk import. Dedupe: matching `externalId`, or same day + kind with a
   * start within 10 minutes. Imported sessions never replace manual ones.
   */
  importWorkouts(items: Workout[]): WorkoutImportResult;
  updateTraining(patch: Partial<TrainingSettings>): void;

  // -- stress ---------------------------------------------------------------
  /** Save (or clear) the day's check-in items in one write. */
  saveCheckIn(d: ISODate, values: Partial<Pick<DailyRecord, CheckInItem>>): void;
  /** Remember which insight templates were shown, for the decaying priority rule. */
  recordInsightsShown(d: ISODate, ids: string[]): void;
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
  /** Per-input breakdown behind the score — the "Why this score" list. */
  contributors?: ReadinessContributor[];
  /** Things that moved the verdict after scoring (training form, stress, illness). */
  modifiers?: ReadinessModifier[];
  /** Baseline not yet established — show "Calibrating", not a number. */
  calibrating?: boolean;
  /** Score uncertainty; widens as inputs go missing. */
  confidence?: { lo: number; hi: number; nInputs: number };
  /** 0 = own score only, 1 = WHOOP only. Ramps over 7 days so imports never step the hero number. */
  blendWeight?: number;
}

export interface ReadinessContributor {
  key: string;
  label: string;
  /** Raw value in its own unit (ms, bpm, hours…). */
  value: number | null;
  /** Standardised value used by the model. */
  z: number | null;
  weight: number;
  /** Points this input contributed to the 0–100 score. */
  points: number;
  effect: 'up' | 'down' | 'flat';
}

export interface ReadinessModifier {
  key: string;
  label: string;
  /** How it changed the verdict. */
  effect: 'downgrade' | 'note';
  reason: string;
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

// ---------------------------------------------------------------------------
// Training analysis shapes
// ---------------------------------------------------------------------------

export type FormBand = 'fresh' | 'neutral' | 'productive' | 'overreached';
export type AcwrBand = 'low' | 'sweet' | 'high' | 'spike';
export type VolumeStatus = 'below-mev' | 'building' | 'productive' | 'high';

export interface PlannedExercise {
  exerciseId: string;
  name: string;
  sets: number;
  reps: [number, number];
  /** Suggested working load in kg (null when there is no history yet). */
  loadKg: number | null;
  mode: 'progress' | 'hold' | 'reduce';
  /** Why this suggestion, in the user's terms. */
  reason: string;
  /** What they did last time, for the ghost line. */
  last?: { loadKg: number; reps: number[]; rpe?: number; d: ISODate };
}

export interface MuscleVolume {
  muscle: Muscle;
  sets: number;
  mev: number;
  mav: number;
  mrv: number;
  status: VolumeStatus;
}

export interface PersonalRecord {
  exerciseId: string;
  name: string;
  kind: 'weight' | 'reps' | 'e1rm';
  value: number;
  previous: number | null;
  d: ISODate;
}

export interface Plateau {
  exerciseId: string;
  name: string;
  sessions: number;
  gainPct: number;
  rpeTrend: number;
}

export interface TrainingContext {
  todaySession: SessionType;
  plannedExercises: PlannedExercise[];
  todayWorkouts: Workout[];
  load: {
    today: number;
    acute7: number;
    chronic28: number;
    /** Descriptive only — never a causal injury predictor (Impellizzeri 2020). */
    acwr: number | null;
    acwrBand: AcwrBand | null;
    /** Week-on-week acute-load change, %. This is what advice leads on. */
    weekOverWeekPct: number | null;
    fitness: number;
    fatigue: number;
    form: number;
    formBand: FormBand | null;
    monotony: number | null;
    weeklyLoad: number;
    source: 'logged' | 'whoop' | 'mixed' | 'none';
    /** True while Banister τ are the 42/7 priors rather than a personal fit. */
    tauIsPrior: boolean;
    /**
     * True while the WHOOP strain → load conversion is still the a = 25 / b = 3.5
     * prior rather than a fit to this user's own sessions (`WhoopScaleFit.fitted`).
     * Optional so a hand-built context stays valid; `undefined` means "not known",
     * and only an explicit `true` makes the gauge hedge (`LOAD_NOTES.whoopPrior`).
     */
    whoopIsPrior?: boolean;
  };
  weeklySets: MuscleVolume[];
  /** Per-muscle recovery 0–100% from the 48–72 h MPS window. */
  muscleReadiness: Array<{ muscle: Muscle; pct: number; hoursSince: number | null }>;
  balance: { pushPull: number | null; squatHinge: number | null };
  prs7d: PersonalRecord[];
  plateaus: Plateau[];
  deload: { recommended: boolean; reasons: string[] };
  lastSession: Workout | null;
  vo2max: { value: number | null; lo: number | null; hi: number | null; method: string } | null;
}

// ---------------------------------------------------------------------------
// Stress, energy and behaviour-impact shapes
// ---------------------------------------------------------------------------

export type StressBand = 'none' | 'minor' | 'major';
export type ResilienceBand = 'limited' | 'adequate' | 'solid' | 'strong' | 'exceptional';

export interface StressSignal {
  key: 'hrv' | 'rhr' | 'rr' | 'skt' | 'spo' | 'debt';
  label: string;
  value: number | null;
  z: number | null;
  threshold: number;
  deviating: boolean;
}

export interface StressContext {
  /** Overnight strain index 0–100, with its credible interval. */
  osi: number | null;
  osiLo: number | null;
  osiHi: number | null;
  /** Leading output: how many overnight signals are outside the personal range. */
  signalsDeviating: number;
  signalsAvailable: number;
  band: StressBand | null;
  outliers: StressSignal[];
  checkIn: {
    sleepQ: number | null;
    fatigue: number | null;
    stress: number | null;
    soreness: number | null;
    /** Hooper total 4–28 (null unless all asked items are present). */
    total: number | null;
    band: Band;
    nDays: number;
    /** Three consecutive days worse than normal — the DALDA rule. */
    worseRun: number;
    missingToday: boolean;
  };
  resilience: {
    score: number | null;
    band: ResilienceBand | null;
    loadEwma: number | null;
    recoveryEwma: number | null;
    balance: number | null;
    nDays: number;
    /** Allostatic-load-STYLE counter; the wearable transposition is not validated. */
    alStyleCount: number | null;
  };
  illness: { flag: boolean; since: ISODate | null; reasons: string[] };
  /** Fewer than 14 days of reference — show "still learning your normal". */
  calibrating: boolean;
  nRef: number;
}

export interface EnergyPoint {
  hhmm: HHMM;
  /** 0–100 predicted alertness/energy. */
  value: number;
  lo: number;
  hi: number;
}

export interface EnergyContext {
  /** Predicted energy right now. */
  now: number | null;
  atWake: number | null;
  forecast: EnergyPoint[];
  /** The afternoon dip. */
  trough: { hhmm: HHMM; value: number } | null;
  /** When predicted energy falls to the sleep-ready threshold. */
  bedtimeReadyAt: HHMM | null;
  caffeineActiveMg: number | null;
  drivers: string[];
  confidence: 'low' | 'medium' | 'high';
}

export interface BehaviourEffect {
  behaviour: string;
  metric: string;
  label: string;
  /** Shrunk difference in means (yes-days minus no-days). */
  deltaMean: number;
  lo95: number;
  hi95: number;
  nYes: number;
  nNo: number;
  /** 0–1: how far the estimate was pulled toward the published prior. */
  shrunkToPrior: number;
  /** Benjamini–Hochberg adjusted p. */
  qValue: number;
  /** Named confound, e.g. "those days also had higher training load". */
  confound?: string;
}

export interface ImpactContext {
  effects: BehaviourEffect[];
  /** Behaviours that exist but lack the ≥5 yes / ≥5 no days in 90 to be reported. */
  pending: string[];
}

export interface Changepoint {
  d: ISODate;
  metric: string;
  label: string;
  prob: number;
  meanBefore: number;
  meanAfter: number;
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
    /** Robust reference (60–90 days): geometric median in ms and the SD of ln rMSSD. */
    refMedianMs?: number | null;
    refSdLn?: number | null;
    /** Readings behind the reference. */
    nRef?: number;
    /** First day of the reference window (truncated after a confirmed regime shift). */
    referenceStart?: ISODate | null;
    /** Valid readings inside the 7-day window; below 4 the band is suppressed. */
    nWindow?: number;
    /** The engine is forcing a light day (2 × SWC rule, or two days below the SWC). */
    forcing?: boolean;
    forcingReason?: string | null;
    /** 'heuristic' for the 2 × SWC clause, 'published' for Kiviniemi's. */
    forcingSupport?: 'heuristic' | 'published' | null;
    /**
     * The short evidence label for the clause that fired ("tunable heuristic, no
     * direct published support"). Carried so a surface that shows the forced
     * verdict can show what it rests on — a hedge left in the engine is no hedge.
     */
    forcingLabel?: string | null;
    /** Possible vagal saturation — a high rMSSD here is not good news. */
    saturated?: boolean;
  };
  rhr: BaselineDelta;
  sleep: {
    hours: number | null;
    need: number | null;
    debtMin: number | null;
    bedtimeSdMin: number | null;
    midpointSdMin: number | null;
    /** Nights contributing to the bedtime SD (cards gate the readout at 3). */
    bedtimeNights?: number;
    lastBedtime: HHMM | null;
    delta: BaselineDelta;
    /** Tonight's need after strain and (decayed) debt — always computed. */
    tonightNeed?: number | null;
    /** Need learned from nights followed by top-tercile readiness. */
    learnedBaselineHrs?: number | null;
    baselineSource?: 'profile' | 'learned' | 'imported';
    /** Sleep Regularity Index 0–100 (Phillips 2017); flag below 70. */
    sri?: number | null;
    sriNights?: number;
    /** |midsleep on rest days − midsleep on training days|, minutes (MCTQ). */
    socialJetlagMin?: number | null;
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
    /** Kalman (decision) level and its uncertainty — the drawn trend is the smoothed level. */
    kalmanLevel?: number | null;
    levelSd?: number | null;
    /** Rate uncertainty; the 90% interval is what the UI shows. */
    rateSdLb?: number | null;
    rateLow90?: number | null;
    rateHigh90?: number | null;
    /** False while the slope is still too uncertain to publish. */
    rateAvailable?: boolean;
    /** Today's weigh-in was rejected by the outlier gate. */
    suspectToday?: boolean;
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
    /** 90% credible interval half-width and bounds. */
    ci?: number | null;
    low?: number | null;
    high?: number | null;
    /** P(weekly rate outside the target band) for the latest block. */
    pOutside?: number | null;
    blocksOutside?: number;
    /** Coarse suggestions are frozen until this date after a target change. */
    frozenUntil?: ISODate | null;
    /** "5 of 7 days logged" — how much of the block was actually recorded. */
    coverage?: { logged: number; days: number };
    /** Forbes/Hall energy density in use, kcal per lb of weight change. */
    energyDensityKcalPerLb?: number | null;
    /** Which suggestion tier fired. */
    tier?: 'none' | 'fine' | 'coarse';
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
    /** Eating occasions needed to hit protein without exceeding the soft per-meal optimum. */
    slots?: number;
    /** Share of the day's kcal in the last fifth of the wake window (McHill 2017). */
    lateSharePct?: number | null;
    lateSeverity?: 'none' | 'mild' | 'high';
    /** The eating day these totals belong to (meals before 04:00 count to the previous day). */
    eatingDay?: ISODate;
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
    /** Days behind each mean — a comparison without counts is not a finding. */
    nFree?: number;
    nSmoke?: number;
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

  // -- engine v3 blocks (absent when the feature has no data) ---------------
  training?: TrainingContext;
  stress?: StressContext;
  energy?: EnergyContext;
  impact?: ImpactContext;
  /** Confirmed regime shifts (BOCPD) worth telling the user about. */
  changepoints?: Changepoint[];
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
