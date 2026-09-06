import { describe, expect, it } from 'vitest';
import type {
  BaselineDelta,
  BehaviourEffect,
  Changepoint,
  CoachContext,
  EnergyContext,
  ImpactContext,
  Insight,
  Macros,
  StressContext,
  TrainingContext,
} from '../data/types';
import { addDays } from '../lib/dates';
import { DEFAULT_BLOODWORK, DEFAULT_PROFILE, DEFAULT_TARGETS } from '../data/defaults';
import {
  COACH_CHIPS,
  type InsightOpts,
  emptyStates,
  examplePortion,
  generateInsights,
  insightPriority,
  insightStreak,
  suggestedPrompts,
} from './insights';

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
  sleep: { hours: 7.5, need: 7.75, debtMin: 15, bedtimeSdMin: 20, midpointSdMin: 20, bedtimeNights: 7, lastBedtime: '23:05', delta: bd(7.5, 7.5) },
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
const all = (ctx: CoachContext, opts: Omit<InsightOpts, 'max'> = {}): Insight[] =>
  generateInsights(ctx, DEFAULT_PROFILE, DEFAULT_TARGETS, { ...opts, max: 30 });
const only = (ctx: CoachContext, template: number, opts: Omit<InsightOpts, 'max'> = {}): Insight | undefined =>
  all(ctx, opts).find((i) => i.template === String(template));
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

  it('#4 protein pacing when per-meal need exists with protein and meals left; a big sitting is a note, not a warning', () => {
    const base = { nutrition: { totals: { p: 40 }, remaining: { p: 140 }, mealsLeft: 3, proteinPerMealNeeded: 47, maxPerMeal: 43 } };
    const c = only(makeCtx(base), 4)!;
    expect(c.body).toContain('40 g protein with 3 meals left');
    expect(c.body).toContain('~47 g each to hit 180 g');
    // 0.55 g/kg is a soft optimum (Trommelen 2023), so 47 g/meal is noted, never warned about.
    expect(c.body).toContain("bigger sitting than your usual 43 g and your body still uses it");
    expect(c.band).toBe('neutral');
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
    const c = only(makeCtx({ tobacco: { today: 3, avg7: 4.2, hrvSmokeFree: 58, hrvSmoking: 52, nFree: 11, nSmoke: 14 } }), 9)!;
    expect(c.body).toContain('3 today vs your 4.2 average');
    expect(c.body).toContain('across 11 smoke-free days HRV averaged 58 ms, 6 ms above your 14 smoking days');
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
    expect(inBand.body).toContain('Trend is 170.4 lb, down 1.2 lb/wk (0.70%/wk) — right in the 0.5–1% target');
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

  it('#11 bedtime consistency: yellow above 30 min, red (and promoted) above 60, gated on 3 nights', () => {
    expect(only(makeCtx({ sleep: { bedtimeSdMin: 30 } }), 11)).toBeUndefined();
    const y = only(makeCtx({ sleep: { bedtimeSdMin: 42 } }), 11)!;
    expect(y.body).toContain('swung 42 min this week');
    expect(y.body).toContain('11:00 pm nightly');
    expect(y.band).toBe('yellow');
    expect(y.priority).toBe(75); // 70 base + 5 yellow
    const r = only(makeCtx({ sleep: { bedtimeSdMin: 61 } }), 11)!;
    expect(r.band).toBe('red');
    expect(r.priority).toBe(107); // 95 promoted + 12 red
    // Two nights is not a habit — the audit gate.
    expect(only(makeCtx({ sleep: { bedtimeSdMin: 61, bedtimeNights: 2 } }), 11)).toBeUndefined();
    expect(only(makeCtx({ sleep: { bedtimeSdMin: 61, bedtimeNights: undefined } }), 11)).toBeUndefined();
    expect(only(makeCtx({ sleep: { bedtimeSdMin: 61, bedtimeNights: 3 } }), 11)).toBeDefined();
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
    // 90+12 red, 80+5 yellow, 72+5 yellow — the band bonus is part of the score now.
    expect(top.map((i) => i.template)).toEqual(['2', '1', '6']);
    expect(top.map((i) => i.priority)).toEqual([102, 85, 77]);
    expect(generateInsights(busy(), DEFAULT_PROFILE, DEFAULT_TARGETS, { max: 5 }).map((i) => i.template)).toEqual(['2', '1', '6', '11', '4']);
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
    // 98 + 5 (yellow) clears a red recovery card's 90 + 12 — the promotion has
    // to survive the band bonus or the rule stops meaning anything.
    expect(cards.map((i) => i.template).slice(0, 2)).toEqual(['1', '2']);
    expect(cards.find((i) => i.template === '1')!.priority).toBe(103);
    expect(cards.find((i) => i.template === '10')!.priority).toBe(50); // 45 + 5 yellow
    expect(cards.find((i) => i.template === '5')!.priority).toBe(32); // 40 − 8 neutral
    expect(cards.find((i) => i.template === '10')!.body).toContain('Fix sleep before cutting calories');
    // sleep only 20 min short → no boost
    const rested = busy({ weight: { inBand: 'below', weeklyRateLb: -0.3 }, sleep: { hours: 7.5, need: 7.75 } });
    expect(all(rested).find((i) => i.template === '1')!.priority).toBe(85);
    expect(all(rested).find((i) => i.template === '10')!.priority).toBe(70);
    // in-band loss with short sleep → no boost either
    expect(all(busy({ sleep: { hours: 6.5 } })).find((i) => i.template === '1')!.priority).toBe(85);
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
    const plain = only(makeCtx({ nutrition: { totals: { p: 40 }, remaining: { p: 140 }, mealsLeft: 3, proteinPerMealNeeded: 47, maxPerMeal: 43, lastMealBelowMin: false, lastMealProtein: 45, minPerMeal: 31 } }), 4)!;
    expect(plain.body).not.toContain('floor');
    // 47 g > the 43 g optimum used to be yellow; the audit made a big sitting a note.
    expect(plain.band).toBe('neutral');
  });

  it('R3-11 + audit: #9 quotes the last 3 smoke-free days, and always the counts behind the comparison', () => {
    const n = { nFree: 11, nSmoke: 14 };
    const c = only(makeCtx({ tobacco: { today: 3, avg7: 4.2, hrvFree3: 58, hrvDelta3: 6, hrvSmokeFree: 55, hrvSmoking: 50, ...n } }), 9)!;
    expect(c.body).toBe(
      '3 today vs your 4.2 average — on your last 3 smoke-free days HRV averaged 58 ms, 6 ms above your 14 smoking days. One fewer keeps the streak alive.',
    );
    const legacy = only(makeCtx({ tobacco: { today: 3, avg7: 4.2, hrvFree3: null, hrvDelta3: null, hrvSmokeFree: 58, hrvSmoking: 52, ...n } }), 9)!;
    expect(legacy.body).toContain('across 11 smoke-free days HRV averaged 58 ms, 6 ms above your 14 smoking days');
    // A sub-2 ms (or negative) 3-day delta is noise: fall back rather than print it.
    const noise = only(makeCtx({ tobacco: { today: 3, avg7: 4.2, hrvFree3: 52, hrvDelta3: -3, hrvSmokeFree: 58, hrvSmoking: 52, ...n } }), 9)!;
    expect(noise.body).toContain('across 11 smoke-free days HRV averaged 58 ms, 6 ms above your 14 smoking days');
  });

  it('audit: #9 drops the HRV clause without ≥ 5 paired days a side, or a ≥ 2 ms difference', () => {
    const thin = only(makeCtx({ tobacco: { today: 3, avg7: 4.2, hrvSmokeFree: 58, hrvSmoking: 52, nFree: 4, nSmoke: 14 } }), 9)!;
    expect(thin.body).not.toContain('HRV');
    const noCounts = only(makeCtx({ tobacco: { today: 3, avg7: 4.2, hrvSmokeFree: 58, hrvSmoking: 52 } }), 9)!;
    expect(noCounts.body).not.toContain('HRV');
    const tiny = only(makeCtx({ tobacco: { today: 3, avg7: 4.2, hrvSmokeFree: 53, hrvSmoking: 52, nFree: 11, nSmoke: 14 } }), 9)!;
    expect(tiny.body).not.toContain('HRV');
    // A punchy 3-day figure cannot smuggle itself past a 30-day delta of 1 ms.
    const smuggled = only(
      makeCtx({ tobacco: { today: 3, avg7: 4.2, hrvFree3: 58, hrvDelta3: 6, hrvSmokeFree: 53, hrvSmoking: 52, nFree: 11, nSmoke: 14 } }),
      9,
    )!;
    expect(smuggled.body).not.toContain('HRV');
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
  it('exposes the spec chips verbatim in order — the original 8, then the v3 four at 8–11', () => {
    expect(COACH_CHIPS).toEqual([
      'Should I train today?',
      'What should I eat now?',
      'Why is my recovery low?',
      "How's my weight trend — adjust calories?",
      'Plan my carbs for a lift day.',
      "How did last night's sleep affect me?",
      'Help me cut back tobacco today.',
      'Are my vitamin D / ferritin / omega-3 habits on track?',
      'What should I lift today?',
      'Am I overtraining?',
      'Why am I so stressed?',
      'When will I have energy today?',
    ]);
  });

  it('gives 2–3 state-driven prompts per tile', () => {
    for (const ctx of [makeCtx(), busy(), makeCtx({ readiness: { band: 'green' }, dayType: 'lift' })]) {
      const p = suggestedPrompts(ctx);
      for (const list of [p.today, p.sleep, p.recovery, p.nutrition, p.training, p.stress]) {
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

describe('review round — R1-12 units-aware weight copy', () => {
  const KG_PROFILE = { ...DEFAULT_PROFILE, units: 'kg' as const };
  const ctx = makeCtx({
    weight: { latest: 172, trend: 171.8, weeklyRateLb: -0.9, weeklyRatePct: -0.52, inBand: 'in' },
    nutrition: { totals: { kc: 800, p: 60, f: 30, c: 60, fi: 10 }, remaining: { kc: 1150, p: 120, f: 35, c: 25, fi: 20 }, mealsLogged: 2, mealsLeft: 2, proteinPerMealNeeded: 60 },
  });
  const byTemplate = (profile: typeof DEFAULT_PROFILE, template: number) =>
    generateInsights(ctx, profile, DEFAULT_TARGETS, { max: 30 }).find((i) => i.template === String(template));

  it('#10 keeps lb copy for a lb user', () => {
    const c = byTemplate(DEFAULT_PROFILE, 10);
    expect(c?.body).toContain('Trend is 171.8 lb, down 0.9 lb/wk (0.52%/wk)');
  });

  it('#10 formats trend and rate in kg and kg/wk for a kg user, with no lb figure', () => {
    const c = byTemplate(KG_PROFILE, 10);
    expect(c?.body).toContain('Trend is 77.9 kg, down 0.4 kg/wk (0.52%/wk)');
    expect(c?.body).not.toMatch(/\blb\b/);
  });

  it('#5 cites the trend rate in the user\'s unit', () => {
    expect(byTemplate(DEFAULT_PROFILE, 5)?.body).toContain('hold your 0.9 lb/wk trend');
    const kg = byTemplate(KG_PROFILE, 5);
    expect(kg?.body).toContain('hold your 0.4 kg/wk trend');
    expect(kg?.body).not.toMatch(/\blb\b/);
  });
});

describe('R7-10 #10 — the %BW/wk figure is printed at 2 dp so it never contradicts the verdict', () => {
  it('a rate just under the band reads "0.45%/wk — under the 0.5–1% target", never "0.5%/wk — under"', () => {
    const c = only(makeCtx({ weight: { trend: 173.2, weeklyRateLb: -0.79, weeklyRatePct: -0.45, inBand: 'below' } }), 10)!;
    expect(c.body).toContain('down 0.8 lb/wk (0.45%/wk) — under the 0.5–1% target');
    expect(c.body).not.toContain('(0.5%/wk)');
  });

  it('a rate just over the band reads "1.04%/wk — faster than"', () => {
    const c = only(makeCtx({ weight: { trend: 173.2, weeklyRateLb: -1.8, weeklyRatePct: -1.04, inBand: 'above' } }), 10)!;
    expect(c.body).toContain('(1.04%/wk) — faster than the 0.5–1% target');
  });
});

// ---------------------------------------------------------------------------
// Engine v3 — priority decay, templates #15–#26, and the new coach chips
// ---------------------------------------------------------------------------

/** History saying `template` was shown on each of the `days` days before `today`. */
const hist = (template: string, days: number, today = '2026-09-06'): Record<string, string[]> => {
  const out: Record<string, string[]> = {};
  for (let i = 1; i <= days; i++) out[addDays(today, -i)] = [template, '99'];
  return out;
};

describe('priority = base + band bonus − 4 · streak', () => {
  it('scores the pieces separately and never below the base minus its decay', () => {
    expect(insightPriority(80, 'red')).toBe(92);
    expect(insightPriority(80, 'yellow')).toBe(85);
    expect(insightPriority(80, 'green')).toBe(72);
    expect(insightPriority(80, 'neutral')).toBe(72);
    expect(insightPriority(80, 'yellow', 3)).toBe(73);
    expect(insightPriority(80, 'yellow', -5)).toBe(85); // a negative streak is not a bonus
  });

  it('counts consecutive prior days from settings.insightHistory, and stops at the first gap', () => {
    expect(insightStreak(hist('1', 4), '1', '2026-09-06')).toBe(4);
    expect(insightStreak(hist('1', 4), '2', '2026-09-06')).toBe(0);
    expect(insightStreak(undefined, '1', '2026-09-06')).toBe(0);
    // today's own entry never counts toward its streak
    expect(insightStreak({ '2026-09-06': ['1'] }, '1', '2026-09-06')).toBe(0);
    // a day the app showed nothing ends the run
    const gapped = { ...hist('1', 4), [addDays('2026-09-06', -3)]: ['7'] };
    expect(insightStreak(gapped, '1', '2026-09-06')).toBe(2);
    expect(insightStreak(hist('1', 40), '1', '2026-09-06')).toBe(14); // capped at the history window
  });

  it('a yellow card cannot hold the top slot more than 4 consecutive days', () => {
    // Yellow readiness, so nothing red outranks the sleep-debt card by band.
    const ctx = busy({ readiness: { band: 'yellow', score: 55 } });
    const top = (streak: number) => all(ctx, { history: hist('1', streak) })[0];
    expect(top(0).template).toBe('1');
    expect(top(0).priority).toBe(85);
    expect(top(1).template).toBe('1');
    expect(top(2).template).toBe('1'); // 77, tying #6 and winning on template number
    // Day 4 in a row: 80 + 5 − 12 = 73, below the 77 of the fat-floor card.
    expect(top(3).template).not.toBe('1');
    expect(top(4).template).not.toBe('1');
    expect(top(5).template).not.toBe('1');
    // The card still exists — it is demoted, not suppressed.
    expect(all(ctx, { history: hist('1', 5) }).map((i) => i.template)).toContain('1');
  });
});

const TRAINING: TrainingContext = {
  todaySession: 'upper',
  plannedExercises: [
    {
      exerciseId: 'bench',
      name: 'Bench press',
      sets: 3,
      reps: [6, 8],
      loadKg: 82.5,
      mode: 'progress',
      reason: 'Last session cleared all reps at RPE 7.',
      last: { loadKg: 80, reps: [8, 8, 8], rpe: 7, d: '2026-09-02' },
    },
  ],
  todayWorkouts: [],
  load: {
    today: 320,
    acute7: 2100,
    chronic28: 1800,
    acwr: 1.17,
    acwrBand: 'sweet',
    weekOverWeekPct: 18,
    fitness: 62,
    fatigue: 48,
    form: 14,
    formBand: 'productive',
    monotony: 1.4,
    weeklyLoad: 2100,
    source: 'logged',
    tauIsPrior: true,
  },
  weeklySets: [
    { muscle: 'side-delts', sets: 4, mev: 10, mav: 18, mrv: 24, status: 'below-mev' },
    { muscle: 'calves', sets: 6, mev: 8, mav: 14, mrv: 20, status: 'below-mev' },
    { muscle: 'chest', sets: 14, mev: 8, mav: 16, mrv: 22, status: 'productive' },
  ],
  muscleReadiness: [],
  balance: { pushPull: 1.1, squatHinge: 0.9 },
  prs7d: [{ exerciseId: 'squat', name: 'Back squat', kind: 'e1rm', value: 142.5, previous: 138, d: '2026-09-04' }],
  plateaus: [],
  deload: { recommended: true, reasons: ['Form has been overreached for 5 days', 'Bench has stalled with rising RPE'] },
  lastSession: null,
  vo2max: null,
};

const STRESS: StressContext = {
  osi: 68,
  osiLo: 60,
  osiHi: 76,
  signalsDeviating: 2,
  signalsAvailable: 5,
  band: 'minor',
  outliers: [
    { key: 'hrv', label: 'HRV', value: 38, z: -1.4, threshold: -1, deviating: true },
    { key: 'rhr', label: 'Resting HR', value: 58, z: 1.3, threshold: 1, deviating: true },
    { key: 'rr', label: 'Respiratory rate', value: 14.1, z: 0.2, threshold: 1, deviating: false },
  ],
  checkIn: { sleepQ: 5, fatigue: 6, stress: 5, soreness: 4, total: 20, band: 'yellow', nDays: 21, worseRun: 3, missingToday: false },
  resilience: { score: 41, band: 'adequate', loadEwma: 1900, recoveryEwma: 52, balance: -0.4, nDays: 30, alStyleCount: 3 },
  illness: { flag: true, since: '2026-09-04', reasons: ['HRV down and resting HR up 2 days running', 'Skin temp +0.6 °C'] },
  calibrating: false,
  nRef: 45,
};

const EFFECT: BehaviourEffect = {
  behaviour: 'alcohol',
  metric: 'readiness',
  label: 'Alcohol',
  deltaMean: -11,
  lo95: -18,
  hi95: -4,
  nYes: 9,
  nNo: 46,
  shrunkToPrior: 0.3,
  qValue: 0.01,
};
const IMPACT: ImpactContext = { effects: [EFFECT], pending: ['lateCaffeine'] };

const CHANGEPOINTS: Changepoint[] = [
  { d: '2026-08-14', metric: 'rhr', label: 'Resting HR', prob: 0.88, meanBefore: 54.2, meanAfter: 58.6 },
];

const ENERGY: EnergyContext = {
  now: 62,
  atWake: 40,
  forecast: [],
  trough: { hhmm: '14:30', value: 44 },
  bedtimeReadyAt: '22:20',
  caffeineActiveMg: 35,
  drivers: ['sleep debt'],
  confidence: 'medium',
};

const v3 = (extra: DeepPartial<CoachContext> = {}): CoachContext =>
  makeCtx(deepMerge<DeepPartial<CoachContext>>({ training: TRAINING, stress: STRESS, impact: IMPACT, changepoints: CHANGEPOINTS, energy: ENERGY }, extra));

describe('templates #15–#26 — the v3 blocks', () => {
  const PREV: InsightOpts = { previous: { resilienceBand: 'solid' } };

  it('#15 names the lift, the load and the set scheme', () => {
    const c = only(v3(), 15)!;
    expect(c.body).toBe('Bench press is ready to move up — take 82.5 kg for 3×6–8. Last time: 80 kg.');
    expect(c.band).toBe('green');
    expect(c.coachPrompt).toBe('What should I lift today?');
  });

  it('#16 deload is reactive and cites Coleman 2024', () => {
    const c = only(v3(), 16)!;
    expect(c.body).toContain('form has been overreached for 5 days and bench has stalled with rising RPE');
    expect(c.body).toContain('cut sets ~40% and load ~10%');
    expect(c.body).toContain('Coleman 2024');
    expect(c.body).toContain('reactive');
    expect(c.band).toBe('yellow');
    expect(only(v3({ training: { deload: { recommended: false } } }), 16)).toBeUndefined();
    // A recommendation with no reasons would be a sentence with a hole in it.
    expect(only(v3({ training: { deload: { recommended: true, reasons: [] } } }), 16)).toBeUndefined();
  });

  it('#17 frames volume under MEV as an opportunity, never a scolding', () => {
    const c = only(v3(), 17)!;
    expect(c.body).toContain('Side delts got 4 sets this week');
    expect(c.body).toContain('6 more clears the 10 where growth starts');
    expect(c.body).toContain('easiest gain');
    expect(c.body).toContain('1 other muscle has the same room');
    expect(c.band).toBe('neutral');
    expect(c.body).not.toMatch(/should|failed|behind|only/i);
  });

  it('#18 leads on the week-on-week load ramp, which replaced the ACWR alert', () => {
    const c = only(v3(), 18)!;
    expect(c.body).toContain('Training load is up 18% on last week (2,100 load units)');
    expect(c.body).toContain('~10%/wk');
    expect(c.band).toBe('yellow');
    expect(only(v3({ training: { load: { weekOverWeekPct: 45 } } }), 18)!.band).toBe('red');
    expect(only(v3({ training: { load: { weekOverWeekPct: 10 } } }), 18)).toBeUndefined();
    expect(only(v3({ training: { load: { weekOverWeekPct: null } } }), 18)).toBeUndefined();
    // ACWR on its own never raises a card.
    expect(only(v3({ training: { load: { weekOverWeekPct: 4, acwr: 1.9, acwrBand: 'spike' } } }), 18)).toBeUndefined();
  });

  it('#19 reports a PR with what it beat', () => {
    const c = only(v3(), 19)!;
    expect(c.body).toBe('New estimated 1RM PR on Back squat: 142.5 kg, up from 138 kg.');
    expect(c.band).toBe('green');
    expect(only(v3({ training: { prs7d: [] } }), 19)).toBeUndefined();
  });

  it('#20 says what moved the verdict, and only for a downgrade with a reason', () => {
    const mods = [{ key: 'illness', label: 'Possible illness', effect: 'downgrade' as const, reason: 'two overnight signals are outside your range' }];
    const c = only(v3({ readiness: { modifiers: mods } }), 20)!;
    expect(c.body).toBe('Possible illness moved today\'s call to "Train, hold loads" — two overnight signals are outside your range. Your score alone read 55%.');
    expect(c.band).toBe('yellow');
    expect(only(v3(), 20)).toBeUndefined();
    expect(only(v3({ readiness: { modifiers: [{ ...mods[0], effect: 'note' as const }] } }), 20)).toBeUndefined();
    expect(only(v3({ readiness: { modifiers: [{ ...mods[0], reason: '  ' }] } }), 20)).toBeUndefined();
  });

  it('#21 fires on the DALDA three-day run and reddens at five', () => {
    const c = only(v3(), 21)!;
    expect(c.body).toContain('worse than normal 3 days running (Hooper 20/28)');
    expect(c.band).toBe('yellow');
    expect(only(v3({ stress: { checkIn: { worseRun: 5 } } }), 21)!.band).toBe('red');
    expect(only(v3({ stress: { checkIn: { worseRun: 2 } } }), 21)).toBeUndefined();
    // No Hooper total → the clause is dropped, not filled with a null.
    expect(only(v3({ stress: { checkIn: { total: null } } }), 21)!.body).not.toMatch(/Hooper|null/);
  });

  it('#22 counts the overnight outliers, Apple-Vitals style', () => {
    const c = only(v3(), 22)!;
    expect(c.body).toContain('2 of 5 overnight signals are outside your range — HRV and resting HR');
    expect(c.band).toBe('yellow');
    const major = only(v3({ stress: { signalsDeviating: 3 } }), 22)!;
    expect(major.band).toBe('red');
    expect(major.body).toContain('Treat today as a recovery day');
    expect(only(v3({ stress: { signalsDeviating: 1 } }), 22)).toBeUndefined();
    // "Still learning your normal" must never be dressed up as a finding.
    expect(only(v3({ stress: { calibrating: true } }), 22)).toBeUndefined();
  });

  it('#23 needs the previous band, and says which way it moved', () => {
    const down = only(v3(), 23, PREV)!;
    expect(down.body).toBe('Resilience moved from solid to adequate (41/100). Your load is outpacing your recovery — protect sleep before adding any.');
    expect(down.band).toBe('yellow');
    const up = only(v3({ stress: { resilience: { band: 'strong' } } }), 23, PREV)!;
    expect(up.band).toBe('green');
    expect(up.body).toContain('room to add work');
    expect(only(v3(), 23)).toBeUndefined(); // no previous band passed
    expect(only(v3(), 23, { previous: { resilienceBand: 'adequate' } })).toBeUndefined(); // unchanged
  });

  it('#24 is a pattern in your own numbers, never a diagnosis', () => {
    const c = only(v3(), 24)!;
    expect(c.body).toContain('Possible illness or heavy overload since Fri 4 Sep');
    expect(c.body).toContain('HRV down and resting HR up 2 days running and skin temp +0.6 °C');
    expect(c.body).toContain('not a diagnosis');
    expect(c.band).toBe('red');
    expect(c.priority).toBe(108); // the highest base in the table, plus red
    expect(only(v3({ stress: { illness: { flag: false } } }), 24)).toBeUndefined();
    expect(only(v3({ stress: { illness: { flag: true, reasons: [] } } }), 24)).toBeUndefined();
  });

  it('#25 quotes the counts and the interval, in the spec\'s words', () => {
    const c = only(v3(), 25)!;
    expect(c.body).toBe('On the 9 days you drank, recovery was 11 points lower, 95% CI 4–18 (against 46 days without).');
    expect(c.band).toBe('yellow');
    const withConfound = only(v3({ impact: { effects: [{ ...EFFECT, confound: 'those days also had higher training load' }] } }), 25)!;
    expect(withConfound.body).toContain('Worth knowing: those days also had higher training load.');
    // An interval straddling zero is not a confirmed effect.
    expect(only(v3({ impact: { effects: [{ ...EFFECT, lo95: -18, hi95: 3 }] } }), 25)).toBeUndefined();
    expect(only(v3({ impact: { effects: [] } }), 25)).toBeUndefined();
    // A helpful direction is a finding too, just not a warning.
    expect(only(v3({ impact: { effects: [{ ...EFFECT, behaviour: 'shortSleep', deltaMean: 6, lo95: 2, hi95: 10 }] } }), 25)!.band).toBe('neutral');
  });

  it('#26 dates the regime shift and says the baseline moved with it', () => {
    const c = only(v3(), 26)!;
    expect(c.body).toContain('Your resting HR has settled at a new level since Fri 14 Aug — up from 54.2 to 58.6');
    expect(c.body).toContain('baseline now starts from that date');
    expect(c.band).toBe('neutral');
    expect(only(v3({ changepoints: [] }), 26)).toBeUndefined();
  });

  it('renders nothing at all when the block behind it is absent', () => {
    const bare = makeCtx(); // no training, stress, impact, energy or changepoints
    const shown = all(bare, { previous: { resilienceBand: 'solid' } }).map((i) => i.template);
    for (const t of ['15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25', '26']) {
      expect(shown).not.toContain(t);
    }
    // Individually, so a single missing block cannot be masked by another.
    expect(only(makeCtx({ stress: STRESS, impact: IMPACT, changepoints: CHANGEPOINTS }), 15)).toBeUndefined();
    expect(only(makeCtx({ stress: STRESS }), 16)).toBeUndefined();
    expect(only(makeCtx({ stress: STRESS }), 17)).toBeUndefined();
    expect(only(makeCtx({ stress: STRESS }), 18)).toBeUndefined();
    expect(only(makeCtx({ stress: STRESS }), 19)).toBeUndefined();
    expect(only(makeCtx({ training: TRAINING }), 21)).toBeUndefined();
    expect(only(makeCtx({ training: TRAINING }), 22)).toBeUndefined();
    expect(only(makeCtx({ training: TRAINING }), 23, { previous: { resilienceBand: 'solid' } })).toBeUndefined();
    expect(only(makeCtx({ training: TRAINING }), 24)).toBeUndefined();
    expect(only(makeCtx({ training: TRAINING }), 25)).toBeUndefined();
    expect(only(makeCtx({ training: TRAINING }), 26)).toBeUndefined();
    // …and when the block is there but empty.
    const empty = makeCtx({ impact: { effects: [], pending: [] }, changepoints: [] });
    expect(only(empty, 25)).toBeUndefined();
    expect(only(empty, 26)).toBeUndefined();
  });

  it('keeps every v3 card to the §7 copy rules', () => {
    const cards = all(v3({ readiness: { modifiers: [{ key: 'k', label: 'Overreached form', effect: 'downgrade', reason: 'training form has been overreached for 5 days' }] } }), PREV);
    const v3Cards = cards.filter((c) => Number(c.template) >= 15);
    expect(v3Cards).toHaveLength(12);
    for (const c of v3Cards) {
      expect(c.body).not.toMatch(/null|undefined|NaN/);
      expect(c.coachPrompt).toBeTruthy();
      expect(c.body.split(/(?<=[.!?])\s+(?=[A-Z0-9])/).length).toBeLessThanOrEqual(2);
      expect(c.id).toBe(`ins-${c.template}-2026-09-06`);
    }
    expect(new Set(v3Cards.map((c) => c.id)).size).toBe(12);
  });
});

describe('suggestedPrompts.training / .stress', () => {
  it('offers state-driven training and stress chips', () => {
    const p = suggestedPrompts(v3());
    expect(p.training).toContain('What should I lift today?');
    expect(p.training).toContain('Should I deload this week?');
    expect(p.training).toContain('Which muscles need more volume?');
    expect(p.stress).toContain('Why am I so stressed?');
    expect(p.stress).toContain('Am I getting sick or just tired?');
    expect(p.stress).toContain('When will I have energy today?');
  });

  it('still returns 2–3 usable chips when the v3 blocks are missing', () => {
    const p = suggestedPrompts(makeCtx());
    for (const list of [p.training, p.stress]) {
      expect(list.length).toBeGreaterThanOrEqual(2);
      expect(list.length).toBeLessThanOrEqual(3);
      expect(new Set(list).size).toBe(list.length);
      expect(list.every((x) => typeof x === 'string' && x.length > 0)).toBe(true);
    }
    expect(p.training[0]).toBe('What should I lift today?');
    expect(p.stress[0]).toBe('Why am I so stressed?');
  });
});
