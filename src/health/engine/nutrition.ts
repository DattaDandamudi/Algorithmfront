/**
 * §6.5 Nutrition — protein-first.
 *
 * Rules implemented here (all pure, deterministic, `now` passed in):
 * - Day type from the training split (`record.lift` overrides) drives carb
 *   cycling: lift 150–175 g / rest 70–100 g (§6.5 "auto-switched by split").
 * - Protein pacing 0.4–0.55 g/kg per meal across ≥4 meals (Schoenfeld &
 *   Aragon 2018) → 31–43 g/meal for 78 kg; nudge when a slot lands < 31 g.
 * - Fat floor 60 g (Whittaker & Wu 2021 — low-fat diets cut testosterone
 *   10–15 %): warn when the projected daily fat can't reach the floor.
 * - Late-eating rule (Vujović 2022): flag ≥ 400 kcal within 3 h of the bed
 *   target and suggest finishing the last substantial meal 3 h before bed.
 * - Hydration 30–35 ml/kg (+250 ml on ≥10k-step days, +250 ml on strain ≥14).
 * - Nutrition-frequency counters for the lab-linked insights (§3, §7 #13/#14).
 *
 * Meals can be logged after midnight ('00:20'); see `mealClockMinutes`.
 */
import type {
  DailyRecord,
  DayType,
  FoodItem,
  HHMM,
  ISODate,
  Macros,
  Meal,
  Profile,
  SessionType,
  Targets,
} from '../data/types';
import { hhmmToMinutes, lastNDates, minutesSinceNoon, minutesToHHMM, weekdayOf } from '../lib/dates';
import { lbToKg, mean, round } from '../lib/format';

// ---------------------------------------------------------------------------
// Day type & macro targets
// ---------------------------------------------------------------------------

/** Sessions that do not count as a lift day for carb cycling. */
const NON_LIFT: ReadonlySet<SessionType> = new Set<SessionType>(['rest', 'cardio']);

/**
 * Lift vs rest for a date. `record.lift` (manual override) wins; otherwise the
 * split entry for that weekday. When the override contradicts the split, the
 * session is reported as a generic 'full' lift (or 'rest') so the UI never
 * shows "rest" on a day the user says they lifted.
 */
export function dayTypeFor(d: ISODate, profile: Profile, record?: DailyRecord): { type: DayType; session: SessionType } {
  const scheduled: SessionType = profile.split?.[weekdayOf(d)] ?? 'rest';
  const scheduledIsLift = !NON_LIFT.has(scheduled);
  if (record?.lift === true) return { type: 'lift', session: scheduledIsLift ? scheduled : 'full' };
  if (record?.lift === false) return { type: 'rest', session: 'rest' };
  return { type: scheduledIsLift ? 'lift' : 'rest', session: scheduled };
}

export interface MacroTargets {
  kc: number;
  p: number;
  /** Fat target (g); the floor is a separate hard limit. */
  f: number;
  fatFloor: number;
  carbsRange: [number, number];
  /** Carb midpoint used for the remaining-bar length. */
  c: number;
  fi: number;
}

/** Day-type-aware targets. Only carbs cycle; kcal/protein/fat/fiber are fixed. */
export function macroTargetsFor(type: DayType, targets: Targets): MacroTargets {
  const carbsRange: [number, number] = type === 'lift' ? [...targets.carbsLift] : [...targets.carbsRest];
  return {
    kc: targets.kcal,
    p: targets.protein,
    f: targets.fatTarget,
    fatFloor: targets.fatFloor,
    carbsRange,
    c: round((carbsRange[0] + carbsRange[1]) / 2),
    fi: targets.fiber,
  };
}

// ---------------------------------------------------------------------------
// Totals & remaining
// ---------------------------------------------------------------------------

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/**
 * Today's intake: the sum of itemised meals when any exist, else the stored
 * day totals (direct entry), else zeros. Rounded like the store (1 dp fiber).
 */
export function dayTotals(record: DailyRecord | undefined): Macros {
  if (!record) return { kc: 0, p: 0, f: 0, c: 0, fi: 0 };
  if (record.meals && record.meals.length > 0) {
    const s = { kc: 0, p: 0, f: 0, c: 0, fi: 0 };
    for (const m of record.meals) {
      s.kc += num(m.kc);
      s.p += num(m.p);
      s.f += num(m.f);
      s.c += num(m.c);
      s.fi += num(m.fi);
    }
    return { kc: round(s.kc), p: round(s.p), f: round(s.f), c: round(s.c), fi: round(s.fi, 1) };
  }
  return { kc: num(record.kc), p: num(record.p), f: num(record.f), c: num(record.c), fi: num(record.fi) };
}

/** target − eaten for each macro. Negative means over target; the sign is kept. */
export function remainingMacros(totals: Macros, t: MacroTargets): Macros {
  return {
    kc: round(t.kc - totals.kc),
    p: round(t.p - totals.p),
    f: round(t.f - totals.f),
    c: round(t.c - totals.c),
    fi: round(t.fi - totals.fi, 1),
  };
}

// ---------------------------------------------------------------------------
// Clock helpers for an eating day that may run past midnight
// ---------------------------------------------------------------------------

/** Meals logged before this clock time belong to the previous evening. */
const EATING_DAY_START_MIN = 4 * 60; // 04:00

/**
 * Minutes on an "eating day" axis: 04:00 → 240 … 23:00 → 1380, and a post-
 * midnight '00:20' → 1460, so a late supper sorts after dinner rather than
 * before breakfast. Null for a malformed time.
 */
export function mealClockMinutes(t: HHMM | undefined | null): number | null {
  const m = hhmmToMinutes(t);
  if (m === null) return null;
  return m < EATING_DAY_START_MIN ? m + 1440 : m;
}

/**
 * Signed minutes from `now` until the bed target. Negative while up to 6 h
 * past bed (00:30 vs a 23:00 bed → −90); a morning "now" is a full day away
 * (08:00 → 900). Uses the noon-anchored axis so bedtimes past midnight work.
 */
export function minutesUntilBed(now: HHMM, bed: HHMM): number | null {
  const n = minutesSinceNoon(now);
  const b = minutesSinceNoon(bed);
  if (n === null || b === null) return null;
  const diff = b - n;
  return diff < -360 ? diff + 1440 : diff;
}

/** Latest meal on the eating-day axis (null when no meals). */
function lastMeal(meals: Meal[] | undefined): Meal | null {
  if (!meals || meals.length === 0) return null;
  let best: Meal | null = null;
  let bestT = -Infinity;
  for (const m of meals) {
    const t = mealClockMinutes(m.t);
    if (t !== null && t >= bestT) {
      best = m;
      bestT = t;
    }
  }
  return best ?? meals[meals.length - 1];
}

// ---------------------------------------------------------------------------
// Protein pacing (§6.5 — 0.4–0.55 g/kg/meal, ≥4 meals)
// ---------------------------------------------------------------------------

/** Per-meal protein band, g/kg body weight (Schoenfeld & Aragon 2018). */
export const PROTEIN_PER_MEAL_GKG: [number, number] = [0.4, 0.55];
/** No more meals are expected once bed is this close. */
const LAST_MEAL_CUTOFF_MIN = 60;

export interface ProteinPacing {
  soFar: number;
  /** target − soFar; negative once over target. */
  remaining: number;
  mealsLogged: number;
  mealsLeft: number;
  /** remaining ÷ mealsLeft (≥ 0); null when no meals are left. */
  perMealNeeded: number | null;
  minPerMeal: number;
  maxPerMeal: number;
  /** The most recent meal delivered less than the 0.4 g/kg minimum. */
  lastMealBelowMin: boolean;
  /** Target is reachable without exceeding 0.55 g/kg in any remaining meal. */
  onPace: boolean;
}

export function proteinPacing(input: {
  record: DailyRecord | undefined;
  targets: Targets;
  weightLb: number;
  nowHHMM: HHMM;
  bedTarget: HHMM;
}): ProteinPacing {
  const { record, targets, weightLb, nowHHMM, bedTarget } = input;
  const kg = lbToKg(weightLb > 0 ? weightLb : 0);
  const minPerMeal = round(PROTEIN_PER_MEAL_GKG[0] * kg);
  const maxPerMeal = round(PROTEIN_PER_MEAL_GKG[1] * kg);

  const soFar = dayTotals(record).p;
  const remaining = round(targets.protein - soFar);
  const mealsLogged = record?.meals?.length ?? 0;

  const untilBed = minutesUntilBed(nowHHMM, bedTarget);
  const tooLate = untilBed !== null && untilBed <= LAST_MEAL_CUTOFF_MIN;
  const mealsLeft = tooLate ? 0 : Math.max(targets.mealsPerDay - mealsLogged, remaining > 0 ? 1 : 0);

  const perMealNeeded = mealsLeft > 0 ? round(Math.max(0, remaining) / mealsLeft) : null;
  const last = lastMeal(record?.meals);
  const lastMealBelowMin = last !== null && num(last.p) < minPerMeal;
  const onPace = perMealNeeded === null ? remaining <= 0 : perMealNeeded <= maxPerMeal;

  return { soFar, remaining, mealsLogged, mealsLeft, perMealNeeded, minPerMeal, maxPerMeal, lastMealBelowMin, onPace };
}

// ---------------------------------------------------------------------------
// Fat floor (§6.2/§6.5 — never below 60 g)
// ---------------------------------------------------------------------------

/** From this clock time the day's eating is treated as essentially done. */
const LATE_DAY_START_NOON = minutesSinceNoon('20:00') as number; // 480
/** …until this morning hour (noon axis), so 00:30 is still "late", 07:00 is not. */
const LATE_DAY_END_NOON = minutesSinceNoon('06:00') as number; // 1080

function isLateInDay(now: HHMM | undefined): boolean {
  const n = minutesSinceNoon(now);
  return n !== null && n >= LATE_DAY_START_NOON && n < LATE_DAY_END_NOON;
}

export interface FatFloorCheck {
  belowFloor: boolean;
  /** Fat reachable today: current fat plus what the remaining kcal could cover (nothing more after 20:00). */
  projectedFat: number;
  /** floor − projectedFat, ≥ 0. */
  shortBy: number;
}

/**
 * Below the floor when current fat < floor AND the gap can't reasonably be
 * covered by the remaining calories (gap × 9 kcal/g > remaining kcal), or when
 * it is late in the day (after 20:00 any shortfall counts).
 */
export function fatFloorCheck(totals: Macros, remainingKcal: number, targets: Targets, nowHHMM?: HHMM): FatFloorCheck {
  const fat = num(totals.f);
  const gap = targets.fatFloor - fat;
  if (gap <= 0) return { belowFloor: false, projectedFat: round(fat, 1), shortBy: 0 };
  const late = isLateInDay(nowHHMM);
  const coverable = late ? 0 : Math.min(gap, Math.max(0, num(remainingKcal)) / 9);
  const projectedFat = round(fat + coverable, 1);
  const shortBy = round(Math.max(0, targets.fatFloor - projectedFat), 1);
  return { belowFloor: shortBy > 0, projectedFat, shortBy };
}

// ---------------------------------------------------------------------------
// Late eating (Vujović 2022)
// ---------------------------------------------------------------------------

/** A "large late-evening load" is at least this many kcal within 3 h of bed. */
export const LATE_LOAD_KCAL = 400;
const LATE_WINDOW_MIN = 3 * 60;

export interface LateEatingCheck {
  late: boolean;
  lastMealTime: HHMM | null;
  kcalWithin3h: number;
  /** Bed target − 3 h. */
  suggestedLastMeal: HHMM;
  /** Minutes from `nowHHMM` until the suggested last-meal time (negative once passed); null when `now` not given. */
  minutesToCutoff: number | null;
}

export function lateEatingCheck(meals: Meal[] | undefined, bedTarget: HHMM, nowHHMM?: HHMM): LateEatingCheck {
  const bedClock = hhmmToMinutes(bedTarget) ?? 23 * 60;
  const bedAxis = mealClockMinutes(minutesToHHMM(bedClock)) as number;
  const windowStart = bedAxis - LATE_WINDOW_MIN;
  const suggestedLastMeal = minutesToHHMM(bedClock - LATE_WINDOW_MIN);

  let kcalWithin3h = 0;
  for (const m of meals ?? []) {
    const t = mealClockMinutes(m.t);
    if (t !== null && t >= windowStart) kcalWithin3h += num(m.kc);
  }
  kcalWithin3h = round(kcalWithin3h);

  const last = lastMeal(meals);
  const nowAxis = nowHHMM === undefined ? null : mealClockMinutes(nowHHMM);
  const minutesToCutoff = nowAxis === null ? null : windowStart - nowAxis;

  return {
    late: kcalWithin3h >= LATE_LOAD_KCAL,
    lastMealTime: last ? last.t : null,
    kcalWithin3h,
    suggestedLastMeal,
    minutesToCutoff,
  };
}

// ---------------------------------------------------------------------------
// Hydration (§6.5 — 30–35 ml/kg + activity bumps)
// ---------------------------------------------------------------------------

/** Steps / WHOOP strain from which an extra 250 ml (one cup) is added. */
export const HYDRATION_STEP_BUMP = 10_000;
export const HYDRATION_STRAIN_BUMP = 14;
export const ML_PER_CUP = 250;

export function hydrationTarget(
  weightLb: number,
  targets: Targets,
  steps?: number | null,
  strain?: number | null,
): { ml: number; cups: number } {
  const kg = lbToKg(weightLb > 0 ? weightLb : 0);
  let ml = kg * (targets.waterMlPerKg > 0 ? targets.waterMlPerKg : 32);
  if (typeof steps === 'number' && steps >= HYDRATION_STEP_BUMP) ml += ML_PER_CUP;
  if (typeof strain === 'number' && strain >= HYDRATION_STRAIN_BUMP) ml += ML_PER_CUP;
  const mlRounded = round(ml / 10) * 10;
  return { ml: mlRounded, cups: round(mlRounded / ML_PER_CUP) };
}

// ---------------------------------------------------------------------------
// Food suggestion for insight #4 ("Lead your next meal with {suggest}")
// ---------------------------------------------------------------------------

const FALLBACK_SUGGESTION = 'a lean protein';

/**
 * Starred favourite whose default portion best matches the protein still
 * needed without blowing the remaining calories, e.g.
 * "chicken tikka (200 g ≈ 50 g protein)". Falls back to "a lean protein".
 */
export function foodSuggestion(remainingProtein: number, remainingKcal: number, favorites: FoodItem[]): string {
  if (!(remainingProtein > 0)) return FALLBACK_SUGGESTION;
  const pool = favorites.filter((f) => f.starred);
  const candidates = (pool.length ? pool : favorites)
    .map((f) => {
      const grams = f.defaultGrams > 0 ? f.defaultGrams : 100;
      return { f, grams, p: (num(f.per100?.p) * grams) / 100, kc: (num(f.per100?.kc) * grams) / 100 };
    })
    .filter((c) => c.p >= 10); // a protein lead, not a side of rice
  if (!candidates.length) return FALLBACK_SUGGESTION;

  const kcalBudget = Math.max(0, num(remainingKcal));
  const fitsKcal = candidates.filter((c) => c.kc <= kcalBudget);
  const ranked = (fitsKcal.length ? fitsKcal : candidates).sort((a, b) => {
    const da = Math.abs(a.p - remainingProtein);
    const db = Math.abs(b.p - remainingProtein);
    if (da !== db) return da - db;
    // tie → denser protein (more g per kcal)
    return b.p / Math.max(1, b.kc) - a.p / Math.max(1, a.kc);
  });
  const best = ranked[0];
  return `${best.f.name.toLowerCase()} (${round(best.grams)} g ≈ ${round(best.p)} g protein)`;
}

// ---------------------------------------------------------------------------
// Frequency counters (§3 — for his labs; feeds §7 #13/#14)
// ---------------------------------------------------------------------------

export interface FrequencyCounters {
  redMeatServings: number;
  fishServings: number;
  seafoodServings: number;
  poultryServings: number;
  restaurantMeals: number;
  homeMeals: number;
  /** Every meal in the window, tagged or not. */
  totalMeals: number;
  /** restaurantMeals ÷ totalMeals × 100 (0 dp); null with no meals. */
  restaurantPct: number | null;
  homeCookedPct: number | null;
  /** Mean daily fiber (g, 1 dp) over logged days; null when none. */
  fiberAvg: number | null;
  /** Days in the window with ≥1 meal or kcal > 0. */
  daysLogged: number;
  /** Window length in calendar days ending at `asOf`. */
  days: number;
}

/** A day counts as logged with ≥1 meal or a positive stored kcal total. */
export function isLoggedDay(r: DailyRecord | undefined): boolean {
  if (!r) return false;
  return (r.meals?.length ?? 0) > 0 || num(r.kc) > 0;
}

export function frequencyCounters(records: DailyRecord[], asOf: ISODate, days = 7): FrequencyCounters {
  const n = Math.max(1, Math.floor(days));
  const dates = lastNDates(asOf, n);
  const start = dates[0];
  const out: FrequencyCounters = {
    redMeatServings: 0,
    fishServings: 0,
    seafoodServings: 0,
    poultryServings: 0,
    restaurantMeals: 0,
    homeMeals: 0,
    totalMeals: 0,
    restaurantPct: null,
    homeCookedPct: null,
    fiberAvg: null,
    daysLogged: 0,
    days: n,
  };
  const fiber: number[] = [];
  for (const r of records) {
    if (r.d < start || r.d > asOf) continue;
    if (isLoggedDay(r)) {
      out.daysLogged++;
      fiber.push(dayTotals(r).fi);
    }
    for (const m of r.meals ?? []) {
      out.totalMeals++;
      const tags = m.tags ?? [];
      if (tags.includes('red-meat')) out.redMeatServings++;
      if (tags.includes('fish')) out.fishServings++;
      if (tags.includes('seafood')) out.seafoodServings++;
      if (tags.includes('poultry')) out.poultryServings++;
      if (tags.includes('restaurant')) out.restaurantMeals++;
      if (tags.includes('home')) out.homeMeals++;
    }
  }
  if (out.totalMeals > 0) {
    out.restaurantPct = round((out.restaurantMeals / out.totalMeals) * 100);
    out.homeCookedPct = round((out.homeMeals / out.totalMeals) * 100);
  }
  const fAvg = mean(fiber);
  out.fiberAvg = fAvg === null ? null : round(fAvg, 1);
  return out;
}
