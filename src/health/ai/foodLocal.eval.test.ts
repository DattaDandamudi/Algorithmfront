import { describe, expect, it } from 'vitest';
import { DEFAULT_FAVORITES, DEFAULT_PROFILE } from '../data/defaults';
import { normalise } from './foodDb';
import { parseFoodText, type ParseFoodOptions } from './foodLocal';

/**
 * Offline-parser evaluation — 40 phrases a real user would type.
 *
 * This is the accuracy floor of the whole food feature: without an API key the
 * deterministic parser is the ONLY estimator, so a phrase it gets wrong is a
 * meal the user has to re-type by hand. Each case is a phrase plus the expected
 * item names (in order) and approximate grams; a case passes only when the item
 * count, every name and every gram figure are right, so one dropped item fails
 * the whole phrase (undercounting is the failure mode that matters).
 *
 * PASS COUNT — this must never go down:
 *   baseline (parser as of Phase 0, before the §1g upgrades): 29 / 40
 *   after    (compound in/on/over splits, second-quantity segmentation,
 *             tie-break ladder, beverage prior, drink entries):  40 / 40
 *
 * The 11 phrases Phase 0 failed all produced a confident, plausible-looking
 * card: 8 dropped a whole food into the previous item's name ("200 g chicken 2
 * rotis" → one item), 1 logged a smoothie as a glass of water, and 2 charged a
 * drink at the 200 kcal/100 g mixed-plate prior. Nothing looked wrong in the
 * UI, which is why the eval exists.
 *
 * The floor below is the *after* number. If a change drops it, fix the parser
 * rather than the expectation; a phrase that genuinely cannot work belongs in
 * KNOWN_FAILURES with the reason, not deleted.
 */
const EVAL_PASS_FLOOR = 40;

interface EvalCase {
  /** What the user types. */
  phrase: string;
  /** Expected items, in order: DB name (or the raw segment for an unknown) + grams. */
  want: Array<[name: string, grams: number]>;
  /** Fractional gram tolerance; stated weights are tighter than assumed portions. */
  tol?: number;
}

const DEFAULT_TOL = 0.25;

// prettier-ignore
const CASES: EvalCase[] = [
  // -- the spec's own example and the plain multi-item cases ---------------------------------------
  { phrase: '200 g chicken tikka and one roti', want: [['Chicken tikka', 200], ['Roti', 40]], tol: 0.02 },
  { phrase: '2 rotis and dal', want: [['Roti', 80], ['Dal tadka', 200]] },
  { phrase: 'chicken curry and rice', want: [['Chicken curry', 250], ['Basmati rice (cooked)', 150]] },
  { phrase: 'dal makhani, jeera rice and 2 tandoori rotis', want: [['Dal makhani', 200], ['Jeera rice', 150], ['Roti', 80]] },
  { phrase: '2 chapatis and mixed veg curry', want: [['Roti', 80], ['Mixed veg curry', 200]] },
  { phrase: 'chicken tikka 250 g and a garlic naan', want: [['Chicken tikka', 250], ['Garlic naan', 95]] },
  { phrase: 'mutton biryani 400 g and a bowl of raita', want: [['Mutton biryani', 400], ['Raita', 100]] },
  { phrase: '200 g paneer tikka, 2 rotis and a glass of milk', want: [['Paneer tikka', 200], ['Roti', 80], ['Milk (whole)', 250]] },
  { phrase: 'two boiled eggs and black coffee', want: [['Eggs', 100], ['Black coffee', 250]] },
  { phrase: '2 samosas and a chai', want: [['Samosa', 100], ['Chai', 150]] },
  { phrase: 'hummus and pita', want: [['Hummus', 80], ['Pita', 60]] },
  { phrase: '150 g salmon and half an avocado', want: [['Salmon', 150], ['Avocado', 75]] },

  // -- "with" phrases: split, except when the whole phrase is the dish -----------------------------
  { phrase: 'chicken biryani plate with raita', want: [['Chicken biryani', 350], ['Raita', 100]] },
  { phrase: '6 falafel with tabbouleh', want: [['Falafel', 180], ['Tabbouleh', 120]] },
  { phrase: '2 idlis with sambar', want: [['Idli', 80], ['Sambar', 150]] },
  { phrase: 'quarter chicken with garlic sauce', want: [['Roast chicken', 300], ['Garlic sauce (toum)', 30]] },
  { phrase: 'chicken tikka masala with naan', want: [['Butter chicken', 250], ['Naan', 90]] },
  { phrase: 'coffee with milk', want: [['Latte', 300]] },

  // -- compound phrases joined by in / on / over / topped with -------------------------------------
  { phrase: 'grilled chicken on rice', want: [['Grilled chicken thigh', 150], ['Basmati rice (cooked)', 150]] },
  { phrase: 'eggs on toast', want: [['Eggs', 100], ['Bread', 30]] },
  { phrase: '1 scoop whey in 250 ml milk', want: [['Whey protein', 30], ['Milk (whole)', 250]] },
  { phrase: 'dal over rice', want: [['Dal tadka', 200], ['Basmati rice (cooked)', 150]] },
  { phrase: 'rice topped with chicken curry', want: [['Basmati rice (cooked)', 150], ['Chicken curry', 250]] },
  // …but a preparation medium is not a second food:
  { phrase: 'chicken in butter sauce with 2 rotis', want: [['Butter chicken', 250], ['Roti', 80]] },

  // -- a second quantity starts a new item, even with no "and" -------------------------------------
  { phrase: '200 g chicken 2 rotis', want: [['Chicken breast', 200], ['Roti', 80]] },
  { phrase: '3 eggs 2 slices of toast', want: [['Eggs', 150], ['Bread', 60]] },
  { phrase: '1 naan 200 g butter chicken', want: [['Naan', 90], ['Butter chicken', 200]] },
  { phrase: '2 rotis 150 g chicken tikka 1 bowl dal', want: [['Roti', 80], ['Chicken tikka', 150], ['Dal tadka', 200]] },

  // -- portions, counts, fractions, units ----------------------------------------------------------
  { phrase: 'a plate of biryani', want: [['Chicken biryani', 350]] },
  { phrase: 'large chicken biryani', want: [['Chicken biryani', 490]] },
  { phrase: 'half a naan and butter chicken', want: [['Naan', 45], ['Butter chicken', 250]] },
  { phrase: 'lamb chops 300g', want: [['Lamb chops', 300]], tol: 0.02 },
  { phrase: 'chicken shawarma wrap and a can of coke', want: [['Chicken shawarma wrap', 300], ['Cola', 330]] },
  { phrase: 'mixed grill plate and 2 kuboos', want: [['Mixed kebab plate', 450], ['Pita', 120]] },
  { phrase: 'oats 60 g with a banana and peanut butter', want: [['Oats', 60], ['Banana', 120], ['Peanut butter', 32]] },

  // -- drinks --------------------------------------------------------------------------------------
  { phrase: 'a glass of orange juice', want: [['Orange juice', 250]] },
  { phrase: '2 beers', want: [['Beer', 660]] },
  { phrase: 'watermelon smoothie', want: [['watermelon smoothie', 250]] },

  // -- unknown food, and an implausible total ------------------------------------------------------
  { phrase: 'grandma special', want: [['grandma special', 250]] },
  { phrase: '1 kg chicken biryani and 4 naans', want: [['Chicken biryani', 1000], ['Naan', 360]], tol: 0.02 },
];

/** Phrases that are expected to fail, with the reason in a comment. Currently none. */
const KNOWN_FAILURES: string[] = [];

const sameName = (actual: string, expected: string) => normalise(actual) === normalise(expected);

function evaluate(c: EvalCase, opts: ParseFoodOptions = {}): string | null {
  const est = parseFoodText(c.phrase, opts);
  if (est.items.length !== c.want.length) {
    return `${est.items.length} items, want ${c.want.length} (${est.items.map((i) => i.name).join(' | ')})`;
  }
  for (let i = 0; i < c.want.length; i++) {
    const [name, grams] = c.want[i];
    const got = est.items[i];
    if (!sameName(got.name, name)) return `item ${i + 1} is "${got.name}", want "${name}"`;
    const tol = Math.max(5, grams * (c.tol ?? DEFAULT_TOL));
    if (Math.abs(got.grams - grams) > tol) return `item ${i + 1} "${name}" is ${got.grams} g, want ≈${grams} g`;
  }
  return null;
}

describe('foodLocal 40-phrase evaluation', () => {
  it('has exactly 40 distinct phrases', () => {
    expect(CASES).toHaveLength(40);
    expect(new Set(CASES.map((c) => c.phrase)).size).toBe(40);
  });

  it(`passes at least ${EVAL_PASS_FLOOR} / 40 phrases`, () => {
    const failures = CASES.map((c) => ({ phrase: c.phrase, why: evaluate(c) })).filter((r) => r.why !== null);
    const passed = CASES.length - failures.length;
    const report = failures.map((f) => `  ✗ ${f.phrase} → ${f.why}`).join('\n');
    expect(passed, `${passed}/40 passed. Failures:\n${report}`).toBeGreaterThanOrEqual(EVAL_PASS_FLOOR);
    expect(failures.map((f) => f.phrase).sort()).toEqual([...KNOWN_FAILURES].sort());
  });

  /**
   * Two phrases resolve differently once the user has a library, and both are
   * the tie-break ladder working as designed rather than a miss:
   *   "a garlic naan"    → their own "Naan" entry, which lists "garlic naan" as
   *                        an alias, instead of the DB's Garlic naan;
   *   "200 g chicken …"  → their favourite Chicken tikka instead of the generic
   *                        plain-basics answer Chicken breast.
   * Everything else must still pass, so the ladder cannot quietly cost accuracy
   * for the very user it exists for.
   */
  const PRIOR_SHIFTS = ['chicken tikka 250 g and a garlic naan', '200 g chicken 2 rotis'];

  it('holds up with the persona’s cuisines and library in play', () => {
    const opts: ParseFoodOptions = { cuisines: DEFAULT_PROFILE.cuisines, extra: DEFAULT_FAVORITES };
    const failures = CASES.map((c) => ({ phrase: c.phrase, why: evaluate(c, opts) })).filter((r) => r.why !== null);
    const report = failures.map((f) => `  ✗ ${f.phrase} → ${f.why}`).join('\n');
    expect(failures.map((f) => f.phrase).sort(), `with priors:\n${report}`).toEqual([...PRIOR_SHIFTS].sort());
    expect(CASES.length - failures.length).toBeGreaterThanOrEqual(EVAL_PASS_FLOOR - PRIOR_SHIFTS.length);
  });

  it('never throws and never returns NaN on any eval phrase', () => {
    for (const c of CASES) {
      const est = parseFoodText(c.phrase);
      for (const it of est.items) {
        for (const v of [it.grams, it.kcal, it.protein_g, it.fat_g, it.carbs_g, it.fiber_g, it.confidence]) {
          expect(Number.isFinite(v), `${c.phrase} → ${it.name}`).toBe(true);
        }
      }
    }
  });
});
