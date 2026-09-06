/**
 * Deterministic 45-day demo dataset for the spec persona (26 y, 172 lb-ish,
 * fat-loss phase, WHOOP wearer, Indian / Middle-Eastern restaurant food,
 * quitting tobacco). Loaded by `actions.loadDemoData()`.
 *
 * Why it looks the way it does (all numbers trace back to SPEC §6):
 *  - Weight: true trend −1.05 lb/wk (inside the 0.86–1.72 lb/wk target band)
 *    under 0.9 lb daily noise plus 1.5–2 lb water bumps the morning after a
 *    biryani / heavy restaurant day — so "trust the trend, not the dot" is
 *    visible. 1–2 weigh-ins are skipped per week but the last 7 days always
 *    have ≥ 5 so the §6.2 expenditure gate passes.
 *  - HRV lives in ln-space around a 58 ms baseline (SD 0.12), dipping after
 *    smoking-heavy or short-sleep nights (§6.3, nicotine evidence); RHR ~52.
 *    Recovery is a linear blend of ln-HRV, sleep and RHR so bands correlate.
 *  - Sleep need = baseline + f(strain) + f(debt) − naps (§6.4); debt decays.
 *  - Nutrition lands in 1,850–2,150 kcal / 160–195 g protein / 55–80 g fat
 *    (2–3 days under the 60 g floor to trigger §7 #6), carbs higher on lift
 *    days (§6.5), fiber 18–34 g. Coffee is logged as a 2 kcal meal tagged
 *    'caffeine' and mirrored into `caf` so the §6.4 cutoff nudge can fire.
 *  - Today (endDate) is a partial day: weigh-in, WHOOP morning data, coffee,
 *    breakfast + lunch (~85 g protein), ~4,200 steps, no tobacco yet.
 *  - The stress stack (§1h): Hooper check-in items on ~80 % of past days,
 *    correlated with that day's recovery (r ≈ −0.75 on the Hooper sum) but not
 *    a re-labelling of it: about a quarter of days the two land on opposite
 *    sides of their medians, which is the whole reason to collect both;
 *    respiratory rate, skin temperature and SpO₂ around plausible means;
 *    ~2 drinking evenings a week whose *next* morning carries the published
 *    alcohol effect (−7 ms HRV, +3 bpm RHR per two drinks, PLOS Digital Health
 *    2024); and a seeded 4-day illness episode 15 days back (RR +3, skin temp
 *    +0.5 °C, HRV −20 %, RHR +6, recovery held under 30) so the strain index,
 *    the illness flag and the behaviour-impact engine all have something real
 *    on first launch.
 *
 * Determinism: four independent mulberry32 streams (physiology, food plan,
 * scheduling, workouts). The physiology stream draws the same number of values
 * every day (all draws happen up front, before any branch) so the sequence is
 * identical for any endDate; only weekday-dependent *branches* (lift days,
 * weekend late nights) change what those values become. Day-to-day size is
 * ~1.5 KB because every food item is its own meal entry (45 days ≈ 70 KB).
 *
 * `generateDemoWorkouts` runs on its own stream (`DEMO_SEED + 303`) and is a
 * separate export, so adding it cannot shift a single physiology or food
 * value: the `DailyRecord[]` is byte-identical whether or not workouts are
 * generated (asserted in seed.test.ts).
 */
import type {
  AppSettings,
  CardioDetail,
  DailyRecord,
  FoodTag,
  HHMM,
  ISODate,
  Macros,
  Meal,
  MealSource,
  Program,
  SessionType,
  SetEntry,
  TrainingSplit,
  Weekday,
  Workout,
  WorkoutExercise,
} from './types';
import { DEFAULT_FAVORITES, DEFAULT_SPLIT } from './defaults';
import { lastNDates, minutesSinceNoonToHHMM, minutesToHHMM, weekdayOf } from '../lib/dates';
import { clamp, round } from '../lib/format';
import { createRng, DEMO_SEED, type Rng } from './prng';
import { DEFAULT_PROGRAMS, exerciseById } from '../engine/exerciseDb';
import { LOAD_INCREMENT_KG } from '../engine/strength';

// ---------------------------------------------------------------------------
// Food library: favorites from defaults.ts + a few home basics
// ---------------------------------------------------------------------------

interface DemoFood {
  id: string;
  name: string;
  per100: Macros;
  tags: FoodTag[];
  src: MealSource;
  /** Gram bounds the planner may scale within (he weighs food, so multiples of 5 g). */
  min: number;
  max: number;
}

const FAV_BOUNDS: Record<string, [number, number]> = {
  fav_chicken_tikka: [120, 320],
  fav_seekh_kebab: [100, 220],
  fav_tandoori_prawns: [120, 260],
  fav_lamb_chops: [120, 200],
  fav_chicken_biryani: [280, 420],
  fav_chicken_shawarma: [220, 320],
  fav_roti: [40, 160],
  fav_naan: [45, 180],
  fav_rice: [80, 300],
};

const EXTRAS: DemoFood[] = [
  { id: 'x_dal', name: 'Dal tadka', per100: { kc: 120, p: 7, f: 4, c: 15, fi: 4 }, tags: ['legume', 'home'], src: 'manual', min: 150, max: 300 },
  { id: 'x_chana', name: 'Chana masala', per100: { kc: 130, p: 7, f: 4, c: 18, fi: 6 }, tags: ['legume', 'home'], src: 'manual', min: 150, max: 300 },
  { id: 'x_eggs', name: 'Eggs, scrambled', per100: { kc: 150, p: 12.5, f: 10.5, c: 1.2, fi: 0 }, tags: ['egg', 'home'], src: 'manual', min: 100, max: 200 },
  { id: 'x_bhurji', name: 'Egg bhurji', per100: { kc: 170, p: 12, f: 12, c: 4, fi: 1 }, tags: ['egg', 'restaurant'], src: 'manual', min: 120, max: 200 },
  { id: 'x_paratha', name: 'Paratha', per100: { kc: 320, p: 7, f: 12, c: 45, fi: 4 }, tags: ['grain', 'restaurant'], src: 'manual', min: 50, max: 150 },
  { id: 'x_whey', name: 'Whey protein shake', per100: { kc: 380, p: 78, f: 5, c: 8, fi: 1 }, tags: ['dairy', 'home'], src: 'manual', min: 20, max: 70 },
  { id: 'x_yogurt', name: 'Greek yogurt 2%', per100: { kc: 70, p: 10, f: 2, c: 4, fi: 0 }, tags: ['dairy', 'home'], src: 'manual', min: 100, max: 300 },
  { id: 'x_oats', name: 'Oats (dry)', per100: { kc: 380, p: 13, f: 7, c: 66, fi: 10 }, tags: ['grain', 'home'], src: 'manual', min: 30, max: 80 },
  { id: 'x_coffee', name: 'Black coffee', per100: { kc: 1, p: 0.1, f: 0, c: 0, fi: 0 }, tags: ['caffeine', 'home'], src: 'manual', min: 250, max: 250 },
  { id: 'x_fish_tikka', name: 'Fish tikka', per100: { kc: 160, p: 22, f: 7, c: 3, fi: 0.3 }, tags: ['fish', 'restaurant'], src: 'manual', min: 150, max: 280 },
  { id: 'x_salmon', name: 'Grilled salmon', per100: { kc: 200, p: 22, f: 12, c: 0, fi: 0 }, tags: ['fish', 'home'], src: 'manual', min: 120, max: 220 },
  { id: 'x_hummus', name: 'Hummus', per100: { kc: 170, p: 8, f: 10, c: 14, fi: 6 }, tags: ['legume', 'restaurant'], src: 'manual', min: 50, max: 120 },
  { id: 'x_almonds', name: 'Almonds', per100: { kc: 580, p: 21, f: 50, c: 22, fi: 12.5 }, tags: ['home'], src: 'manual', min: 10, max: 45 },
  { id: 'x_salad', name: 'Kachumber salad', per100: { kc: 35, p: 1.5, f: 0.5, c: 7, fi: 2.5 }, tags: ['veg'], src: 'manual', min: 100, max: 250 },
  { id: 'x_sabzi', name: 'Mixed veg sabzi', per100: { kc: 60, p: 2.5, f: 2.5, c: 8, fi: 3.5 }, tags: ['veg'], src: 'manual', min: 100, max: 250 },
  { id: 'x_berries', name: 'Mixed berries', per100: { kc: 55, p: 0.8, f: 0.3, c: 12, fi: 4 }, tags: ['veg', 'home'], src: 'manual', min: 100, max: 200 },
];

const FOODS: Record<string, DemoFood> = Object.fromEntries(
  [
    ...DEFAULT_FAVORITES.map<DemoFood>((f) => ({
      id: f.id,
      name: f.name,
      per100: f.per100,
      tags: f.tags ?? [],
      src: 'favorite',
      min: FAV_BOUNDS[f.id]?.[0] ?? 50,
      max: FAV_BOUNDS[f.id]?.[1] ?? 400,
    })),
    ...EXTRAS,
  ].map((f) => [f.id, f]),
);

// ---------------------------------------------------------------------------
// Meal templates (eating occasions). Roles drive the macro fitter:
//   P = protein source scaled to hit the protein target
//   C = carb side scaled to close the carb / kcal budget
//   X = fixed portion (biryani, shawarma, legumes, coffee, almonds)
//   V = veg / fruit (fixed portion, grown or shrunk to land fiber)
// ---------------------------------------------------------------------------

type Role = 'P' | 'C' | 'X' | 'V';
type Venue = 'home' | 'restaurant';
/** `fatty` occasions (≥ ~20 g fat at minimum portion) are limited to one per day so the 55–80 g band is reachable. */
interface Template { venue: Venue; items: Array<[string, Role]>; fatty?: boolean }
const tpl = (venue: Venue, fatty: boolean, ...items: Array<[string, Role]>): Template => ({ venue, fatty, items });

const T_BREAKFAST: Template[] = [
  tpl('home', true, ['x_eggs', 'P'], ['fav_roti', 'C']),
  tpl('home', false, ['x_yogurt', 'P'], ['x_oats', 'C'], ['x_berries', 'V']),
  tpl('home', false, ['x_whey', 'P'], ['x_oats', 'C']),
  tpl('restaurant', true, ['x_bhurji', 'P'], ['x_paratha', 'C']),
];
const T_LUNCH: Template[] = [
  tpl('restaurant', false, ['fav_chicken_tikka', 'P'], ['fav_rice', 'C'], ['x_salad', 'V']),
  tpl('restaurant', false, ['fav_chicken_tikka', 'P'], ['fav_naan', 'C']),
  tpl('restaurant', true, ['fav_chicken_shawarma', 'X'], ['x_hummus', 'X']),
  tpl('restaurant', false, ['fav_tandoori_prawns', 'P'], ['fav_rice', 'C'], ['x_salad', 'V']),
  tpl('restaurant', false, ['x_chana', 'X'], ['fav_roti', 'C'], ['x_salad', 'V']),
  tpl('restaurant', false, ['x_dal', 'X'], ['fav_rice', 'C'], ['x_salad', 'V']),
];
const T_LUNCH_RED = tpl('restaurant', true, ['fav_seekh_kebab', 'P'], ['fav_roti', 'C'], ['x_salad', 'V']);
const T_LUNCH_FISH = tpl('home', false, ['x_salmon', 'P'], ['fav_rice', 'C'], ['x_salad', 'V']);
const T_DINNER: Template[] = [
  tpl('restaurant', false, ['fav_chicken_tikka', 'P'], ['fav_naan', 'C'], ['x_salad', 'V']),
  tpl('restaurant', false, ['fav_chicken_tikka', 'P'], ['fav_rice', 'C'], ['x_sabzi', 'V']),
  tpl('restaurant', true, ['fav_chicken_biryani', 'X'], ['x_salad', 'V']),
  tpl('restaurant', true, ['fav_chicken_shawarma', 'X'], ['x_hummus', 'X'], ['x_salad', 'V']),
  tpl('restaurant', false, ['fav_tandoori_prawns', 'P'], ['fav_naan', 'C']),
  tpl('home', false, ['x_dal', 'X'], ['fav_rice', 'C'], ['x_sabzi', 'V']),
];
const T_DINNER_RED: Template[] = [
  tpl('restaurant', true, ['fav_lamb_chops', 'P'], ['fav_roti', 'C'], ['x_sabzi', 'V']),
  tpl('restaurant', true, ['fav_seekh_kebab', 'P'], ['fav_naan', 'C'], ['x_salad', 'V']),
];
const T_DINNER_FISH = tpl('restaurant', false, ['x_fish_tikka', 'P'], ['fav_naan', 'C'], ['x_salad', 'V']);

const TIMES = { coffee: '08:00', breakfast: '08:30', lunch: '13:00', snack: '16:30', dinner: '20:15', late: '22:30' } as const;
/** Protein share of the day each occasion carries (renormalised over the P items present). */
const P_SHARE: Record<string, number> = { [TIMES.breakfast]: 0.25, [TIMES.lunch]: 0.36, [TIMES.snack]: 0.12, [TIMES.dinner]: 0.37, [TIMES.late]: 0.08 };
/** Carb share of the day each occasion's side carries. */
const C_SHARE: Record<string, number> = { [TIMES.breakfast]: 0.25, [TIMES.lunch]: 0.4, [TIMES.dinner]: 0.35 };

interface PlanItem { food: DemoFood; role: Role; t: HHMM; venue: Venue; g: number }

const g5 = (g: number) => Math.max(5, Math.round(g / 5) * 5);
const macro = (f: DemoFood, g: number, k: keyof Macros) => (f.per100[k] * g) / 100;
const sum = (items: PlanItem[], k: keyof Macros) => items.reduce((a, it) => a + macro(it.food, it.g, k), 0);
const byMacroDesc = (k: keyof Macros) => (a: PlanItem, b: PlanItem) => macro(b.food, b.g, k) - macro(a.food, a.g, k);
/** Round grams the way he weighs them: whey / almonds to 1 g, everything else to 5 g. */
const grams = (it: PlanItem, g: number) => (it.food.id === 'x_whey' || it.food.id === 'x_almonds' ? Math.round(clamp(g, it.food.min, it.food.max)) : g5(clamp(g, it.food.min, it.food.max)));

interface DayTargets { p: number; f: number; c: number; fi: number; kc: number }

/**
 * Shrink the biggest contributors of macro `k` (in `pool`) toward their minimum
 * grams until the day is at or under `limit`. Returns the protein lost so it
 * can be put back via a lean source.
 */
function shrinkTo(items: PlanItem[], pool: PlanItem[], k: keyof Macros, limit: number, keepOrder = false): number {
  let lostP = 0;
  for (const it of keepOrder ? pool : [...pool].sort(byMacroDesc(k))) {
    const excess = sum(items, k) - limit;
    if (excess <= 0) break;
    const before = it.g;
    it.g = grams(it, it.g - (excess * 100) / it.food.per100[k]);
    lostP += ((before - it.g) * it.food.per100.p) / 100;
  }
  return lostP;
}

/** Grow items in `pool` order (each to its max) until macro `k` reaches `target`. */
function growTo(items: PlanItem[], pool: PlanItem[], k: keyof Macros, target: number): void {
  for (const it of pool) {
    const gap = target - sum(items, k);
    if (gap <= 0.5) break;
    it.g = grams(it, it.g + (gap * 100) / it.food.per100[k]);
  }
}

function ensureItem(items: PlanItem[], id: string, role: Role, t: HHMM, venue: Venue): PlanItem {
  const found = items.find((it) => it.food.id === id);
  if (found) return found;
  const it: PlanItem = { food: FOODS[id], role, t, venue, g: 0 };
  items.push(it);
  return it;
}

/**
 * Add protein via lean routes only (fat/protein ≤ 0.35 per gram — whey, yogurt,
 * prawns, chicken tikka, fish) so topping up never re-inflates the fat the
 * fat guard just removed. Order: lean items already on the plan, then a new
 * 16:30 whey shake (a breakfast shake doesn't block a second one — two scoops
 * a day is normal for a lifter in a deficit), then a late yogurt. New items
 * start at their minimum portion, so the caller re-checks the upper bound.
 */
function topUpProtein(items: PlanItem[], need: number, dairyOnly = false): void {
  const target = sum(items, 'p') + need;
  const lean = (it: PlanItem) => it.role === 'P' && it.food.per100.f / it.food.per100.p <= (dairyOnly ? 0.2 : 0.35);
  growTo(items, items.filter(lean).sort((a, b) => b.food.per100.p - a.food.per100.p), 'p', target);
  for (const [id, t] of [['x_whey', TIMES.snack], ['x_yogurt', TIMES.late]] as const) {
    if (target - sum(items, 'p') <= 0.5) return;
    if (items.some((it) => it.food.id === id && it.t === t)) continue;
    const it: PlanItem = { food: FOODS[id], role: 'P', t, venue: 'home', g: 0 };
    items.push(it);
    growTo(items, [it], 'p', target);
  }
}

/** Pick the day's occasions, allowing at most one `fatty` template (red-meat days spend it on the red main). */
function pickTemplates(rng: Rng, opts: { fish: boolean; red: boolean; lean: boolean }): { breakfast: Template; lunch: Template; dinner: Template } {
  const fishAtLunch = opts.fish && rng.chance(0.4);
  const redAtLunch = opts.red && !fishAtLunch && rng.chance(0.35);
  let breakfast = rng.pick(T_BREAKFAST);
  let lunch = fishAtLunch ? T_LUNCH_FISH : redAtLunch ? T_LUNCH_RED : rng.pick(T_LUNCH);
  let dinner = opts.fish && !fishAtLunch ? T_DINNER_FISH : opts.red && !redAtLunch ? rng.pick(T_DINNER_RED) : rng.pick(T_DINNER);
  const lean = (xs: Template[]) => xs.filter((t) => !t.fatty);
  if (opts.lean) {
    // Designated low-fat day (fat 55–59 g to exercise the §7 #6 floor card): no fatty occasion at all.
    if (breakfast.fatty) breakfast = rng.pick(lean(T_BREAKFAST));
    if (lunch.fatty) lunch = rng.pick(lean(T_LUNCH));
    if (dinner.fatty) dinner = rng.pick(lean(T_DINNER));
  } else if (opts.red) {
    if (breakfast.fatty) breakfast = rng.pick(lean(T_BREAKFAST));
    if (!redAtLunch && lunch.fatty) lunch = rng.pick(lean(T_LUNCH));
    if (redAtLunch && dinner.fatty) dinner = rng.pick(lean(T_DINNER));
  } else {
    if (breakfast.fatty && lunch.fatty) lunch = rng.pick(lean(T_LUNCH));
    if ((breakfast.fatty || lunch.fatty) && dinner.fatty) dinner = rng.pick(lean(T_DINNER));
  }
  // A low-protein combo dinner (dal, shawarma, biryani) after a combo or fat-capped red-meat lunch leaves no room for 160+ g protein.
  const combo = (t: Template) => t.items[0][1] === 'X';
  if (combo(dinner) && (combo(lunch) || redAtLunch)) dinner = rng.pick(T_DINNER.filter((t) => !combo(t) && (!t.fatty || !(breakfast.fatty || lunch.fatty))));
  return { breakfast, lunch, dinner };
}

/**
 * Build one day's meals: pick templates, then fit grams so the day lands on
 * its protein / fat / carb / fiber targets. Order matters: protein first (the
 * app's rule), fat to the target (floor-aware), fiber via veg, carbs from the
 * remaining budget, then guards and a kcal close on the carb sides — so the
 * spec bands hold for every template combination and weekday alignment.
 */
function planDay(rng: Rng, tg: DayTargets, opts: { fish: boolean; red: boolean; secondCoffee: boolean }): PlanItem[] {
  const lean = tg.f < 60;
  const items: PlanItem[] = [];
  const add = (t: Template, time: HHMM) => {
    for (const [id, role] of t.items) items.push({ food: FOODS[id], role, t: time, venue: t.venue, g: FOODS[id].min });
  };
  const coffee = (t: HHMM) => items.push({ food: FOODS.x_coffee, role: 'X', t, venue: 'home', g: 250 });

  const picked = pickTemplates(rng, { ...opts, lean });
  coffee(TIMES.coffee);
  add(picked.breakfast, TIMES.breakfast);
  add(picked.lunch, TIMES.lunch);
  const snack = rng.chance(0.4) ? rng.pick(['x_whey', 'x_yogurt', 'x_almonds'] as const) : null;
  if (snack) items.push({ food: FOODS[snack], role: snack === 'x_almonds' ? 'X' : 'P', t: TIMES.snack, venue: 'home', g: FOODS[snack].min });
  if (opts.secondCoffee) coffee(TIMES.snack);
  add(picked.dinner, TIMES.dinner);
  if (rng.chance(0.1)) items.push({ food: FOODS.x_yogurt, role: 'P', t: TIMES.late, venue: 'home', g: 150 });

  const of = (role: Role) => items.filter((it) => it.role === role);
  const notC = () => items.filter((it) => it.role !== 'C');
  const adjustable = () => items.filter((it) => it.role !== 'C' && it.role !== 'V' && it.food.id !== 'x_coffee');
  const vegPool = () => [...of('V').sort((a, b) => b.food.per100.fi - a.food.per100.fi), ensureItem(items, 'x_sabzi', 'V', TIMES.dinner, picked.dinner.venue)];

  // 1. Fixed portions (combos, legumes, almonds, veg) — random within bounds.
  for (const it of items) {
    if (it.role === 'X' && it.food.id !== 'x_coffee') it.g = grams(it, rng.uniform(it.food.min, it.food.max));
    if (it.role === 'V') it.g = grams(it, rng.uniform(it.food.min, it.food.min + 60));
  }

  // 2. Protein sources split what the fixed items don't provide (sides add ~8 g).
  const ps = of('P');
  const shareTotal = ps.reduce((a, it) => a + P_SHARE[it.t], 0) || 1;
  const pGoal = Math.max(0, tg.p - sum(items.filter((it) => it.role === 'X' || it.role === 'V'), 'p') - 8);
  for (const it of ps) it.g = grams(it, ((P_SHARE[it.t] / shareTotal) * pGoal * 100) / it.food.per100.p);

  // 3. Fat to target (sides will add ~4 g): shrink the fattiest mains, or add almonds.
  const sideFat = 4;
  if (sum(notC(), 'f') + sideFat > tg.f + 2) {
    topUpProtein(items, shrinkTo(items, adjustable(), 'f', tg.f - sideFat));
  } else if (sum(notC(), 'f') + sideFat < tg.f - 5) {
    const nuts = ensureItem(items, 'x_almonds', 'X', TIMES.snack, 'home');
    nuts.g = grams(nuts, nuts.g + ((tg.f - sideFat - sum(notC(), 'f')) * 100) / 50);
  }

  // 4. Fiber: estimate what the carb sides will bring, then grow (or shrink) veg to land the target.
  const cs = of('C');
  const cShareTotal = cs.reduce((a, it) => a + (C_SHARE[it.t] ?? 0.3), 0) || 1;
  const cRem = () => Math.max(0, tg.c - sum(notC(), 'c'));
  const fiSides = cs.reduce((a, it) => a + ((C_SHARE[it.t] ?? 0.3) / cShareTotal) * cRem() * (it.food.per100.fi / it.food.per100.c), 0);
  const fiGap = tg.fi - sum(notC(), 'fi') - fiSides;
  if (fiGap > 1) growTo(items, vegPool(), 'fi', sum(items, 'fi') + fiGap);
  else if (fiGap < -3) shrinkTo(items, [...of('V'), ...of('X').filter((it) => it.food.tags.includes('legume'))], 'fi', tg.fi - fiSides);

  // 5. Carb sides take the remaining carb budget.
  for (const it of cs) it.g = grams(it, (((C_SHARE[it.t] ?? 0.3) / cShareTotal) * cRem() * 100) / it.food.per100.c);

  // 6. Guards (protein band, fat cap), then close kcal on the carb sides — falling
  //    back to the combos when the sides are pinned at their bounds.
  const fixProtein = (tol: number) => {
    if (sum(items, 'p') < tg.p - tol) topUpProtein(items, tg.p - sum(items, 'p'));
    if (sum(items, 'p') > tg.p + tol) shrinkTo(items, of('P'), 'p', tg.p);
  };
  const closeKcal = (passes: number) => {
    for (let pass = 0; pass < passes; pass++) {
      const gap = tg.kc - sum(items, 'kc');
      if (Math.abs(gap) < 25) break;
      const pool = pass < 2 ? cs : [...cs, ...of('X').filter((it) => it.food.id !== 'x_coffee' && it.food.id !== 'x_almonds')];
      const poolKc = sum(pool, 'kc') || 1;
      for (const it of pool) {
        const share = poolKc > 1 ? macro(it.food, it.g, 'kc') / poolKc : 1 / pool.length;
        it.g = grams(it, it.g + (share * gap * 100) / it.food.per100.kc);
      }
    }
  };
  fixProtein(4);
  for (let k = 0; k < 2; k++) {
    topUpProtein(items, shrinkTo(items, adjustable(), 'f', Math.min(79, tg.f + 3)));
    fixProtein(4);
  }
  closeKcal(4);
  // Sides carry protein too (roti 9 g/100 g): re-check, then re-close on the sides only.
  fixProtein(7);
  closeKcal(2);
  // Fiber — veg only, so it moves kcal by < 60.
  if (sum(items, 'fi') < 19) growTo(items, vegPool(), 'fi', 20);
  else if (sum(items, 'fi') > 33) shrinkTo(items, [...of('V'), ...of('X').filter((it) => it.food.tags.includes('legume') || it.food.id === 'x_almonds')], 'fi', 32);
  // Fat is authoritative last: cap at 79 g (and keep the 2–3 designated low-fat days under the 60 g floor),
  // restoring any lost protein through dairy only so fat cannot creep back.
  const fatCap = lean ? 58 : 79;
  const fatPerProtein = (it: PlanItem) => it.food.per100.f / Math.max(1, it.food.per100.p);
  const capFat = (limit: number) => {
    if (sum(items, 'f') <= fatCap) return;
    const byRatio = adjustable().sort((a, b) => fatPerProtein(b) - fatPerProtein(a));
    topUpProtein(items, shrinkTo(items, byRatio, 'f', limit, true), true);
  };
  capFat(fatCap - 1);
  capFat(fatCap - 2);
  closeKcal(2); // sides only — restores the kcal the cap removed
  capFat(fatCap - 1.5);
  // Nobody logs 15 g of rice — drop token-sized and never-sized items.
  return items.filter((it) => it.g > 0 && (it.g >= 25 || it.food.id === 'x_whey' || it.food.id === 'x_almonds'));
}

function toMeals(items: PlanItem[], nextId: () => string): Meal[] {
  const order: Record<string, number> = { [TIMES.coffee]: 0, [TIMES.breakfast]: 1, [TIMES.lunch]: 2, [TIMES.snack]: 3, [TIMES.dinner]: 4, [TIMES.late]: 5 };
  return [...items]
    .sort((a, b) => order[a.t] - order[b.t])
    .map((it) => {
      const tags: FoodTag[] = [...it.food.tags];
      if (!tags.includes('home') && !tags.includes('restaurant')) tags.push(it.venue);
      return {
        id: nextId(),
        t: it.t,
        n: it.food.name,
        g: it.g,
        kc: round(macro(it.food, it.g, 'kc')),
        p: round(macro(it.food, it.g, 'p'), 1),
        f: round(macro(it.food, it.g, 'f'), 1),
        c: round(macro(it.food, it.g, 'c'), 1),
        fi: round(macro(it.food, it.g, 'fi'), 1),
        src: it.food.src,
        tags,
      };
    });
}

/** Same rounding the store applies in withTotals(), so seeded totals are already canonical. */
function totalsOf(meals: Meal[]): Pick<DailyRecord, 'kc' | 'p' | 'f' | 'c' | 'fi'> {
  const s = { kc: 0, p: 0, f: 0, c: 0, fi: 0 };
  for (const m of meals) {
    s.kc += m.kc;
    s.p += m.p;
    s.f += m.f;
    s.c += m.c;
    s.fi += m.fi;
  }
  return { kc: round(s.kc), p: round(s.p), f: round(s.f), c: round(s.c), fi: round(s.fi, 1) };
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

const LN58 = Math.log(58);
/** Logistic strain → extra sleep need (h), 0.4 h asymptote centred on strain 12 (§6.4). */
const strainNeed = (strn: number) => 0.4 / (1 + Math.exp(-(strn - 12) / 2));

/** Hooper items are integers 1–7 with 1 = best. */
const hooper = (x: number) => clamp(Math.round(x), 1, 7);

/** First day of the seeded illness episode, counted back from `endDate`. */
const ILLNESS_START_BACK = 15;
/** Length of the episode, days. Four is long enough for a 3-day run rule to fire. */
const ILLNESS_DAYS = 4;
/**
 * HRV suppression during the episode, in ln-space: 0.75 of the untroubled
 * baseline, which lands the four days ≈ 20 % under the persona's own 60-day
 * mean (that mean sits below the baseline because ordinary smoking and
 * short-sleep nights drag it down). The 20 % is what the illness flag reads.
 */
const ILL_LN_HRV = Math.log(0.75);
/**
 * Alcohol's next-morning effect at two drinks: −7 ms HRV (in ln-space on the
 * 58 ms baseline, ln(51/58) ≈ −0.128) and +3 bpm RHR — PLOS Digital Health
 * 2024, 20,968 users. Scaled linearly by `drinks / 2`, capped at three drinks
 * — the same prior `engine/impact.BEHAVIOUR_PRIORS` carries, so the behaviour
 * engine is looking for an effect that is genuinely in the data. An evening is
 * 2–3 drinks, so the realised next-morning contrast runs a little past the
 * two-drink figure; that is the dose, not a different effect size.
 */
const ALC_LN_HRV = -0.128;
const ALC_RHR_BPM = 3;
/** Skewed to Friday / Saturday, ≈ 2 evenings a week overall. */
const ALC_P_WEEKEND = 0.45;
const ALC_P_WEEKDAY = 0.18;
/** Share of logged days he answers the four check-in questions on. */
const CHECKIN_P = 0.9;

export function generateDemoData(settings: AppSettings, endDate: ISODate, days = 45): DailyRecord[] {
  const n = Math.max(0, Math.floor(days));
  if (n === 0) return [];
  const dates = lastNDates(endDate, n);
  const split = settings.profile?.split ?? DEFAULT_SPLIT;
  const isLift = (i: number) => split[weekdayOf(dates[i])] !== 'rest';
  const needBase = clamp(settings.profile?.sleepBaselineHrs ?? 7.75, 7.4, 8.0);

  const phys = createRng(DEMO_SEED);
  const food = createRng(DEMO_SEED + 101);
  const plan = createRng(DEMO_SEED + 202);
  let mealCounter = 0;
  const nextId = () => `m_demo_${String(++mealCounter).padStart(3, '0')}`;
  const last = n - 1;

  // --- Scheduling (which days skip a weigh-in, miss logging, are smoke-free, eat fish / red meat) ---
  const skipWeigh = new Set<number>();
  const fishDays = new Set<number>();
  const redDays = new Set<number>();
  for (let end = last; end >= 0; end -= 7) {
    const start = Math.max(0, end - 6);
    const block = Array.from({ length: end - start + 1 }, (_, k) => start + k);
    // 1–2 skipped weigh-ins per week; the final week keeps today and ≥ 5 weigh-ins.
    const candidates = end === last ? block.filter((i) => i !== last) : block;
    const nSkip = block.length >= 7 ? plan.int(1, 2) : 0;
    plan.sample(candidates, nSkip).forEach((i) => skipWeigh.add(i));
    plan.sample(block, plan.chance(0.15) ? 2 : 1).forEach((i) => fishDays.add(i));
    plan.sample(block.filter((i) => !fishDays.has(i)), plan.int(2, 3)).forEach((i) => redDays.add(i));
  }
  fishDays.delete(last);
  redDays.delete(last);
  // Missed logging: 2–3 days in the older half, never in the last 7 days.
  const missedLog = new Set<number>(n >= 14 ? plan.sample(Array.from({ length: Math.floor(n / 2) }, (_, i) => i), plan.int(2, 3)) : []);
  // Tobacco: smoke-free streak of 2 ending yesterday + 1–2 more zero days in the last two weeks.
  const roughNights = new Set<number>([last - 9, Math.floor(n * 0.3)].filter((i) => i >= 1 && i < last));
  const greatNights = new Set<number>([last - 13, last - 6, Math.floor(n * 0.55)].filter((i) => i >= 0 && i < last && !roughNights.has(i)));
  const heavySmokeDays = new Set<number>([...roughNights].map((i) => i - 1));
  const zeroTob = new Set<number>(n >= 4 ? [last - 1, last - 2] : []);
  if (n >= 15) {
    const pool = Array.from({ length: 10 }, (_, k) => last - 14 + k).filter((i) => !heavySmokeDays.has(i) && i !== last - 3);
    plan.sample(pool, plan.int(1, 2)).forEach((i) => zeroTob.add(i));
  }
  const lowFatDays = new Set<number>(plan.sample(Array.from({ length: Math.max(0, n - 1) }, (_, i) => i).filter((i) => !missedLog.has(i) && !redDays.has(i)), plan.int(2, 3)));

  // The seeded illness episode: a fixed 4-day window, so it lands in the same
  // place for any endDate and the flag is demonstrable on first launch.
  const illStart = last - ILLNESS_START_BACK;
  const isIll = (i: number) => n >= ILLNESS_START_BACK + ILLNESS_DAYS && i >= illStart && i < illStart + ILLNESS_DAYS;

  const out: DailyRecord[] = [];
  let prev: { tob: number; strn: number; dbt: number; nap: number; bump: number; biryani: boolean; heavyRestaurant: boolean; alc: number } = {
    tob: 5,
    strn: 9,
    dbt: 45,
    nap: 0,
    bump: 0,
    biryani: false,
    heavyRestaurant: false,
    alc: 0,
  };

  for (let i = 0; i < n; i++) {
    const d = dates[i];
    const lift = isLift(i);
    const isToday = i === last;
    const progress = n > 1 ? i / (n - 1) : 1;
    const ill = isIll(i);
    const rec: DailyRecord = { d };

    // --- Physiology stream: the same 45 draws every day (normal() = 2), before any branch ---
    const eTob = phys.normal(0, 0.9);
    const eBt = phys.normal(0, 20);
    const eWk = phys.normal(0, 11);
    const awake = phys.uniform(0.3, 0.7);
    const uLate = phys.next();
    const lateAmt = phys.uniform(30, 55);
    const uNap = phys.next();
    const napLen = phys.uniform(20, 45);
    const eHrv = phys.normal(0, 0.12);
    const eRhr = phys.normal(0, 1.6);
    const eRec = phys.normal(0, 6);
    const eStrn = phys.normal(0, 1.5);
    const eSteps = phys.normal(0, 1500);
    const eH2o = phys.int(-1, 1);
    const eW = phys.normal(0, 0.9);
    const bumpAmt = phys.uniform(1.5, 2.0);
    const uBump = phys.next();
    const uChk = phys.next();
    const eQm = phys.normal(0, 1);
    const eQs = phys.normal(0, 1);
    const eQf = phys.normal(0, 1);
    const eQt = phys.normal(0, 1);
    const eQo = phys.normal(0, 1);
    const eRr = phys.normal(0, 0.5);
    const eSkt = phys.normal(0, 0.18);
    const eSpo = phys.normal(0, 0.8);
    const uAlc = phys.next();
    const alcAmt = phys.int(2, 3);

    // Last night's drinking, scaled so two drinks carry the published effect.
    const alcLoad = Math.min(prev.alc, 3) / 2;

    // Tobacco (counts/day). Today is partial → not logged yet.
    const tobBase = 5 - 3 * progress;
    let tob = zeroTob.has(i) ? 0 : Math.max(1, Math.round(tobBase + eTob));
    if (heavySmokeDays.has(i)) tob = Math.max(tob, 6);
    if (!isToday) rec.tob = tob;

    // Sleep (the night ending this morning). Bedtimes on the since-noon axis: 23:00 = 660.
    const eveningWd = weekdayOf(dates[Math.max(0, i - 1)]);
    const late = (eveningWd === 5 || eveningWd === 6) ? uLate < 0.45 : uLate < 0.12;
    let btNoon = 660 + eBt + (late ? lateAmt : 0);
    if (roughNights.has(i)) btNoon = 740; // 00:20
    btNoon = clamp(btNoon, 640, 745);
    const wkMin = clamp(415 + eWk, 400, 450);
    let slh = (wkMin + 720 - btNoon) / 60 - awake;
    if (roughNights.has(i)) slh = Math.min(slh, 6.3);
    if (greatNights.has(i)) slh = Math.max(slh, 7.9);
    slh = round(clamp(slh, 6.2, 8.3), 1);
    const nap = !isToday && uNap < (lift ? 0.06 : 0.18) ? Math.round(napLen) : 0;
    const sln = round(clamp(needBase + strainNeed(prev.strn) + (Math.min(prev.dbt, 90) / 60) * 0.2 - prev.nap / 60, 7.6, 8.4), 1);
    // Debt decays (WHOOP caps it); a night at need pays ~2/3 of the gap back, so it hovers 30–100 min.
    const dbt = Math.round(clamp(0.35 * prev.dbt + (sln - slh) * 48, 0, 120));
    rec.bt = minutesSinceNoonToHHMM(Math.round(btNoon));
    rec.wk = minutesToHHMM(Math.round(wkMin));
    rec.slh = slh;
    rec.sln = sln;
    rec.dbt = dbt;
    if (nap) rec.nap = nap;

    // HRV / RHR / recovery — personal baseline 58 ms, dips after heavy smoking,
    // short sleep, a drinking night, or inside the seeded illness window.
    const heavy = prev.tob >= 5;
    const smokeFree = prev.tob === 0 && i > 0;
    const shortSleep = slh < 6.6;
    // Inside the episode the infection dominates: the ordinary day-to-day
    // spread shrinks (the same draws, scaled) so the ~20 % HRV suppression and
    // the +6 bpm are visible on all four days rather than on the lucky ones.
    const illNoise = ill ? 0.4 : 1;
    const lnHrv =
      LN58 + eHrv * illNoise - (heavy ? 0.13 : 0) - (shortSleep ? 0.15 : 0) + (smokeFree ? 0.05 : 0) +
      (greatNights.has(i) ? 0.12 : 0) + 0.04 * progress + ALC_LN_HRV * alcLoad + (ill ? ILL_LN_HRV : 0);
    const hrv = Math.round(clamp(Math.exp(lnHrv), 35, 95));
    const rhr = Math.round(clamp(52 + eRhr * illNoise + (shortSleep ? 2 : 0) + (heavy ? 1.5 : 0) - (smokeFree ? 0.7 : 0) - 0.6 * progress + ALC_RHR_BPM * alcLoad + (ill ? 6 : 0), 46, 60));
    rec.hrv = hrv;
    rec.rhr = rhr;
    const recScore = Math.round(clamp(58 + 90 * (Math.log(hrv) - LN58) + 9 * (slh - 7.2) - 2 * (rhr - 52) + eRec, 5, 99));
    // The episode is seeded, not emergent: hold recovery in the red for all
    // four days so the illness flag and the strain index have a clean case.
    rec.rec = ill ? Math.min(recScore, 30) : recScore;

    // Overnight signals the strain index fuses (WHOOP reports all three).
    rec.rr = round(clamp(14.6 + eRr + (ill ? 3 : 0) + 0.4 * alcLoad + (shortSleep ? 0.3 : 0), 10, 24), 1);
    rec.skt = round(clamp(33.6 + eSkt + (ill ? 0.5 : 0) + 0.08 * alcLoad, 31.5, 36), 1);
    rec.spo = Math.round(clamp(97.4 + eSpo - (ill ? 1.2 : 0), 95, 99));

    // Strain, steps, water. Today is mid-afternoon: no day strain yet, ~4,200 steps.
    const strn = round(lift ? clamp(13 + eStrn, 9.5, 16) : clamp(8 + 0.9 * eStrn, 6, 11), 1);
    if (!isToday) rec.strn = strn;
    const wd = weekdayOf(d);
    const steps = isToday ? 4200 + Math.round(eSteps / 20) : Math.round(clamp(8300 + eSteps + (wd === 0 || wd === 6 ? 500 : 0), 5500, 11500) / 10) * 10;
    rec.st = steps;
    rec.h2o = isToday ? 3 : clamp(6 + Math.round((steps - 5500) / 1500) + eH2o, 6, 11);

    // Alcohol: 2–3 drinks, skewed to Friday / Saturday. Today's evening has not
    // happened yet (like tobacco), and he does not drink while ill.
    if (!isToday && !ill && uAlc < (wd === 5 || wd === 6 ? ALC_P_WEEKEND : ALC_P_WEEKDAY)) rec.alc = alcAmt;

    // Hooper check-in, 1 = best. Skipped on days he never opened the app, and
    // on today so Today still has something to ask for.
    if (!isToday && !missedLog.has(i) && uChk < CHECKIN_P) {
      const z = ((rec.rec as number) - 58) / 16;
      // Two things stop the Hooper sum being a re-labelled recovery score:
      // `mood`, the shared subjective factor every self-report carries (the
      // reason four questions asked the same morning move together whatever
      // the wearable says), and the slow life-stress cycle `qt` rides. Both
      // are why the two signals disagree on about a quarter of days.
      const mood = 0.6 * eQm;
      const wave = Math.sin(i / 4.7 + 1.1);
      const soreYesterday = i > 0 && isLift(i - 1);
      rec.qs = hooper(3.9 - 0.8 * z - 0.5 * (slh - 7.2) + mood + 1.25 * eQs + (ill ? 1.5 : 0));
      rec.qf = hooper(3.9 - 0.85 * z + 0.3 * (prev.strn - 10) + mood + 1.25 * eQf + (ill ? 1.8 : 0));
      rec.qt = hooper(3.8 - 0.3 * z + 0.95 * wave + mood + 1.25 * eQt + (ill ? 0.6 : 0));
      rec.qo = hooper(3.4 - 0.55 * z + (soreYesterday ? 1.0 : -0.2) + mood + 1.25 * eQo + (ill ? 0.8 : 0));
    }

    // Meals (food stream). Missed-logging days have no meals / caffeine at all.
    let biryani = false;
    let heavyRestaurant = false;
    if (isToday) {
      const items: PlanItem[] = [
        { food: FOODS.x_coffee, role: 'X', t: '08:05', venue: 'home', g: 250 },
        { food: FOODS.x_eggs, role: 'P', t: TIMES.breakfast, venue: 'home', g: 150 },
        { food: FOODS.fav_roti, role: 'C', t: TIMES.breakfast, venue: 'home', g: 80 },
        { food: FOODS.fav_chicken_tikka, role: 'P', t: TIMES.lunch, venue: 'restaurant', g: 220 },
        { food: FOODS.fav_rice, role: 'C', t: TIMES.lunch, venue: 'restaurant', g: 150 },
        { food: FOODS.x_salad, role: 'V', t: TIMES.lunch, venue: 'restaurant', g: 120 },
      ];
      rec.meals = toMeals(items, nextId);
      Object.assign(rec, totalsOf(rec.meals));
      rec.caf = ['08:05'];
    } else if (!missedLog.has(i)) {
      const lowFat = lowFatDays.has(i);
      const tg: DayTargets = {
        kc: lift ? food.uniform(1990, 2090) : food.uniform(1910, 1990),
        p: food.uniform(170, 186),
        f: lowFat ? food.uniform(55, 59) : lift ? food.uniform(60, 69) : food.uniform(66, 78),
        fi: food.uniform(22, 30),
        c: 0,
      };
      tg.c = (tg.kc - 4 * tg.p - 9 * tg.f) / 4;
      const secondCoffee = food.chance(0.2);
      const items = planDay(food, tg, { fish: fishDays.has(i), red: redDays.has(i), secondCoffee });
      rec.meals = toMeals(items, nextId);
      Object.assign(rec, totalsOf(rec.meals));
      rec.caf = rec.meals.filter((m) => m.tags?.includes('caffeine')).map((m) => m.t);
      biryani = items.some((it) => it.food.id === 'fav_chicken_biryani');
      heavyRestaurant = items.filter((it) => it.venue === 'restaurant' && it.food.id !== 'x_coffee').length >= 5;
    }

    // Weight: linear true trend + noise + water bump after biryani / heavy restaurant days (§6.1).
    const bump = prev.biryani ? bumpAmt : prev.heavyRestaurant && uBump < 0.3 ? bumpAmt - 0.6 : 0;
    if (!skipWeigh.has(i)) rec.w = round(176.2 - 1.05 * (i / 7) + eW + bump + 0.5 * prev.bump, 1);

    if (roughNights.has(i)) rec.note = 'Up late, slept badly.';
    if (greatNights.has(i) && i === last - 6) rec.note = 'Best sleep in weeks.';

    out.push(rec);
    prev = { tob: isToday ? 0 : tob, strn, dbt, nap, bump, biryani, heavyRestaurant, alc: rec.alc ?? 0 };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Demo workouts — a fourth, independent stream
// ---------------------------------------------------------------------------

/**
 * Working loads the persona is on at the top of the block, KILOGRAMS (that is
 * what `SetEntry.w` stores; display converts). One entry per exercise in
 * `DEFAULT_PROGRAMS`; a zero means the movement is bodyweight and progresses
 * in reps instead. Numbers are an ordinary 78 kg lifter two years in — nothing
 * here is measured, it is a plausible starting point for a demo.
 */
const BASE_LOAD_KG: Record<string, number> = {
  // Program A — upper
  'bench-press': 72.5,
  'barbell-row': 60,
  'overhead-press': 45,
  'lat-pulldown': 60,
  'lateral-raise': 10,
  'triceps-pushdown': 27.5,
  'barbell-curl': 30,
  // Program A — lower
  'back-squat': 100,
  'romanian-deadlift': 85,
  'leg-press': 145,
  'lying-leg-curl': 40,
  'standing-calf-raise': 65,
  'hanging-leg-raise': 0,
  // Program B — upper
  'pull-up': 0,
  'incline-dumbbell-press': 26,
  'seated-cable-row': 62.5,
  'dumbbell-shoulder-press': 20,
  'face-pull': 25,
  'hammer-curl': 14,
  'overhead-triceps-extension': 25,
  // Program B — lower
  deadlift: 130,
  'bulgarian-split-squat': 18,
  'hip-thrust': 90,
  'seated-leg-curl': 40,
  'seated-calf-raise': 50,
  'cable-crunch': 35,
};

/** Top-set reps for the bodyweight movements, which progress in reps, not load. */
const BASE_REPS_BODYWEIGHT: Record<string, number> = { 'pull-up': 9, 'hanging-leg-raise': 12 };

/**
 * The block, indexed by whole weeks back from `endDate` (0 = the last seven
 * days). Read oldest → newest it is an ordinary double-progression block:
 * two weeks at one load working reps up, a load step, a deload, another rep
 * build, a second load step, then a peak week where only the session's main
 * lift goes up — which is what makes the PR count 3–5 rather than one per
 * exercise. Accessories repeat week 1 exactly in the peak week, so the only
 * new records in the "PRs this week" window are the main lifts.
 */
const WEEK_LOAD_FACTOR: readonly number[] = [1, 1, 0.965, 0.9, 0.965, 0.93, 0.93];
/** Where the top set sits in the program's rep range: 0 = the bottom, 1 = the top. */
const WEEK_REP_POS: readonly number[] = [0, 0, 1, 0.6, 0, 1, 0];
/** Week's offset from the program's target RPE. The deload is the −1.5. */
const WEEK_RPE_DELTA: readonly number[] = [0.5, 0, 0, -1.5, 0, -0.5, -0.5];
/** The peak week's main lift, as a fraction of the block's top load. */
const PEAK_FACTOR = 1.04;

/** Monday-first week order, so "which lift day of the week is this" is stable. */
const WEEK_ORDER: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 0];

/** Which program slot a split day fills; `null` days get no strength session. */
const SESSION_SLOT: Record<SessionType, 'upper' | 'lower' | null> = {
  upper: 'upper',
  push: 'upper',
  pull: 'upper',
  full: 'upper',
  lower: 'lower',
  legs: 'lower',
  cardio: null,
  rest: null,
};

/** Saturday, on the JS `Date` convention `weekdayOf` uses. */
const RUN_WEEKDAY: Weekday = 6;

/** How many non-rest days come before `wd` in the training week. */
function liftIndexInWeek(split: TrainingSplit, wd: Weekday): number {
  let k = 0;
  for (const day of WEEK_ORDER) {
    if (day === wd) break;
    if (split[day] !== 'rest') k += 1;
  }
  return k;
}

/** Round to a load somebody can actually load, using the equipment's real step. */
function roundToStep(kg: number, exerciseId: string): number {
  const equipment = exerciseById(exerciseId)?.equipment ?? 'other';
  const step = LOAD_INCREMENT_KG[equipment] ?? LOAD_INCREMENT_KG.other;
  return round(Math.max(step, Math.round(kg / step) * step), 2);
}

/** RPE is logged in half steps. */
const halfStep = (x: number) => Math.round(x * 2) / 2;

interface WeekPlan {
  load: number;
  repPos: number;
  rpeDelta: number;
  peak: boolean;
}

function weekPlan(weeksBack: number): WeekPlan {
  const k = clamp(weeksBack, 0, WEEK_LOAD_FACTOR.length - 1);
  return { load: WEEK_LOAD_FACTOR[k], repPos: WEEK_REP_POS[k], rpeDelta: WEEK_RPE_DELTA[k], peak: k === 0 };
}

/**
 * One exercise's sets for one session.
 *
 * The top set is a pure function of the week and the program row — no random
 * draw touches it. That is deliberate: `strength.detectPRs` compares the best
 * set at a given load across sessions, so any upward jitter on the top set
 * would manufacture a personal record out of noise. The back-off sets carry
 * all the randomness, and only downward (fewer reps, higher RPE), so they can
 * never out-rank the top set either.
 */
function buildExercise(
  rng: Rng,
  row: { exerciseId: string; sets: number; reps: [number, number]; rpe?: number },
  plan: WeekPlan,
  isMain: boolean,
): WorkoutExercise {
  const [lo, hi] = row.reps;
  const base = BASE_LOAD_KG[row.exerciseId] ?? 0;
  const factor = isMain && plan.peak ? PEAK_FACTOR : plan.load;
  const bodyweight = base <= 0;
  const load = bodyweight ? 0 : roundToStep(base * factor, row.exerciseId);
  const topReps = bodyweight
    ? clamp(Math.round((BASE_REPS_BODYWEIGHT[row.exerciseId] ?? hi) * factor), lo, hi)
    : clamp(Math.round(hi - (hi - lo) * (1 - plan.repPos)), lo, hi);
  const topRpe = clamp(halfStep((row.rpe ?? 8) + plan.rpeDelta), 6, 10);

  const sets: SetEntry[] = [];
  // Two ramping warm-ups on the session's main lift; `k: 'wu'` keeps them out
  // of volume, e1RM and PR detection.
  if (isMain && load > 0) {
    sets.push({ w: roundToStep(load * 0.5, row.exerciseId), r: 8, k: 'wu' });
    sets.push({ w: roundToStep(load * 0.75, row.exerciseId), r: 5, k: 'wu' });
  }
  for (let j = 0; j < row.sets; j++) {
    const fade = j === 0 ? 0 : Math.min(j, 2) + (rng.chance(0.3) ? 1 : 0);
    const rpeFade = j === 0 ? 0 : 0.5 * Math.min(j, 2) + (rng.chance(0.3) ? 0.5 : 0);
    sets.push({
      w: load,
      r: Math.max(1, topReps - fade),
      rpe: clamp(halfStep(topRpe + rpeFade), 6, 10),
    });
  }
  return { exerciseId: row.exerciseId, sets };
}

/** Foster sRPE load, the same `srpe × minutes` `engine/load.sessionLoad` computes. */
const fosterLoad = (srpe: number, durationMin: number) => round(srpe * durationMin, 1);

/** Edwards summated heart-rate zones: Σ minutes in zone i × i (`sessionLoad` again). */
function edwardsLoad(zoneMin: readonly number[]): number {
  let total = 0;
  for (let i = 0; i < zoneMin.length && i < 6; i++) total += zoneMin[i] * i;
  return round(total, 1);
}

/** Minutes in HR zones 0–5 for a steady run, summing exactly to `durationMin`. */
function runZones(rng: Rng, durationMin: number): CardioDetail['zoneMin'] {
  const shares = [0, 0.12, 0.26, 0.38, 0.19, 0.05];
  const mins = shares.map((s, i) => (i === 0 ? 0 : Math.max(0, Math.round(durationMin * s + rng.uniform(-1.5, 1.5)))));
  const spent = mins.reduce((a, m) => a + m, 0);
  mins[3] = Math.max(0, mins[3] + (durationMin - spent));
  return [mins[0], mins[1], mins[2], mins[3], mins[4], mins[5]];
}

/**
 * A deterministic 45 days of training for the demo persona: one session on
 * every lift day of `settings.profile.split`, plus a Saturday run.
 *
 * Sessions come from `DEFAULT_PROGRAMS` (the built-in A/B upper-lower split
 * the Train screen falls back to), alternating A → B across the training week,
 * so what History shows lines up with what Train plans. `endDate` itself is
 * left empty on purpose: `generateDemoData` makes it a partial day, and a
 * finished session on it would leave Train with nothing to suggest.
 *
 * Runs on `DEMO_SEED + 303` — its own stream — so the `DailyRecord[]` from
 * `generateDemoData` is byte-identical whether or not this is called. Ids are
 * derived from the date (`w_demo_<date>_s`), never drawn, so re-generating
 * cannot duplicate or re-key a session.
 */
export function generateDemoWorkouts(settings: AppSettings, endDate: ISODate, days = 45): Workout[] {
  const n = Math.max(0, Math.floor(days));
  if (n === 0) return [];
  const dates = lastNDates(endDate, n);
  const split = settings.profile?.split ?? DEFAULT_SPLIT;
  const rng = createRng(DEMO_SEED + 303);
  const last = n - 1;
  const out: Workout[] = [];

  for (let i = 0; i < last; i++) {
    const d = dates[i];
    const wd = weekdayOf(d);
    const type = split[wd] ?? 'rest';
    const slot = SESSION_SLOT[type] ?? null;
    const plan = weekPlan(Math.floor((last - i) / 7));

    if (slot) {
      const programIdx = Math.floor(liftIndexInWeek(split, wd) / 2) % DEFAULT_PROGRAMS.length;
      const program: Program = DEFAULT_PROGRAMS[programIdx];
      const rows = program.sessions[slot] ?? [];
      // The main lift is the first *loaded* row — a bodyweight opener (pull-ups)
      // cannot carry a weight PR, so the press behind it does.
      const mainId = rows.find((r) => (BASE_LOAD_KG[r.exerciseId] ?? 0) > 0)?.exerciseId;
      const exercises = rows.map((r) => buildExercise(rng, r, plan, r.exerciseId === mainId));
      const setCount = exercises.reduce((a, e) => a + e.sets.length, 0);
      const durationMin = Math.max(30, Math.round(12 + 2.4 * setCount) + rng.int(-4, 5));
      const srpe = clamp(halfStep(7.5 + 0.6 * plan.rpeDelta + 0.5 * rng.int(-1, 1)), 5, 9.5);
      out.push({
        id: `w_demo_${d}_s`,
        d,
        start: minutesToHHMM(17 * 60 + 45 + rng.int(0, 45)),
        durationMin,
        kind: 'strength',
        session: type,
        title: `${slot === 'upper' ? 'Upper' : 'Lower'} ${String.fromCharCode(65 + programIdx)}`,
        exercises,
        srpe,
        load: fosterLoad(srpe, durationMin),
        source: 'demo',
        programId: program.id,
      });
    }

    if (wd === RUN_WEEKDAY || type === 'cardio') {
      const durationMin = 38 + rng.int(0, 16);
      const zoneMin = runZones(rng, durationMin);
      const paceMinPerKm = rng.uniform(5.5, 6.4);
      out.push({
        id: `w_demo_${d}_c`,
        d,
        start: minutesToHHMM(7 * 60 + 45 + rng.int(0, 50)),
        durationMin,
        kind: 'cardio',
        session: 'cardio',
        title: 'Easy run',
        cardio: {
          sport: 'run',
          distanceKm: round(durationMin / paceMinPerKm, 1),
          avgHr: 148 + rng.int(-6, 8),
          maxHr: 168 + rng.int(0, 9),
          zoneMin,
          kcal: Math.round(durationMin * (10.5 + rng.uniform(0, 1.5))),
        },
        srpe: clamp(halfStep(6.5 + 0.5 * rng.int(-1, 1)), 5, 8),
        load: edwardsLoad(zoneMin ?? []),
        source: 'demo',
      });
    }
  }

  return out.sort((a, b) => (a.d !== b.d ? (a.d < b.d ? -1 : 1) : a.id < b.id ? -1 : 1));
}

/** Caption for Settings → "Demo data: 45 days · 38 weigh-ins · 240 meals". */
export function demoSummary(records: DailyRecord[]): { days: number; weighIns: number; meals: number } {
  let weighIns = 0;
  let meals = 0;
  for (const r of records) {
    if (typeof r.w === 'number' && Number.isFinite(r.w)) weighIns++;
    meals += r.meals?.length ?? 0;
  }
  return { days: records.length, weighIns, meals };
}
