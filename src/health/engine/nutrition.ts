/**
 * §6.5 Nutrition — protein-first.
 *
 * Rules implemented here (all pure, deterministic, `now` passed in):
 * - Day type from the training split (`record.lift` overrides) drives carb
 *   cycling: lift 150–175 g / rest 70–100 g (§6.5 "auto-switched by split").
 * - Protein pacing across `mealSlots = max(mealsPerDay, ceil(protein / (0.55·kg)))`
 *   eating occasions. **0.55 g/kg/meal is a soft optimum, not a ceiling**
 *   (Schoenfeld & Aragon 2018; Trommelen 2023 showed a 100 g bolus is used, not
 *   wasted), so a per-meal need above it is a *note*, never a warning. The
 *   0.4 g/kg lower rail still nudges when a logged occasion lands under it.
 * - Daily protein floor: 1.6 g/kg body weight with 2.2 as the stretch
 *   (Morton 2018 meta-regression); in a deficit with a known body composition
 *   it scales to 2.3–3.1 g/kg **fat-free mass** (Helms 2014). Protein is never
 *   the macro that gets cut — `allocateKcalCut` takes a shortfall out of carbs
 *   first, then fat down to the floor, and reports what it cannot cover.
 * - Fat floor `max(60 g, 0.15·kcal/9)` — the 60 g absolute (Whittaker & Wu 2021:
 *   low-fat diets cut testosterone 10–15 %) with RP's 15 %-of-calories rule on
 *   top, so a 3,000 kcal day floors at 60 g and not 50. The projection assumes
 *   the remaining kcal arrive at a typical ~30 % fat share (§6 "fat floor
 *   ~28 % kcal"), not that every remaining kcal is fat (R3-6).
 * - Pre-sleep protein: ≥ 40 g when the last meal is more than 3 h before bed
 *   and the day is still under target (Trommelen 2023 — overnight MPS responds
 *   to a pre-sleep bolus; a long pre-sleep gap wastes the night).
 * - **Late eating is anchored to the circadian window, not the clock.** McHill
 *   2017 found body fat tracked caloric midpoint *relative to melatonin onset*,
 *   not clock time and not calories: `lateEatingScore` is the share of the
 *   day's kcal falling in the final fifth of the habitual wake window (wake and
 *   sleep-onset medians over 14 days), reported with the eating midpoint's
 *   offset from that window's centre. Bands none < 15 % / mild / high ≥ 30 %,
 *   with Vujović 2022's absolute "≥ 400 kcal within 60 min of bed" kept as an
 *   override. A 05:00-to-21:00 sleeper is no longer told 20:00 is fine.
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
import {
  hhmmToMinutes,
  lastNDates,
  minutesSinceNoon,
  minutesSinceNoonToHHMM,
  minutesToHHMM,
  weekdayOf,
} from '../lib/dates';
import { lbToKg, mean, round } from '../lib/format';
import { median } from './stats';

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

/** Absolute fat floor in grams — below this testosterone falls 10–15 % (Whittaker & Wu 2021). */
export const FAT_FLOOR_ABS_G = 60;
/** RP's rule: fat never below 15 % of calories. 0.15 · kcal / 9 kcal per gram. */
export const FAT_FLOOR_KCAL_SHARE = 0.15;

/**
 * `max(60 g, 0.15 · kcal / 9)` — the absolute floor and RP's 15 %-of-calories
 * rule, whichever bites harder, and never below a floor the user set higher.
 * The two meet at 3,600 kcal: below that the 60 g absolute governs (at
 * 1,950 kcal the 15 % rule would only ask for 32.5 g), above it the share does.
 */
export function effectiveFatFloor(targets: Targets): number {
  const kcal = num(targets.kcal);
  const byShare = kcal > 0 ? (kcal * FAT_FLOOR_KCAL_SHARE) / 9 : 0;
  const set = num(targets.fatFloor);
  return round(Math.max(FAT_FLOOR_ABS_G, byShare, set), 1);
}

/** Day-type-aware targets. Only carbs cycle; kcal/protein/fat/fiber are fixed. */
export function macroTargetsFor(type: DayType, targets: Targets): MacroTargets {
  const carbsRange: [number, number] = type === 'lift' ? [...targets.carbsLift] : [...targets.carbsRest];
  return {
    kc: targets.kcal,
    p: targets.protein,
    f: targets.fatTarget,
    fatFloor: effectiveFatFloor(targets),
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
/** Entries below this are drinks/condiments (black coffee, a splash of milk) and don't count as a meal slot. */
export const OCCASION_MIN_KCAL = 50;

/**
 * Entries this many minutes apart or less on the eating-day axis are one
 * sitting. **Heuristic** — no published definition of an "eating occasion"
 * fixes a gap; 45 min is long enough to hold a curry and the roti that
 * followed it, short enough that afternoon tea is its own occasion.
 */
export const OCCASION_GAP_MIN = 45;

export interface MealOccasion {
  /** Clock time of the first entry in the sitting. */
  t: HHMM;
  /** Every distinct clock time folded into this occasion, in order. */
  times: HHMM[];
  /** Summed macros of every entry in the sitting. */
  p: number;
  kc: number;
  /** Number of entries in the occasion. */
  n: number;
  /** Minutes from the first to the last entry of the sitting. */
  spanMin: number;
}

/**
 * Group meal entries into eating occasions. The NL logger and the demo data
 * store one entry per food ("chicken tikka" + "roti" at 13:00), so counting
 * entries would exhaust the day's meal slots by lunch; §6.5's "≥4 meals" means
 * occasions. Entries within `OCCASION_GAP_MIN` of each other on the eating-day
 * axis are one sitting (a 13:00 curry and the 13:20 roti that followed it), and
 * a sitting whose total lands under `OCCASION_MIN_KCAL` (a lone black coffee, a
 * splash of milk) is not an eating occasion at all. Sorted on the eating-day
 * axis, where times before 04:00 belong to the previous evening.
 */
export function mealOccasions(meals: Meal[] | undefined): MealOccasion[] {
  if (!meals || meals.length === 0) return [];
  const entries = meals
    .map((m) => ({ m, axis: mealClockMinutes(m.t) }))
    .filter((e): e is { m: Meal; axis: number } => e.axis !== null)
    .sort((a, b) => a.axis - b.axis);
  if (entries.length === 0) return [];

  const out: MealOccasion[] = [];
  let cur: MealOccasion | null = null;
  let lastAxis = 0;
  let firstAxis = 0;
  for (const { m, axis } of entries) {
    if (cur === null || axis - lastAxis > OCCASION_GAP_MIN) {
      cur = { t: m.t, times: [m.t], p: 0, kc: 0, n: 0, spanMin: 0 };
      out.push(cur);
      firstAxis = axis;
    } else if (!cur.times.includes(m.t)) {
      cur.times.push(m.t);
    }
    cur.p += num(m.p);
    cur.kc += num(m.kc);
    cur.n += 1;
    cur.spanMin = axis - firstAxis;
    lastAxis = axis;
  }
  return out.filter((o) => o.kc >= OCCASION_MIN_KCAL).map((o) => ({ ...o, p: round(o.p), kc: round(o.kc) }));
}

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

/**
 * Per-meal protein rails, g/kg body weight. 0.4 is the lower rail below which a
 * sitting under-stimulates MPS; **0.55 is a soft optimum, not a ceiling** —
 * Schoenfeld & Aragon 2018 put the per-meal plateau around there, and
 * Trommelen 2023 showed a 100 g bolus is still used rather than oxidised, so
 * the engine notes a bigger dose and never warns about one.
 */
export const PROTEIN_PER_MEAL_GKG: [number, number] = [0.4, 0.55];
/** No more meals are expected once bed is this close. */
const LAST_MEAL_CUTOFF_MIN = 60;

/**
 * `mealSlots = max(mealsPerDay, ceil(protein / (0.55 · kg)))` — the number of
 * eating occasions the day's protein wants, never fewer than the user's own
 * meal plan. 180 g at 78 kg needs ceil(180 / 42.9) = 5 slots even though the
 * plan says 4. Falls back to `mealsPerDay` when the body weight is unknown.
 */
export function mealSlots(targets: Targets, weightLb: number): number {
  const plan = Math.max(1, Math.floor(num(targets.mealsPerDay) || 1));
  const kg = lbToKg(weightLb > 0 ? weightLb : 0);
  const protein = num(targets.protein);
  const perMeal = PROTEIN_PER_MEAL_GKG[1] * kg;
  if (!(kg > 0) || !(protein > 0) || !(perMeal > 0)) return plan;
  return Math.max(plan, Math.ceil(protein / perMeal));
}

export interface ProteinPacing {
  soFar: number;
  /** target − soFar; negative once over target. */
  remaining: number;
  mealsLogged: number;
  mealsLeft: number;
  /** Eating occasions the day's protein wants — `mealSlots`. */
  slots: number;
  /** remaining ÷ mealsLeft (≥ 0); null when no meals are left. */
  perMealNeeded: number | null;
  minPerMeal: number;
  /** The 0.55 g/kg soft optimum — a note when exceeded, never a warning. */
  maxPerMeal: number;
  /** Protein (g) in the most recent eating occasion; null when none is logged. */
  lastMealProtein: number | null;
  /** The most recent meal delivered less than the 0.4 g/kg minimum. */
  lastMealBelowMin: boolean;
  /** The remaining meals each need more than the 0.55 g/kg soft optimum. */
  aboveOptimum: boolean;
  /** Target is reachable inside the 0.55 g/kg soft optimum. */
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
  const occasions = mealOccasions(record?.meals);
  const mealsLogged = occasions.length;
  const slots = mealSlots(targets, weightLb);

  const untilBed = minutesUntilBed(nowHHMM, bedTarget);
  const tooLate = untilBed !== null && untilBed <= LAST_MEAL_CUTOFF_MIN;
  const mealsLeft = tooLate ? 0 : Math.max(slots - mealsLogged, remaining > 0 ? 1 : 0);

  const perMealNeeded = mealsLeft > 0 ? round(Math.max(0, remaining) / mealsLeft) : null;
  // Judge the last *occasion* (all items eaten together), not the last entry.
  const lastOcc = occasions.length ? occasions[occasions.length - 1] : null;
  const lastMealProtein = lastOcc === null ? null : lastOcc.p;
  const lastMealBelowMin = lastOcc !== null && lastOcc.p < minPerMeal;
  const aboveOptimum = perMealNeeded !== null && perMealNeeded > maxPerMeal;
  const onPace = perMealNeeded === null ? remaining <= 0 : !aboveOptimum;

  return {
    soFar,
    remaining,
    mealsLogged,
    mealsLeft,
    slots,
    perMealNeeded,
    minPerMeal,
    maxPerMeal,
    lastMealProtein,
    lastMealBelowMin,
    aboveOptimum,
    onPace,
  };
}

// ---------------------------------------------------------------------------
// Daily protein floor (Morton 2018 / Helms 2014) and the "never cut protein" rule
// ---------------------------------------------------------------------------

/** Morton 2018 meta-regression: 1.6 g/kg body weight, 2.2 as the stretch. */
export const PROTEIN_GKG_BW: [number, number] = [1.6, 2.2];
/** Helms 2014: 2.3–3.1 g/kg **fat-free mass** while in an energy deficit. */
export const PROTEIN_GKG_FFM: [number, number] = [2.3, 3.1];

export interface ProteinFloor {
  /** Daily floor, g. */
  floor: number;
  /** The upper end of the band — worth aiming at in a hard deficit, g. */
  stretch: number;
  /** Which body mass the band was applied to. */
  basis: 'ffm' | 'bodyweight';
  /** The g/kg band actually used. */
  gPerKg: [number, number];
  /** Fat-free mass in kg when body composition is known. */
  ffmKg: number | null;
  kg: number;
  deficit: boolean;
  /** The configured daily protein target, when one was passed. */
  target: number | null;
  /** The configured target sits under the floor. */
  belowFloor: boolean;
}

/**
 * Daily protein floor. Baseline is Morton 2018's 1.6 g/kg body weight with 2.2
 * as the stretch; **in a deficit with a known body-fat percentage** it scales to
 * Helms 2014's 2.3–3.1 g/kg fat-free mass, which is the band that protects lean
 * mass when calories are low. Without a body composition the deficit keeps the
 * body-weight band — inventing a lean mass would invent the answer.
 */
export function proteinFloor(input: {
  weightLb: number;
  bodyFatPct?: number | null;
  deficit?: boolean;
  target?: number | null;
}): ProteinFloor {
  const kg = lbToKg(input.weightLb > 0 ? input.weightLb : 0);
  const deficit = input.deficit === true;
  const bf = typeof input.bodyFatPct === 'number' && Number.isFinite(input.bodyFatPct) ? input.bodyFatPct : null;
  const knownComp = bf !== null && bf > 0 && bf < 70;
  const ffmKg = knownComp ? round(kg * (1 - (bf as number) / 100), 1) : null;
  const useFfm = deficit && ffmKg !== null && ffmKg > 0;
  const gPerKg: [number, number] = useFfm ? [...PROTEIN_GKG_FFM] : [...PROTEIN_GKG_BW];
  const base = useFfm ? (ffmKg as number) : kg;
  const floor = round(gPerKg[0] * base);
  const stretch = round(gPerKg[1] * base);
  const target = typeof input.target === 'number' && Number.isFinite(input.target) ? input.target : null;
  return {
    floor,
    stretch,
    basis: useFfm ? 'ffm' : 'bodyweight',
    gPerKg,
    ffmKg,
    kg: round(kg, 1),
    deficit,
    target,
    belowFloor: target !== null && target < floor,
  };
}

export interface MacroCut {
  /** Grams taken out of carbohydrate. */
  fromCarbs: number;
  /** Grams taken out of fat (never below the floor). */
  fromFat: number;
  /** Always 0 — protein is never the macro that gets cut. */
  fromProtein: 0;
  /** kcal the cut could not reach without touching protein or the fat floor. */
  unmetKcal: number;
}

/**
 * Take `kcalToCut` out of the day's macros without touching protein:
 * carbohydrate first, then fat down to the floor. Whatever is left over is
 * returned as `unmetKcal` — the caller must shrink the deficit, not the
 * protein target (§6.5: protein is never the macro that gets cut).
 */
export function allocateKcalCut(kcalToCut: number, t: MacroTargets): MacroCut {
  const need = Math.max(0, num(kcalToCut));
  const carbKcal = Math.max(0, num(t.c)) * 4;
  const fatKcal = Math.max(0, num(t.f) - num(t.fatFloor)) * 9;
  const fromCarbKcal = Math.min(need, carbKcal);
  const fromFatKcal = Math.min(need - fromCarbKcal, fatKcal);
  return {
    fromCarbs: round(fromCarbKcal / 4, 1),
    fromFat: round(fromFatKcal / 9, 1),
    fromProtein: 0,
    unmetKcal: round(need - fromCarbKcal - fromFatKcal),
  };
}

// ---------------------------------------------------------------------------
// Pre-sleep protein (Trommelen 2023)
// ---------------------------------------------------------------------------

/** Pre-sleep bolus that measurably raises overnight MPS (Trommelen 2023). */
export const PRE_SLEEP_PROTEIN_G = 40;
/** A "long" pre-sleep gap — the last meal this far before bed leaves the night unfed. */
export const PRE_SLEEP_GAP_MIN = 3 * 60;

export interface PreSleepProteinNudge {
  show: boolean;
  /** The bolus to aim for, g. */
  grams: number;
  /** Protein still owed today (≤ 0 once the target is met). */
  remaining: number;
  lastMealTime: HHMM | null;
  /** Minutes from the last meal to bed; null when nothing is logged. */
  gapToBedMin: number | null;
  /** Minutes from `now` until bed; null when `now` was not given. */
  minutesToBed: number | null;
  /** Why the nudge is (not) showing — never a partial sentence for the UI to finish. */
  reason: string;
}

/**
 * "Take ≥ 40 g before bed." Fires only when the day is still under its protein
 * target AND the last logged meal sits more than 3 h before bed, i.e. the
 * overnight window would otherwise start unfed (Trommelen 2023). When `now` is
 * given it also waits until the final 3 h of the day, so the nudge lands when
 * it is actionable rather than at lunchtime.
 */
export function preSleepProtein(input: {
  meals: Meal[] | undefined;
  bedTarget: HHMM;
  proteinRemaining: number;
  nowHHMM?: HHMM;
}): PreSleepProteinNudge {
  const { meals, bedTarget, nowHHMM } = input;
  const remaining = round(num(input.proteinRemaining));
  const bedClock = hhmmToMinutes(bedTarget);
  const bedAxis = bedClock === null ? null : (mealClockMinutes(minutesToHHMM(bedClock)) as number);
  const last = lastMeal(meals);
  const lastAxis = last ? mealClockMinutes(last.t) : null;
  const gapToBedMin = bedAxis !== null && lastAxis !== null ? bedAxis - lastAxis : null;
  const minutesToBed = nowHHMM === undefined ? null : minutesUntilBed(nowHHMM, bedTarget);

  const base = {
    grams: PRE_SLEEP_PROTEIN_G,
    remaining,
    lastMealTime: last ? last.t : null,
    gapToBedMin,
    minutesToBed,
  };
  if (remaining <= 0) return { ...base, show: false, reason: 'protein target already met' };
  if (gapToBedMin === null) return { ...base, show: false, reason: 'no meal logged yet' };
  if (gapToBedMin <= PRE_SLEEP_GAP_MIN) return { ...base, show: false, reason: 'last meal is already close to bed' };
  if (minutesToBed !== null && (minutesToBed > PRE_SLEEP_GAP_MIN || minutesToBed <= 0)) {
    return { ...base, show: false, reason: 'not yet in the pre-sleep window' };
  }
  return { ...base, show: true, reason: `last meal was ${round(gapToBedMin / 60, 1)} h before bed` };
}

// ---------------------------------------------------------------------------
// Fat floor (§6.2/§6.5 — never below 60 g)
// ---------------------------------------------------------------------------

/**
 * Share of the remaining kcal assumed to arrive as fat when projecting the
 * day's total (§6: the 60 g floor is ~28 % of 1,950 kcal). Assuming 100 % made
 * the warning impossible before 20:00 unless < 9 × gap kcal remained (R3-6).
 */
export const FAT_KCAL_SHARE = 0.3;
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
  /** Fat projected for the day: current fat plus ~30 % of the remaining kcal as fat (nothing more after 20:00). */
  projectedFat: number;
  /** floor − projectedFat, ≥ 0. */
  shortBy: number;
  /** The floor actually applied — `max(60 g, 0.15 · kcal / 9, targets.fatFloor)`. */
  floor: number;
}

/**
 * Below the floor when current fat < floor AND the projected day — logged so
 * far plus a typical ~30 % fat share of the remaining kcal — lands under it,
 * or when it is late in the day (after 20:00 any shortfall counts). The floor
 * is the effective one (`effectiveFatFloor`), not the stored constant.
 */
export function fatFloorCheck(totals: Macros, remainingKcal: number, targets: Targets, nowHHMM?: HHMM): FatFloorCheck {
  const fat = num(totals.f);
  const floor = effectiveFatFloor(targets);
  const gap = floor - fat;
  if (gap <= 0) return { belowFloor: false, projectedFat: round(fat, 1), shortBy: 0, floor };
  const late = isLateInDay(nowHHMM);
  const coverable = late ? 0 : Math.min(gap, (Math.max(0, num(remainingKcal)) * FAT_KCAL_SHARE) / 9);
  const projectedFat = round(fat + coverable, 1);
  const shortBy = round(Math.max(0, floor - projectedFat), 1);
  return { belowFloor: shortBy > 0, projectedFat, shortBy, floor };
}

// ---------------------------------------------------------------------------
// Late eating — circadian, not clock (McHill 2017; Vujović 2022 override)
// ---------------------------------------------------------------------------

/** A "large late-evening load" is at least this many kcal (Vujović 2022). */
export const LATE_LOAD_KCAL = 400;
const LATE_WINDOW_MIN = 3 * 60;

/**
 * The late window is the final fifth of the habitual wake period. McHill 2017
 * measured caloric midpoint against **melatonin onset**, and body fat tracked
 * that relative timing rather than clock time or total calories; the exposure
 * in that literature sits in the last 20–25 % of the waking day, and the engine
 * uses the conservative 20 %. For a 16 h day that is the last 3 h 12 min.
 */
export const LATE_WINDOW_SHARE = 0.2;
/**
 * Bands for the share of the day's kcal landing in that window, %.
 * **Heuristic cut points**: McHill 2017 reports a continuous association, not
 * thresholds, so these are chosen to make the card actionable and are exposed
 * so the UI copy can say they are the app's lines, not the paper's.
 */
export const LATE_SHARE_MILD_PCT = 15;
export const LATE_SHARE_HIGH_PCT = 30;
/** Absolute override: this many kcal inside this many minutes of bed is "high" whatever the share. */
export const LATE_NEAR_BED_MIN = 60;

/** Days of history the habitual wake window is built from (two weeks — the same window the sleep stack uses for debt). */
export const WAKE_WINDOW_DAYS = 14;
/** Below this many logged nights the medians are not the user's habit — fall back to their targets. Heuristic, matched to the 3-night gate on bedtime consistency. */
export const WAKE_WINDOW_MIN_NIGHTS = 3;
/** Sanity rails on the derived wake period, minutes — guards against a typo'd bedtime, not a physiological claim. */
const WAKE_WINDOW_MIN_LEN = 6 * 60;
const WAKE_WINDOW_MAX_LEN = 20 * 60;

export interface WakeWindow {
  /** Median wake time. */
  wake: HHMM;
  /** Median sleep onset. */
  sleep: HHMM;
  /** Start of the late window (sleep onset − 20 % of the period). */
  lateStart: HHMM;
  /** Minutes since midnight of the median wake — the origin of this axis. */
  wakeMin: number;
  /** Sleep onset on the same axis (always > wakeMin; may exceed 1440). */
  sleepMin: number;
  /** sleepMin − wakeMin. */
  lengthMin: number;
  /** Midpoint of the wake period on the same axis. */
  centreMin: number;
  /** Start of the late window on the same axis. */
  lateStartMin: number;
  /** Nights behind the medians (the smaller of the wake and sleep counts). */
  nights: number;
  /** Whether both medians, one, or neither came from logged nights. */
  source: 'observed' | 'mixed' | 'target';
}

/** Minutes on the wake-window axis: everything is measured forward from the median wake. */
function onWakeAxis(t: HHMM | undefined | null, wakeMin: number): number | null {
  const m = hhmmToMinutes(t);
  if (m === null) return null;
  return m >= wakeMin ? m : m + 1440;
}

/**
 * The user's habitual wake period: medians of the logged wake times (`wk`) and
 * sleep onsets (`bt`) over the last `days` days, falling back to their
 * wake/bed targets for whichever side has fewer than `WAKE_WINDOW_MIN_NIGHTS`
 * nights. Bedtimes are averaged on the noon-anchored axis so 23:40 and 00:20
 * do not median to lunchtime.
 */
export function habitualWakeWindow(
  records: DailyRecord[],
  asOf: ISODate,
  targetsHHMM: { wakeTarget: HHMM; bedTarget: HHMM },
  days = WAKE_WINDOW_DAYS,
): WakeWindow {
  const n = Math.max(1, Math.floor(days));
  const window = new Set(lastNDates(asOf, n));
  const wakes: number[] = [];
  const beds: number[] = [];
  for (const r of records) {
    if (!window.has(r.d)) continue;
    const w = hhmmToMinutes(r.wk);
    if (w !== null) wakes.push(w);
    const b = minutesSinceNoon(r.bt);
    if (b !== null) beds.push(b);
  }
  const wakeObserved = wakes.length >= WAKE_WINDOW_MIN_NIGHTS;
  const bedObserved = beds.length >= WAKE_WINDOW_MIN_NIGHTS;
  const wakeHHMM = wakeObserved ? minutesToHHMM(median(wakes) as number) : targetsHHMM.wakeTarget;
  const bedHHMM = bedObserved ? minutesSinceNoonToHHMM(median(beds) as number) : targetsHHMM.bedTarget;

  const wakeMin = hhmmToMinutes(wakeHHMM) ?? 7 * 60;
  const bedClock = hhmmToMinutes(bedHHMM) ?? 23 * 60;
  let sleepMin = bedClock > wakeMin ? bedClock : bedClock + 1440;
  let lengthMin = sleepMin - wakeMin;
  if (lengthMin > WAKE_WINDOW_MAX_LEN) lengthMin = sleepMin - 1440 - wakeMin;
  if (lengthMin < WAKE_WINDOW_MIN_LEN) lengthMin = WAKE_WINDOW_MIN_LEN;
  sleepMin = wakeMin + lengthMin;

  const lateStartMin = sleepMin - Math.round(lengthMin * LATE_WINDOW_SHARE);
  const source: WakeWindow['source'] =
    wakeObserved && bedObserved ? 'observed' : wakeObserved || bedObserved ? 'mixed' : 'target';
  return {
    wake: minutesToHHMM(wakeMin),
    sleep: minutesToHHMM(sleepMin),
    lateStart: minutesToHHMM(lateStartMin),
    wakeMin,
    sleepMin,
    lengthMin,
    centreMin: wakeMin + lengthMin / 2,
    lateStartMin,
    nights: Math.min(wakes.length, beds.length),
    source,
  };
}

export type LateSeverity = 'none' | 'mild' | 'high';

export interface LateEatingScore {
  /** Share of the day's kcal inside the late window, % (null when nothing is logged). */
  sharePct: number | null;
  severity: LateSeverity;
  kcalLate: number;
  kcalTotal: number;
  /** kcal logged within `LATE_NEAR_BED_MIN` of sleep onset (or later). */
  kcalNearBed: number;
  /** True when the ≥ 400 kcal-near-bed clause forced `high` on its own. */
  override: boolean;
  /** Midpoint between the first and last caloric entry; null with no meals. */
  eatingMidpoint: HHMM | null;
  /** eatingMidpoint − the wake period's centre, minutes (+ = later than the middle of the day). */
  midpointOffsetMin: number | null;
  /** Clock time the late window opens. */
  lateStart: HHMM;
  window: WakeWindow;
}

/**
 * Share of today's kcal landing in the final fifth of the habitual wake window
 * (McHill 2017), with Vujović 2022's absolute "≥ 400 kcal within 60 min of bed"
 * kept as an override. Entries with no kcal (water, a black coffee logged at 0)
 * do not move the eating midpoint.
 */
export function lateEatingScore(meals: Meal[] | undefined, window: WakeWindow): LateEatingScore {
  let kcalTotal = 0;
  let kcalLate = 0;
  let kcalNearBed = 0;
  let first: number | null = null;
  let last: number | null = null;
  for (const m of meals ?? []) {
    const kc = num(m.kc);
    const axis = onWakeAxis(m.t, window.wakeMin);
    if (axis === null || kc <= 0) continue;
    kcalTotal += kc;
    if (axis >= window.lateStartMin) kcalLate += kc;
    if (axis >= window.sleepMin - LATE_NEAR_BED_MIN) kcalNearBed += kc;
    if (first === null || axis < first) first = axis;
    if (last === null || axis > last) last = axis;
  }
  kcalTotal = round(kcalTotal);
  kcalLate = round(kcalLate);
  kcalNearBed = round(kcalNearBed);

  const sharePct = kcalTotal > 0 ? round((kcalLate / kcalTotal) * 100, 1) : null;
  const override = kcalNearBed >= LATE_LOAD_KCAL;
  let severity: LateSeverity = 'none';
  if (override) severity = 'high';
  else if (sharePct !== null && sharePct >= LATE_SHARE_HIGH_PCT) severity = 'high';
  else if (sharePct !== null && sharePct >= LATE_SHARE_MILD_PCT) severity = 'mild';

  const mid = first !== null && last !== null ? (first + last) / 2 : null;
  return {
    sharePct,
    severity,
    kcalLate,
    kcalTotal,
    kcalNearBed,
    override,
    eatingMidpoint: mid === null ? null : minutesToHHMM(mid),
    midpointOffsetMin: mid === null ? null : round(mid - window.centreMin),
    lateStart: window.lateStart,
    window,
  };
}

export interface LateEatingCheck {
  late: boolean;
  lastMealTime: HHMM | null;
  kcalWithin3h: number;
  /** Where the last substantial meal should land: the late-window start, or bed − 3 h without a window. */
  suggestedLastMeal: HHMM;
  /** Minutes from `nowHHMM` until the suggested last-meal time (negative once passed); null when `now` not given. */
  minutesToCutoff: number | null;
  /** Circadian score — present only when a wake window was supplied. */
  score: LateEatingScore | null;
}

/**
 * Late-eating state for the Today card. **Pass `window`**: with it, `late`
 * follows the circadian rule (share of kcal in the final fifth of the wake
 * period, plus the near-bed override) and the suggested cutoff is the start of
 * that window, so a 05:00-to-21:00 sleeper is told 20:00 is late. Without it
 * the function falls back to the old fixed "≥ 400 kcal within 3 h of the bed
 * target" clock rule, which is wrong for anyone whose day is not centred on a
 * 23:00 bedtime and is kept only so legacy callers keep compiling.
 */
export function lateEatingCheck(
  meals: Meal[] | undefined,
  bedTarget: HHMM,
  nowHHMM?: HHMM,
  window?: WakeWindow | null,
): LateEatingCheck {
  const bedClock = hhmmToMinutes(bedTarget) ?? 23 * 60;
  const bedAxis = mealClockMinutes(minutesToHHMM(bedClock)) as number;
  const clockWindowStart = bedAxis - LATE_WINDOW_MIN;

  let kcalWithin3h = 0;
  for (const m of meals ?? []) {
    const t = mealClockMinutes(m.t);
    if (t !== null && t >= clockWindowStart) kcalWithin3h += num(m.kc);
  }
  kcalWithin3h = round(kcalWithin3h);

  const score = window ? lateEatingScore(meals, window) : null;
  const cutoffClock = score ? (hhmmToMinutes(score.lateStart) as number) : bedClock - LATE_WINDOW_MIN;
  const suggestedLastMeal = minutesToHHMM(cutoffClock);
  const windowStart = score ? (mealClockMinutes(suggestedLastMeal) as number) : clockWindowStart;

  const last = lastMeal(meals);
  const nowAxis = nowHHMM === undefined ? null : mealClockMinutes(nowHHMM);
  const minutesToCutoff = nowAxis === null ? null : windowStart - nowAxis;

  return {
    late: score ? score.severity !== 'none' : kcalWithin3h >= LATE_LOAD_KCAL,
    lastMealTime: last ? last.t : null,
    kcalWithin3h,
    suggestedLastMeal,
    minutesToCutoff,
    score,
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
