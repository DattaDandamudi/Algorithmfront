import type { FoodEstimate, FoodEstimateItem, FoodItem, HHMM, Macros, Meal, MealSource } from '../data/types';
import { round } from '../lib/format';
import { TIE_BAND, findFood, getFood, normalise, singularize, tokens, type FoodMatch } from './foodDb';

/**
 * Deterministic natural-language food parser (§2 "200 g chicken tikka and one
 * roti" → editable macro card). Used offline (AI provider 'none') and as the
 * fallback whenever the Claude path fails, so it must never throw.
 *
 * This is the accuracy floor of the food feature: a user with no API key has
 * nothing else, so every phrase it drops is a meal that goes unlogged. The
 * 40-phrase evaluation in `foodLocal.eval.test.ts` is the regression gate.
 *
 * Confidence ladder (mirrors the §9 UI chips: High ≥0.8 / Med 0.5–0.79 / Low <0.5):
 *   0.9  explicit grams + strong DB match         "200 g chicken tikka"
 *   0.75 count × a known natural unit             "2 rotis", "a plate of biryani"
 *   0.6  default / generic portion assumed        "chicken shawarma wrap", "a bowl of X", bare "200" read as grams
 *   0.45 weak fuzzy match (prefix / typo / partial overlap)
 *   0.3  unknown drink → beverage prior (40 kcal/100 g, 250 g) + a clarifying question
 *   0.2  unknown food → generic mixed-dish prior (200 kcal/100 g) + a clarifying question
 *  ≤0.4 whole-parse cap when the total is physically implausible (see PLAUSIBLE_MAX_*)
 *
 * The spec allows at most ONE clarifying question per estimate, so only the
 * single most uncertain segment gets `clarify` — unless the whole parse is
 * implausible, which asks about the total instead.
 */

export interface ParseFoodOptions {
  /** Favorites/recents — searched first and win ties over the built-in DB. */
  extra?: FoodItem[];
  /** The persona's cuisines (`profile.cuisines`) — breaks near-ties in the DB lookup only. */
  cuisines?: string[];
  /** Reserved for time-of-day heuristics; the deterministic parser ignores it today. */
  now?: HHMM;
}

/** Fallback prior for a dish we cannot identify: a mixed restaurant plate. */
export const GENERIC_PER100: Macros = { kc: 200, p: 8, f: 10, c: 20, fi: 2 };
const GENERIC_GRAMS = 250;
const UNKNOWN_COUNT_GRAMS = 150;

/**
 * Prior for an unrecognised DRINK ("watermelon smoothie", "jaljeera soda"):
 * 40 kcal/100 g in a 250 g glass. Sweetened drinks cluster tightly — cola 42,
 * orange juice 45, sweet lassi ~55, beer 43 — so a 250 g glass at 40 kcal/100 g
 * is a far better guess than the 200 kcal/100 g mixed-plate prior, which would
 * charge a glass of juice 500 kcal. Macros are carb-dominant, as sugar.
 */
export const BEVERAGE_PER100: Macros = { kc: 40, p: 0.5, f: 0.1, c: 9.5, fi: 0.1 };
const BEVERAGE_GRAMS = 250;
const BEVERAGE_CONF = 0.3;

/**
 * Words that make a phrase a drink. Used only to pick the prior for a segment
 * the DB could not identify, and only when the weak match we do have is not
 * itself a drink ("green tea" still resolves to chai; "watermelon smoothie"
 * does not resolve to water).
 */
const BEVERAGE_WORDS = new Set([
  'drink', 'beverage', 'juice', 'smoothie', 'milkshake', 'shake', 'lassi', 'soda', 'pop', 'cola',
  'lemonade', 'limeade', 'squash', 'cordial', 'mocktail', 'cocktail', 'punch', 'slushie', 'frappe',
  'frappuccino', 'latte', 'cappuccino', 'mocha', 'macchiato', 'espresso', 'americano', 'coffee',
  'tea', 'chai', 'matcha', 'kombucha', 'boba', 'sherbet', 'thandai', 'falooda', 'ayran', 'doogh',
  'buttermilk', 'chaas', 'jallab', 'karak', 'beer', 'lager', 'ale', 'cider', 'wine', 'sangria',
  'whisky', 'whiskey', 'vodka', 'rum', 'gin', 'tequila', 'mojito', 'margarita', 'water', 'milk',
]);

/**
 * Plausibility guard. A single logged meal above ~1.5 kg or ~2,500 kcal is
 * almost always a parse error (a count read as grams, a repeated segment, a
 * "kg" that should have been "g") rather than a real plate — 2,500 kcal is a
 * whole day's intake for this persona. We do not silently rewrite the numbers:
 * the estimate is kept, every item's confidence is capped at 0.4 (Low), and the
 * one clarifying question asks about the total. Both bounds are heuristics
 * chosen for this app, not published limits.
 */
export const PLAUSIBLE_MAX_G = 1500;
export const PLAUSIBLE_MAX_KCAL = 2500;
export const IMPLAUSIBLE_CONF_CAP = 0.4;

/** At or below this confidence a segment earns the estimate's one clarifying question. */
const CLARIFY_AT = 0.3;

// Match-quality thresholds on findFood()'s 0–1 score.
const STRONG = 0.8;

/**
 * A bare digit number with no unit (R5-3): the persona weighs food, so "chicken
 * tikka 200" means 200 g, not 200 pieces. ≥ BARE_GRAMS_MIN is read as grams at
 * 0.6 confidence with an "assumed … g" note; below it the number stays a
 * piece count, capped at MAX_BARE_COUNT. Number words ("two", "half") are
 * always counts.
 */
const BARE_GRAMS_MIN = 20;
const MAX_BARE_COUNT = 12;
const BARE_GRAMS_CONF = 0.6;

/** "quarter/half chicken" is a restaurant portion of a whole roast bird (~1.2 kg), not ¼ of a tikka piece (R5-14). */
const WHOLE_ROAST_CHICKEN_GRAMS = 1200;
const ROAST_CHICKEN_WORDS = new Set(['chicken', 'roast', 'roasted', 'rotisserie', 'grilled', 'charcoal', 'bbq', 'whole']);

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, single: 1, two: 2, double: 2, three: 3, triple: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10, half: 0.5, quarter: 0.25,
  '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3,
};
const FRACTION_WORDS = new Set(['half', 'quarter', '½', '¼', '¾', '⅓', '⅔']);

/** small/medium/large scale the portion (0.75 / 1 / 1.4) — the §2 quick-portion vocabulary. */
const SIZE_WORDS: Record<string, number> = {
  small: 0.75, mini: 0.75, little: 0.75, medium: 1, regular: 1, normal: 1, standard: 1,
  large: 1.4, big: 1.4, jumbo: 1.4, xl: 1.4, huge: 1.4,
};

/** Mass units → grams (ml treated as g: drinks are ~water density). */
const MASS_UNITS: Record<string, number> = {
  g: 1, gram: 1, gm: 1, gr: 1, kg: 1000, kilo: 1000, kilogram: 1000,
  oz: 28.35, ounce: 28.35, lb: 453.6, pound: 453.6, ml: 1, litre: 1000, liter: 1000,
};

/** Portion units → generic grams; 0 = "use the item's own natural unit or default". */
const PORTION_UNITS: Record<string, number> = {
  cup: 240, tbsp: 15, tablespoon: 15, tsp: 5, teaspoon: 5, piece: 0, pc: 0, serving: 0, portion: 0,
  plate: 350, bowl: 250, wrap: 300, skewer: 75, slice: 30, scoop: 30, glass: 250, can: 330,
  handful: 30, bar: 60, bottle: 500, mug: 300, shot: 30, katori: 150,
};
const STOP = new Set([
  'a', 'an', 'the', 'of', 'some', 'my', 'in', 'from', 'style', 'x', 'about', 'around', 'approx', 'roughly',
  // Serving verbs left behind by a compound split ("rice topped with dal" → "rice topped").
  'topped', 'served', 'garnished', 'drizzled', 'covered', 'smothered',
]);

/**
 * Preparation media, not second foods. "Chicken in butter sauce" is one dish;
 * "tuna in water" is one tin. A tail made of these words never starts a new
 * item unless the user gave it a weight of its own ("with 20 g butter").
 *
 * Milk is deliberately NOT here: "oats in milk" and "whey in milk" are two
 * things eaten, and the milk is most of the calories — dropping it is exactly
 * the undercount this section exists to fix.
 */
const PREPARATION_WORDS = new Set([
  'sauce', 'gravy', 'dressing', 'marinade', 'brine', 'syrup', 'broth', 'stock', 'batter', 'glaze',
  'oil', 'ghee', 'butter', 'cream', 'masala', 'water', 'seasoning', 'spice', 'salt', 'pepper',
]);

const NUM_WORD_RE = '(?:\\d+(?:\\.\\d+)?|a|an|one|two|three|four|five|six|seven|eight|nine|ten)';

/** A whole phrase scoring this high is itself the dish — never split it ("coffee with milk" is a latte). */
const KNOWN_DISH = 0.95;
/** Minimum match for a tail that carries its own quantity to become its own item. */
const QUANTIFIED_TAIL = 0.6;

/**
 * "dal on rice" / "whey in milk": the compound joiners. "topped with" is not
 * listed because the `with` split below already cuts it — "topped" itself is a
 * STOP word, so "rice topped with dal" lands as "rice" + "dal" either way.
 */
const COMPOUND_JOIN_RE = /\s+(?:in|on|over)\s+/g;

/**
 * Normalise quantity idioms that would otherwise be split or mis-read, then
 * split into food segments on ',', '+', ';', '&', newlines, 'and', 'plus',
 * 'with', the compound joiners ('in' / 'on' / 'over' / 'topped with') and — the
 * biggest source of undercounting — a second quantity inside one segment.
 *
 * Every optional split is guarded: "X with Y" and "X in Y" stay whole when the
 * phrase is itself a known dish, and a compound tail must be a food in its own
 * right (see `tailIsSeparateFood`).
 */
export function splitFoodSegments(text: string, extra: FoodItem[] = [], cuisines: string[] = []): string[] {
  const t = text
    .toLowerCase()
    .replace(new RegExp(`\\b(${NUM_WORD_RE})\\s+and\\s+a\\s+half\\b`, 'g'), '$1 ½')
    .replace(/\b(?:a\s+)?couple\s+of\b|\ba\s+couple\b/g, '2')
    .replace(/\ba\s+few\b/g, '3')
    .replace(/\bhalf\s+a\s+dozen\b/g, '6')
    .replace(/\b(?:a\s+)?dozen\b/g, '12');
  const out: string[] = [];
  for (const piece of t.split(/\s*(?:,|\+|;|&|\n|\band\b|\bplus\b)\s*/)) {
    const p = piece.trim();
    if (!p) continue;
    // "with" first: it is the coarser join, and splitting it keeps a compound
    // tail ("chicken in butter sauce with 2 rotis") from swallowing the rotis.
    const parts =
      /\bwith\b/.test(p) && (findFood(p, extra, { cuisines })[0]?.score ?? 0) < KNOWN_DISH
        ? p.split(/\s*\bwith\b\s*/).map((s) => s.trim()).filter(Boolean)
        : [p];
    for (const part of parts) {
      for (const compound of splitCompound(part, extra, cuisines)) out.push(...splitOnSecondQuantity(compound));
    }
  }
  return mergeQuantitySegments(out);
}

/**
 * Split "X in/on/over Y" into two foods when Y stands on its own ("topped with"
 * is cut by the `with` split above). Guarded three ways, because the same words
 * also describe how one dish was cooked: the whole phrase must not be a known
 * dish, the tail must not be a preparation medium (butter sauce, brine, oil),
 * and the tail must either match the DB strongly or carry its own quantity
 * ("in 250 ml milk").
 */
function splitCompound(phrase: string, extra: FoodItem[], cuisines: string[]): string[] {
  const joins = [...phrase.matchAll(COMPOUND_JOIN_RE)];
  if (!joins.length) return [phrase];
  if ((findFood(phrase, extra, { cuisines })[0]?.score ?? 0) >= KNOWN_DISH) return [phrase];
  // Every joiner is tried in turn: a blocked one ("chicken IN butter sauce over
  // rice") must not hide the split that does hold ("… OVER rice").
  for (const m of joins) {
    const at = m.index ?? -1;
    if (at <= 0) continue;
    const head = phrase.slice(0, at).trim();
    const tail = phrase.slice(at + m[0].length).trim();
    if (!head || !tail || !tailIsSeparateFood(tail, extra, cuisines)) continue;
    return [head, ...splitCompound(tail, extra, cuisines)];
  }
  return [phrase];
}

function tailIsSeparateFood(tail: string, extra: FoodItem[], cuisines: string[]): boolean {
  const q = parseQuantity(tail);
  if (!q.food.length) return false;
  const quantified = q.count !== null || q.unit !== null;
  if (!quantified && q.food.some((t) => PREPARATION_WORDS.has(singularize(t)))) return false;
  const score = findFood(q.food.join(' '), extra, { cuisines })[0]?.score ?? 0;
  return score >= (quantified ? QUANTIFIED_TAIL : STRONG);
}

/** Tokens that carry no food meaning: numbers, units, sizes and filler. */
function isFoodToken(t: string): boolean {
  return parseNum(t) === null && !isMassUnit(t) && !isPortionUnit(t) && !(t in SIZE_WORDS) && !STOP.has(t);
}

/** Index just past the quantity that starts at `i` (mixed fraction, "2 x 100", trailing unit). */
function endOfQuantity(toks: string[], i: number): number {
  let count = parseNum(toks[i]) as number;
  let j = i + 1;
  while (j < toks.length && Number.isInteger(count) && count >= 1 && FRACTION_WORDS.has(toks[j])) {
    count += NUMBER_WORDS[toks[j]];
    j++;
  }
  if (toks[j] === 'x' && j + 1 < toks.length && parseNum(toks[j + 1]) !== null && /^\d/.test(toks[j + 1])) j += 2;
  while (j < toks.length && count < 1 && (toks[j] === 'a' || toks[j] === 'an' || toks[j] === 'of')) j++;
  if (j < toks.length && (isMassUnit(toks[j]) || isPortionUnit(toks[j]))) j++;
  return j;
}

/**
 * A SECOND quantity inside one segment starts a new food (R-1g). "200 g chicken
 * 2 rotis" is two items; before this the "2 rotis" was swallowed into the
 * chicken's name and the rotis went unlogged, which was the single biggest
 * source of undercounting. The cut is only made when a food word separates the
 * two quantities, so "half a naan", "1 ½ rotis" and "2 x 100 g" stay whole, and
 * a trailing weight ("chicken tikka 200 g") is still that dish's own quantity.
 */
function splitOnSecondQuantity(segment: string): string[] {
  const toks = normalise(segment).split(' ').filter(Boolean);
  const cuts: number[] = [];
  let sawQuantity = false;
  let sawFood = false;
  for (let i = 0; i < toks.length; i++) {
    if (parseNum(toks[i]) !== null) {
      if (sawQuantity && sawFood) {
        cuts.push(i);
        sawFood = false;
      }
      sawQuantity = true;
      i = endOfQuantity(toks, i) - 1;
      continue;
    }
    if (isFoodToken(toks[i])) sawFood = true;
  }
  if (!cuts.length) return [segment];
  const out: string[] = [];
  let from = 0;
  for (const cut of [...cuts, toks.length]) {
    const piece = toks.slice(from, cut).join(' ').trim();
    if (piece) out.push(piece);
    from = cut;
  }
  return out;
}

/** True when a segment carries only quantity words — "200 g", "2", "half", "a bowl", "large" — and no food. */
function isQuantityOnly(segment: string): boolean {
  const toks = normalise(segment).split(' ').filter(Boolean);
  return (
    toks.length > 0 &&
    toks.every((t) => parseNum(t) !== null || FRACTION_WORDS.has(t) || isMassUnit(t) || isPortionUnit(t) || t in SIZE_WORDS || STOP.has(t))
  );
}

/**
 * "chicken tikka, 200 g" splits into a food and a quantity; the quantity
 * belongs to the food, not to a phantom "200 g" item (R5-8). A quantity-only
 * segment is appended to the preceding food segment, or prepended to the
 * following one when it comes first ("200 g and chicken tikka").
 */
function mergeQuantitySegments(segments: string[]): string[] {
  const out: string[] = [];
  let pendingPrefix = '';
  for (const seg of segments) {
    if (isQuantityOnly(seg)) {
      if (out.length) out[out.length - 1] = `${out[out.length - 1]} ${seg}`;
      else pendingPrefix = pendingPrefix ? `${pendingPrefix} ${seg}` : seg;
      continue;
    }
    out.push(pendingPrefix ? `${pendingPrefix} ${seg}` : seg);
    pendingPrefix = '';
  }
  if (pendingPrefix) out.push(pendingPrefix);
  return out;
}

function parseNum(tok: string): number | null {
  if (/^\d+(\.\d+)?$/.test(tok)) return Number(tok);
  const frac = /^(\d+)\/(\d+)$/.exec(tok);
  if (frac && Number(frac[2]) > 0) return Number(frac[1]) / Number(frac[2]);
  return tok in NUMBER_WORDS ? NUMBER_WORDS[tok] : null;
}

const isMassUnit = (t: string) => singularize(t) in MASS_UNITS;
const isPortionUnit = (t: string) => singularize(t) in PORTION_UNITS;

interface Quantity {
  count: number | null;
  /** The count was typed as digits ("200"), not a number word ("two", "half") — only digits can mean grams (R5-3). */
  countNumeric: boolean;
  /** Singularised unit token, or null. */
  unit: string | null;
  unitKind: 'mass' | 'portion' | null;
  sizeFactor: number;
  sizeWord: string | null;
  /** Raw food tokens (unit excluded). */
  food: string[];
  /** Raw food tokens with a tentative portion unit kept in place ("shawarma wrap"). */
  foodWithUnit: string[];
}

/** Pull quantity, unit and size words out of one segment, leaving the food phrase. */
function parseQuantity(segment: string): Quantity {
  const toks = normalise(segment).split(' ').filter(Boolean);
  const used = new Set<number>();
  let count: number | null = null;
  let countNumeric = false;
  let j = -1;
  for (let i = 0; i < toks.length; i++) {
    const n = parseNum(toks[i]);
    if (n === null) continue;
    count = n;
    countNumeric = /^\d/.test(toks[i]);
    used.add(i);
    j = i + 1;
    // Mixed numbers: "1 ½", "2 1/2".
    while (j < toks.length && Number.isInteger(count) && count >= 1 && FRACTION_WORDS.has(toks[j])) {
      count += NUMBER_WORDS[toks[j]];
      used.add(j++);
    }
    // Multiplier: "2 x 100 g" → 200 g.
    if (toks[j] === 'x' && j + 1 < toks.length) {
      const m = parseNum(toks[j + 1]);
      if (m !== null && /^\d/.test(toks[j + 1])) {
        count *= m;
        used.add(j).add(j + 1);
        j += 2;
      }
    }
    // "half a naan", "half of a naan" — the article is filler, not a second count.
    while (j < toks.length && count < 1 && (toks[j] === 'a' || toks[j] === 'an' || toks[j] === 'of')) used.add(j++);
    break;
  }
  let sizeFactor = 1;
  let sizeWord: string | null = null;
  toks.forEach((t, i) => {
    if (!used.has(i) && t in SIZE_WORDS) {
      sizeFactor = SIZE_WORDS[t];
      sizeWord = t;
      used.add(i);
    }
  });
  // Unit candidate: right after the number, else a leading or trailing portion word.
  let unitIdx = -1;
  const free = (i: number) => i >= 0 && i < toks.length && !used.has(i);
  if (count !== null && free(j) && (isMassUnit(toks[j]) || isPortionUnit(toks[j]))) unitIdx = j;
  else if (count !== null && free(toks.length - 1) && isPortionUnit(toks[toks.length - 1])) unitIdx = toks.length - 1;
  else if (count === null) {
    const first = toks.findIndex((_, i) => free(i));
    const last = toks.length - 1;
    if (free(first) && isPortionUnit(toks[first])) unitIdx = first;
    else if (free(last) && isPortionUnit(toks[last])) unitIdx = last;
  }
  let unit: string | null = null;
  let unitKind: Quantity['unitKind'] = null;
  if (unitIdx >= 0) {
    unit = singularize(toks[unitIdx]);
    unitKind = unit in MASS_UNITS ? 'mass' : 'portion';
  }
  const foodWithUnit = toks.filter((t, i) => !used.has(i) && !STOP.has(t));
  const food = toks.filter((t, i) => !used.has(i) && i !== unitIdx && !STOP.has(t));
  return { count, countNumeric, unit, unitKind, sizeFactor, sizeWord, food, foodWithUnit };
}

const fmtCount = (n: number): string => {
  const whole = Math.floor(n);
  const frac = round(n - whole, 2);
  const glyph = frac === 0.5 ? '½' : frac === 0.25 ? '¼' : frac === 0.75 ? '¾' : null;
  if (glyph) return whole ? `${whole}${glyph}` : glyph;
  return String(round(n, 2));
};
const plural = (name: string, n: number) => (n <= 1 ? name : /(s|x|ch|sh)$/.test(name) ? `${name}es` : `${name}s`);

function itemUnitMatches(item: FoodItem, unit: string | null): boolean {
  return !!unit && !!item.unitName && !!item.unitGrams && singularize(normalise(item.unitName)) === unit;
}

/** Scale an item's per-100 g macros to a gram amount. */
function macrosFor(per100: Macros, grams: number) {
  const k = grams / 100;
  return {
    kcal: round(per100.kc * k),
    protein_g: round(per100.p * k, 1),
    fat_g: round(per100.f * k, 1),
    carbs_g: round(per100.c * k, 1),
    fiber_g: round(per100.fi * k, 1),
  };
}

interface Parsed {
  item: FoodEstimateItem;
  segment: string;
}

/** "20 prawns" / "3 eggs": the plural of the item's own unit word is an explicit piece count, not an ambiguous bare number. */
const MAX_PLURAL_UNIT_COUNT = 50;

/**
 * Bare digits with no unit: grams when ≥ BARE_GRAMS_MIN, else a count capped
 * at MAX_BARE_COUNT (R5-3). When the food phrase is the plural of the matched
 * item's unit ("20 prawns", "15 rotis") the user counted pieces, so it stays a
 * count (uncapped up to MAX_PLURAL_UNIT_COUNT); 'plural' marks that case.
 */
function bareNumberRead(q: Quantity, item?: FoodItem): 'grams' | 'count' | 'plural' | null {
  if (q.unit !== null || q.count === null || !q.countNumeric) return null;
  const unitWord = item?.unitName ? singularize(normalise(item.unitName)) : null;
  const pluralUnit = !!unitWord && q.food.some((t) => t.endsWith('s') && singularize(t) === unitWord);
  if (pluralUnit && q.count <= MAX_PLURAL_UNIT_COUNT) return 'plural';
  return q.count >= BARE_GRAMS_MIN ? 'grams' : 'count';
}

function isRoastChickenIdiom(q: Quantity): boolean {
  return (
    q.count !== null &&
    q.count > 0 &&
    q.count < 1 &&
    q.unit === null &&
    q.food.includes('chicken') &&
    q.food.every((t) => ROAST_CHICKEN_WORDS.has(t))
  );
}

/**
 * The beverage word in a phrase, if any ("mango smoothie" → "smoothie").
 *
 * A word that is both a drink and a cooking medium ("water", "milk") only
 * counts when it is the whole phrase: in "tuna in water" the water is what the
 * tuna is packed in, and reading the tin as a glass of water loses the tuna.
 */
function beverageWord(toks: string[]): string | null {
  for (const t of toks) {
    const s = singularize(t);
    if (!BEVERAGE_WORDS.has(s)) continue;
    if (PREPARATION_WORDS.has(s) && toks.length > 1) continue;
    return s;
  }
  return null;
}

/** True when the matched item is itself that kind of drink ("tea" → chai keeps the match). */
function itemCoversWord(item: FoodItem, word: string): boolean {
  return [item.name, ...(item.aliases ?? [])].some((k) => tokens(k).includes(word));
}

/** An item whose whole name is a cooking medium: Water, Butter, Ghee. */
const isMediumOnly = (m: FoodMatch) => tokens(m.item.name).every((t) => PREPARATION_WORDS.has(singularize(t)));

/**
 * A dish is never identified by the medium it sits in. "Tuna in water" scores
 * tuna and water identically (one matched token each), and the lower-kcal
 * tie-break would hand it to a glass of water — so a medium-only top match
 * yields to any real food within the same tie band.
 */
function demoteMediumOnly(rows: FoodMatch[]): FoodMatch[] {
  if (rows.length < 2 || !isMediumOnly(rows[0])) return rows;
  const alt = rows.find((r) => r.score >= rows[0].score - TIE_BAND && !isMediumOnly(r));
  return alt ? [alt, ...rows.filter((r) => r !== alt)] : rows;
}

function parseSegment(segment: string, extra: FoodItem[], cuisines: string[]): Parsed {
  const q = parseQuantity(segment);
  const pick = (toks: string[]): FoodMatch | null =>
    toks.length ? demoteMediumOnly(findFood(toks.join(' '), extra, { cuisines }))[0] ?? null : null;
  if (isRoastChickenIdiom(q)) {
    const roast = getFood('roast-chicken');
    if (roast) {
      const grams = Math.max(1, round((q.count as number) * WHOLE_ROAST_CHICKEN_GRAMS * q.sizeFactor));
      const asm = `assumed ${fmtCount(q.count as number)} of a whole roast chicken (~${WHOLE_ROAST_CHICKEN_GRAMS} g), ${grams} g; restaurant-style, moderate oil`;
      return { segment, item: { name: roast.name, grams, ...macrosFor(roast.per100, grams), confidence: 0.6, assumptions: asm, tags: [...(roast.tags ?? [])] } };
    }
  }
  let match = pick(q.food);
  let unit = q.unit;
  let unitKind = q.unitKind;
  if (unitKind === 'portion') {
    // Is the "unit" really part of the dish name ("chicken shawarma wrap", "whey scoop")?
    const alt = pick(q.foodWithUnit);
    if (alt && (!match || alt.score >= match.score)) {
      match = alt;
      unit = null;
      unitKind = null;
    }
  }
  // An unrecognised drink gets the beverage prior, not the mixed-plate one —
  // unless the (weak) match we have is that drink already.
  const bev = beverageWord(q.food);
  if (bev && (!match || (match.score < STRONG && !itemCoversWord(match.item, bev)))) {
    return unknownItem(segment, q, bev);
  }
  if (!match) return unknownItem(segment, q);

  const it = match.item;
  const size = q.sizeWord ?? 'medium';
  const sizeNote = q.sizeWord ? `${q.sizeWord} ` : '';
  let grams: number;
  let conf: number;
  let asm: string;
  const bare = bareNumberRead({ ...q, unit }, it);
  const capped = bare === 'count' && (q.count as number) > MAX_BARE_COUNT;
  const count = capped ? MAX_BARE_COUNT : (q.count ?? 1);
  const capNote = capped ? ` (${q.count} read as a count, capped at ${MAX_BARE_COUNT} — add "g" if you meant grams)` : '';
  if (unitKind === 'mass' && unit) {
    grams = count * MASS_UNITS[unit];
    conf = 0.9;
    asm = `${round(grams)} g as stated`;
  } else if (bare === 'grams') {
    grams = count;
    conf = BARE_GRAMS_CONF;
    asm = `assumed ${round(grams)} g (no unit given)`;
  } else if (itemUnitMatches(it, unit) || (unit === null && q.count !== null && it.unitGrams)) {
    const ug = it.unitGrams as number;
    const uname = it.unitName ?? 'piece';
    grams = count * ug * q.sizeFactor;
    conf = 0.75;
    asm = `assumed ${fmtCount(count)} ${size} ${plural(uname, count)}, ${round(ug * q.sizeFactor)} g${count > 1 ? ' each' : ''}${capNote}`;
  } else if (unit && PORTION_UNITS[unit] > 0) {
    grams = count * PORTION_UNITS[unit] * q.sizeFactor;
    conf = 0.6;
    asm = `assumed ${fmtCount(count)} ${sizeNote}${plural(unit, count)} ≈ ${round(grams)} g`;
  } else if (q.count !== null) {
    grams = count * it.defaultGrams * q.sizeFactor;
    conf = 0.6;
    asm = `assumed ${fmtCount(count)} ${sizeNote}${plural('portion', count)}, ${round(it.defaultGrams * q.sizeFactor)} g${count > 1 ? ' each' : ''}${capNote}`;
  } else {
    grams = it.defaultGrams * q.sizeFactor;
    conf = 0.6;
    asm = `assumed a ${q.sizeWord ? `${q.sizeWord} ` : 'typical '}portion, ${round(grams)} g`;
  }
  if (match.score < STRONG) {
    conf = Math.min(conf, 0.45);
    asm = `matched "${segment}" to ${it.name} (low confidence); ${asm}`;
  }
  if (it.tags?.includes('restaurant')) asm += '; restaurant-style, moderate oil';
  grams = Math.max(1, round(grams));
  return {
    segment,
    item: { name: it.name, grams, ...macrosFor(it.per100, grams), confidence: conf, assumptions: asm, tags: [...(it.tags ?? [])] },
  };
}

/**
 * A segment we could not identify. `bev` (a drink word found in the phrase)
 * switches the prior from a mixed restaurant plate to a glass of a sweetened
 * drink, which is the difference between charging "watermelon smoothie" 500
 * kcal and charging it 100.
 */
function unknownItem(segment: string, q: Quantity, bev?: string): Parsed {
  const per100 = bev ? BEVERAGE_PER100 : GENERIC_PER100;
  const defaultGrams = bev ? BEVERAGE_GRAMS : GENERIC_GRAMS;
  const countGrams = bev ? BEVERAGE_GRAMS : UNKNOWN_COUNT_GRAMS;
  let grams: number;
  const bare = bareNumberRead(q);
  if (q.unitKind === 'mass' && q.unit) grams = (q.count ?? 1) * MASS_UNITS[q.unit];
  else if (q.unit && PORTION_UNITS[q.unit] > 0) grams = (q.count ?? 1) * PORTION_UNITS[q.unit] * q.sizeFactor;
  else if (bare === 'grams') grams = q.count as number;
  else if (q.count !== null) grams = Math.min(q.count, bare === 'count' ? MAX_BARE_COUNT : Infinity) * countGrams * q.sizeFactor;
  else grams = defaultGrams * q.sizeFactor;
  grams = Math.max(1, round(grams));
  return {
    segment,
    item: {
      name: segment.trim(),
      grams,
      ...macrosFor(per100, grams),
      confidence: bev ? BEVERAGE_CONF : 0.2,
      assumptions: bev
        ? `unknown drink — assumed a ${BEVERAGE_GRAMS} g glass at ${BEVERAGE_PER100.kc} kcal/100 g, edit before saving`
        : `unknown food — generic mixed-dish estimate (${GENERIC_PER100.kc} kcal/100 g), edit before saving`,
      tags: [],
    },
  };
}

/** Whole-number gram/kcal totals for the plausibility question. */
const fmtTotal = (n: number) => Math.round(n).toLocaleString('en-US');

/** Parse free text into a local FoodEstimate. Never throws; empty input yields no items and one question. */
export function parseFoodText(text: string, opts: ParseFoodOptions = {}): FoodEstimate {
  const extra = opts.extra ?? [];
  const cuisines = opts.cuisines ?? [];
  const segments = splitFoodSegments(text ?? '', extra, cuisines);
  if (!segments.length) return { items: [], clarify: 'What did you eat, and roughly how much?', source: 'local' };
  const parsed = segments.map((s) => parseSegment(s, extra, cuisines));
  let items = parsed.map((p) => p.item);
  let clarify: string | null = null;
  const worst = parsed.reduce((a, b) => (b.item.confidence < a.item.confidence ? b : a));
  if (worst.item.confidence <= CLARIFY_AT) clarify = `What was in "${worst.segment}" and roughly how much?`;

  // Plausibility: a 3 kg / 5,000 kcal "meal" is a parse error, not a plate.
  const totalG = items.reduce((s, i) => s + i.grams, 0);
  const totalKcal = items.reduce((s, i) => s + i.kcal, 0);
  if (totalG > PLAUSIBLE_MAX_G || totalKcal > PLAUSIBLE_MAX_KCAL) {
    items = items.map((i) => ({ ...i, confidence: Math.min(i.confidence, IMPLAUSIBLE_CONF_CAP) }));
    clarify = `That adds up to ${fmtTotal(totalG)} g and ${fmtTotal(totalKcal)} kcal — is that the whole amount, or a smaller portion?`;
  }
  return { items, clarify, source: 'local' };
}

// ---------------------------------------------------------------------------
// Conversions shared by the Log screen
// ---------------------------------------------------------------------------

/** Library item + grams → estimate item (favorites/recents tap: explicit grams, strong match → 0.9). */
export function foodItemToEstimate(item: FoodItem, grams: number): FoodEstimateItem {
  const g = Math.max(0, round(grams));
  let asm = `${g} g of ${item.name}`;
  if (item.tags?.includes('restaurant')) asm += '; restaurant-style, moderate oil';
  return { name: item.name, grams: g, ...macrosFor(item.per100, g), confidence: 0.9, assumptions: asm, tags: [...(item.tags ?? [])] };
}

/** Re-scale an estimate to a new gram amount (quantity steppers). Confidence and assumptions are kept. */
export function scaleItem(item: FoodEstimateItem, grams: number): FoodEstimateItem {
  const g = Math.max(0, round(grams));
  if (!(item.grams > 0)) return { ...item, grams: g };
  const k = g / item.grams;
  return {
    ...item,
    grams: g,
    kcal: round(item.kcal * k),
    protein_g: round(item.protein_g * k, 1),
    fat_g: round(item.fat_g * k, 1),
    carbs_g: round(item.carbs_g * k, 1),
    fiber_g: round(item.fiber_g * k, 1),
  };
}

/** Estimate item → persisted meal (compact keys). `conf` is only kept for AI-sourced meals. */
export function itemToMeal(item: FoodEstimateItem, time: HHMM, src: MealSource): Omit<Meal, 'id'> {
  const meal: Omit<Meal, 'id'> = {
    t: time,
    n: item.name,
    g: Math.max(0, round(item.grams)),
    kc: Math.max(0, round(item.kcal)),
    p: Math.max(0, round(item.protein_g, 1)),
    f: Math.max(0, round(item.fat_g, 1)),
    c: Math.max(0, round(item.carbs_g, 1)),
    fi: Math.max(0, round(item.fiber_g, 1)),
    src,
  };
  if (src === 'ai') meal.conf = Math.min(1, Math.max(0, item.confidence));
  if (item.assumptions) meal.as = item.assumptions;
  if (item.tags?.length) meal.tags = [...item.tags];
  return meal;
}

/** §9 UI chip: High ≥0.8 green / Med 0.5–0.79 yellow / Low <0.5 gray. */
export function confidenceBand(conf: number): { band: 'high' | 'med' | 'low'; label: string; color: 'green' | 'yellow' | 'neutral' } {
  if (Number.isFinite(conf) && conf >= 0.8) return { band: 'high', label: 'High', color: 'green' };
  if (Number.isFinite(conf) && conf >= 0.5) return { band: 'med', label: 'Med', color: 'yellow' };
  return { band: 'low', label: 'Low', color: 'neutral' };
}
