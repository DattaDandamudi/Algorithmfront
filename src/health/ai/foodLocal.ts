import type { FoodEstimate, FoodEstimateItem, FoodItem, HHMM, Macros, Meal, MealSource } from '../data/types';
import { round } from '../lib/format';
import { findFood, normalise, singularize, type FoodMatch } from './foodDb';

/**
 * Deterministic natural-language food parser (§2 "200 g chicken tikka and one
 * roti" → editable macro card). Used offline (AI provider 'none') and as the
 * fallback whenever the Claude path fails, so it must never throw.
 *
 * Confidence ladder (mirrors the §9 UI chips: High ≥0.8 / Med 0.5–0.79 / Low <0.5):
 *   0.9  explicit grams + strong DB match         "200 g chicken tikka"
 *   0.75 count × a known natural unit             "2 rotis", "a plate of biryani"
 *   0.6  default / generic portion assumed        "chicken shawarma wrap", "a bowl of X"
 *   0.45 weak fuzzy match (prefix / typo / partial overlap)
 *   0.2  unknown food → generic mixed-dish prior (200 kcal/100 g) + one clarifying question
 *
 * The spec allows at most ONE clarifying question per estimate, so only the
 * single most uncertain unknown segment gets `clarify`; everything else is null.
 */

export interface ParseFoodOptions {
  /** Favorites/recents — searched first and win ties over the built-in DB. */
  extra?: FoodItem[];
  /** Reserved for time-of-day heuristics; the deterministic parser ignores it today. */
  now?: HHMM;
}

/** Fallback prior for a dish we cannot identify: a mixed restaurant plate. */
export const GENERIC_PER100: Macros = { kc: 200, p: 8, f: 10, c: 20, fi: 2 };
const GENERIC_GRAMS = 250;
const UNKNOWN_COUNT_GRAMS = 150;

// Match-quality thresholds on findFood()'s 0–1 score.
const STRONG = 0.8;

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
const STOP = new Set(['a', 'an', 'the', 'of', 'some', 'my', 'in', 'from', 'style', 'x', 'about', 'around', 'approx', 'roughly']);

const NUM_WORD_RE = '(?:\\d+(?:\\.\\d+)?|a|an|one|two|three|four|five|six|seven|eight|nine|ten)';

/**
 * Normalise quantity idioms that would otherwise be split or mis-read, then
 * split into food segments on ',', '+', ';', '&', newlines, 'and', 'plus' and
 * 'with' — except when the whole "X with Y" phrase is itself a known dish
 * ("coffee with milk" is a latte, not coffee + a glass of milk).
 */
export function splitFoodSegments(text: string, extra: FoodItem[] = []): string[] {
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
    if (/\bwith\b/.test(p) && (findFood(p, extra)[0]?.score ?? 0) < 0.95) {
      out.push(...p.split(/\s*\bwith\b\s*/).map((s) => s.trim()).filter(Boolean));
    } else {
      out.push(p);
    }
  }
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
  let j = -1;
  for (let i = 0; i < toks.length; i++) {
    const n = parseNum(toks[i]);
    if (n === null) continue;
    count = n;
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
  return { count, unit, unitKind, sizeFactor, sizeWord, food, foodWithUnit };
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

function parseSegment(segment: string, extra: FoodItem[]): Parsed {
  const q = parseQuantity(segment);
  const pick = (toks: string[]): FoodMatch | null => (toks.length ? findFood(toks.join(' '), extra)[0] ?? null : null);
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
  if (!match) return unknownItem(segment, q);

  const it = match.item;
  const size = q.sizeWord ?? 'medium';
  const sizeNote = q.sizeWord ? `${q.sizeWord} ` : '';
  let grams: number;
  let conf: number;
  let asm: string;
  const count = q.count ?? 1;
  if (unitKind === 'mass' && unit) {
    grams = count * MASS_UNITS[unit];
    conf = 0.9;
    asm = `${round(grams)} g as stated`;
  } else if (itemUnitMatches(it, unit) || (unit === null && q.count !== null && it.unitGrams)) {
    const ug = it.unitGrams as number;
    const uname = it.unitName ?? 'piece';
    grams = count * ug * q.sizeFactor;
    conf = 0.75;
    asm = `assumed ${fmtCount(count)} ${size} ${plural(uname, count)}, ${round(ug * q.sizeFactor)} g${count > 1 ? ' each' : ''}`;
  } else if (unit && PORTION_UNITS[unit] > 0) {
    grams = count * PORTION_UNITS[unit] * q.sizeFactor;
    conf = 0.6;
    asm = `assumed ${fmtCount(count)} ${sizeNote}${plural(unit, count)} ≈ ${round(grams)} g`;
  } else if (q.count !== null) {
    grams = count * it.defaultGrams * q.sizeFactor;
    conf = 0.6;
    asm = `assumed ${fmtCount(count)} ${sizeNote}${plural('portion', count)}, ${round(it.defaultGrams * q.sizeFactor)} g${count > 1 ? ' each' : ''}`;
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

function unknownItem(segment: string, q: Quantity): Parsed {
  let grams = GENERIC_GRAMS;
  if (q.unitKind === 'mass' && q.unit) grams = (q.count ?? 1) * MASS_UNITS[q.unit];
  else if (q.unit && PORTION_UNITS[q.unit] > 0) grams = (q.count ?? 1) * PORTION_UNITS[q.unit] * q.sizeFactor;
  else if (q.count !== null) grams = q.count * UNKNOWN_COUNT_GRAMS * q.sizeFactor;
  else grams = GENERIC_GRAMS * q.sizeFactor;
  grams = Math.max(1, round(grams));
  return {
    segment,
    item: {
      name: segment.trim(),
      grams,
      ...macrosFor(GENERIC_PER100, grams),
      confidence: 0.2,
      assumptions: `unknown food — generic mixed-dish estimate (${GENERIC_PER100.kc} kcal/100 g), edit before saving`,
      tags: [],
    },
  };
}

/** Parse free text into a local FoodEstimate. Never throws; empty input yields no items and one question. */
export function parseFoodText(text: string, opts: ParseFoodOptions = {}): FoodEstimate {
  const extra = opts.extra ?? [];
  const segments = splitFoodSegments(text ?? '', extra);
  if (!segments.length) return { items: [], clarify: 'What did you eat, and roughly how much?', source: 'local' };
  const parsed = segments.map((s) => parseSegment(s, extra));
  let clarify: string | null = null;
  const worst = parsed.reduce((a, b) => (b.item.confidence < a.item.confidence ? b : a));
  if (worst.item.confidence <= 0.2) clarify = `What was in "${worst.segment}" and roughly how much?`;
  return { items: parsed.map((p) => p.item), clarify, source: 'local' };
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
