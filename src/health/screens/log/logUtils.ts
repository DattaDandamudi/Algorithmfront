/**
 * Pure helpers for the Log screen (SPEC §2). No React, no clock access —
 * every function takes `now`/`today` explicitly so it is unit-testable.
 *
 * Conventions honoured here (INTEGRATION_NOTES):
 * - Sleep record semantics: on record D, `bt` describes the sleep that ENDED
 *   on the morning of D. "Going to bed" pressed in the evening therefore
 *   writes to TOMORROW's record; pressed after midnight it writes to today's.
 *   The night boundary is 04:00 (same as the engine's eating-day start):
 *   anything before 04:00 still counts as the PREVIOUS calendar day's
 *   bedtime. See `bedtimeNightOf` / `bedtimeRecordDate`.
 * - Meals are one entry per food item sharing a clock time `t`; the list is
 *   grouped by `t` and "meals" means eating occasions (`mealOccasions`).
 * - Weights are stored in lb; `profile.units` only changes display.
 */
import type { FoodEstimate, FoodEstimateItem, FoodItem, HHMM, ISODate, Macros, Meal, MealSource } from '../../data/types';
import { findFood, normalise } from '../../ai/foodDb';
import { AI_UNAVAILABLE_NOTE } from '../../ai/food';
import { addDays, hhmmToMinutes, minutesToHHMM, toISODate } from '../../lib/dates';
import { kgToLb, lbToKg, round } from '../../lib/format';
import { mealClockMinutes, mealOccasions } from '../../engine/nutrition';

// ---------------------------------------------------------------------------
// Bedtime
// ---------------------------------------------------------------------------

/**
 * Night rollover hour. A "Going to bed" press before 04:00 is a late night
 * that belongs to the PREVIOUS calendar day (00:20 on 7 Sep is still the
 * night of 6 Sep); from 04:00 onwards a press belongs to the current day's
 * night. 04:00 matches the engine's eating-day boundary (nutrition.ts
 * EATING_DAY_START_MIN) so a 00:20 supper and a 00:30 bedtime land on the
 * same night.
 */
export const BEDTIME_ROLLOVER_HOUR = 4;

/**
 * The calendar date of the night a "Going to bed" press belongs to:
 *   23:10 on 6 Sep → 2026-09-06
 *   00:20 on 7 Sep → 2026-09-06 (before 04:00 → previous day)
 *   04:00 on 7 Sep → 2026-09-07
 */
export function bedtimeNightOf(now: Date): ISODate {
  const today = toISODate(now);
  return now.getHours() < BEDTIME_ROLLOVER_HOUR ? addDays(today, -1) : today;
}

/**
 * Which record a "Going to bed" press writes `bt` to. The bedtime lives on
 * the record of the morning the sleep ENDS on (engine/sleep.ts), i.e. the
 * night's date + 1:
 *   23:10 on 6 Sep → night of 6 Sep → record 2026-09-07
 *   00:20 on 7 Sep → night of 6 Sep → record 2026-09-07 (same night)
 *   04:00 on 7 Sep → night of 7 Sep → record 2026-09-08
 */
export function bedtimeRecordDate(now: Date): ISODate {
  return addDays(bedtimeNightOf(now), 1);
}

// ---------------------------------------------------------------------------
// Meals list grouping
// ---------------------------------------------------------------------------

export interface MealGroup {
  t: HHMM;
  meals: Meal[];
  kc: number;
  p: number;
  /** True when the group counts as an eating occasion (≥ 50 kcal in total). */
  isOccasion: boolean;
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/**
 * Group entries by clock time on the eating-day axis (a 00:20 supper sorts
 * after dinner). `mealOccasions` decides which groups are real meals; trivial
 * groups (a lone black coffee) are still listed so the user can edit them.
 */
export function groupMealsByTime(meals: Meal[] | undefined): MealGroup[] {
  if (!meals || meals.length === 0) return [];
  const occasions = new Set(mealOccasions(meals).map((o) => o.t));
  const map = new Map<HHMM, MealGroup>();
  for (const m of meals) {
    const g = map.get(m.t) ?? { t: m.t, meals: [], kc: 0, p: 0, isOccasion: occasions.has(m.t) };
    g.meals.push(m);
    g.kc += num(m.kc);
    g.p += num(m.p);
    map.set(m.t, g);
  }
  return [...map.values()]
    .map((g) => ({ ...g, kc: round(g.kc), p: round(g.p) }))
    .sort((a, b) => (mealClockMinutes(a.t) ?? 0) - (mealClockMinutes(b.t) ?? 0));
}

/** Sum of a macro over meals. */
export function sumMacros(meals: Meal[] | undefined): Macros {
  const s = { kc: 0, p: 0, f: 0, c: 0, fi: 0 };
  for (const m of meals ?? []) {
    s.kc += num(m.kc);
    s.p += num(m.p);
    s.f += num(m.f);
    s.c += num(m.c);
    s.fi += num(m.fi);
  }
  return { kc: round(s.kc), p: round(s.p), f: round(s.f), c: round(s.c), fi: round(s.fi, 1) };
}

// ---------------------------------------------------------------------------
// Estimate items ↔ meals / library foods
// ---------------------------------------------------------------------------

/** Persisted meal → editable estimate item (opens the same card as the AI bar). */
export function mealToEstimateItem(m: Meal): FoodEstimateItem {
  return {
    name: m.n,
    grams: num(m.g),
    kcal: num(m.kc),
    protein_g: num(m.p),
    fat_g: num(m.f),
    carbs_g: num(m.c),
    fiber_g: num(m.fi),
    // A manual/favourite entry has no AI confidence; treat it as confirmed.
    confidence: typeof m.conf === 'number' ? m.conf : 1,
    assumptions: m.as ?? '',
    tags: m.tags ? [...m.tags] : [],
  };
}

/** Sum over estimate items for the sheet's total row. */
export function estimateTotals(items: FoodEstimateItem[]): Macros {
  const s = { kc: 0, p: 0, f: 0, c: 0, fi: 0 };
  for (const it of items) {
    s.kc += num(it.kcal);
    s.p += num(it.protein_g);
    s.f += num(it.fat_g);
    s.c += num(it.carbs_g);
    s.fi += num(it.fiber_g);
  }
  return { kc: round(s.kc), p: round(s.p), f: round(s.f), c: round(s.c), fi: round(s.fi, 1) };
}

/** Score at/above which a name match is treated as the same library food. */
const SAME_FOOD_SCORE = 0.95;

export function slugId(name: string, prefix = 'rec'): string {
  const slug = normalise(name).replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 40) || 'food';
  return `${prefix}_${slug}`;
}

/**
 * The library FoodItem a saved estimate item corresponds to, for
 * `actions.touchRecent`. An exact name/alias match in favorites, recents or
 * the built-in DB wins; otherwise a new item is synthesised from the estimate
 * (per-100 g macros back-computed from the portion) so an AI-logged dish is
 * one tap away next time.
 */
export function foodItemFromEstimate(item: FoodEstimateItem, extra: FoodItem[] = []): FoodItem {
  const best = findFood(item.name, extra)[0];
  if (best && best.score >= SAME_FOOD_SCORE) return best.item;
  const g = num(item.grams);
  const k = g > 0 ? 100 / g : 0;
  const per100: Macros = {
    kc: round(num(item.kcal) * k),
    p: round(num(item.protein_g) * k, 1),
    f: round(num(item.fat_g) * k, 1),
    c: round(num(item.carbs_g) * k, 1),
    fi: round(num(item.fiber_g) * k, 1),
  };
  return {
    id: slugId(item.name),
    name: item.name.trim() || 'Unnamed item',
    per100,
    defaultGrams: g > 0 ? round(g) : 100,
    tags: item.tags ? [...item.tags] : [],
    cuisine: 'generic',
  };
}

/**
 * Meal source for a text-bar save. Both the Claude and the local-parser paths
 * are 'ai': they carry a confidence and an assumptions string that the meal
 * list and the edit card surface later (itemToMeal keeps `conf` only for
 * src 'ai'). The assumptions text already says when the local parser was used.
 */
export const ESTIMATE_MEAL_SRC: MealSource = 'ai';

export type EstimateOrigin = 'claude' | 'local' | 'ai-fallback';

/** Where the numbers came from — drives the note under the estimate card. */
export function estimateOrigin(est: FoodEstimate): EstimateOrigin {
  if (est.source === 'claude') return 'claude';
  const first = est.items[0];
  if (first && first.assumptions.startsWith(AI_UNAVAILABLE_NOTE)) return 'ai-fallback';
  return 'local';
}

export const LOCAL_ESTIMATE_NOTE = 'Local estimate — connect an AI key in Settings for better accuracy';
export const AI_FALLBACK_NOTE = 'AI unavailable right now — this is the local estimate. Check the numbers before saving.';

export function estimateNote(origin: EstimateOrigin): string | null {
  if (origin === 'local') return LOCAL_ESTIMATE_NOTE;
  if (origin === 'ai-fallback') return AI_FALLBACK_NOTE;
  return null;
}

/** Append a clarifying answer to the original description for a re-estimate. */
export function appendClarification(text: string, answer: string): string {
  const a = answer.trim();
  if (!a) return text;
  return `${text.trim()} (${a})`;
}

// ---------------------------------------------------------------------------
// Tobacco note stamps ("cig 14:32")
// ---------------------------------------------------------------------------

export const NOTE_SEPARATOR = ' · ';
const STAMP_RE = /\bcig (\d{2}:\d{2})\b/g;

/** Append a short entry to a free-text note, keeping existing content. */
export function appendNote(note: string | undefined, entry: string): string {
  const cur = (note ?? '').trim();
  return cur ? `${cur}${NOTE_SEPARATOR}${entry}` : entry;
}

export function tobaccoStamp(time: HHMM): string {
  return `cig ${time}`;
}

/** Times recorded as "cig HH:MM" in a note, in the order written. */
export function tobaccoStampsFromNote(note: string | undefined): HHMM[] {
  if (!note) return [];
  const out: HHMM[] = [];
  for (const m of note.matchAll(STAMP_RE)) out.push(m[1]);
  return out;
}

// ---------------------------------------------------------------------------
// Weight units
// ---------------------------------------------------------------------------

export type Units = 'lb' | 'kg';

/** Stored lb → the user's display unit, 1 dp. */
export function lbToDisplay(lb: number, units: Units): number {
  return round(units === 'kg' ? lbToKg(lb) : lb, 1);
}

/** Display-unit value → lb for storage, 1 dp. */
export function displayToLb(value: number, units: Units): number {
  return round(units === 'kg' ? kgToLb(value) : value, 1);
}

// ---------------------------------------------------------------------------
// Caffeine
// ---------------------------------------------------------------------------

/** Copy of `xs` with the first occurrence of `v` removed (duplicate times are separate logs). */
export function withoutOne<T>(xs: readonly T[], v: T): T[] {
  const i = xs.indexOf(v);
  return i < 0 ? [...xs] : [...xs.slice(0, i), ...xs.slice(i + 1)];
}

/** True when `now` is later than the caffeine cutoff on the same clock day. */
export function isAfterCutoff(now: HHMM, cutoff: HHMM): boolean {
  const n = hhmmToMinutes(now);
  const c = hhmmToMinutes(cutoff);
  return n !== null && c !== null && n > c;
}

/** Normalised HH:MM from a <input type="time"> value, or the fallback when malformed. */
export function normaliseTime(value: string, fallback: HHMM): HHMM {
  const m = hhmmToMinutes(value);
  return m === null ? fallback : minutesToHHMM(m);
}
