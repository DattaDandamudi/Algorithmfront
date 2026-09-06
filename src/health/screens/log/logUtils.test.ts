import { describe, expect, it } from 'vitest';
import { DEFAULT_FAVORITES } from '../../data/defaults';
import type { FoodEstimate, Meal } from '../../data/types';
import { AI_UNAVAILABLE_NOTE } from '../../ai/food';
import { weeklyExpenditure } from '../../engine/expenditure';
import { weighInsInWeek } from '../../engine/weight';
import { addDays, formatDateShort } from '../../lib/dates';
import { blockProgress } from '../trends/summaries';
import {
  appendClarification,
  appendNote,
  bedtimeNightOf,
  bedtimeRecordDate,
  describeClientError,
  displayToLb,
  eatingDayCaption,
  eatingDayOf,
  estimateNote,
  estimateOrigin,
  estimateTotals,
  foodItemFromEstimate,
  groupMealsByTime,
  hoursToBed,
  isAfterCutoff,
  lbToDisplay,
  mealToEstimateItem,
  normaliseTime,
  slugId,
  sumMacros,
  tobaccoStamp,
  tobaccoStampsFromNote,
  weighInBlockLine,
  withoutOne,
} from './logUtils';

const meal = (id: string, t: string, n: string, kc: number, p = 0): Meal => ({ id, t, n, g: 100, kc, p, f: 0, c: 0, fi: 0 });

describe('bedtimeNightOf / bedtimeRecordDate', () => {
  it('an evening press is tonight → tomorrow\'s record', () => {
    expect(bedtimeNightOf(new Date(2026, 8, 6, 23, 10))).toBe('2026-09-06');
    expect(bedtimeRecordDate(new Date(2026, 8, 6, 23, 10))).toBe('2026-09-07');
    expect(bedtimeRecordDate(new Date(2026, 8, 6, 21, 0))).toBe('2026-09-07');
  });
  it('before 04:00 still counts as the previous calendar day\'s night → today\'s record', () => {
    expect(bedtimeNightOf(new Date(2026, 8, 7, 0, 20))).toBe('2026-09-06');
    expect(bedtimeRecordDate(new Date(2026, 8, 7, 0, 20))).toBe('2026-09-07');
    expect(bedtimeRecordDate(new Date(2026, 8, 7, 3, 59))).toBe('2026-09-07');
  });
  it('rolls over at 04:00', () => {
    expect(bedtimeNightOf(new Date(2026, 8, 7, 4, 0))).toBe('2026-09-07');
    expect(bedtimeRecordDate(new Date(2026, 8, 7, 4, 0))).toBe('2026-09-08');
    expect(bedtimeRecordDate(new Date(2026, 8, 6, 11, 59))).toBe('2026-09-07');
  });
  it('crosses a month boundary', () => {
    expect(bedtimeRecordDate(new Date(2026, 8, 30, 23, 30))).toBe('2026-10-01');
    expect(bedtimeRecordDate(new Date(2026, 9, 1, 1, 0))).toBe('2026-10-01');
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
  it('a coffee after midnight is still after the afternoon cutoff (eating-day axis)', () => {
    expect(isAfterCutoff('00:30', '14:00')).toBe(true);
    expect(isAfterCutoff('03:59', '14:00')).toBe(true);
    expect(isAfterCutoff('04:00', '14:00')).toBe(false);
  });
  it('withoutOne removes a single occurrence and never mutates', () => {
    const caf = ['08:05', '14:30', '14:30'];
    expect(withoutOne(caf, '14:30')).toEqual(['08:05', '14:30']);
    expect(withoutOne(caf, '09:00')).toEqual(caf);
    expect(caf).toHaveLength(3);
  });
  it('normalises time-input values', () => {
    expect(normaliseTime('9:05', '12:00')).toBe('09:05');
    expect(normaliseTime('', '12:00')).toBe('12:00');
    expect(normaliseTime('25:00', '12:00')).toBe('12:00');
  });
});

// R7-1: meals before 04:00 belong to the previous calendar day, like the bedtime.
describe('eatingDayOf', () => {
  it('matches the calendar day from 04:00 onwards', () => {
    expect(eatingDayOf(new Date(2026, 8, 6, 4, 0))).toBe('2026-09-06');
    expect(eatingDayOf(new Date(2026, 8, 6, 13, 0))).toBe('2026-09-06');
    expect(eatingDayOf(new Date(2026, 8, 6, 23, 59))).toBe('2026-09-06');
  });
  it('a 00:20 supper on 7 Sep is charged to 6 Sep', () => {
    expect(eatingDayOf(new Date(2026, 8, 7, 0, 0))).toBe('2026-09-06');
    expect(eatingDayOf(new Date(2026, 8, 7, 0, 20))).toBe('2026-09-06');
    expect(eatingDayOf(new Date(2026, 8, 7, 3, 59))).toBe('2026-09-06');
  });
  it('agrees with the bedtime night boundary and crosses months', () => {
    const t = new Date(2026, 9, 1, 1, 0);
    expect(eatingDayOf(t)).toBe('2026-09-30');
    expect(eatingDayOf(t)).toBe(bedtimeNightOf(t));
  });
  it('explains where a pre-04:00 entry goes', () => {
    expect(eatingDayCaption('2026-09-06')).toBe('Logging to Sat 6 Sep — meals before 04:00 count toward the previous day');
  });
});

// R7-6: the caffeine hint is computed from the time being picked, on the eating-day axis.
describe('hoursToBed', () => {
  it('measures the picked time against the bed target', () => {
    expect(hoursToBed('16:00', '23:00')).toBe(7);
    expect(hoursToBed('08:00', '23:00')).toBe(15);
    expect(hoursToBed('14:30', '23:00')).toBe(8.5);
    expect(hoursToBed('05:00', '23:00')).toBe(18);
  });
  it('a coffee after the bed target is negative, not 23.5 h before bed', () => {
    expect(hoursToBed('23:30', '23:00')).toBe(-0.5);
    expect(hoursToBed('00:30', '23:00')).toBe(-1.5);
    expect(hoursToBed('23:00', '23:00')).toBe(0);
  });
  it('handles a bed target after midnight and malformed input', () => {
    expect(hoursToBed('23:30', '00:30')).toBe(1);
    expect(hoursToBed('01:00', '00:30')).toBe(-0.5);
    expect(hoursToBed('nope', '23:00')).toBeNull();
    expect(hoursToBed('16:00', '')).toBeNull();
  });
});

// R7-5: the weight card must count the same 7-day block the expenditure gate uses.
describe('weighInBlockLine', () => {
  const today = '2026-09-06';
  const rec = (k: number, extra: object = {}) => ({ d: addDays(today, k), w: 172, ...extra });
  it('reports the block count, not the trailing-7-day count', () => {
    // First weigh-in 9 days ago anchors the blocks: [-9..-3] closed, [-2..+4] in progress.
    const records = [-9, -6, -5, -4, -3, -2].map((k) => rec(k));
    const exp = weeklyExpenditure(records, today);
    expect(weighInsInWeek(records, today)).toBe(5); // what the old card showed ("Enough…")
    expect(exp.weighInsThisWeek).toBe(1);
    const line = weighInBlockLine(exp, blockProgress(exp, today).met);
    expect(line.value).toBe('1/7 weigh-ins');
    expect(line.sub).toBe(`in this block · updates ${formatDateShort(exp.nextUpdate as string)} — weigh in 5+ days to calibrate.`);
    expect(line.sub).not.toMatch(/Enough/);
  });
  it('says "Enough" only when the block gate is met', () => {
    // Anchor 5 days ago; weigh-ins and intake on every day since → 6/7 of both in the open block.
    const records = [-5, -4, -3, -2, -1, 0].map((k) => rec(k, { kc: 2000, p: 150 }));
    const exp = weeklyExpenditure(records, today);
    expect(exp.weighInsThisWeek).toBe(6);
    const line = weighInBlockLine(exp, blockProgress(exp, today).met);
    expect(line.value).toBe('6/7 weigh-ins');
    expect(line.sub).toBe(`Enough for this block’s expenditure update · updates ${formatDateShort(exp.nextUpdate as string)}.`);
  });
  it('has copy for before the first weigh-in', () => {
    const exp = weeklyExpenditure([], today);
    expect(weighInBlockLine(exp, false)).toEqual({ value: '0/7 weigh-ins', sub: 'Your first weigh-in starts a 7-day block — weigh in 5+ days of it so expenditure can calibrate.' });
  });
});

// R7-3: the lazy SDK import can fail; the reason must be readable, never "connect an AI key".
describe('describeClientError', () => {
  it('maps a failed chunk load to an offline hint and keeps other messages', () => {
    expect(describeClientError(new TypeError('Failed to fetch dynamically imported module: http://x/@anthropic-ai_sdk.js'))).toBe('the AI module could not be downloaded — check your connection and reload');
    expect(describeClientError(new Error('boom'))).toBe('boom');
    expect(describeClientError('nope')).toBe('the AI client could not be created');
    expect(describeClientError(new Error(''))).toBe('the AI client could not be created');
  });
});
