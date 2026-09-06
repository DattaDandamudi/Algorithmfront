import { describe, expect, it } from 'vitest';
import type { AppSettings, CoachContext, DailyRecord, FoodTag, Meal } from '../data/types';
import { DEFAULT_BLOODWORK, DEFAULT_SETTINGS, DEFAULT_TARGETS } from '../data/defaults';
import { addDays, minutesToHHMM } from '../lib/dates';
import { ENGINE_VERSION, buildCoachContext, buildInsights, contextForDate } from './context';
import * as engine from './index';

/** Sunday 2026-09-06 → 'rest' on the default split. */
const TODAY = '2026-09-06';
/** A fixed instant — constructed, not read from the clock. 09:00 local. */
const NOW = new Date(2026, 8, 6, 9, 0, 0);
const SETTINGS: AppSettings = DEFAULT_SETTINGS;
const T = DEFAULT_TARGETS;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Walk every value; collect paths whose value is NaN (JSON.stringify would hide them as null). */
function nanPaths(v: unknown, path = 'ctx'): string[] {
  if (typeof v === 'number') return Number.isNaN(v) ? [path] : [];
  if (Array.isArray(v)) return v.flatMap((x, i) => nanPaths(x, `${path}[${i}]`));
  if (v && typeof v === 'object') {
    return Object.entries(v as Record<string, unknown>).flatMap(([k, x]) => nanPaths(x, `${path}.${k}`));
  }
  return [];
}

function expectNoNaN(ctx: CoachContext): void {
  expect(nanPaths(ctx)).toEqual([]);
  // Also catch NaN that leaked into copy ("NaN:NaN", "NaN kcal").
  expect(JSON.stringify(ctx)).not.toContain('NaN');
}

const build = (records: DailyRecord[], today = TODAY, now = NOW, settings = SETTINGS): CoachContext =>
  buildCoachContext({ records, settings, today, now });

// ---------------------------------------------------------------------------
// Deterministic 40-day synthetic dataset (does not depend on data/seed.ts)
// ---------------------------------------------------------------------------

const DAYS = 40;
/** Day index → ISO date; index DAYS − 1 is TODAY. */
const dayOf = (i: number) => addDays(TODAY, i - (DAYS - 1));

type MealTemplate = Omit<Meal, 'id' | 'tags'> & { tags: FoodTag[] };

/** Integer macros so `remaining = target − totals` is exact. Daily p = 178 (≥ 170 = protein hit). */
const MEALS: MealTemplate[] = [
  { t: '08:30', n: 'eggs and roti', g: 200, kc: 430, p: 28, f: 18, c: 40, fi: 4, tags: ['egg', 'grain', 'home'] },
  { t: '13:00', n: 'chicken tikka', g: 250, kc: 520, p: 60, f: 18, c: 20, fi: 3, tags: ['poultry', 'restaurant'] },
  { t: '17:00', n: 'greek yogurt', g: 200, kc: 180, p: 30, f: 6, c: 12, fi: 0, tags: ['dairy', 'home'] },
  { t: '20:00', n: 'lamb chops and rice', g: 300, kc: 700, p: 60, f: 30, c: 50, fi: 3, tags: ['red-meat', 'grain', 'restaurant'] },
];
const FISH_DINNER: MealTemplate = { t: '20:00', n: 'tandoori prawns and rice', g: 300, kc: 620, p: 60, f: 20, c: 50, fi: 3, tags: ['seafood', 'fish', 'grain', 'restaurant'] };

function mealsFor(i: number, count = 4): Meal[] {
  const out: Meal[] = [];
  for (let k = 0; k < count; k++) {
    const tpl = k === 3 && i % 3 === 0 ? FISH_DINNER : MEALS[k];
    // Small deterministic kcal jitter (0–40) keeps every day inside the kcal-hit band.
    out.push({ id: `m${i}-${k}`, ...tpl, kc: tpl.kc + ((i * 7 + k) % 5) * 10 });
  }
  return out;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * 40 fully-logged days ending TODAY. Weight falls ~1 lb/wk with ±0.6 lb
 * noise; HRV wobbles ±5 ms around 50 so the SWC has width; tobacco cycles
 * 0/1/2 so both smoke-free and smoking groups have ≥3 paired mornings.
 */
function synthetic(): DailyRecord[] {
  const recs: DailyRecord[] = [];
  for (let i = 0; i < DAYS; i++) {
    const meals = mealsFor(i);
    const kc = meals.reduce((a, m) => a + m.kc, 0);
    const p = meals.reduce((a, m) => a + m.p, 0);
    const f = meals.reduce((a, m) => a + m.f, 0);
    const c = meals.reduce((a, m) => a + m.c, 0);
    const fi = meals.reduce((a, m) => a + m.fi, 0);
    recs.push({
      d: dayOf(i),
      w: r1(176 - i / 7 + 0.6 * Math.sin(i * 1.3)),
      kc,
      p,
      f,
      c,
      fi,
      st: 8000 + Math.round(1500 * Math.sin(i * 0.4)),
      rec: 60 + Math.round(15 * Math.sin(i * 0.8)),
      hrv: 50 + Math.round(5 * Math.sin(i * 1.1)),
      rhr: 54 + Math.round(2 * Math.cos(i * 0.6)),
      slh: r1(7.2 + 0.5 * Math.sin(i * 0.9)),
      strn: 10 + Math.round(4 * Math.sin(i * 0.5)),
      bt: minutesToHHMM(23 * 60 + Math.round(20 * Math.sin(i * 1.7))),
      wk: '07:00',
      tob: i % 3,
      caf: ['08:00'],
      h2o: 6,
      meals,
    });
  }
  // Today is a partial day: morning WHOOP data, two meals, a late coffee, one cigarette so far.
  const today = recs[DAYS - 1];
  const meals = mealsFor(DAYS - 1, 2);
  recs[DAYS - 1] = {
    d: TODAY,
    w: today.w,
    rec: 71,
    hrv: today.hrv,
    rhr: today.rhr,
    slh: today.slh,
    bt: today.bt,
    wk: '07:00',
    st: 4200,
    tob: 1,
    caf: ['08:00', '15:30'],
    h2o: 3,
    meals,
    kc: meals.reduce((a, m) => a + m.kc, 0),
    p: meals.reduce((a, m) => a + m.p, 0),
    f: meals.reduce((a, m) => a + m.f, 0),
    c: meals.reduce((a, m) => a + m.c, 0),
    fi: meals.reduce((a, m) => a + m.fi, 0),
  };
  return recs;
}

// ---------------------------------------------------------------------------
// 1. Fresh install — empty records
// ---------------------------------------------------------------------------

describe('buildCoachContext — empty records (fresh install)', () => {
  it('does not throw and fills every block with nulls / zeros', () => {
    let ctx!: CoachContext;
    expect(() => {
      ctx = build([]);
    }).not.toThrow();
    expectNoNaN(ctx);

    expect(ctx.today).toBe(TODAY);
    expect(ctx.nowHHMM).toBe('09:00');
    expect(ctx.dayType).toBe('rest');
    expect(ctx.sessionType).toBe('rest');

    expect(ctx.readiness.source).toBe('none');
    expect(ctx.readiness.score).toBeNull();
    expect(ctx.readiness.band).toBe('neutral');

    expect(ctx.hrv.band).toBe('insufficient');
    expect(ctx.hrv.today).toBeNull();
    expect(ctx.hrv.baseline7).toBeNull();
    expect(ctx.hrv.swcLower).toBeNull();
    expect(ctx.hrv.delta.n).toBe(0);
    expect(ctx.rhr.today).toBeNull();
    expect(ctx.rhr.n).toBe(0);

    expect(ctx.sleep.hours).toBeNull();
    expect(ctx.sleep.bedtimeSdMin).toBeNull();
    expect(ctx.sleep.lastBedtime).toBeNull();
    expect(ctx.sleep.delta.n).toBe(0);

    expect(ctx.steps.today).toBeNull();
    expect(ctx.steps.goalMin).toBe(T.stepsMin);
    expect(ctx.steps.goalMax).toBe(T.stepsMax);

    expect(ctx.weight).toEqual({
      latest: null,
      trend: null,
      weeklyRateLb: null,
      weeklyRatePct: null,
      targetLbPerWk: [0.86, 1.72], // 172 lb × 0.5–1.0 %BW/wk (§6.1)
      inBand: null,
      weighInsThisWeek: 0,
    });

    expect(ctx.expenditure.valid).toBe(false);
    expect(ctx.expenditure.tdee).toBeNull();
    expect(ctx.expenditure.suggestedKcal).toBeNull();
    expect(ctx.expenditure.suggestedDelta).toBeNull();
    expect(ctx.expenditure.reason.length).toBeGreaterThan(0);

    expect(ctx.nutrition.totals).toEqual({ kc: 0, p: 0, f: 0, c: 0, fi: 0 });
    expect(ctx.nutrition.remaining.p).toBe(T.protein);
    expect(ctx.nutrition.remaining.kc).toBe(T.kcal);
    expect(ctx.nutrition.targets.carbsRange).toEqual(T.carbsRest);
    expect(ctx.nutrition.targets.fatFloor).toBe(T.fatFloor);
    expect(ctx.nutrition.mealsLogged).toBe(0);
    expect(ctx.nutrition.mealsLeft).toBe(T.mealsPerDay);
    expect(ctx.nutrition.lastMealTime).toBeNull();
    expect(ctx.nutrition.fatBelowFloor).toBe(false);
    expect(ctx.nutrition.lateEating).toBe(false);
    expect(ctx.nutrition.hydrationCups).toBe(0);
    expect(ctx.nutrition.hydrationTargetCups).toBe(10); // 78 kg × 32 ml ≈ 2.5 L
    expect(ctx.nutrition.caffeineAfterCutoff).toBeNull();

    expect(ctx.tobacco).toEqual({ today: 0, avg7: null, avg30: null, streakDays: 0, hrvSmokeFree: null, hrvSmoking: null });
    expect(ctx.frequency).toEqual({ redMeatServings7d: 0, fishServings7d: 0, restaurantPct7d: null, fiberAvg7d: null, homeCookedPct7d: null });
    expect(ctx.adherence).toEqual({ loggingStreak: 0, proteinHitDays30: 0, kcalHitDays30: 0, weighInDays30: 0 });
    expect(ctx.bloodwork).toEqual(DEFAULT_BLOODWORK);
    expect(ctx.last30).toEqual([]);
    expect(ctx.todayRecord).toBeNull();
  });

  it('buildInsights on the empty context returns ≤ 3 cards without throwing', () => {
    const cards = buildInsights(build([]), SETTINGS);
    expect(Array.isArray(cards)).toBe(true);
    expect(cards.length).toBeLessThanOrEqual(3);
  });

  it('falls back to a neutral clock for an invalid Date instead of leaking NaN', () => {
    const ctx = build([], TODAY, new Date(NaN));
    expect(ctx.nowHHMM).toBe('12:00');
    expectNoNaN(ctx);
  });
});

// ---------------------------------------------------------------------------
// 2. Only today's partial record
// ---------------------------------------------------------------------------

describe('buildCoachContext — only today, partially logged', () => {
  const meal: Meal = { id: 'a', t: '08:10', n: 'eggs', g: 150, kc: 300, p: 24, f: 20, c: 4, fi: 0, tags: ['egg', 'home'] };
  const today: DailyRecord = { d: TODAY, w: 160, meals: [meal], kc: 300, p: 24, f: 20, c: 4, fi: 0, st: 3000, caf: ['15:00'], h2o: 2, tob: 0 };

  it('uses the single record everywhere it applies and stays null-safe elsewhere', () => {
    const ctx = build([today]);
    expectNoNaN(ctx);

    expect(ctx.todayRecord).toEqual(today);
    expect(ctx.last30).toEqual([]); // today is never part of the history window

    // No WHOOP / HRV → no readiness signal.
    expect(ctx.readiness.source).toBe('none');
    expect(ctx.hrv.delta.n).toBe(0);

    // One weigh-in seeds the trend but cannot yield a weekly rate yet.
    expect(ctx.weight.latest).toBe(160);
    expect(ctx.weight.trend).toBe(160);
    expect(ctx.weight.weeklyRateLb).toBeNull();
    expect(ctx.weight.inBand).toBeNull();
    expect(ctx.weight.weighInsThisWeek).toBe(1);
    // Body weight for %BW / g/kg math is today's 160 lb scale weight, not the 172 lb profile default.
    expect(ctx.weight.targetLbPerWk).toEqual([0.8, 1.6]);
    expect(ctx.nutrition.hydrationTargetCups).toBe(9); // 72.6 kg × 32 ml = 2.32 L

    expect(ctx.expenditure.valid).toBe(false);
    expect(ctx.expenditure.tdee).toBeNull();

    expect(ctx.nutrition.totals).toEqual({ kc: 300, p: 24, f: 20, c: 4, fi: 0 });
    expect(ctx.nutrition.remaining.p).toBe(T.protein - 24);
    expect(ctx.nutrition.mealsLogged).toBe(1);
    expect(ctx.nutrition.mealsLeft).toBe(T.mealsPerDay - 1);
    expect(ctx.nutrition.proteinPerMealNeeded).toBe(Math.round((T.protein - 24) / 3));
    expect(ctx.nutrition.lastMealTime).toBe('08:10');
    expect(ctx.nutrition.hydrationCups).toBe(2);
    expect(ctx.nutrition.caffeineAfterCutoff).toBe('15:00');

    expect(ctx.steps.today).toBe(3000);
    expect(ctx.tobacco.today).toBe(0);
    expect(ctx.tobacco.streakDays).toBe(1);
    expect(ctx.adherence).toEqual({ loggingStreak: 1, proteinHitDays30: 0, kcalHitDays30: 0, weighInDays30: 1 });
    expect(ctx.frequency.homeCookedPct7d).toBe(100);
    expect(ctx.frequency.restaurantPct7d).toBe(0);
  });

  it("prefers the store's cached `wt` for the trend when present", () => {
    const ctx = build([{ ...today, wt: 161.4 }]);
    expect(ctx.weight.trend).toBe(161.4);
  });
});

// ---------------------------------------------------------------------------
// 3. 40-day synthetic history
// ---------------------------------------------------------------------------

describe('buildCoachContext — 40-day synthetic dataset', () => {
  const records = synthetic();
  const ctx = build(records);

  it('is free of NaN everywhere and deterministic', () => {
    expectNoNaN(ctx);
    expect(build(records)).toEqual(ctx);
  });

  it('last30 is the 30 days before today, meals collapsed to mealCount', () => {
    expect(ctx.last30.length).toBeLessThanOrEqual(30);
    expect(ctx.last30.length).toBe(30);
    expect(ctx.last30.every((r) => r.d < TODAY)).toBe(true);
    expect(ctx.last30[0].d).toBe(addDays(TODAY, -30));
    expect(ctx.last30[29].d).toBe(addDays(TODAY, -1));
    for (const r of ctx.last30) {
      expect('meals' in r).toBe(false);
      expect(r.mealCount).toBe(4);
      expect(r.kc).toBeGreaterThan(0);
    }
    // ascending regardless of input order
    const shuffled = [...records].reverse();
    expect(build(shuffled).last30.map((r) => r.d)).toEqual(ctx.last30.map((r) => r.d));
    expect(ctx.todayRecord?.d).toBe(TODAY);
    expect(ctx.todayRecord?.meals?.length).toBe(2);
  });

  it('readiness defers to WHOOP recovery when today has `rec`, with the HRV forcing rule applied', () => {
    expect(ctx.readiness.source).toBe('whoop');
    expect(ctx.readiness.score).toBe(71); // the score is the data — never altered
    // Today's synthetic HRV (46 ms) sits below the lower SWC → band 'low' forces red
    // over a 71 % recovery (§6.3 thresholds; the same HrvStatus feeds both blocks).
    expect(ctx.hrv.band).toBe('low');
    expect(ctx.readiness.band).toBe('red');
    expect(ctx.readiness.forced).toBe(true);
    expect(ctx.readiness.training).toBe('Light day');

    // With HRV back inside its range the WHOOP band stands on its own.
    const healthy = records.map((r) => (r.d === TODAY ? { ...r, hrv: 52 } : r));
    const c = build(healthy);
    expect(c.readiness.source).toBe('whoop');
    expect(c.readiness.score).toBe(71);
    expect(c.hrv.band).not.toBe('low');
    expect(c.readiness.band).toBe('green');
    expect(c.readiness.forced).toBeFalsy();
  });

  it('hrv block maps HrvStatus and counts 30-day readings in delta.n', () => {
    expect(ctx.hrv.today).toBe(records[DAYS - 1].hrv);
    expect(ctx.hrv.baseline7).not.toBeNull();
    expect(ctx.hrv.swcLower as number).toBeLessThan(ctx.hrv.baseline7 as number);
    expect(ctx.hrv.baseline7 as number).toBeLessThan(ctx.hrv.swcUpper as number);
    expect(ctx.hrv.lnMean7).toBeCloseTo(Math.log(ctx.hrv.baseline7 as number), 2);
    expect(ctx.hrv.band).not.toBe('insufficient');
    expect(ctx.hrv.cv7).not.toBeNull();
    expect(ctx.hrv.delta.n).toBe(30);
    expect(ctx.hrv.delta.today).toBe(records[DAYS - 1].hrv);
    expect(ctx.hrv.delta.baseline).not.toBeNull();
    // The same HrvStatus fed readiness — the detail quotes the same 7-day baseline.
    expect(ctx.readiness.detail).toContain(`baseline ${Math.round(ctx.hrv.baseline7 as number)}`);
  });

  it('rhr uses a 28-day baseline, sleep and steps map from their modules', () => {
    expect(ctx.rhr.n).toBe(28);
    expect(ctx.rhr.today).toBe(records[DAYS - 1].rhr);

    expect(ctx.sleep.hours).toBe(records[DAYS - 1].slh);
    expect(ctx.sleep.need).not.toBeNull();
    expect(ctx.sleep.debtMin).not.toBeNull();
    expect(ctx.sleep.bedtimeSdMin).not.toBeNull();
    expect(ctx.sleep.midpointSdMin).not.toBeNull();
    expect(ctx.sleep.lastBedtime).toBe(records[DAYS - 1].bt);
    expect(ctx.sleep.delta.n).toBe(30);

    expect(ctx.steps.today).toBe(4200);
    expect(ctx.steps.n).toBe(30); // includeToday
    expect(ctx.steps.delta as number).toBeLessThan(0);
  });

  it('weight: falling trend gives a negative weekly rate inside the target band', () => {
    expect(ctx.weight.latest).toBe(records[DAYS - 1].w);
    expect(ctx.weight.trend).not.toBeNull();
    expect(ctx.weight.weeklyRateLb as number).toBeLessThan(0);
    expect(ctx.weight.weeklyRatePct as number).toBeLessThan(0);
    expect(ctx.weight.inBand).toBe('in'); // ~1 lb/wk on ~171 lb ≈ 0.6 %BW/wk
    expect(ctx.weight.weighInsThisWeek).toBe(7);
    // Body weight for the band is the latest scale weight (≈ 170.7 lb), not the profile's 172.
    const [lo, hi] = ctx.weight.targetLbPerWk;
    expect(lo).toBeCloseTo((ctx.weight.latest as number) * 0.005, 2);
    expect(hi).toBeCloseTo((ctx.weight.latest as number) * 0.01, 2);
  });

  it('expenditure is valid with 7 weigh-ins and 7 intake days in the final week', () => {
    expect(ctx.expenditure.valid).toBe(true);
    expect(typeof ctx.expenditure.tdee).toBe('number');
    expect(ctx.expenditure.tdee as number).toBeGreaterThan(1500);
    expect(ctx.expenditure.suggestedKcal).toBe(T.kcal); // rate in band → hold
    expect(ctx.expenditure.suggestedDelta).toBe(0);
    expect(ctx.expenditure.reason).toMatch(/Hold at 1,950 kcal/);
  });

  it('exposes the last calibrated estimate in the reason when this week fails the gate', () => {
    // Drop this week's weigh-ins so the current block is invalid but earlier blocks calibrated.
    const sparse = records.map((r) => (r.d > addDays(TODAY, -7) ? { ...r, w: undefined } : r));
    const c = build(sparse);
    expect(c.expenditure.valid).toBe(false);
    expect(c.expenditure.tdee).toBeNull();
    expect(c.expenditure.suggestedKcal).toBeNull();
    expect(c.expenditure.reason).toMatch(/Last calibrated estimate: [\d,]+ kcal\/day/);
    expectNoNaN(c);
  });

  it('nutrition: remaining = target − totals, pacing, late coffee, hydration', () => {
    const todayRec = records[DAYS - 1];
    expect(ctx.nutrition.totals.p).toBe(todayRec.p);
    expect(ctx.nutrition.remaining.p).toBe(T.protein - ctx.nutrition.totals.p);
    expect(ctx.nutrition.remaining.kc).toBe(T.kcal - ctx.nutrition.totals.kc);
    expect(ctx.nutrition.mealsLogged).toBe(2);
    expect(ctx.nutrition.mealsLeft).toBe(2);
    expect(ctx.nutrition.proteinPerMealNeeded).toBe(Math.round((T.protein - ctx.nutrition.totals.p) / 2));
    expect(ctx.nutrition.lastMealTime).toBe('13:00');
    expect(ctx.nutrition.targets.carbsRange).toEqual(T.carbsRest); // Sunday
    expect(ctx.nutrition.fatBelowFloor).toBe(false); // 09:00 — plenty of kcal left to reach 60 g
    expect(ctx.nutrition.lateEating).toBe(false);
    expect(ctx.nutrition.hydrationCups).toBe(3);
    expect(ctx.nutrition.hydrationTargetCups).toBe(10);
    expect(ctx.nutrition.caffeineAfterCutoff).toBe('15:30');
  });

  it('tobacco, frequency and adherence come from their modules', () => {
    expect(ctx.tobacco.today).toBe(1);
    expect(ctx.tobacco.avg7).not.toBeNull();
    expect(ctx.tobacco.avg30).not.toBeNull();
    expect(ctx.tobacco.streakDays).toBe(0);
    expect(ctx.tobacco.hrvSmokeFree).not.toBeNull();
    expect(ctx.tobacco.hrvSmoking).not.toBeNull();

    // Last 7 days: 6 full days (4 meals) + today (2 meals) = 26 meals.
    expect(ctx.frequency.redMeatServings7d).toBeGreaterThan(0);
    expect(ctx.frequency.fishServings7d).toBeGreaterThan(0);
    expect(ctx.frequency.restaurantPct7d as number).toBeGreaterThan(0);
    expect(ctx.frequency.restaurantPct7d as number).toBeLessThanOrEqual(100);
    expect((ctx.frequency.restaurantPct7d as number) + (ctx.frequency.homeCookedPct7d as number)).toBe(100);
    expect(ctx.frequency.fiberAvg7d).not.toBeNull();

    expect(ctx.adherence.loggingStreak).toBe(DAYS);
    expect(ctx.adherence.weighInDays30).toBe(30);
    // 29 full past days hit protein (178 g ≥ 170) and kcal (1830–1870 within 1550–2000); today's partial day misses both.
    expect(ctx.adherence.proteinHitDays30).toBe(29);
    expect(ctx.adherence.kcalHitDays30).toBe(29);
  });

  it('day type follows the split for weekdays', () => {
    const friday = addDays(TODAY, -2); // 2026-09-04 → 'lower'
    const c = contextForDate(records, SETTINGS, friday, NOW);
    expect(c.today).toBe(friday);
    expect(c.dayType).toBe('lift');
    expect(c.sessionType).toBe('lower');
    expect(c.nutrition.targets.carbsRange).toEqual(T.carbsLift);
    expect(c.todayRecord?.d).toBe(friday);
    expect(c.last30.every((r) => r.d < friday)).toBe(true);
    expect(c.last30.length).toBe(30);
    expectNoNaN(c);
  });

  it('buildInsights returns at most 3 cards, sorted by priority', () => {
    const cards = buildInsights(ctx, SETTINGS);
    expect(cards.length).toBeLessThanOrEqual(3);
    expect(cards.length).toBeGreaterThan(0);
    for (let i = 1; i < cards.length; i++) expect(cards[i - 1].priority).toBeGreaterThanOrEqual(cards[i].priority);
    for (const c of cards) {
      expect(c.title.length).toBeGreaterThan(0);
      expect(c.body).not.toContain('NaN');
      expect(c.body).not.toContain('null');
    }
  });
});

// ---------------------------------------------------------------------------
// Barrel & version
// ---------------------------------------------------------------------------

describe('engine barrel', () => {
  it('re-exports every engine module and the context builder', () => {
    expect(ENGINE_VERSION).toBe('1');
    expect(engine.ENGINE_VERSION).toBe('1');
    expect(engine.buildCoachContext).toBe(buildCoachContext);
    expect(engine.buildInsights).toBe(buildInsights);
    expect(engine.contextForDate).toBe(contextForDate);
    for (const fn of [
      engine.computeEwmaTrend,
      engine.weeklyExpenditure,
      engine.baselineDelta,
      engine.hrvStatus,
      engine.readiness,
      engine.sleepSummary,
      engine.tobaccoStats,
      engine.dayTypeFor,
      engine.adherenceGrid,
      engine.markerGuidance,
      engine.generateInsights,
    ]) {
      expect(typeof fn).toBe('function');
    }
  });
});
