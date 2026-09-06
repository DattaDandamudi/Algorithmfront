import { describe, expect, it } from 'vitest';
import { DEFAULT_FAVORITES } from '../../data/defaults';
import type { FoodEstimate, Meal } from '../../data/types';
import { AI_UNAVAILABLE_NOTE } from '../../ai/food';
import {
  appendClarification,
  appendNote,
  bedtimeRecordDate,
  displayToLb,
  estimateNote,
  estimateOrigin,
  estimateTotals,
  foodItemFromEstimate,
  groupMealsByTime,
  isAfterCutoff,
  lbToDisplay,
  mealToEstimateItem,
  normaliseTime,
  slugId,
  sumMacros,
  tobaccoStamp,
  tobaccoStampsFromNote,
} from './logUtils';

const meal = (id: string, t: string, n: string, kc: number, p = 0): Meal => ({ id, t, n, g: 100, kc, p, f: 0, c: 0, fi: 0 });

describe('bedtimeRecordDate', () => {
  it('writes to tomorrow when pressed before midnight', () => {
    expect(bedtimeRecordDate(new Date(2026, 8, 6, 23, 10))).toBe('2026-09-07');
    expect(bedtimeRecordDate(new Date(2026, 8, 6, 21, 0))).toBe('2026-09-07');
  });
  it('writes to today when pressed after midnight and before noon', () => {
    expect(bedtimeRecordDate(new Date(2026, 8, 7, 0, 20))).toBe('2026-09-07');
    expect(bedtimeRecordDate(new Date(2026, 8, 7, 3, 59))).toBe('2026-09-07');
  });
  it('treats noon onwards as tonight', () => {
    expect(bedtimeRecordDate(new Date(2026, 8, 6, 12, 0))).toBe('2026-09-07');
    expect(bedtimeRecordDate(new Date(2026, 8, 6, 11, 59))).toBe('2026-09-06');
  });
});

describe('groupMealsByTime', () => {
  it('groups entries sharing a clock time and sorts on the eating-day axis', () => {
    const meals = [
      meal('a', '00:20', 'late snack', 300, 10),
      meal('b', '13:00', 'chicken tikka', 330, 50),
      meal('c', '13:00', 'roti', 120, 4),
      meal('d', '08:00', 'black coffee', 2),
    ];
    const groups = groupMealsByTime(meals);
    expect(groups.map((g) => g.t)).toEqual(['08:00', '13:00', '00:20']);
    expect(groups[1]).toMatchObject({ kc: 450, p: 54, isOccasion: true });
    expect(groups[1].meals.map((m) => m.id)).toEqual(['b', 'c']);
    // A lone coffee is listed (editable) but is not an occasion.
    expect(groups[0].isOccasion).toBe(false);
  });
  it('returns [] for no meals', () => {
    expect(groupMealsByTime(undefined)).toEqual([]);
    expect(groupMealsByTime([])).toEqual([]);
  });
});

describe('sumMacros / estimateTotals', () => {
  it('sums and rounds (fiber 1 dp)', () => {
    const meals: Meal[] = [
      { id: 'a', t: '13:00', n: 'x', g: 1, kc: 100.4, p: 10.2, f: 2.2, c: 3.3, fi: 1.25 },
      { id: 'b', t: '13:00', n: 'y', g: 1, kc: 50.4, p: 1.4, f: 1.4, c: 1.4, fi: 0.5 },
    ];
    expect(sumMacros(meals)).toEqual({ kc: 151, p: 12, f: 4, c: 5, fi: 1.8 });
    expect(estimateTotals([mealToEstimateItem(meals[0]), mealToEstimateItem(meals[1])])).toEqual({ kc: 151, p: 12, f: 4, c: 5, fi: 1.8 });
  });
});

describe('mealToEstimateItem', () => {
  it('maps compact keys and treats missing confidence as confirmed', () => {
    const it = mealToEstimateItem({ id: 'm', t: '13:00', n: 'roti', g: 40, kc: 120, p: 3.6, f: 2.4, c: 21, fi: 2.4, tags: ['grain'] });
    expect(it).toMatchObject({ name: 'roti', grams: 40, kcal: 120, protein_g: 3.6, fiber_g: 2.4, confidence: 1, assumptions: '', tags: ['grain'] });
    expect(mealToEstimateItem({ id: 'm', t: '13:00', n: 'x', g: 1, kc: 1, p: 0, f: 0, c: 0, fi: 0, conf: 0.4, as: 'guess' })).toMatchObject({ confidence: 0.4, assumptions: 'guess' });
  });
});

describe('foodItemFromEstimate', () => {
  it('returns the favourite when the name matches exactly', () => {
    const item = { name: 'Chicken tikka', grams: 200, kcal: 330, protein_g: 50, fat_g: 12, carbs_g: 6, fiber_g: 1, confidence: 0.9, assumptions: '', tags: [] as never[] };
    expect(foodItemFromEstimate(item, DEFAULT_FAVORITES).id).toBe('fav_chicken_tikka');
  });
  it('synthesises a per-100 g item for an unknown dish', () => {
    const item = { name: "Grandma's special stew", grams: 250, kcal: 500, protein_g: 30, fat_g: 20, carbs_g: 40, fiber_g: 5, confidence: 0.2, assumptions: '', tags: [] as never[] };
    const f = foodItemFromEstimate(item, DEFAULT_FAVORITES);
    expect(f.id).toBe('rec_grandma-s-special-stew');
    expect(f.per100).toEqual({ kc: 200, p: 12, f: 8, c: 16, fi: 2 });
    expect(f.defaultGrams).toBe(250);
  });
  it('slugId is stable and safe', () => {
    expect(slugId('Chicken Tikka!')).toBe('rec_chicken-tikka');
    expect(slugId('')).toBe('rec_food');
  });
});

describe('estimateOrigin / estimateNote', () => {
  const base = { name: 'roti', grams: 40, kcal: 120, protein_g: 3.6, fat_g: 2.4, carbs_g: 21, fiber_g: 2.4, confidence: 0.75, tags: [] as never[] };
  it('distinguishes claude, local and AI-fallback estimates', () => {
    const claude: FoodEstimate = { items: [{ ...base, assumptions: 'x' }], clarify: null, source: 'claude' };
    const local: FoodEstimate = { items: [{ ...base, assumptions: 'assumed 1 roti' }], clarify: null, source: 'local' };
    const fallback: FoodEstimate = { items: [{ ...base, assumptions: `${AI_UNAVAILABLE_NOTE}; assumed 1 roti` }], clarify: null, source: 'local' };
    expect(estimateOrigin(claude)).toBe('claude');
    expect(estimateOrigin(local)).toBe('local');
    expect(estimateOrigin(fallback)).toBe('ai-fallback');
    expect(estimateNote('claude')).toBeNull();
    expect(estimateNote('local')).toMatch(/Local estimate/);
    expect(estimateNote('ai-fallback')).toMatch(/AI unavailable/);
  });
});

describe('appendClarification', () => {
  it('appends the answer in parentheses and ignores blanks', () => {
    expect(appendClarification('a bowl of stew', 'about 300 g, homemade')).toBe('a bowl of stew (about 300 g, homemade)');
    expect(appendClarification('a bowl of stew', '   ')).toBe('a bowl of stew');
  });
});

describe('tobacco note stamps', () => {
  it('appends with a separator and parses back', () => {
    const n1 = appendNote(undefined, tobaccoStamp('09:10'));
    const n2 = appendNote(n1, tobaccoStamp('14:32'));
    expect(n2).toBe('cig 09:10 · cig 14:32');
    expect(tobaccoStampsFromNote(n2)).toEqual(['09:10', '14:32']);
    expect(tobaccoStampsFromNote('felt tired')).toEqual([]);
    expect(appendNote('felt tired', tobaccoStamp('20:00'))).toBe('felt tired · cig 20:00');
  });
});

describe('weight units', () => {
  it('round-trips lb ↔ kg at 1 dp', () => {
    expect(lbToDisplay(172, 'lb')).toBe(172);
    expect(lbToDisplay(172, 'kg')).toBe(78);
    expect(displayToLb(78, 'kg')).toBe(172);
    expect(displayToLb(171.85, 'lb')).toBe(171.9);
  });
});

describe('caffeine / time helpers', () => {
  it('flags times after the cutoff', () => {
    expect(isAfterCutoff('14:30', '14:00')).toBe(true);
    expect(isAfterCutoff('14:00', '14:00')).toBe(false);
    expect(isAfterCutoff('08:00', '14:00')).toBe(false);
  });
  it('normalises time-input values', () => {
    expect(normaliseTime('9:05', '12:00')).toBe('09:05');
    expect(normaliseTime('', '12:00')).toBe('12:00');
    expect(normaliseTime('25:00', '12:00')).toBe('12:00');
  });
});
