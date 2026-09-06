import { describe, expect, it } from 'vitest';
import { DEFAULT_FAVORITES, DEFAULT_PROFILE, DEFAULT_TARGETS } from '../data/defaults';
import type { DailyRecord, Meal } from '../data/types';
import {
  dayTotals,
  dayTypeFor,
  fatFloorCheck,
  foodSuggestion,
  frequencyCounters,
  hydrationTarget,
  lateEatingCheck,
  macroTargetsFor,
  mealClockMinutes,
  minutesUntilBed,
  proteinPacing,
  remainingMacros,
} from './nutrition';

// 2026-09-07 is a Monday (upper), 2026-09-09 a Wednesday (rest) in the default split.
const MON = '2026-09-07';
const WED = '2026-09-09';

let seq = 0;
const meal = (over: Partial<Meal>): Meal => ({
  id: `m${++seq}`,
  t: '12:00',
  n: 'food',
  g: 100,
  kc: 300,
  p: 30,
  f: 10,
  c: 20,
  fi: 2,
  ...over,
});

const pacing = (record: DailyRecord | undefined, nowHHMM: string) =>
  proteinPacing({ record, targets: DEFAULT_TARGETS, weightLb: 172, nowHHMM, bedTarget: '23:00' });

describe('dayTypeFor', () => {
  it('follows the default split: Monday lift (upper), Wednesday rest', () => {
    expect(dayTypeFor(MON, DEFAULT_PROFILE)).toEqual({ type: 'lift', session: 'upper' });
    expect(dayTypeFor(WED, DEFAULT_PROFILE)).toEqual({ type: 'rest', session: 'rest' });
  });

  it('lets record.lift override the split in both directions', () => {
    expect(dayTypeFor(WED, DEFAULT_PROFILE, { d: WED, lift: true })).toEqual({ type: 'lift', session: 'full' });
    expect(dayTypeFor(MON, DEFAULT_PROFILE, { d: MON, lift: false })).toEqual({ type: 'rest', session: 'rest' });
    // override agreeing with the split keeps the scheduled session name
    expect(dayTypeFor(MON, DEFAULT_PROFILE, { d: MON, lift: true })).toEqual({ type: 'lift', session: 'upper' });
  });

  it('treats cardio as a rest day for carb cycling', () => {
    const profile = { ...DEFAULT_PROFILE, split: { ...DEFAULT_PROFILE.split, 1: 'cardio' as const } };
    expect(dayTypeFor(MON, profile)).toEqual({ type: 'rest', session: 'cardio' });
  });
});

describe('macroTargetsFor', () => {
  it('cycles only carbs between lift and rest days', () => {
    const lift = macroTargetsFor('lift', DEFAULT_TARGETS);
    const rest = macroTargetsFor('rest', DEFAULT_TARGETS);
    expect(lift).toMatchObject({ kc: 1950, p: 180, f: 65, fatFloor: 60, fi: 30, carbsRange: [150, 175], c: 163 });
    expect(rest).toMatchObject({ kc: 1950, p: 180, f: 65, fatFloor: 60, fi: 30, carbsRange: [70, 100], c: 85 });
  });
});

describe('dayTotals / remainingMacros', () => {
  it('sums itemised meals when present', () => {
    const rec: DailyRecord = { d: MON, kc: 1, p: 1, meals: [meal({}), meal({ kc: 200, p: 20, f: 5, c: 10, fi: 1.5 })] };
    expect(dayTotals(rec)).toEqual({ kc: 500, p: 50, f: 15, c: 30, fi: 3.5 });
  });

  it('falls back to stored totals, then to zeros', () => {
    expect(dayTotals({ d: MON, kc: 1900, p: 170 })).toEqual({ kc: 1900, p: 170, f: 0, c: 0, fi: 0 });
    expect(dayTotals({ d: MON, kc: 1900, meals: [] })).toEqual({ kc: 1900, p: 0, f: 0, c: 0, fi: 0 });
    expect(dayTotals(undefined)).toEqual({ kc: 0, p: 0, f: 0, c: 0, fi: 0 });
  });

  it('keeps the sign when over target', () => {
    const t = macroTargetsFor('rest', DEFAULT_TARGETS);
    const rem = remainingMacros({ kc: 2100, p: 120, f: 70, c: 60, fi: 12.5 }, t);
    expect(rem).toEqual({ kc: -150, p: 60, f: -5, c: 25, fi: 17.5 });
  });
});

describe('proteinPacing (78 kg persona)', () => {
  it('uses the 0.4–0.55 g/kg band → 31–43 g per meal', () => {
    const p = pacing(undefined, '09:00');
    expect(p.minPerMeal).toBe(31);
    expect(p.maxPerMeal).toBe(43);
    expect(p.soFar).toBe(0);
    expect(p.remaining).toBe(180);
    expect(p.mealsLeft).toBe(4);
    expect(p.perMealNeeded).toBe(45);
    expect(p.onPace).toBe(false);
    expect(p.lastMealBelowMin).toBe(false);
  });

  it('90 g after 2 meals at 15:00 → 2 meals left, 45 g each, not on pace', () => {
    const rec: DailyRecord = { d: MON, meals: [meal({ t: '09:00', p: 45 }), meal({ t: '13:00', p: 45 })] };
    const p = pacing(rec, '15:00');
    expect(p).toMatchObject({ soFar: 90, remaining: 90, mealsLogged: 2, mealsLeft: 2, perMealNeeded: 45, onPace: false });
  });

  it('is on pace when the per-meal need fits under 43 g', () => {
    const rec: DailyRecord = { d: MON, meals: [meal({ t: '09:00', p: 50 }), meal({ t: '13:00', p: 50 }), meal({ t: '17:00', p: 50 })] };
    const p = pacing(rec, '19:00');
    expect(p).toMatchObject({ soFar: 150, remaining: 30, mealsLeft: 1, perMealNeeded: 30, onPace: true });
  });

  it('keeps one meal slot when all planned meals are logged but protein remains', () => {
    const meals = ['08:00', '12:00', '16:00', '19:00'].map((t) => meal({ t, p: 35 }));
    const p = pacing({ d: MON, meals }, '20:00');
    expect(p).toMatchObject({ soFar: 140, remaining: 40, mealsLogged: 4, mealsLeft: 1, perMealNeeded: 40, onPace: true });
  });

  it('has no meals left within 60 min of bed or after bedtime', () => {
    const rec: DailyRecord = { d: MON, meals: [meal({ t: '13:00', p: 45 })] };
    expect(pacing(rec, '22:00')).toMatchObject({ mealsLeft: 0, perMealNeeded: null, onPace: false });
    expect(pacing(rec, '22:30')).toMatchObject({ mealsLeft: 0, perMealNeeded: null });
    expect(pacing(rec, '00:10')).toMatchObject({ mealsLeft: 0, perMealNeeded: null });
    expect(pacing(rec, '21:59').mealsLeft).toBe(3);
  });

  it('reports the target as met once protein is over target', () => {
    const meals = ['08:00', '12:00', '16:00', '19:00'].map((t) => meal({ t, p: 47 }));
    const p = pacing({ d: MON, meals }, '20:00');
    expect(p).toMatchObject({ soFar: 188, remaining: -8, mealsLeft: 0, perMealNeeded: null, onPace: true });
  });

  it('flags the most recent meal when it lands under 31 g (after-midnight meal is the latest)', () => {
    const rec: DailyRecord = { d: MON, meals: [meal({ t: '00:20', p: 12 }), meal({ t: '20:00', p: 45 })] };
    expect(pacing(rec, '09:00').lastMealBelowMin).toBe(true);
    const rec2: DailyRecord = { d: MON, meals: [meal({ t: '12:00', p: 12 }), meal({ t: '20:00', p: 45 })] };
    expect(pacing(rec2, '21:00').lastMealBelowMin).toBe(false);
  });

  it('works from stored totals when no meals are itemised', () => {
    const p = pacing({ d: MON, p: 100 }, '15:00');
    expect(p).toMatchObject({ soFar: 100, remaining: 80, mealsLogged: 0, mealsLeft: 4, perMealNeeded: 20 });
  });
});

describe('minutesUntilBed / mealClockMinutes', () => {
  it('handles the evening, past-midnight and morning cases', () => {
    expect(minutesUntilBed('22:30', '23:00')).toBe(30);
    expect(minutesUntilBed('00:30', '23:00')).toBe(-90);
    expect(minutesUntilBed('08:00', '23:00')).toBe(900);
    expect(minutesUntilBed('23:30', '00:30')).toBe(60);
    expect(minutesUntilBed('bad', '23:00')).toBeNull();
  });

  it('sorts a post-midnight meal after dinner', () => {
    expect(mealClockMinutes('23:00')).toBe(1380);
    expect(mealClockMinutes('00:20')).toBe(1460);
    expect(mealClockMinutes('08:00')).toBe(480);
    expect(mealClockMinutes(null)).toBeNull();
  });
});

describe('fatFloorCheck', () => {
  it('is fine when remaining kcal can cover the gap earlier in the day', () => {
    const r = fatFloorCheck({ kc: 900, p: 100, f: 20, c: 80, fi: 10 }, 900, DEFAULT_TARGETS, '15:00');
    expect(r).toEqual({ belowFloor: false, projectedFat: 60, shortBy: 0 });
  });

  it('is below the floor when remaining kcal cannot cover the gap (gap × 9 > remaining)', () => {
    const r = fatFloorCheck({ kc: 1700, p: 160, f: 20, c: 150, fi: 20 }, 200, DEFAULT_TARGETS, '15:00');
    expect(r.belowFloor).toBe(true);
    expect(r.projectedFat).toBe(42.2);
    expect(r.shortBy).toBe(17.8);
  });

  it('treats any shortfall as below after 20:00 (including after midnight)', () => {
    const totals = { kc: 1100, p: 120, f: 45, c: 80, fi: 15 };
    expect(fatFloorCheck(totals, 800, DEFAULT_TARGETS, '21:00')).toEqual({ belowFloor: true, projectedFat: 45, shortBy: 15 });
    expect(fatFloorCheck(totals, 800, DEFAULT_TARGETS, '00:30').belowFloor).toBe(true);
    expect(fatFloorCheck(totals, 800, DEFAULT_TARGETS, '07:00').belowFloor).toBe(false);
    expect(fatFloorCheck(totals, 800, DEFAULT_TARGETS).belowFloor).toBe(false);
  });

  it('never flags once fat is at or above the floor', () => {
    expect(fatFloorCheck({ kc: 1900, p: 180, f: 65, c: 150, fi: 30 }, -50, DEFAULT_TARGETS, '22:00')).toEqual({
      belowFloor: false,
      projectedFat: 65,
      shortBy: 0,
    });
  });
});

describe('lateEatingCheck', () => {
  it('flags ≥ 400 kcal within 3 h of the bed target and suggests bed − 3 h', () => {
    const meals = [meal({ t: '12:30', kc: 500 }), meal({ t: '20:30', kc: 300 }), meal({ t: '22:15', kc: 250 })];
    const r = lateEatingCheck(meals, '23:00');
    expect(r).toMatchObject({ late: true, lastMealTime: '22:15', kcalWithin3h: 550, suggestedLastMeal: '20:00', minutesToCutoff: null });
  });

  it('counts meals after midnight as late and as the last meal', () => {
    const meals = [meal({ t: '19:00', kc: 600 }), meal({ t: '00:20', kc: 450 })];
    const r = lateEatingCheck(meals, '23:00');
    expect(r.late).toBe(true);
    expect(r.kcalWithin3h).toBe(450);
    expect(r.lastMealTime).toBe('00:20');
  });

  it('is not late for a small evening snack', () => {
    const r = lateEatingCheck([meal({ t: '19:30', kc: 700 }), meal({ t: '20:30', kc: 200 })], '23:00');
    expect(r).toMatchObject({ late: false, kcalWithin3h: 200, lastMealTime: '20:30' });
  });

  it('handles a bed target past midnight and empty meals', () => {
    expect(lateEatingCheck(undefined, '00:30')).toMatchObject({ late: false, lastMealTime: null, kcalWithin3h: 0, suggestedLastMeal: '21:30' });
    expect(lateEatingCheck([meal({ t: '22:00', kc: 500 })], '00:30').late).toBe(true);
  });

  it('reports minutes to the last-meal cutoff when now is given', () => {
    expect(lateEatingCheck([], '23:00', '19:00').minutesToCutoff).toBe(60);
    expect(lateEatingCheck([], '23:00', '21:00').minutesToCutoff).toBe(-60);
  });
});

describe('hydrationTarget', () => {
  it('gives ≈2.5 L ≈ 10 cups for 78 kg at 32 ml/kg', () => {
    expect(hydrationTarget(172, DEFAULT_TARGETS)).toEqual({ ml: 2500, cups: 10 });
  });

  it('adds 250 ml for ≥10k steps and for strain ≥ 14', () => {
    expect(hydrationTarget(172, DEFAULT_TARGETS, 10_000, null)).toEqual({ ml: 2750, cups: 11 });
    expect(hydrationTarget(172, DEFAULT_TARGETS, 9_999, 14)).toEqual({ ml: 2750, cups: 11 });
    expect(hydrationTarget(172, DEFAULT_TARGETS, 12_000, 15.2)).toEqual({ ml: 3000, cups: 12 });
  });

  it('respects the 30–35 ml/kg setting', () => {
    expect(hydrationTarget(172, { ...DEFAULT_TARGETS, waterMlPerKg: 30 }).ml).toBe(2340);
    expect(hydrationTarget(172, { ...DEFAULT_TARGETS, waterMlPerKg: 35 }).ml).toBe(2730);
  });
});

describe('foodSuggestion', () => {
  it('picks the starred favourite whose portion protein best fits', () => {
    expect(foodSuggestion(50, 600, DEFAULT_FAVORITES)).toBe('chicken tikka (200 g ≈ 50 g protein)');
  });

  it('respects the remaining kcal budget', () => {
    expect(foodSuggestion(50, 200, DEFAULT_FAVORITES)).toBe('tandoori prawns (150 g ≈ 30 g protein)');
  });

  it('falls back to "a lean protein"', () => {
    expect(foodSuggestion(0, 500, DEFAULT_FAVORITES)).toBe('a lean protein');
    expect(foodSuggestion(40, 500, [])).toBe('a lean protein');
    expect(foodSuggestion(40, 500, [DEFAULT_FAVORITES.find((f) => f.id === 'fav_rice')!])).toBe('a lean protein');
  });
});

describe('frequencyCounters', () => {
  const records: DailyRecord[] = [
    // outside the 7-day window ending MON (2026-09-07)
    { d: '2026-08-31', meals: [meal({ tags: ['red-meat', 'restaurant'] })] },
    { d: '2026-09-01', meals: [meal({ tags: ['red-meat', 'restaurant'], fi: 4 }), meal({ tags: ['grain'], fi: 6 })] },
    { d: '2026-09-03', meals: [meal({ tags: ['fish', 'home'], fi: 10 })] },
    { d: '2026-09-04', kc: 1800, fi: 20 }, // direct-entry day, no meals
    { d: '2026-09-06', meals: [meal({ tags: ['seafood', 'restaurant'], fi: 2 }), meal({ tags: ['poultry', 'home'], fi: 3 })] },
    { d: MON, meals: [meal({ tags: ['poultry'], fi: 5 })] },
  ];

  it('counts servings and meal sources by tag over the window', () => {
    const c = frequencyCounters(records, MON);
    expect(c).toMatchObject({
      days: 7,
      redMeatServings: 1,
      fishServings: 1,
      seafoodServings: 1,
      poultryServings: 2,
      restaurantMeals: 2,
      homeMeals: 2,
      totalMeals: 6,
      daysLogged: 5,
    });
    // 2 of 6 meals restaurant; the untagged meals count toward the total only
    expect(c.restaurantPct).toBe(33);
    expect(c.homeCookedPct).toBe(33);
    // fiber: 10, 10, 20, 5, 5 → 10
    expect(c.fiberAvg).toBe(10);
  });

  it('returns nulls with no meals in the window', () => {
    const c = frequencyCounters(records, '2026-08-20', 7);
    expect(c).toMatchObject({ totalMeals: 0, restaurantPct: null, homeCookedPct: null, fiberAvg: null, daysLogged: 0 });
  });
});
