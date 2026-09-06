import { describe, expect, it } from 'vitest';
import { DEFAULT_FAVORITES } from '../data/defaults';
import type { FoodEstimateItem } from '../data/types';
import { FOOD_DB, findFood, scoreTokens } from './foodDb';
import {
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
    const [prawns] = parseFoodText('15 prawns').items;
    expect(prawns.grams).toBe(240); // 12 × 20 g
    expect(prawns.assumptions).toContain('capped');
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
