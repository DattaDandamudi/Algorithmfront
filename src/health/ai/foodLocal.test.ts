import { describe, expect, it } from 'vitest';
import { DEFAULT_FAVORITES } from '../data/defaults';
import type { FoodEstimateItem, FoodItem } from '../data/types';
import { FOOD_DB, TIE_BAND, findFood, scoreTokens } from './foodDb';
import {
  BEVERAGE_PER100,
  IMPLAUSIBLE_CONF_CAP,
  PLAUSIBLE_MAX_G,
  PLAUSIBLE_MAX_KCAL,
  confidenceBand,
  foodItemToEstimate,
  itemToMeal,
  parseFoodText,
  scaleItem,
  splitFoodSegments,
} from './foodLocal';

const within = (actual: number, expected: number, pct = 0.1) =>
  Math.abs(actual - expected) <= Math.abs(expected) * pct;

describe('FOOD_DB', () => {
  it('has 70–100 items with unique slug ids, per-100 g macros and tags', () => {
    expect(FOOD_DB.length).toBeGreaterThanOrEqual(70);
    expect(FOOD_DB.length).toBeLessThanOrEqual(100);
    const ids = new Set(FOOD_DB.map((f) => f.id));
    expect(ids.size).toBe(FOOD_DB.length);
    for (const f of FOOD_DB) {
      expect(f.id).toMatch(/^[a-z0-9-]+$/);
      expect(f.defaultGrams).toBeGreaterThan(0);
      expect(f.per100.kc).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(f.tags)).toBe(true);
      if (f.unitName) expect(f.unitGrams).toBeGreaterThan(0);
    }
  });

  it('covers the spec staples', () => {
    for (const id of ['chicken-tikka', 'seekh-kebab', 'tandoori-prawns', 'lamb-chops', 'chicken-biryani', 'chicken-shawarma-wrap', 'roti', 'naan', 'rice-cooked', 'black-coffee', 'whey-protein', 'ghee']) {
      expect(FOOD_DB.find((f) => f.id === id), id).toBeDefined();
    }
    expect(FOOD_DB.find((f) => f.id === 'black-coffee')?.tags).toContain('caffeine');
    expect(FOOD_DB.find((f) => f.id === 'black-coffee')?.per100.kc).toBe(0);
  });
});

describe('findFood', () => {
  it('ranks exact names and aliases first', () => {
    expect(findFood('chicken tikka')[0]).toMatchObject({ item: { id: 'chicken-tikka' }, score: 1 });
    expect(findFood('biryani')[0].item.id).toBe('chicken-biryani');
    expect(findFood('chapati')[0].item.id).toBe('roti');
    expect(findFood('shawarma')[0].item.id).toBe('chicken-shawarma-wrap');
  });

  it('handles plurals, prefixes and typos with lower scores', () => {
    expect(findFood('rotis')[0]).toMatchObject({ item: { id: 'roti' }, score: 1 });
    const prefix = findFood('shaw')[0];
    expect(prefix.item.id).toBe('chicken-shawarma-wrap');
    expect(prefix.score).toBeLessThan(0.8);
    expect(findFood('biriyani')[0].item.id).toBe('chicken-biryani');
    expect(findFood('grandma special')).toHaveLength(0);
  });

  it('prefers extra (favorite) items on ties', () => {
    const m = findFood('chicken tikka', DEFAULT_FAVORITES);
    expect(m[0].item.id).toBe('fav_chicken_tikka');
    // de-duplicated by name: only one "Chicken tikka" row
    expect(m.filter((x) => x.item.name.toLowerCase() === 'chicken tikka')).toHaveLength(1);
  });
});

describe('splitFoodSegments', () => {
  it('splits on and / , / + / with / newlines but keeps "and a half"', () => {
    expect(splitFoodSegments('200 g chicken tikka and one roti')).toEqual(['200 g chicken tikka', 'one roti']);
    expect(splitFoodSegments('dal, rice + raita\nchai')).toEqual(['dal', 'rice', 'raita', 'chai']);
    expect(splitFoodSegments('chana masala with 2 rotis')).toEqual(['chana masala', '2 rotis']);
    expect(splitFoodSegments('one and a half rotis')).toEqual(['one ½ rotis']);
    expect(splitFoodSegments('a couple of samosas')).toEqual(['2 samosas']);
  });
});

describe('parseFoodText', () => {
  it('parses "200 g chicken tikka and one roti"', () => {
    const est = parseFoodText('200 g chicken tikka and one roti');
    expect(est.source).toBe('local');
    expect(est.items).toHaveLength(2);
    const [tikka, roti] = est.items;
    expect(tikka.name).toBe('Chicken tikka');
    expect(tikka.grams).toBe(200);
    expect(within(tikka.kcal, 330)).toBe(true);
    expect(within(tikka.protein_g, 50)).toBe(true);
    expect(tikka.confidence).toBe(0.9);
    expect(tikka.assumptions).toContain('200 g as stated');
    expect(tikka.assumptions).toContain('restaurant-style');
    expect(tikka.tags).toContain('poultry');
    expect(roti.name).toBe('Roti');
    expect(roti.grams).toBe(40);
    expect(roti.confidence).toBe(0.75);
    expect(roti.assumptions).toBe('assumed 1 medium roti, 40 g');
    expect(est.clarify).toBeNull();
  });

  it('honours favorites/recents passed as extra', () => {
    const est = parseFoodText('200g chicken tikka', { extra: DEFAULT_FAVORITES });
    expect(est.items[0].grams).toBe(200);
    expect(est.items[0].kcal).toBe(330);
  });

  it('counts natural units: "2 rotis"', () => {
    const [it] = parseFoodText('2 rotis').items;
    expect(it.name).toBe('Roti');
    expect(it.grams).toBe(80);
    expect(it.confidence).toBe(0.75);
    expect(it.assumptions).toContain('2 medium rotis, 40 g each');
    expect(within(it.kcal, 240)).toBe(true);
  });

  it('handles fractions: "half a naan"', () => {
    const [it] = parseFoodText('half a naan').items;
    expect(it.name).toBe('Naan');
    expect(it.grams).toBe(45);
    expect(it.confidence).toBe(0.75);
    expect(it.assumptions).toContain('½');
  });

  it('handles "a plate of biryani" as one plate of chicken biryani', () => {
    const est = parseFoodText('a plate of biryani');
    expect(est.items).toHaveLength(1);
    expect(est.items[0].name).toBe('Chicken biryani');
    expect(est.items[0].grams).toBe(350);
    expect(est.items[0].confidence).toBe(0.75);
    expect(est.items[0].tags).toEqual(expect.arrayContaining(['poultry', 'grain', 'restaurant']));
    expect(est.clarify).toBeNull();
  });

  it('uses the default portion when no quantity is given: "chicken shawarma wrap"', () => {
    const [it] = parseFoodText('chicken shawarma wrap').items;
    expect(it.name).toBe('Chicken shawarma wrap');
    expect(it.grams).toBe(300);
    expect(it.confidence).toBe(0.6);
    expect(it.assumptions).toContain('typical portion');
    expect(it.tags).toContain('poultry');
  });

  it('keeps a trailing unit word that is part of the dish name, and counts it', () => {
    const [it] = parseFoodText('2 chicken shawarma wraps').items;
    expect(it.name).toBe('Chicken shawarma wrap');
    expect(it.grams).toBe(600);
    expect(it.confidence).toBe(0.75);
    const [plate] = parseFoodText('chicken shawarma plate').items;
    expect(plate.name).toBe('Chicken shawarma plate');
    expect(plate.grams).toBe(400);
  });

  it('"black coffee" is 0 kcal and tagged caffeine', () => {
    const [it] = parseFoodText('black coffee').items;
    expect(it.name).toBe('Black coffee');
    expect(it.kcal).toBe(0);
    expect(it.tags).toContain('caffeine');
    expect(it.confidence).toBe(0.6);
  });

  it('applies size words and generic units', () => {
    expect(parseFoodText('large chicken biryani').items[0].grams).toBe(490);
    expect(parseFoodText('small plate of biryani').items[0].grams).toBe(263);
    expect(parseFoodText('1.5 cups rice').items[0].grams).toBe(240);
    expect(parseFoodText('2 tbsp peanut butter').items[0].grams).toBe(32);
    expect(parseFoodText('a glass of milk').items[0]).toMatchObject({ name: 'Milk (whole)', grams: 250, confidence: 0.75 });
    const bowl = parseFoodText('bowl of chicken tikka').items[0];
    expect(bowl).toMatchObject({ name: 'Chicken tikka', grams: 250, confidence: 0.6 });
    expect(parseFoodText('3 eggs').items[0]).toMatchObject({ name: 'Eggs', grams: 150, confidence: 0.75 });
    expect(parseFoodText('1 scoop whey').items[0]).toMatchObject({ name: 'Whey protein', grams: 30, confidence: 0.75 });
  });

  it('handles mass units and "kg"/"oz"', () => {
    expect(parseFoodText('0.5 kg chicken breast').items[0].grams).toBe(500);
    expect(parseFoodText('4 oz salmon').items[0].grams).toBe(113);
    expect(parseFoodText('chicken tikka 150g').items[0]).toMatchObject({ grams: 150, confidence: 0.9 });
  });

  it('flags weak fuzzy matches at 0.45', () => {
    const [it] = parseFoodText('200 g shaw').items;
    expect(it.name).toBe('Chicken shawarma wrap');
    expect(it.grams).toBe(200);
    expect(it.confidence).toBe(0.45);
    expect(it.assumptions).toContain('low confidence');
  });

  it('unknown food → low confidence, generic estimate and one clarifying question', () => {
    const est = parseFoodText('grandma special');
    expect(est.items).toHaveLength(1);
    expect(est.items[0].name).toBe('grandma special');
    expect(est.items[0].confidence).toBe(0.2);
    expect(est.items[0].grams).toBe(250);
    expect(est.items[0].kcal).toBe(500); // 200 kcal / 100 g
    expect(est.items[0].tags).toEqual([]);
    expect(est.clarify).toBe('What was in "grandma special" and roughly how much?');
  });

  it('asks only one question even with several unknowns, and none when all are known', () => {
    const est = parseFoodText('grandma special, mystery pudding and 2 rotis');
    expect(est.items).toHaveLength(3);
    expect(est.items.filter((i) => i.confidence <= 0.2)).toHaveLength(2);
    expect(est.clarify).toBe('What was in "grandma special" and roughly how much?');
    expect(parseFoodText('dal and rice').clarify).toBeNull();
  });

  it('never throws on empty or junk input', () => {
    expect(parseFoodText('')).toEqual({ items: [], clarify: 'What did you eat, and roughly how much?', source: 'local' });
    expect(parseFoodText('   , + ')).toMatchObject({ items: [], source: 'local' });
    expect(() => parseFoodText('!!! 12 ### 3/0')).not.toThrow();
  });
});

describe('conversions', () => {
  const item: FoodEstimateItem = {
    name: 'Chicken tikka', grams: 200, kcal: 330, protein_g: 50, fat_g: 12, carbs_g: 6, fiber_g: 1,
    confidence: 0.9, assumptions: '200 g as stated', tags: ['poultry', 'restaurant'],
  };

  it('scaleItem rescales macros proportionally and keeps confidence', () => {
    const half = scaleItem(item, 100);
    expect(half).toMatchObject({ grams: 100, kcal: 165, protein_g: 25, fat_g: 6, carbs_g: 3, fiber_g: 0.5, confidence: 0.9 });
    expect(scaleItem(item, 300).kcal).toBe(495);
    expect(scaleItem({ ...item, grams: 0 }, 50)).toMatchObject({ grams: 50, kcal: 330 });
    expect(scaleItem(item, -5).grams).toBe(0);
  });

  it('foodItemToEstimate scales per-100 g macros', () => {
    const roti = FOOD_DB.find((f) => f.id === 'roti')!;
    const est = foodItemToEstimate(roti, 80);
    expect(est).toMatchObject({ name: 'Roti', grams: 80, kcal: 240, confidence: 0.9 });
    expect(est.protein_g).toBeCloseTo(7.2, 1);
    expect(est.tags).toContain('grain');
  });

  it('itemToMeal produces compact meal keys and keeps conf only for AI meals', () => {
    const ai = itemToMeal(item, '12:30', 'ai');
    expect(ai).toEqual({ t: '12:30', n: 'Chicken tikka', g: 200, kc: 330, p: 50, f: 12, c: 6, fi: 1, src: 'ai', conf: 0.9, as: '200 g as stated', tags: ['poultry', 'restaurant'] });
    const manual = itemToMeal({ ...item, assumptions: '', tags: [] }, '19:00', 'manual');
    expect(manual.conf).toBeUndefined();
    expect(manual.as).toBeUndefined();
    expect(manual.tags).toBeUndefined();
    expect(manual.src).toBe('manual');
  });

  it('confidenceBand maps ≥0.8 / 0.5–0.79 / <0.5', () => {
    expect(confidenceBand(0.9)).toEqual({ band: 'high', label: 'High', color: 'green' });
    expect(confidenceBand(0.8)).toEqual({ band: 'high', label: 'High', color: 'green' });
    expect(confidenceBand(0.79)).toEqual({ band: 'med', label: 'Med', color: 'yellow' });
    expect(confidenceBand(0.5)).toEqual({ band: 'med', label: 'Med', color: 'yellow' });
    expect(confidenceBand(0.45)).toEqual({ band: 'low', label: 'Low', color: 'neutral' });
    expect(confidenceBand(NaN).band).toBe('low');
  });
});

// ---------------------------------------------------------------------------
// Review round 5 reproductions
// ---------------------------------------------------------------------------

describe('R5-2 water is water, not canned tuna', () => {
  it('has zero-kcal water entries', () => {
    expect(parseFoodText('water').items[0]).toMatchObject({ name: 'Water', kcal: 0, grams: 250 });
    expect(parseFoodText('1 litre water').items[0]).toMatchObject({ name: 'Water', kcal: 0, grams: 1000, confidence: 0.9 });
    expect(parseFoodText('a glass of water').items[0]).toMatchObject({ name: 'Water', kcal: 0, grams: 250, confidence: 0.75 });
    expect(parseFoodText('sparkling water').items[0]).toMatchObject({ name: 'Sparkling water', kcal: 0 });
    expect(parseFoodText('500 ml soda water').items[0]).toMatchObject({ name: 'Sparkling water', grams: 500 });
  });

  it('never resolves "water" to tuna at a strong score', () => {
    expect(findFood('water')[0].item.id).toBe('water');
    const tuna = findFood('water').find((m) => m.item.id === 'tuna');
    expect(tuna === undefined || tuna.score < 0.8).toBe(true);
    expect(FOOD_DB.find((f) => f.id === 'tuna')?.aliases).not.toContain('tuna in water');
  });

  it('query ⊆ key only scores strong when the query carries the key\'s head token', () => {
    expect(scoreTokens(['water'], ['tuna', 'water'])).toBeLessThan(0.8);
    expect(scoreTokens(['tuna'], ['tuna', 'water'])).toBeGreaterThanOrEqual(0.8);
    expect(scoreTokens(['tuna', 'water'], ['tuna', 'water'])).toBe(1);
  });
});

describe('R5-3 bare numbers without a unit', () => {
  it('≥ 20 is read as grams at reduced confidence', () => {
    for (const q of ['chicken tikka 200', '200 chicken tikka']) {
      const [it] = parseFoodText(q).items;
      expect(it.name).toBe('Chicken tikka');
      expect(it.grams).toBe(200);
      expect(it.confidence).toBeLessThanOrEqual(0.6);
      expect(it.confidence).toBeGreaterThanOrEqual(0.5);
      expect(it.assumptions).toContain('assumed 200 g');
    }
  });

  it('< 20 stays a count, capped at 12', () => {
    expect(parseFoodText('3 eggs').items[0]).toMatchObject({ name: 'Eggs', grams: 150, confidence: 0.75 });
    const [tikka] = parseFoodText('15 chicken tikka').items;
    expect(tikka.grams).toBe(420); // 12 × 35 g
    expect(tikka.assumptions).toContain('capped at 12');
  });

  it('the plural of the item\'s own unit word is an explicit piece count — no gram reading, no cap', () => {
    expect(parseFoodText('15 prawns').items[0]).toMatchObject({ name: 'Tandoori prawns', grams: 300, confidence: 0.75 });
    expect(parseFoodText('20 prawns').items[0]).toMatchObject({ name: 'Tandoori prawns', grams: 400, confidence: 0.75 });
    expect(parseFoodText('24 eggs').items[0]).toMatchObject({ name: 'Eggs', grams: 1200 });
    expect(parseFoodText('200 prawns').items[0]).toMatchObject({ grams: 200, confidence: 0.6 }); // beyond any plausible count → grams
  });

  it('a bare number with no food is an unknown item with a question, not 30,000 g', () => {
    const est = parseFoodText('200');
    expect(est.items).toHaveLength(1);
    expect(est.items[0].grams).toBe(200);
    expect(est.items[0].kcal).toBe(400);
    expect(est.items[0].confidence).toBe(0.2);
    expect(est.clarify).not.toBeNull();
    expect(parseFoodText('2').items[0].grams).toBeLessThanOrEqual(300);
  });
});

describe('R5-8 quantity-only segments merge into the food segment', () => {
  it('splitFoodSegments merges "200 g" / "2" / "half" into the preceding food', () => {
    expect(splitFoodSegments('chicken tikka, 200 g')).toEqual(['chicken tikka 200 g']);
    expect(splitFoodSegments('naan, half')).toEqual(['naan half']);
    expect(splitFoodSegments('chicken tikka, 2 and one roti')).toEqual(['chicken tikka 2', 'one roti']);
    expect(splitFoodSegments('200 g and chicken tikka')).toEqual(['200 g chicken tikka']);
    expect(splitFoodSegments('dal, rice + raita\nchai')).toEqual(['dal', 'rice', 'raita', 'chai']);
  });

  it('the stated weight is applied and no phantom item is offered', () => {
    const est = parseFoodText('chicken tikka, 200 g');
    expect(est.items).toHaveLength(1);
    expect(est.items[0]).toMatchObject({ name: 'Chicken tikka', grams: 200, confidence: 0.9 });
    expect(est.clarify).toBeNull();
    expect(parseFoodText('naan, half').items[0]).toMatchObject({ name: 'Naan', grams: 45 });
    expect(parseFoodText('chicken tikka, 2').items[0]).toMatchObject({ name: 'Chicken tikka', grams: 70 });
    expect(parseFoodText('dal, a bowl').items[0]).toMatchObject({ name: 'Dal tadka', grams: 200, confidence: 0.75 });
  });
});

describe('R5-14 generic "chicken" and portion idioms', () => {
  it('bare "chicken" prefers plain chicken breast at low confidence', () => {
    const [it] = parseFoodText('chicken').items;
    expect(it.name).toBe('Chicken breast');
    expect(it.confidence).toBeLessThanOrEqual(0.45);
    expect(it.assumptions).toContain('low confidence');
    expect(findFood('chicken')[0].score).toBeLessThan(0.8);
    expect(findFood('kebab')[0].score).toBeLessThan(0.8);
  });

  it('unambiguous short queries still score strong', () => {
    expect(findFood('biryani')[0].score).toBe(1);
    expect(findFood('scrambled eggs')[0]).toMatchObject({ item: { id: 'eggs' }, score: 1 });
  });

  it('quarter / half chicken are roast-chicken portions', () => {
    expect(parseFoodText('quarter chicken').items[0]).toMatchObject({ name: 'Roast chicken', grams: 300, confidence: 0.6 });
    expect(parseFoodText('half chicken').items[0]).toMatchObject({ name: 'Roast chicken', grams: 600, confidence: 0.6 });
    expect(parseFoodText('half a chicken').items[0]).toMatchObject({ name: 'Roast chicken', grams: 600 });
    expect(parseFoodText('1/4 chicken').items[0]).toMatchObject({ name: 'Roast chicken', grams: 300 });
    expect(parseFoodText('half chicken').items[0].assumptions).toContain('roast chicken');
  });
});

// ---------------------------------------------------------------------------
// §1g parser upgrades
// ---------------------------------------------------------------------------

describe('compound phrases (in / on / over / topped with)', () => {
  it('splits when the tail is a food in its own right', () => {
    expect(splitFoodSegments('grilled chicken on rice')).toEqual(['grilled chicken', 'rice']);
    expect(splitFoodSegments('dal over rice')).toEqual(['dal', 'rice']);
    expect(splitFoodSegments('eggs on toast')).toEqual(['eggs', 'toast']);
    expect(splitFoodSegments('rice topped with dal')).toEqual(['rice topped', 'dal']);
    expect(parseFoodText('dal over rice').items.map((i) => i.name)).toEqual(['Dal tadka', 'Basmati rice (cooked)']);
    // "topped" is filler, so it never reaches the DB lookup
    expect(parseFoodText('rice topped with dal').items[0].name).toBe('Basmati rice (cooked)');
  });

  it('keeps a preparation medium attached to its dish', () => {
    expect(splitFoodSegments('chicken in butter sauce')).toEqual(['chicken in butter sauce']);
    expect(splitFoodSegments('paneer in gravy')).toEqual(['paneer in gravy']);
    expect(splitFoodSegments('tuna in water')).toEqual(['tuna in water']);
    expect(splitFoodSegments('chicken in olive oil')).toEqual(['chicken in olive oil']);
    const [dish] = parseFoodText('chicken in butter sauce').items;
    expect(dish.name).toBe('Butter chicken');
    expect(dish.grams).toBe(250);
  });

  it('splits a medium the user weighed, and never on a phrase that is itself a dish', () => {
    expect(splitFoodSegments('1 scoop whey in 250 ml milk')).toEqual(['1 scoop whey', '250 ml milk']);
    expect(splitFoodSegments('coffee with milk')).toEqual(['coffee with milk']);
    expect(parseFoodText('coffee with milk').items).toHaveLength(1);
  });

  it('milk is a food, not a medium — its calories are most of the meal', () => {
    const est = parseFoodText('oats in milk');
    expect(est.items.map((i) => [i.name, i.grams])).toEqual([['Oats', 50], ['Milk (whole)', 250]]);
    expect(est.items[1].kcal).toBeGreaterThan(140);
  });

  it('does not split when the tail is not a food', () => {
    expect(splitFoodSegments('2 eggs on the side')).toEqual(['2 eggs on the side']);
    expect(splitFoodSegments('biryani on tuesday')).toEqual(['biryani on tuesday']);
  });

  it('a blocked joiner does not hide a later one that holds', () => {
    expect(splitFoodSegments('chicken in butter sauce over rice')).toEqual(['chicken in butter sauce', 'rice']);
    expect(parseFoodText('chicken in butter sauce over rice').items.map((i) => i.name)).toEqual([
      'Butter chicken',
      'Basmati rice (cooked)',
    ]);
  });

  it('an unsplit medium never becomes the dish (R5-2 the other way round)', () => {
    // "tuna in water" is a tin of tuna; water and tuna score identically, so
    // without the medium rule the lower-kcal tie-break would log a glass of water.
    expect(parseFoodText('tuna in water').items).toHaveLength(1);
    expect(parseFoodText('tuna in water').items[0].name).toBe('Tuna (canned)');
    // …and the media are still foods in their own right.
    expect(parseFoodText('water').items[0]).toMatchObject({ name: 'Water', kcal: 0 });
    expect(parseFoodText('2 tbsp butter').items[0]).toMatchObject({ name: 'Butter', grams: 28 });
    expect(parseFoodText('ghee').items[0].name).toBe('Ghee');
  });
});

describe('a second quantity starts a new item', () => {
  it('segments a run-on phrase with no connector', () => {
    expect(splitFoodSegments('200 g chicken 2 rotis')).toEqual(['200 g chicken', '2 rotis']);
    expect(splitFoodSegments('3 eggs 2 slices of toast')).toEqual(['3 eggs', '2 slices of toast']);
    expect(splitFoodSegments('2 rotis 150 g chicken tikka 1 bowl dal')).toEqual(['2 rotis', '150 g chicken tikka', '1 bowl dal']);
    const est = parseFoodText('200 g chicken 2 rotis');
    expect(est.items).toHaveLength(2);
    expect(est.items[0]).toMatchObject({ name: 'Chicken breast', grams: 200 });
    expect(est.items[1]).toMatchObject({ name: 'Roti', grams: 80 });
  });

  it('keeps one quantity whole: mixed numbers, multipliers, articles and trailing weights', () => {
    expect(splitFoodSegments('half a naan')).toEqual(['half a naan']);
    expect(splitFoodSegments('one and a half rotis')).toEqual(['one ½ rotis']);
    expect(splitFoodSegments('2 x 100 g chicken tikka')).toEqual(['2 x 100 g chicken tikka']);
    expect(splitFoodSegments('chicken tikka 200 g')).toEqual(['chicken tikka 200 g']);
    expect(splitFoodSegments('1.5 cups rice')).toEqual(['1.5 cups rice']);
    expect(parseFoodText('2 x 100 g chicken tikka').items[0]).toMatchObject({ grams: 200, confidence: 0.9 });
  });
});

describe('near-tie ranking (favorites → cuisine → score → plain → kcal)', () => {
  const fav: FoodItem = {
    id: 'fav_dal_makhani', name: 'Dal makhani', per100: { kc: 150, p: 7, f: 8, c: 14, fi: 4 },
    defaultGrams: 200, unitName: 'bowl', unitGrams: 200, aliases: ['dal'], cuisine: 'indian', tags: ['legume'],
  };

  it('a favorite wins a near-tie it would lose on score alone', () => {
    // "dal" is an exact alias of both, and the favorite carries the same score.
    expect(findFood('dal')[0].item.id).toBe('dal-tadka');
    expect(findFood('dal', [fav])[0].item.id).toBe('fav_dal_makhani');
    expect(parseFoodText('a bowl of dal', { extra: [fav] }).items[0].name).toBe('Dal makhani');
  });

  it('the persona cuisine breaks a tie the list order would otherwise decide', () => {
    const twin = (id: string, name: string, cuisine: FoodItem['cuisine']): FoodItem => ({
      id, name, per100: { kc: 250, p: 17, f: 18, c: 5, fi: 1 }, defaultGrams: 150,
      aliases: ['kofta'], cuisine, tags: ['red-meat'],
    });
    const both = [twin('x_me', 'Kofta plate', 'middle-eastern'), twin('x_in', 'Kofta curry', 'indian')];
    expect(findFood('kofta', both, { cuisines: ['indian'] })[0].item.id).toBe('x_in');
    expect(findFood('kofta', both, { cuisines: ['middle-eastern'] })[0].item.id).toBe('x_me');
    expect(findFood('kofta', both)[0].item.id).toBe('x_me'); // list order, deterministically
    // A cuisine never promotes a match from outside the band.
    const best = findFood('biryani')[0];
    expect(findFood('biryani', [], { cuisines: ['western'] })[0].item.id).toBe(best.item.id);
    expect(best.score - findFood('biryani', [], { cuisines: ['western'] })[1].score).toBeGreaterThan(TIE_BAND);
  });

  it('score still beats the generic preferences, so a 0.05-better match wins', () => {
    // butter (plain, 'home') is 0.75; butter chicken is 0.80 — the dish wins.
    expect(findFood('chicken butter sauce')[0].item.id).toBe('butter-chicken');
  });

  it('the lower-kcal candidate breaks what everything else leaves tied', () => {
    const rows = findFood('paneer tikka');
    const tied = rows.filter((r) => r.score >= rows[0].score - TIE_BAND);
    for (let i = 1; i < tied.length; i++) {
      if (tied[i].score === tied[i - 1].score && tied[i].item.tags?.includes('home') === tied[i - 1].item.tags?.includes('home')) {
        expect(tied[i].item.per100.kc).toBeGreaterThanOrEqual(tied[i - 1].item.per100.kc);
      }
    }
  });

  it('"watermelon" no longer matches "water"', () => {
    expect(findFood('watermelon smoothie')).toHaveLength(0);
    expect(findFood('shaw')[0].item.id).toBe('chicken-shawarma-wrap'); // prefix typing still works
    expect(findFood('rotis')[0].item.id).toBe('roti'); // a 1-letter overhang still matches
  });
});

describe('beverage prior for unknown drinks', () => {
  it('uses 40 kcal/100 g in a 250 g glass and asks one question', () => {
    const est = parseFoodText('watermelon smoothie');
    expect(est.items).toHaveLength(1);
    expect(est.items[0]).toMatchObject({ name: 'watermelon smoothie', grams: 250, kcal: 100, confidence: 0.3 });
    expect(est.items[0].assumptions).toContain('unknown drink');
    expect(BEVERAGE_PER100.kc).toBe(40);
    expect(est.clarify).toBe('What was in "watermelon smoothie" and roughly how much?');
  });

  it('honours a stated size and scales the prior', () => {
    expect(parseFoodText('500 ml mango milkshake').items[0]).toMatchObject({ grams: 500, kcal: 200, confidence: 0.3 });
    expect(parseFoodText('a glass of thandai').items[0]).toMatchObject({ grams: 250, kcal: 100 });
  });

  it('never overrides a drink the DB knows', () => {
    expect(parseFoodText('green tea').items[0].name).toBe('Chai'); // "tea" is chai for this persona
    expect(parseFoodText('a glass of orange juice').items[0]).toMatchObject({ name: 'Orange juice', grams: 250 });
    expect(parseFoodText('2 beers').items[0]).toMatchObject({ name: 'Beer', grams: 660 });
    expect(parseFoodText('2 beers').items[0].tags).toContain('alcohol');
    expect(parseFoodText('black coffee').items[0].name).toBe('Black coffee');
  });

  it('a solid unknown food still gets the mixed-dish prior', () => {
    expect(parseFoodText('grandma special').items[0]).toMatchObject({ confidence: 0.2, kcal: 500 });
  });
});

describe('plausibility guard', () => {
  it('caps confidence at 0.4 and asks about the total above 1,500 g or 2,500 kcal', () => {
    const heavy = parseFoodText('2 kg chicken biryani');
    expect(heavy.items[0].grams).toBe(2000);
    expect(heavy.items.every((i) => i.confidence <= IMPLAUSIBLE_CONF_CAP)).toBe(true);
    expect(heavy.clarify).toMatch(/2,000 g and 3,600 kcal/);
    expect(heavy.clarify).toMatch(/whole amount/);

    // kcal alone can trip it: 400 g of ghee is under the gram bound.
    const rich = parseFoodText('400 g ghee');
    expect(rich.items[0].grams).toBe(400);
    expect(rich.items[0].confidence).toBe(IMPLAUSIBLE_CONF_CAP);
    expect(rich.clarify).not.toBeNull();
  });

  it('leaves a big-but-real meal alone', () => {
    const feast = parseFoodText('chicken biryani plate, 2 rotis and a bowl of raita');
    const totalG = feast.items.reduce((s, i) => s + i.grams, 0);
    const totalKcal = feast.items.reduce((s, i) => s + i.kcal, 0);
    expect(totalG).toBeLessThanOrEqual(PLAUSIBLE_MAX_G);
    expect(totalKcal).toBeLessThanOrEqual(PLAUSIBLE_MAX_KCAL);
    expect(feast.clarify).toBeNull();
    expect(Math.max(...feast.items.map((i) => i.confidence))).toBeGreaterThan(IMPLAUSIBLE_CONF_CAP);
  });

  it('does not rewrite the numbers — only the confidence and the question', () => {
    const heavy = parseFoodText('1 kg chicken biryani and 4 naans');
    expect(heavy.items.map((i) => i.grams)).toEqual([1000, 360]);
    expect(heavy.items[0].kcal).toBe(1800);
  });
});
