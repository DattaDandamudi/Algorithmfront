import { describe, expect, it } from 'vitest';
import { DEFAULT_FAVORITES, DEFAULT_PROFILE, DEFAULT_TARGETS } from '../data/defaults';
import type { DailyRecord, Meal } from '../data/types';
import { addDays } from '../lib/dates';
import {
  allocateKcalCut,
  dayTotals,
  dayTypeFor,
  effectiveFatFloor,
  fatFloorCheck,
  foodSuggestion,
  frequencyCounters,
  habitualWakeWindow,
  hydrationTarget,
  lateEatingCheck,
  lateEatingScore,
  macroTargetsFor,
  mealClockMinutes,
  mealOccasions,
  mealSlots,
  minutesUntilBed,
  preSleepProtein,
  proteinFloor,
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

describe('mealSlots', () => {
  it('is max(mealsPerDay, ceil(protein / (0.55 · kg))) — 180 g at 78 kg wants 5 sittings, not 4', () => {
    expect(DEFAULT_TARGETS.mealsPerDay).toBe(4);
    expect(mealSlots(DEFAULT_TARGETS, 172)).toBe(5); // ceil(180 / (0.55 × 78.02)) = ceil(4.20) = 5
    // A bigger lifter clears the target inside the plan's four meals.
    expect(mealSlots(DEFAULT_TARGETS, 240)).toBe(4); // ceil(180 / 59.9) = 4
    // The user's own plan is a floor, never lowered.
    expect(mealSlots({ ...DEFAULT_TARGETS, mealsPerDay: 6 }, 172)).toBe(6);
    // Degenerate inputs fall back to the plan rather than dividing by zero.
    expect(mealSlots(DEFAULT_TARGETS, 0)).toBe(4);
    expect(mealSlots({ ...DEFAULT_TARGETS, protein: 0 }, 172)).toBe(4);
  });
});

describe('proteinPacing (78 kg persona)', () => {
  it('uses the 0.4–0.55 g/kg rails → 31–43 g per meal across 5 slots', () => {
    const p = pacing(undefined, '09:00');
    expect(p.minPerMeal).toBe(31);
    expect(p.maxPerMeal).toBe(43);
    expect(p.soFar).toBe(0);
    expect(p.remaining).toBe(180);
    expect(p.slots).toBe(5);
    expect(p.mealsLeft).toBe(5);
    expect(p.perMealNeeded).toBe(36);
    expect(p.aboveOptimum).toBe(false);
    expect(p.onPace).toBe(true);
    expect(p.lastMealBelowMin).toBe(false);
  });

  it('90 g after 2 meals at 15:00 → 3 slots left, 30 g each', () => {
    const rec: DailyRecord = { d: MON, meals: [meal({ t: '09:00', p: 45 }), meal({ t: '13:00', p: 45 })] };
    const p = pacing(rec, '15:00');
    expect(p).toMatchObject({ soFar: 90, remaining: 90, mealsLogged: 2, mealsLeft: 3, perMealNeeded: 30, onPace: true });
  });

  it('treats a per-meal need above 0.55 g/kg as a note, not a failure', () => {
    // 40 g in by 21:00 with one slot left needs 140 g in one sitting — a big
    // bolus, but Trommelen 2023 says it is used, so this is a note only.
    const rec: DailyRecord = { d: MON, meals: [meal({ t: '13:00', p: 40 })] };
    const p = pacing(rec, '21:30');
    expect(p.mealsLeft).toBe(4);
    expect(p.perMealNeeded).toBe(35);
    expect(p.aboveOptimum).toBe(false);
    const tight: DailyRecord = { d: MON, meals: ['08:00', '12:00', '15:00', '18:00'].map((t) => meal({ t, p: 5 })) };
    const q = pacing(tight, '19:00');
    expect(q).toMatchObject({ soFar: 20, mealsLeft: 1, perMealNeeded: 160, aboveOptimum: true, onPace: false });
  });

  it('is on pace when the per-meal need fits under 43 g', () => {
    const rec: DailyRecord = { d: MON, meals: [meal({ t: '09:00', p: 50 }), meal({ t: '13:00', p: 50 }), meal({ t: '17:00', p: 50 })] };
    const p = pacing(rec, '19:00');
    expect(p).toMatchObject({ soFar: 150, remaining: 30, mealsLeft: 2, perMealNeeded: 15, onPace: true });
  });

  it('keeps one meal slot when all slots are logged but protein remains', () => {
    const meals = ['08:00', '11:00', '14:00', '17:00', '19:00'].map((t) => meal({ t, p: 28 }));
    const p = pacing({ d: MON, meals }, '20:00');
    expect(p).toMatchObject({ soFar: 140, remaining: 40, mealsLogged: 5, mealsLeft: 1, perMealNeeded: 40, onPace: true });
  });

  it('has no meals left within 60 min of bed or after bedtime', () => {
    const rec: DailyRecord = { d: MON, meals: [meal({ t: '13:00', p: 45 })] };
    expect(pacing(rec, '22:00')).toMatchObject({ mealsLeft: 0, perMealNeeded: null, onPace: false });
    expect(pacing(rec, '22:30')).toMatchObject({ mealsLeft: 0, perMealNeeded: null });
    expect(pacing(rec, '00:10')).toMatchObject({ mealsLeft: 0, perMealNeeded: null });
    expect(pacing(rec, '21:59').mealsLeft).toBe(4);
  });

  it('reports the target as met once protein is over target', () => {
    const meals = ['08:00', '11:00', '14:00', '17:00', '19:00'].map((t) => meal({ t, p: 38 }));
    const p = pacing({ d: MON, meals }, '20:00');
    expect(p).toMatchObject({ soFar: 190, remaining: -10, mealsLogged: 5, mealsLeft: 0, perMealNeeded: null, onPace: true });
  });

  it('flags the most recent meal when it lands under 31 g (after-midnight meal is the latest)', () => {
    const rec: DailyRecord = { d: MON, meals: [meal({ t: '00:20', p: 12 }), meal({ t: '20:00', p: 45 })] };
    expect(pacing(rec, '09:00').lastMealBelowMin).toBe(true);
    const rec2: DailyRecord = { d: MON, meals: [meal({ t: '12:00', p: 12 }), meal({ t: '20:00', p: 45 })] };
    expect(pacing(rec2, '21:00').lastMealBelowMin).toBe(false);
  });

  it('works from stored totals when no meals are itemised', () => {
    const p = pacing({ d: MON, p: 100 }, '15:00');
    expect(p).toMatchObject({ soFar: 100, remaining: 80, mealsLogged: 0, mealsLeft: 5, perMealNeeded: 16 });
  });
});

describe('mealOccasions — a 45-min gap makes a sitting', () => {
  it('folds entries eaten within 45 min into one occasion', () => {
    const meals = [meal({ t: '13:00', kc: 330, p: 50 }), meal({ t: '13:20', kc: 120, p: 4 }), meal({ t: '19:00', kc: 500, p: 40 })];
    const occ = mealOccasions(meals);
    expect(occ).toHaveLength(2);
    expect(occ[0]).toMatchObject({ t: '13:00', times: ['13:00', '13:20'], kc: 450, p: 54, n: 2, spanMin: 20 });
    expect(occ[1]).toMatchObject({ t: '19:00', n: 1 });
  });

  it('splits when the gap exceeds 45 min and chains across it', () => {
    // 13:00 → 13:40 → 14:20 chains (two 40-min gaps); 15:10 starts a new sitting.
    const meals = ['13:00', '13:40', '14:20', '15:10'].map((t) => meal({ t, kc: 200, p: 20 }));
    const occ = mealOccasions(meals);
    expect(occ.map((o) => o.t)).toEqual(['13:00', '15:10']);
    expect(occ[0].n).toBe(3);
  });

  it('drops a sitting under 50 kcal but keeps one that reaches it together', () => {
    expect(mealOccasions([meal({ t: '08:00', kc: 2, p: 0 })])).toEqual([]);
    const together = mealOccasions([meal({ t: '08:00', kc: 30, p: 3 }), meal({ t: '08:10', kc: 25, p: 2 })]);
    expect(together).toHaveLength(1);
    expect(together[0].kc).toBe(55);
  });

  it('keeps the eating-day axis: a 00:20 supper sorts last', () => {
    const occ = mealOccasions([meal({ t: '00:20', kc: 300 }), meal({ t: '08:00', kc: 300 }), meal({ t: '20:00', kc: 300 })]);
    expect(occ.map((o) => o.t)).toEqual(['08:00', '20:00', '00:20']);
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
  it('is fine when ~30% of the remaining kcal can cover the gap earlier in the day', () => {
    // 20 g logged, 1,500 kcal left → 1,500 × 0.30 / 9 = 50 g coverable ≥ the 40 g gap.
    const r = fatFloorCheck({ kc: 450, p: 40, f: 20, c: 30, fi: 5 }, 1500, DEFAULT_TARGETS, '15:00');
    expect(r).toEqual({ belowFloor: false, projectedFat: 60, shortBy: 0, floor: 60 });
  });

  it('R3-6: projects remaining fat at ~30% of remaining kcal, not as if every kcal were fat', () => {
    // 17:00, 20 g fat, 600 kcal left → +20 g → 40 g projected (the old rule said 60 g / fine).
    expect(fatFloorCheck({ kc: 1350, p: 120, f: 20, c: 100, fi: 10 }, 600, DEFAULT_TARGETS, '17:00')).toEqual({
      belowFloor: true,
      projectedFat: 40,
      shortBy: 20,
      floor: 60,
    });
    // 19:30, 25 g fat, 400 kcal left → +13.3 g → 38.3 g projected.
    const r2 = fatFloorCheck({ kc: 1550, p: 150, f: 25, c: 120, fi: 15 }, 400, DEFAULT_TARGETS, '19:30');
    expect(r2.belowFloor).toBe(true);
    expect(r2.projectedFat).toBe(38.3);
    expect(r2.shortBy).toBe(21.7);
  });

  it('is below the floor when the remaining kcal cannot cover the gap', () => {
    const r = fatFloorCheck({ kc: 1700, p: 160, f: 20, c: 150, fi: 20 }, 200, DEFAULT_TARGETS, '15:00');
    expect(r.belowFloor).toBe(true);
    expect(r.projectedFat).toBe(26.7); // 20 + 200 × 0.30 / 9
    expect(r.shortBy).toBe(33.3);
  });

  it('treats any shortfall as below after 20:00 (including after midnight)', () => {
    const totals = { kc: 1100, p: 120, f: 45, c: 80, fi: 15 };
    expect(fatFloorCheck(totals, 800, DEFAULT_TARGETS, '21:00')).toEqual({ belowFloor: true, projectedFat: 45, shortBy: 15, floor: 60 });
    expect(fatFloorCheck(totals, 800, DEFAULT_TARGETS, '00:30').belowFloor).toBe(true);
    expect(fatFloorCheck(totals, 800, DEFAULT_TARGETS, '07:00').belowFloor).toBe(false);
    expect(fatFloorCheck(totals, 800, DEFAULT_TARGETS).belowFloor).toBe(false);
  });

  it('never flags once fat is at or above the floor', () => {
    expect(fatFloorCheck({ kc: 1900, p: 180, f: 65, c: 150, fi: 30 }, -50, DEFAULT_TARGETS, '22:00')).toEqual({
      belowFloor: false,
      projectedFat: 65,
      shortBy: 0,
      floor: 60,
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

describe('effectiveFatFloor — max(60 g, 0.15 · kcal / 9)', () => {
  it('keeps 60 g at 1,950 kcal, where the 15% rule asks for only 32.5 g', () => {
    expect(effectiveFatFloor(DEFAULT_TARGETS)).toBe(60);
    expect(macroTargetsFor('lift', DEFAULT_TARGETS).fatFloor).toBe(60);
  });

  it("lets RP's 15%-of-calories rule take over on a big-calorie day", () => {
    expect(effectiveFatFloor({ ...DEFAULT_TARGETS, kcal: 4000 })).toBe(66.7); // 0.15 × 4000 / 9
    expect(effectiveFatFloor({ ...DEFAULT_TARGETS, kcal: 3600 })).toBe(60); // exactly 60 — the two rules meet
  });

  it('never drops below a floor the user set higher, and survives a zero target', () => {
    expect(effectiveFatFloor({ ...DEFAULT_TARGETS, fatFloor: 80 })).toBe(80);
    expect(effectiveFatFloor({ ...DEFAULT_TARGETS, kcal: 0, fatFloor: 0 })).toBe(60);
  });

  it('fatFloorCheck reports the floor it applied', () => {
    const hi = fatFloorCheck({ kc: 0, p: 0, f: 30, c: 0, fi: 0 }, 0, { ...DEFAULT_TARGETS, kcal: 4000 }, '21:00');
    expect(hi.floor).toBe(66.7);
    expect(hi.shortBy).toBe(36.7);
  });
});

describe('proteinFloor — Morton 2018 body weight, Helms 2014 FFM in a deficit', () => {
  it('is 1.6–2.2 g/kg body weight when body composition is unknown', () => {
    const f = proteinFloor({ weightLb: 172 });
    expect(f).toMatchObject({ basis: 'bodyweight', gPerKg: [1.6, 2.2], ffmKg: null, deficit: false });
    expect(f.floor).toBe(125); // 1.6 × 78.0
    expect(f.stretch).toBe(172); // 2.2 × 78.0
  });

  it('scales to 2.3–3.1 g/kg fat-free mass in a deficit with a known body fat', () => {
    const f = proteinFloor({ weightLb: 172, bodyFatPct: 15, deficit: true });
    expect(f).toMatchObject({ basis: 'ffm', gPerKg: [2.3, 3.1], ffmKg: 66.3 });
    expect(f.floor).toBe(152); // 2.3 × 66.3
    expect(f.stretch).toBe(206); // 3.1 × 66.3
  });

  it('keeps the body-weight band when the deficit has no body composition to scale from', () => {
    expect(proteinFloor({ weightLb: 172, deficit: true }).basis).toBe('bodyweight');
    expect(proteinFloor({ weightLb: 172, bodyFatPct: 15 }).basis).toBe('bodyweight'); // no deficit
    expect(proteinFloor({ weightLb: 172, bodyFatPct: 0, deficit: true }).basis).toBe('bodyweight');
  });

  it('flags a configured target under the floor and never returns NaN', () => {
    expect(proteinFloor({ weightLb: 172, target: 180 }).belowFloor).toBe(false);
    expect(proteinFloor({ weightLb: 172, target: 120 }).belowFloor).toBe(true);
    const none = proteinFloor({ weightLb: 0 });
    expect(none.floor).toBe(0);
    expect(none.belowFloor).toBe(false);
    expect(Number.isFinite(none.stretch)).toBe(true);
  });
});

describe('allocateKcalCut — protein is never the macro that gets cut', () => {
  const t = macroTargetsFor('rest', DEFAULT_TARGETS); // c 85 g, f 65 g, fatFloor 60 g

  it('takes the cut out of carbs first', () => {
    expect(allocateKcalCut(300, t)).toEqual({ fromCarbs: 75, fromFat: 0, fromProtein: 0, unmetKcal: 0 });
  });

  it('then fat, but only down to the floor — the rest is reported as unmet', () => {
    // 340 kcal of carbs + 45 kcal of fat (5 g above the floor) = 385 available.
    expect(allocateKcalCut(400, t)).toEqual({ fromCarbs: 85, fromFat: 5, fromProtein: 0, unmetKcal: 15 });
    expect(allocateKcalCut(1000, t).fromProtein).toBe(0);
    expect(allocateKcalCut(1000, t).unmetKcal).toBe(615);
  });

  it('cuts nothing for a zero or negative request', () => {
    expect(allocateKcalCut(0, t)).toEqual({ fromCarbs: 0, fromFat: 0, fromProtein: 0, unmetKcal: 0 });
    expect(allocateKcalCut(-500, t).unmetKcal).toBe(0);
  });
});

describe('preSleepProtein (Trommelen 2023)', () => {
  const meals = [meal({ t: '12:00', p: 60 }), meal({ t: '18:00', p: 50 })];

  it('fires in the last 3 h before bed when the last meal was more than 3 h back and protein is owed', () => {
    const n = preSleepProtein({ meals, bedTarget: '23:00', proteinRemaining: 50, nowHHMM: '21:00' });
    expect(n.show).toBe(true);
    expect(n.grams).toBe(40);
    expect(n.lastMealTime).toBe('18:00');
    expect(n.gapToBedMin).toBe(300);
    expect(n.minutesToBed).toBe(120);
    expect(n.reason).toContain('5 h before bed');
  });

  it('stays quiet at lunchtime, when the last meal was recent, and when the target is met', () => {
    expect(preSleepProtein({ meals, bedTarget: '23:00', proteinRemaining: 50, nowHHMM: '15:00' }).show).toBe(false);
    const recent = [meal({ t: '21:00', p: 50 })];
    expect(preSleepProtein({ meals: recent, bedTarget: '23:00', proteinRemaining: 50, nowHHMM: '22:00' }).show).toBe(false);
    expect(preSleepProtein({ meals, bedTarget: '23:00', proteinRemaining: 0, nowHHMM: '21:00' }).show).toBe(false);
    expect(preSleepProtein({ meals, bedTarget: '23:00', proteinRemaining: -20, nowHHMM: '21:00' }).show).toBe(false);
  });

  it('never returns a half-sentence when nothing is logged', () => {
    const n = preSleepProtein({ meals: undefined, bedTarget: '23:00', proteinRemaining: 180, nowHHMM: '21:00' });
    expect(n).toMatchObject({ show: false, lastMealTime: null, gapToBedMin: null, reason: 'no meal logged yet' });
  });
});

describe('habitualWakeWindow', () => {
  const nights = (wk: string, bt: string, n = 14): DailyRecord[] =>
    Array.from({ length: n }, (_, i) => ({ d: addDays(MON, -i), wk, bt }) as DailyRecord);
  const T = { wakeTarget: '07:00' as const, bedTarget: '23:00' as const };

  it('takes the medians of the logged wake and sleep-onset times', () => {
    const w = habitualWakeWindow(nights('05:00', '21:00'), MON, T);
    expect(w).toMatchObject({ wake: '05:00', sleep: '21:00', wakeMin: 300, sleepMin: 1260, lengthMin: 960, source: 'observed' });
    expect(w.lateStart).toBe('17:48'); // 21:00 − 20% of 16 h
    expect(w.centreMin).toBe(780); // 13:00
    expect(w.nights).toBe(14);
  });

  it('medians bedtimes on the noon axis, so 23:40 and 00:20 do not average to lunchtime', () => {
    const records: DailyRecord[] = [
      { d: addDays(MON, -2), wk: '07:00', bt: '23:40' },
      { d: addDays(MON, -1), wk: '07:00', bt: '00:20' },
      { d: MON, wk: '07:00', bt: '00:00' },
    ];
    const w = habitualWakeWindow(records, MON, T);
    expect(w.sleep).toBe('00:00');
    expect(w.sleepMin).toBe(1440);
    expect(w.lengthMin).toBe(1020);
  });

  it('falls back to the targets below 3 logged nights', () => {
    const w = habitualWakeWindow([{ d: MON, wk: '05:00', bt: '21:00' }], MON, T);
    expect(w).toMatchObject({ wake: '07:00', sleep: '23:00', source: 'target', nights: 1 });
    expect(habitualWakeWindow([], MON, T).source).toBe('target');
    // one side observed, the other from the target
    const mixed = habitualWakeWindow(nights('05:00', '21:00').map((r) => ({ d: r.d, wk: r.wk })), MON, T);
    expect(mixed).toMatchObject({ wake: '05:00', sleep: '23:00', source: 'mixed' });
  });

  it('handles a night-shift window and never returns a degenerate length', () => {
    const w = habitualWakeWindow(nights('14:00', '06:00'), MON, T);
    expect(w).toMatchObject({ wake: '14:00', sleep: '06:00', wakeMin: 840, sleepMin: 1800, lengthMin: 960 });
    expect(w.lateStart).toBe('02:48'); // 06:00 − 20% of 16 h
    expect(habitualWakeWindow(nights('07:00', '07:30'), MON, T).lengthMin).toBeGreaterThanOrEqual(360);
  });
});

describe('lateEatingScore — circadian, not clock (McHill 2017)', () => {
  const nights = (wk: string, bt: string): DailyRecord[] =>
    Array.from({ length: 14 }, (_, i) => ({ d: addDays(MON, -i), wk, bt }) as DailyRecord);
  const T = { wakeTarget: '07:00' as const, bedTarget: '23:00' as const };
  const early = habitualWakeWindow(nights('05:00', '21:00'), MON, T);
  const normal = habitualWakeWindow(nights('07:00', '23:00'), MON, T);
  const day = [meal({ t: '07:00', kc: 400 }), meal({ t: '12:00', kc: 600 }), meal({ t: '19:30', kc: 800 })];

  it('a 19:30 dinner is late for a 05:00–21:00 sleeper and fine for a 07:00–23:00 one', () => {
    const e = lateEatingScore(day, early);
    expect(e.sharePct).toBe(44.4); // 800 of 1,800 kcal after 17:48
    expect(e.severity).toBe('high');
    expect(e.lateStart).toBe('17:48');
    const n = lateEatingScore(day, normal);
    expect(n.kcalLate).toBe(0); // the late window opens at 19:48
    expect(n.sharePct).toBe(0);
    expect(n.severity).toBe('none');
  });

  it('the old clock rule called that same dinner fine — this is the behaviour the audit changed', () => {
    expect(lateEatingCheck(day, '23:00').late).toBe(false);
    expect(lateEatingCheck(day, '23:00', undefined, early).late).toBe(true);
    expect(lateEatingCheck(day, '23:00', undefined, early).suggestedLastMeal).toBe('17:48');
  });

  it('bands the share none < 15% / mild / high ≥ 30%', () => {
    const mild = [meal({ t: '08:00', kc: 800 }), meal({ t: '18:30', kc: 200 })]; // 20% after 17:48
    expect(lateEatingScore(mild, early)).toMatchObject({ sharePct: 20, severity: 'mild' });
    const none = [meal({ t: '08:00', kc: 900 }), meal({ t: '18:30', kc: 100 })]; // 10%
    expect(lateEatingScore(none, early).severity).toBe('none');
    const high = [meal({ t: '08:00', kc: 600 }), meal({ t: '18:30', kc: 400 })]; // 40%
    expect(lateEatingScore(high, early).severity).toBe('high');
  });

  it('keeps ≥ 400 kcal within 60 min of bed as an absolute override', () => {
    // 400 kcal at 20:30 is only 12% of a 3,300 kcal day, but it is 30 min before sleep.
    const big = [meal({ t: '08:00', kc: 2900 }), meal({ t: '20:30', kc: 400 })];
    const r = lateEatingScore(big, early);
    expect(r.kcalNearBed).toBe(400);
    expect(r.override).toBe(true);
    expect(r.severity).toBe('high');
    expect(r.sharePct).toBeLessThan(15);
  });

  it('reports the eating midpoint against the centre of the wake window', () => {
    const r = lateEatingScore(day, early);
    expect(r.eatingMidpoint).toBe('13:15'); // (07:00 + 19:30) / 2
    expect(r.midpointOffsetMin).toBe(15); // 15 min later than the 13:00 centre
    const n = lateEatingScore(day, normal);
    expect(n.midpointOffsetMin).toBe(-105); // 13:15 against a 15:00 centre
  });

  it('returns nulls, not NaN, with nothing logged', () => {
    const r = lateEatingScore([], early);
    expect(r).toMatchObject({ sharePct: null, severity: 'none', kcalTotal: 0, eatingMidpoint: null, midpointOffsetMin: null });
    expect(lateEatingScore(undefined, early).severity).toBe('none');
    // zero-kcal entries never move the midpoint
    expect(lateEatingScore([meal({ t: '22:00', kc: 0, p: 0 })], early).eatingMidpoint).toBeNull();
  });

  it('counts a post-midnight supper against the wake window it belongs to', () => {
    const supper = [meal({ t: '08:00', kc: 600 }), meal({ t: '00:20', kc: 400 })];
    const r = lateEatingScore(supper, normal);
    expect(r.kcalLate).toBe(400);
    expect(r.kcalNearBed).toBe(400);
    expect(r.severity).toBe('high');
  });
});
