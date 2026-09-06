import { describe, expect, it } from 'vitest';
import type { BaselineDelta, CoachContext, Insight, Macros } from '../data/types';
import { DEFAULT_BLOODWORK, DEFAULT_PROFILE, DEFAULT_TARGETS } from '../data/defaults';
import { COACH_CHIPS, emptyStates, examplePortion, generateInsights, suggestedPrompts } from './insights';

type DeepPartial<T> = T extends (infer U)[] ? U[] : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

const isPlain = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function deepMerge<T>(base: T, patch: DeepPartial<T> | undefined): T {
  if (!isPlain(base) || !isPlain(patch)) return (patch === undefined ? base : patch) as T;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    out[k] = isPlain(v) && isPlain(out[k]) ? deepMerge(out[k], v) : v;
  }
  return out as T;
}

const bd = (today: number | null, baseline: number | null, n = 30): BaselineDelta => ({
  today,
  baseline,
  delta: today !== null && baseline !== null ? today - baseline : null,
  pct: today !== null && baseline ? ((today - baseline) / baseline) * 100 : null,
  n,
  good: null,
});

const ZERO: Macros = { kc: 0, p: 0, f: 0, c: 0, fi: 0 };
const TARGETS = { kc: 1950, p: 180, f: 65, c: 85, fi: 30, fatFloor: 60, carbsRange: [70, 100] as [number, number] };

/** Neutral defaults: yellow readiness, no debt, nothing logged — no template should fire. */
const BASE: CoachContext = {
  today: '2026-09-06',
  nowHHMM: '12:00',
  dayType: 'rest',
  sessionType: 'rest',
  readiness: { score: 55, band: 'yellow', source: 'whoop', verdict: 'Train, hold loads', training: 'Train, hold loads', detail: '' },
  hrv: { today: 50, baseline7: 50, lnMean7: Math.log(50), swcLower: 46, swcUpper: 54, band: 'balanced', cv7: 5, delta: bd(50, 50) },
  rhr: bd(52, 52),
  sleep: { hours: 7.5, need: 7.75, debtMin: 15, bedtimeSdMin: 20, midpointSdMin: 20, lastBedtime: '23:05', delta: bd(7.5, 7.5) },
  steps: { ...bd(8500, 8000), goalMin: 8000, goalMax: 10000 },
  weight: { latest: null, trend: null, weeklyRateLb: null, weeklyRatePct: null, targetLbPerWk: [0.86, 1.72], inBand: null, weighInsThisWeek: 6 },
  expenditure: { tdee: null, valid: false, reason: 'insufficient weigh-ins', suggestedKcal: null, suggestedDelta: null },
  nutrition: {
    totals: ZERO,
    targets: TARGETS,
    remaining: { kc: 1950, p: 180, f: 65, c: 85, fi: 30 },
    mealsLogged: 0,
    mealsLeft: 4,
    proteinPerMealNeeded: null,
    lastMealTime: null,
    fatBelowFloor: false,
    lateEating: false,
    hydrationCups: 0,
    hydrationTargetCups: 10,
    caffeineAfterCutoff: null,
  },
  tobacco: { today: 0, avg7: 0, avg30: 0, streakDays: 0, hrvSmokeFree: null, hrvSmoking: null },
  frequency: { redMeatServings7d: 2, fishServings7d: 3, restaurantPct7d: 40, fiberAvg7d: 25, homeCookedPct7d: 60 },
  adherence: { loggingStreak: 5, proteinHitDays30: 10, kcalHitDays30: 10, weighInDays30: 20 },
  bloodwork: DEFAULT_BLOODWORK,
  last30: [],
  todayRecord: null,
};

const makeCtx = (overrides: DeepPartial<CoachContext> = {}): CoachContext => deepMerge(BASE, overrides);
const all = (ctx: CoachContext): Insight[] => generateInsights(ctx, DEFAULT_PROFILE, DEFAULT_TARGETS, { max: 14 });
const only = (ctx: CoachContext, template: number): Insight | undefined => all(ctx).find((i) => i.template === String(template));
const templates = (ctx: CoachContext): string[] => all(ctx).map((i) => i.template);

describe('generateInsights — triggers', () => {
  it('fires nothing on the neutral context', () => {
    expect(all(makeCtx())).toEqual([]);
  });

  it('#1 sleep debt at ≥ 45 min, citing debt, hours and a bedtime', () => {
    expect(only(makeCtx({ sleep: { debtMin: 44 } }), 1)).toBeUndefined();
    const c = only(makeCtx({ sleep: { debtMin: 45, hours: 6.8, need: 8.2 } }), 1);
    expect(c).toBeDefined();
    expect(c!.body).toContain('45 min of sleep debt');
    expect(c!.body).toContain('6.8 h');
    // wake 07:00 − 8.2 h need = 22:48 → snapped to 22:45, earlier than the 23:00 target
    expect(c!.body).toContain('Get to bed by 10:45 pm');
    expect(c!.band).toBe('yellow');
    expect(c!.coachPrompt).toBe("How did last night's sleep affect me?");
    expect(only(makeCtx({ sleep: { debtMin: 95 } }), 1)!.band).toBe('red');
    // hours missing → clause dropped, never "null h"
    expect(only(makeCtx({ sleep: { debtMin: 60, hours: null } }), 1)!.body).not.toMatch(/null|NaN/);
  });

  it('#2 recovery low on red, #3 on green, neither on yellow — never both', () => {
    const red = makeCtx({ readiness: { band: 'red', score: 28 }, hrv: { today: 42, delta: bd(42, 50) } });
    expect(templates(red)).toContain('2');
    expect(templates(red)).not.toContain('3');
    const c2 = only(red, 2)!;
    expect(c2.body).toContain('28% (red)');
    expect(c2.body).toContain('HRV 42 ms is 8 ms below baseline');
    expect(c2.body).toContain('keep today light');
    expect(c2.band).toBe('red');
    expect(c2.coachPrompt).toBe('Why is my recovery low?');

    const green = makeCtx({ readiness: { band: 'green', score: 81 }, dayType: 'lift', sessionType: 'upper' });
    expect(templates(green)).toContain('3');
    expect(templates(green)).not.toContain('2');
    expect(only(green, 3)!.body).toContain('81% (green)');
    expect(only(green, 3)!.body).toContain('upper-body loads');
    expect(only(green, 3)!.coachPrompt).toBe('Should I train today?');

    expect(templates(makeCtx({ readiness: { band: 'yellow' } }))).toEqual([]);
    // red with no HRV reading drops the HRV clause
    expect(only(makeCtx({ readiness: { band: 'red', score: 20 }, hrv: { today: null, delta: bd(null, 50) } }), 2)!.body).not.toContain('HRV');
  });

  it('#4 protein pacing when per-meal need exists with protein and meals left; yellow above 43 g', () => {
    const base = { nutrition: { totals: { p: 40 }, remaining: { p: 140 }, mealsLeft: 3, proteinPerMealNeeded: 47 } };
    const c = only(makeCtx(base), 4)!;
    expect(c.body).toContain('40 g protein with 3 meals left');
    expect(c.body).toContain('~47 g each to hit 180 g');
    expect(c.band).toBe('yellow');
    expect(only(makeCtx({ nutrition: { ...base.nutrition, proteinPerMealNeeded: 35 } }), 4)!.band).toBe('neutral');
    expect(only(makeCtx({ nutrition: { ...base.nutrition, mealsLeft: 1 } }), 4)!.body).toContain('1 meal left');
    expect(only(makeCtx({ nutrition: { ...base.nutrition, proteinPerMealNeeded: null } }), 4)).toBeUndefined();
    expect(only(makeCtx({ nutrition: { ...base.nutrition, remaining: { p: 0 } } }), 4)).toBeUndefined();
    expect(only(makeCtx({ nutrition: { ...base.nutrition, mealsLeft: 0 } }), 4)).toBeUndefined();
  });

  it('#5 calories whenever intake is logged, with an example portion and the trend rate', () => {
    const c = only(makeCtx({ nutrition: { mealsLogged: 2, totals: { kc: 1250 }, remaining: { kc: 700 } }, weight: { weeklyRateLb: -1.1 } }), 5)!;
    expect(c.body).toContain('700 kcal left today (~1 chicken biryani plate)');
    expect(c.body).toContain('1.1 lb/wk');
    expect(c.band).toBe('neutral');
    expect(only(makeCtx({ nutrition: { mealsLogged: 3, totals: { kc: 2100 }, remaining: { kc: -150 } } }), 5)!.band).toBe('red');
    expect(only(makeCtx({ nutrition: { mealsLogged: 3, totals: { kc: 1800 }, remaining: { kc: 150 } } }), 5)!.band).toBe('yellow');
    expect(only(makeCtx(), 5)).toBeUndefined();
    expect(examplePortion(330)).toBe('1 chicken tikka plate');
    expect(examplePortion(100)).toBe('less than a roti');
  });

  it('#6 fat floor only when flagged and totals really are below the floor', () => {
    const c = only(makeCtx({ nutrition: { fatBelowFloor: true, totals: { f: 38 } } }), 6)!;
    expect(c.body).toContain("Fat's at 38 g — below your 60 g floor");
    expect(c.band).toBe('yellow');
    expect(only(makeCtx({ nutrition: { fatBelowFloor: false, totals: { f: 38 } } }), 6)).toBeUndefined();
    expect(only(makeCtx({ nutrition: { fatBelowFloor: true, totals: { f: 62 } } }), 6)).toBeUndefined();
  });

  it('#7 lift-day carbs need ≥ 60 g of room before 18:00', () => {
    const lift = { dayType: 'lift' as const, sessionType: 'lower' as const, nutrition: { remaining: { c: 120 }, targets: { carbsRange: [150, 175] as [number, number] } } };
    const c = only(makeCtx(lift), 7)!;
    expect(c.body).toContain('room for 120 g more carbs (150–175 g target)');
    expect(c.coachPrompt).toBe('Plan my carbs for a lift day.');
    expect(only(makeCtx({ ...lift, nowHHMM: '18:00' }), 7)).toBeUndefined();
    expect(only(makeCtx({ ...lift, nutrition: { remaining: { c: 59 } } }), 7)).toBeUndefined();
    expect(only(makeCtx({ ...lift, dayType: 'rest' }), 7)).toBeUndefined();
  });

  it('#8 steps ≥ 1,000 short of goalMin with a walk estimate at 100 steps/min', () => {
    const c = only(makeCtx({ steps: { today: 5500 } }), 8)!;
    expect(c.body).toContain('5,500 steps, 2,500 short of your 8,000 goal');
    expect(c.body).toContain('A 25-min walk closes it');
    expect(c.band).toBe('neutral');
    expect(only(makeCtx({ steps: { today: 5500 }, nowHHMM: '17:30' }), 8)!.band).toBe('yellow');
    expect(only(makeCtx({ steps: { today: 7001 } }), 8)).toBeUndefined();
    expect(only(makeCtx({ steps: { today: null } }), 8)).toBeUndefined();
  });

  it('#9 tobacco with today > 0 or a 7-day average, using the HRV delta when present', () => {
    const c = only(makeCtx({ tobacco: { today: 3, avg7: 4.2, hrvSmokeFree: 58, hrvSmoking: 52 } }), 9)!;
    expect(c.body).toContain('3 today vs your 4.2 average');
    expect(c.body).toContain('HRV averaged 58 ms, 6 ms higher');
    expect(c.body).toContain('One fewer keeps the streak alive');
    expect(c.band).toBe('yellow');
    const noHrv = only(makeCtx({ tobacco: { today: 5, avg7: 4 } }), 9)!;
    expect(noHrv.body).not.toContain('HRV');
    expect(noHrv.band).toBe('red');
    const free = only(makeCtx({ tobacco: { today: 0, avg7: 3, streakDays: 2 } }), 9)!;
    expect(free.band).toBe('green');
    expect(free.body).toContain('2 days streak');
    expect(only(makeCtx({ tobacco: { today: 0, avg7: 0 } }), 9)).toBeUndefined();
    expect(only(makeCtx({ tobacco: { today: 0, avg7: null } }), 9)).toBeUndefined();
  });

  it('#10 weight trend copy varies by band and mentions water only on a > 1 lb scale bump', () => {
    const w = { trend: 170.4, weeklyRateLb: -1.2, weeklyRatePct: -0.7 };
    const inBand = only(makeCtx({ weight: { ...w, inBand: 'in', latest: 171.8 } }), 10)!;
    expect(inBand.body).toContain('Trend is 170.4 lb, down 1.2 lb/wk (0.7%/wk) — right in the 0.5–1% target');
    expect(inBand.body).toContain("Ignore today's scale bump; it's water");
    expect(inBand.band).toBe('green');
    expect(only(makeCtx({ weight: { ...w, inBand: 'in', latest: 170.9 } }), 10)!.body).not.toContain('water');
    const below = only(makeCtx({ weight: { ...w, weeklyRateLb: -0.3, weeklyRatePct: -0.2, inBand: 'below' } }), 10)!;
    expect(below.body).toContain('under the 0.5–1% target');
    expect(below.body).toContain('Hold 1,950 kcal');
    expect(below.band).toBe('yellow');
    const above = only(makeCtx({ weight: { ...w, weeklyRateLb: -2.1, weeklyRatePct: -1.2, inBand: 'above' } }), 10)!;
    expect(above.body).toContain('faster than the 0.5–1% target');
    expect(above.body).toContain('Add ~150 kcal');
    expect(only(makeCtx({ weight: { trend: 170.4, weeklyRateLb: null } }), 10)).toBeUndefined();
  });

  it('#11 bedtime consistency: yellow above 30 min, red (and promoted) above 60', () => {
    expect(only(makeCtx({ sleep: { bedtimeSdMin: 30 } }), 11)).toBeUndefined();
    const y = only(makeCtx({ sleep: { bedtimeSdMin: 42 } }), 11)!;
    expect(y.body).toContain('swung 42 min this week');
    expect(y.body).toContain('11:00 pm nightly');
    expect(y.band).toBe('yellow');
    expect(y.priority).toBe(70);
    const r = only(makeCtx({ sleep: { bedtimeSdMin: 61 } }), 11)!;
    expect(r.band).toBe('red');
    expect(r.priority).toBe(95);
  });

  it('#12 caffeine after cutoff cites the time, hours before bed and the cutoff', () => {
    const c = only(makeCtx({ nutrition: { caffeineAfterCutoff: '15:30' } }), 12)!;
    expect(c.body).toContain('caffeine at 3:30 pm — within 7.5 h of bed');
    expect(c.body).toContain('Cut off by 2:00 pm tomorrow');
    expect(c.band).toBe('yellow');
    expect(only(makeCtx(), 12)).toBeUndefined();
  });

  it('#13 fish < 2 servings only when the omega-3 marker is low, with a doctor cue', () => {
    const c = only(makeCtx({ frequency: { fishServings7d: 1 } }), 13)!;
    expect(c.body).toContain('fish 1× this week');
    expect(c.body).toContain('omega-3 index at 3%');
    expect(c.body).toContain('confirm dosing with your doctor');
    expect(c.coachPrompt).toBe(COACH_CHIPS[7]);
    expect(only(makeCtx({ frequency: { fishServings7d: 2 } }), 13)).toBeUndefined();
    const normal = DEFAULT_BLOODWORK.map((m) => (m.key === 'omega3' ? { ...m, status: 'normal' as const } : m));
    expect(only(makeCtx({ frequency: { fishServings7d: 0 }, bloodwork: normal }), 13)).toBeUndefined();
  });

  it('#14 restaurant ≥ 60% only with an elevated lead marker, escalating to a physician', () => {
    const c = only(makeCtx({ frequency: { restaurantPct7d: 71 } }), 14)!;
    expect(c.body).toContain('71% of meals were restaurant');
    expect(c.body).toContain('4.3 µg/dL');
    expect(c.body).toContain('follow up with your doctor');
    expect(only(makeCtx({ frequency: { restaurantPct7d: 59 } }), 14)).toBeUndefined();
    const noLead = DEFAULT_BLOODWORK.filter((m) => m.key !== 'lead');
    expect(only(makeCtx({ frequency: { restaurantPct7d: 90 }, bloodwork: noLead }), 14)).toBeUndefined();
  });
});

/** Everything fires: red recovery, debt, protein, calories, fat, steps, tobacco, weight, consistency, caffeine, fish, restaurant. */
const busy = (extra: DeepPartial<CoachContext> = {}): CoachContext =>
  makeCtx(
    deepMerge<DeepPartial<CoachContext>>(
      {
        readiness: { band: 'red', score: 25 },
        sleep: { debtMin: 60, bedtimeSdMin: 45 },
        steps: { today: 4000 },
        weight: { latest: 172, trend: 170.4, weeklyRateLb: -1.0, weeklyRatePct: -0.6, inBand: 'in' },
        nutrition: { totals: { kc: 900, p: 40, f: 20 }, remaining: { kc: 1050, p: 140 }, mealsLogged: 2, mealsLeft: 2, proteinPerMealNeeded: 70, fatBelowFloor: true, caffeineAfterCutoff: '16:00' },
        tobacco: { today: 2, avg7: 3 },
        frequency: { fishServings7d: 0, restaurantPct7d: 80 },
      },
      extra,
    ),
  );

describe('generateInsights — ranking & promotion', () => {
  it('caps at 3 by default, honours max, and orders by priority', () => {
    const top = generateInsights(busy(), DEFAULT_PROFILE, DEFAULT_TARGETS);
    expect(top).toHaveLength(3);
    expect(top.map((i) => i.template)).toEqual(['2', '1', '4']); // 90, 80, 75
    expect(generateInsights(busy(), DEFAULT_PROFILE, DEFAULT_TARGETS, { max: 5 }).map((i) => i.template)).toEqual(['2', '1', '4', '6', '11']);
    expect(all(busy())).toHaveLength(12);
    const ps = all(busy()).map((i) => i.priority);
    expect(ps).toEqual([...ps].sort((a, b) => b - a));
    expect(generateInsights(busy(), DEFAULT_PROFILE, DEFAULT_TARGETS, { max: 0 })).toEqual([]);
  });

  it('promotes consistency above the sleep-debt card only when bedtime SD > 60 min', () => {
    expect(templates(busy({ sleep: { bedtimeSdMin: 75 } })).slice(0, 3)).toEqual(['11', '2', '1']);
    expect(templates(busy({ sleep: { bedtimeSdMin: 45 } })).indexOf('1')).toBeLessThan(templates(busy({ sleep: { bedtimeSdMin: 45 } })).indexOf('11'));
  });

  it('boosts sleep debt above recovery and lowers weight/calories when loss stalls with short sleep', () => {
    const stalled = busy({ weight: { inBand: 'below', weeklyRateLb: -0.3, weeklyRatePct: -0.2 }, sleep: { hours: 6.5, need: 7.75 } });
    const cards = all(stalled);
    expect(cards.map((i) => i.template).slice(0, 2)).toEqual(['1', '2']);
    expect(cards.find((i) => i.template === '1')!.priority).toBe(92);
    expect(cards.find((i) => i.template === '10')!.priority).toBe(45);
    expect(cards.find((i) => i.template === '5')!.priority).toBe(40);
    expect(cards.find((i) => i.template === '10')!.body).toContain('Fix sleep before cutting calories');
    // sleep only 20 min short → no boost
    const rested = busy({ weight: { inBand: 'below', weeklyRateLb: -0.3 }, sleep: { hours: 7.5, need: 7.75 } });
    expect(all(rested).find((i) => i.template === '1')!.priority).toBe(80);
    expect(all(rested).find((i) => i.template === '10')!.priority).toBe(65);
    // in-band loss with short sleep → no boost either
    expect(all(busy({ sleep: { hours: 6.5 } })).find((i) => i.template === '1')!.priority).toBe(80);
  });

  it('is deterministic with stable ids', () => {
    const a = all(busy());
    const b = all(busy());
    expect(a).toEqual(b);
    expect(a.map((i) => i.id)).toContain('ins-2-2026-09-06');
    expect(new Set(a.map((i) => i.id)).size).toBe(a.length);
    for (const c of a) {
      expect(c.body).not.toMatch(/null|undefined|NaN/);
      expect(c.coachPrompt).toBeTruthy();
      expect(c.body.split(/(?<=[.!?])\s+(?=[A-Z0-9])/).length).toBeLessThanOrEqual(2);
    }
  });
});

describe('review round 3 — copy and gates', () => {
  it('R3-7: #4 names a last meal under the per-meal floor and turns yellow', () => {
    const c = only(
      makeCtx({ nutrition: { totals: { p: 40 }, remaining: { p: 140 }, mealsLogged: 2, mealsLeft: 3, proteinPerMealNeeded: 47, lastMealBelowMin: true, lastMealProtein: 18, minPerMeal: 31 } }),
      4,
    )!;
    expect(c.body).toContain("You're at 40 g protein with 3 meals left — you need ~47 g each to hit 180 g.");
    expect(c.body).toContain('Your last meal came in at 18 g, under your 31 g floor — lead your next meal with');
    expect(c.band).toBe('yellow');
    expect(c.body.split(/(?<=[.!?])\s+(?=[A-Z0-9])/).length).toBeLessThanOrEqual(2);
    const plain = only(makeCtx({ nutrition: { totals: { p: 40 }, remaining: { p: 140 }, mealsLeft: 3, proteinPerMealNeeded: 47, lastMealBelowMin: false, lastMealProtein: 45, minPerMeal: 31 } }), 4)!;
    expect(plain.body).not.toContain('floor');
    expect(plain.band).toBe('yellow'); // 47 g > 43 g per meal is the existing "hard" case
  });

  it('R3-11: #9 quotes the last 3 smoke-free days when available, else the 30-day comparison', () => {
    const c = only(makeCtx({ tobacco: { today: 3, avg7: 4.2, hrvFree3: 58, hrvDelta3: 6, hrvSmokeFree: 55, hrvSmoking: 50 } }), 9)!;
    expect(c.body).toBe('3 today vs your 4.2 average — on your last 3 smoke-free days HRV averaged 58 ms, 6 ms higher. One fewer keeps the streak alive.');
    const legacy = only(makeCtx({ tobacco: { today: 3, avg7: 4.2, hrvFree3: null, hrvDelta3: null, hrvSmokeFree: 58, hrvSmoking: 52 } }), 9)!;
    expect(legacy.body).toContain('on smoke-free days your HRV averaged 58 ms, 6 ms higher');
    // A sub-1 ms (or negative) 3-day delta is noise: fall back rather than print it.
    const noise = only(makeCtx({ tobacco: { today: 3, avg7: 4.2, hrvFree3: 52, hrvDelta3: -3, hrvSmokeFree: 58, hrvSmoking: 52 } }), 9)!;
    expect(noise.body).toContain('on smoke-free days your HRV averaged 58 ms, 6 ms higher');
  });

  it('R3-10: the HRV empty state follows hrv.baselineEstablished (21 readings) with the ~3 weeks copy', () => {
    const forming = emptyStates(makeCtx({ hrv: { delta: { n: 12 }, daysOfData: 12, baselineEstablished: false } }));
    expect(forming.hrv).toBe('Baseline forms after ~3 weeks of HRV — 12 days logged so far.');
    // 25 readings used to show "forming" (< 30) while the hero already banded and forced on the range.
    const established = emptyStates(makeCtx({ hrv: { delta: { n: 25 }, daysOfData: 25, baselineEstablished: true } }));
    expect(established.hrv).toBeUndefined();
    // Contexts without the flag fall back to the same 21-reading rule.
    expect(emptyStates(makeCtx({ hrv: { delta: { n: 25 } } })).hrv).toBeUndefined();
    expect(emptyStates(makeCtx({ hrv: { delta: { n: 20 } } })).hrv).toMatch(/20 days logged/);
  });

  it('R3-3: #10 aligns with a live intake suggestion instead of "hold one more week"', () => {
    const w = { trend: 170.4, weeklyRateLb: -0.3, weeklyRatePct: -0.2, inBand: 'below' as const };
    const c = only(makeCtx({ weight: w, expenditure: { valid: true, tdee: 2300, suggestedKcal: 1850, suggestedDelta: -100 } }), 10)!;
    expect(c.body).toContain('Trim to 1,850 kcal (−100)');
    expect(c.body).not.toContain('one more week');
    expect(only(makeCtx({ weight: w }), 10)!.body).toContain('Hold 1,950 kcal one more week');
  });
});

describe('suggestedPrompts / COACH_CHIPS / emptyStates', () => {
  it('exposes the 8 spec chips verbatim in order', () => {
    expect(COACH_CHIPS).toEqual([
      'Should I train today?',
      'What should I eat now?',
      'Why is my recovery low?',
      "How's my weight trend — adjust calories?",
      'Plan my carbs for a lift day.',
      "How did last night's sleep affect me?",
      'Help me cut back tobacco today.',
      'Are my vitamin D / ferritin / omega-3 habits on track?',
    ]);
  });

  it('gives 2–3 state-driven prompts per tile', () => {
    for (const ctx of [makeCtx(), busy(), makeCtx({ readiness: { band: 'green' }, dayType: 'lift' })]) {
      const p = suggestedPrompts(ctx);
      for (const list of [p.today, p.sleep, p.recovery, p.nutrition]) {
        expect(list.length).toBeGreaterThanOrEqual(2);
        expect(list.length).toBeLessThanOrEqual(3);
        expect(new Set(list).size).toBe(list.length);
      }
    }
    expect(suggestedPrompts(busy()).today).toContain('Why is my recovery low?');
    expect(suggestedPrompts(busy()).today).toContain('Help me cut back tobacco today.');
    expect(suggestedPrompts(busy()).sleep).toContain('How do I make my bedtime more consistent?');
    expect(suggestedPrompts(busy()).nutrition).toContain('How do I reach my 60 g fat floor?');
    expect(suggestedPrompts(makeCtx({ dayType: 'lift' })).nutrition).toContain('Plan my carbs for a lift day.');
    expect(suggestedPrompts(makeCtx()).recovery).toContain('Should I train today?');
  });

  it('returns the spec empty-state copy only for tiles with nothing to show', () => {
    const e = emptyStates(makeCtx({ weight: { weighInsThisWeek: 3 }, hrv: { delta: { n: 12 } }, sleep: { hours: null } }));
    expect(e.protein).toBe('Log your first meal to see protein remaining.');
    expect(e.weight).toBe('Weigh in 5+ days this week so your trend and expenditure calibrate.');
    expect(e.hrv).toBe('Baseline forms after ~3 weeks of HRV — 12 days logged so far.');
    expect(e.sleep).toMatch(/sleep/);
    const full = emptyStates(makeCtx({ nutrition: { mealsLogged: 1, totals: { p: 40 } }, weight: { trend: 170, weighInsThisWeek: 5 } }));
    expect(full.protein).toBeUndefined();
    expect(full.weight).toBeUndefined();
    expect(full.hrv).toBeUndefined();
    expect(full.sleep).toBeUndefined();
    expect(emptyStates(makeCtx({ hrv: { today: null, baseline7: null } })).hrv).toMatch(/WHOOP/);
  });
});
