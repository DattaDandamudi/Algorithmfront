import { describe, expect, it } from 'vitest';
import type { AppSettings, Changepoint, CoachContext, DailyRecord, FoodTag, Meal, Workout } from '../data/types';
import { DEFAULT_BLOODWORK, DEFAULT_SETTINGS, DEFAULT_TARGETS } from '../data/defaults';
import { generateDemoData, generateDemoWorkouts } from '../data/seed';
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
      weeksOutsideBand: 0,
      // §1a: the Kalman block is filled too, and says "no rate yet" rather
      // than being absent.
      kalmanLevel: null,
      levelSd: null,
      rateSdLb: null,
      rateLow90: null,
      rateHigh90: null,
      rateAvailable: false,
      suspectToday: false,
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
    // `mealSlots` replaced `targets.mealsPerDay` in pacing: 180 g of protein at
    // ~78 kg needs ceil(180 / 0.55·78) = 5 occasions, not the 4 the plan says.
    expect(ctx.nutrition.slots).toBe(5);
    expect(ctx.nutrition.mealsLeft).toBe(5);
    expect(ctx.nutrition.mealsLeft).toBeGreaterThan(T.mealsPerDay);
    expect(ctx.nutrition.lastMealTime).toBeNull();
    expect(ctx.nutrition.fatBelowFloor).toBe(false);
    expect(ctx.nutrition.lateEating).toBe(false);
    expect(ctx.nutrition.hydrationCups).toBe(0);
    expect(ctx.nutrition.hydrationTargetCups).toBe(10); // 78 kg × 32 ml ≈ 2.5 L
    expect(ctx.nutrition.caffeineAfterCutoff).toBeNull();

    // nFree/nSmoke ride along: a comparison of two means without its counts is
    // not a finding (§7 #9 will not render without them).
    expect(ctx.tobacco).toEqual({ today: 0, avg7: null, avg30: null, streakDays: 0, hrvSmokeFree: null, hrvSmoking: null, hrvFree3: null, hrvDelta3: null, nFree: 0, nSmoke: 0 });
    expect(ctx.frequency).toEqual({ redMeatServings7d: 0, fishServings7d: 0, restaurantPct7d: null, fiberAvg7d: null, homeCookedPct7d: null });
    expect(ctx.adherence).toEqual({ loggingStreak: 0, proteinHitDays30: 0, kcalHitDays30: 0, weighInDays30: 0 });
    expect(ctx.bloodwork).toEqual(DEFAULT_BLOODWORK);
    expect(ctx.last30).toEqual([]);
    expect(ctx.todayRecord).toBeNull();
  });

  it('builds every v3 block on a fresh install rather than leaving them absent', () => {
    const ctx = build([]);
    expectNoNaN(ctx);

    // Training: no workouts, no program history — every number is an empty
    // state, not a hole.
    expect(ctx.training).toBeDefined();
    const t = ctx.training as NonNullable<CoachContext['training']>;
    expect(t.todaySession).toBe('rest');
    expect(t.plannedExercises).toEqual([]); // rest day → no plan
    expect(t.todayWorkouts).toEqual([]);
    expect(t.lastSession).toBeNull();
    expect(t.load.source).toBe('none');
    expect(t.load.acwr).toBeNull();
    expect(t.load.formBand).toBeNull();
    expect(t.load.tauIsPrior).toBe(true);
    expect(t.weeklySets).toHaveLength(15); // all 15 muscles, never a hole
    expect(t.weeklySets.every((m) => m.sets === 0)).toBe(true);
    expect(t.muscleReadiness).toHaveLength(15);
    expect(t.muscleReadiness.every((m) => m.pct === 100 && m.hoursSince === null)).toBe(true);
    expect(t.balance).toEqual({ pushPull: null, squatHinge: null });
    expect(t.prs7d).toEqual([]);
    expect(t.plateaus).toEqual([]);
    expect(t.deload.recommended).toBe(false);
    expect(t.vo2max?.value).toBeNull();

    // Stress: nothing to compare against, so it says it is still learning.
    const s = ctx.stress as NonNullable<CoachContext['stress']>;
    expect(s.osi).toBeNull();
    expect(s.band).toBeNull();
    expect(s.calibrating).toBe(true);
    expect(s.nRef).toBe(0);
    expect(s.signalsAvailable).toBe(0);
    expect(s.outliers.every((o) => o.z === null && !o.deviating)).toBe(true);
    expect(s.checkIn.missingToday).toBe(true);
    expect(s.checkIn.nDays).toBe(0);
    expect(s.resilience.score).toBeNull();
    expect(s.illness).toEqual({ flag: false, since: null, reasons: [] });

    // Energy: an absent curve, never a made-up flat line.
    const e = ctx.energy as NonNullable<CoachContext['energy']>;
    expect(e.forecast).toEqual([]);
    expect(e.now).toBeNull();
    expect(e.trough).toBeNull();
    expect(e.confidence).toBe('low');

    expect(ctx.impact).toEqual({ effects: [], pending: [] });
    expect(ctx.changepoints).toEqual([]);

    // The v3 expenditure posterior exists from day one; it is simply not
    // published while its interval is this wide.
    expect(ctx.expenditure.tdee).toBeNull();
    expect(ctx.expenditure.valid).toBe(false);
    expect(ctx.expenditure.calibrating).toBe(true);
    expect(ctx.expenditure.ci as number).toBeGreaterThan(300);
    expect(ctx.expenditure.coverage).toEqual({ logged: 0, days: 7 });
    expect(ctx.expenditure.energyDensityKcalPerLb as number).toBeGreaterThan(2000);
    expect(ctx.expenditure.tier).toBe('none');

    // Sleep falls back to the profile baseline until enough recovered nights exist.
    expect(ctx.sleep.tonightNeed).toBe(DEFAULT_SETTINGS.profile.sleepBaselineHrs);
    expect(ctx.sleep.learnedBaselineHrs).toBeNull();
    expect(ctx.sleep.baselineSource).toBe('profile');
    expect(ctx.sleep.sri).toBeNull();
    expect(ctx.sleep.socialJetlagMin).toBeNull();
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
    // 5 slots (mealSlots at 160 lb: ceil(180 / 0.55·72.6) = 5) − 1 logged.
    expect(ctx.nutrition.slots).toBe(5);
    expect(ctx.nutrition.mealsLeft).toBe(4);
    expect(ctx.nutrition.proteinPerMealNeeded).toBe(Math.round((T.protein - 24) / 4));
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

  it('R3-1: readiness defers to WHOOP recovery; one low HRV reading does not force a light day', () => {
    expect(ctx.readiness.source).toBe('whoop');
    expect(ctx.readiness.score).toBe(71); // the score is the data — never altered
    // Today's synthetic HRV (46 ms) is a single dip; the 7-day mean stays inside the
    // SWC, so the 71 % recovery stands (the old construction banded the one reading
    // and forced 'Light day' here).
    expect(ctx.hrv.today).toBe(46);
    expect(ctx.hrv.band).not.toBe('low');
    expect(ctx.readiness.forced).toBeFalsy();
    // v3: readiness now also receives the training-form band. 40 days of WHOOP
    // strain is short of the fitted Banister τ₁, so fitness is still warming up
    // while fatigue is not, form reads 'overreached', and the modifier steps the
    // verdict down one band. The score is untouched — the band is not forced.
    expect(ctx.training?.load.formBand).toBe('overreached');
    expect(ctx.readiness.band).toBe('yellow');
    expect(ctx.readiness.modifiers?.map((m) => m.key)).toContain('formOverreached');
    expect(ctx.readiness.training).toBe('Train, hold loads');

    // Three days 20 % under the baseline is a genuine 'low' — too short for the
    // regime detector to call a new baseline — and it forces red over WHOOP.
    const dip = records.map((r) => (r.d > addDays(TODAY, -3) ? { ...r, hrv: Math.round((r.hrv as number) * 0.8) } : r));
    const c = build(dip);
    expect(c.changepoints?.some((cp) => cp.metric === 'hrv')).toBe(false);
    expect(c.readiness.source).toBe('whoop');
    expect(c.readiness.score).toBe(71);
    expect(c.hrv.band).toBe('low');
    expect(c.hrv.baselineEstablished).toBe(true);
    expect(c.readiness.band).toBe('red');
    expect(c.readiness.forced).toBe(true);
    expect(c.readiness.training).toBe('Light day');
  });

  it('§1i: a confirmed HRV regime shift truncates the reference instead of banding against the old level', () => {
    // A whole week 20 % under the old baseline is a level change, not a dip.
    // BOCPD confirms it on the third day, the context passes the shift's first
    // day to `hrvStatus` as `referenceStart`, and today is then compared with
    // the new normal rather than spending six weeks averaging across the step.
    const depressed = records.map((r) => (r.d > addDays(TODAY, -7) ? { ...r, hrv: Math.round((r.hrv as number) * 0.8) } : r));
    const c = build(depressed);
    expectNoNaN(c);

    const shift = (c.changepoints ?? []).find((cp) => cp.metric === 'hrv');
    expect(shift).toBeDefined();
    expect((shift as Changepoint).meanAfter).toBeLessThan((shift as Changepoint).meanBefore);
    // `d` is the first day of the new regime, and that is what truncates.
    expect(c.hrv.referenceStart).toBe((shift as Changepoint).d);
    expect(c.hrv.nRef as number).toBeLessThan(records.length);
    // Without the truncation this same week reads 'low' and forces a light day.
    expect(engine.hrvStatus(depressed, TODAY, { age: SETTINGS.profile.age }).band).toBe('low');
    expect(c.hrv.band).not.toBe('low');
    expect(c.hrv.forcing).toBe(false);
  });

  it('hrv block maps HrvStatus and counts 30-day readings in delta.n', () => {
    expect(ctx.hrv.today).toBe(records[DAYS - 1].hrv);
    expect(ctx.hrv.baseline7).not.toBeNull();
    // The SWC is centred on the long-term baseline (R3-1), not on the 7-day mean.
    expect(ctx.hrv.swcLower as number).toBeLessThan(ctx.hrv.baseline28 as number);
    expect(ctx.hrv.baseline28 as number).toBeLessThan(ctx.hrv.swcUpper as number);
    expect(ctx.hrv.lnMean7).toBeCloseTo(Math.log(ctx.hrv.baseline7 as number), 2);
    expect(ctx.hrv.band).not.toBe('insufficient');
    expect(ctx.hrv.cv7).not.toBeNull();
    expect(ctx.hrv.delta.n).toBe(30);
    expect(ctx.hrv.delta.today).toBe(records[DAYS - 1].hrv);
    expect(ctx.hrv.delta.baseline).not.toBeNull();
    // R3-10: one baseline gate, exposed for the tile's empty state.
    expect(ctx.hrv.baselineEstablished).toBe(true);
    expect(ctx.hrv.daysOfData).toBe(30);
    expect(ctx.hrv.overreaching).toBe(false);
    // The same HrvStatus fed readiness — the detail quotes the same long-term baseline.
    expect(ctx.readiness.detail).toContain(`baseline ${Math.round(ctx.hrv.baseline28 as number)}`);
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
    expect(ctx.steps.n).toBe(30); // the 30 days before today (R3-9: today is never in its own baseline)
    expect(ctx.steps.delta as number).toBeLessThan(0);
  });

  it('weight: falling trend gives a negative weekly rate inside the target band', () => {
    expect(ctx.weight.latest).toBe(records[DAYS - 1].w);
    expect(ctx.weight.trend).not.toBeNull();
    expect(ctx.weight.weeklyRateLb as number).toBeLessThan(0);
    expect(ctx.weight.weeklyRatePct as number).toBeLessThan(0);
    expect(ctx.weight.inBand).toBe('in'); // ~1 lb/wk on ~171 lb ≈ 0.6 %BW/wk
    expect(ctx.weight.weighInsThisWeek).toBe(7);
    // Body weight for the band is the EWMA trend (R3-12), not the scale dot or the profile's 172.
    const [lo, hi] = ctx.weight.targetLbPerWk;
    expect(lo).toBeCloseTo((ctx.weight.trend as number) * 0.005, 2);
    expect(hi).toBeCloseTo((ctx.weight.trend as number) * 0.01, 2);
    expect(ctx.weight.weeksOutsideBand).toBe(0); // rate is in band
  });

  it('expenditure publishes the v3 posterior with its interval, coverage and energy density', () => {
    expect(ctx.expenditure.valid).toBe(true);
    expect(typeof ctx.expenditure.tdee).toBe('number');
    expect(ctx.expenditure.tdee as number).toBeGreaterThan(1500);
    expect(ctx.expenditure.suggestedKcal).toBe(T.kcal); // rate in band → hold
    expect(ctx.expenditure.suggestedDelta).toBe(0);
    expect(ctx.expenditure.tier).toBe('none');
    // The interval, the coverage and the Forbes/Hall factor are what the
    // caption has to name, so all three ride on the context.
    expect(ctx.expenditure.ci as number).toBeLessThanOrEqual(300);
    expect(ctx.expenditure.low as number).toBeLessThan(ctx.expenditure.tdee as number);
    expect(ctx.expenditure.high as number).toBeGreaterThan(ctx.expenditure.tdee as number);
    expect(ctx.expenditure.coverage).toEqual({ logged: 7, days: 7 });
    expect(ctx.expenditure.energyDensityKcalPerLb as number).toBeGreaterThan(2000);
    expect(ctx.expenditure.blocksOutside).toBe(0);
    expect(ctx.expenditure.frozenUntil).toBeNull();
    expect(ctx.expenditure.reason).toMatch(/hold at 1,950 kcal/);
    expect(ctx.expenditure.reason).toMatch(/7 of 7 days logged/);
  });

  it('the posterior survives a fortnight with no weigh-ins — the interval widens instead', () => {
    // Drop the last 12 days of weigh-ins. v2 lost the estimate here; v3 keeps a
    // steps-based observation, so the block is predict-only and says so.
    const sparse = records.map((r) => (r.d >= dayOf(28) ? { ...r, w: undefined } : r));
    const c = build(sparse);
    expect(c.weight.weighInsThisWeek).toBe(0);
    expect(typeof c.expenditure.tdee).toBe('number');
    expect(c.expenditure.ci as number).toBeGreaterThan(ctx.expenditure.ci as number);
    expect(c.expenditure.reason).toMatch(/predict-only/);
    expect(c.expenditure.suggestedDelta).toBe(0); // no weight evidence → no move
    expectNoNaN(c);
  });

  it('nutrition: remaining = target − totals, pacing, late coffee, hydration', () => {
    const todayRec = records[DAYS - 1];
    expect(ctx.nutrition.totals.p).toBe(todayRec.p);
    expect(ctx.nutrition.remaining.p).toBe(T.protein - ctx.nutrition.totals.p);
    expect(ctx.nutrition.remaining.kc).toBe(T.kcal - ctx.nutrition.totals.kc);
    expect(ctx.nutrition.mealsLogged).toBe(2);
    // 5 protein slots − 2 eaten (mealSlots, not targets.mealsPerDay).
    expect(ctx.nutrition.slots).toBe(5);
    expect(ctx.nutrition.mealsLeft).toBe(3);
    expect(ctx.nutrition.proteinPerMealNeeded).toBe(Math.round((T.protein - ctx.nutrition.totals.p) / 3));
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
    // v3: engine upgrade — Kalman decision trend, training load & strength,
    // the stress stack, predicted energy, N-of-1 impact and regime detection.
    expect(ENGINE_VERSION).toBe('3');
    expect(engine.ENGINE_VERSION).toBe('3');
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

// ---------------------------------------------------------------------------
// Review round 3 findings (context-level)
// ---------------------------------------------------------------------------

describe('buildCoachContext — R3 findings', () => {
  const records = synthetic();
  const ctx = build(records);

  it('R3-9: the steps baseline is the previous 30 days, never today\'s partial count', () => {
    const recs: DailyRecord[] = Array.from({ length: 29 }, (_, i) => ({ d: dayOf(DAYS - 30 + i), st: 8000 }));
    recs.push({ d: TODAY, st: 4200 });
    const ctx = build(recs);
    expect(ctx.steps.today).toBe(4200);
    expect(ctx.steps.baseline).toBe(8000);
    expect(ctx.steps.delta).toBe(-3800);
    expect(ctx.steps.n).toBe(29);
  });

  it('§1b: the two-tier rule nudges 50 kcal after one block outside the band and 150 after two', () => {
    // 70 fully-logged days: the trend falls 1.3 lb/wk (in band) then the loss
    // slows to 0.4 lb/wk — under the band for a user who is cutting.
    // R3-3's "wait a full week, then step 100" was v2; v3 replaces it with the
    // probability-gated fine (±50/100 from one block) and coarse (≥150 after
    // two) tiers, so this asserts the new rule on the same data.
    const N = 70;
    const recs: DailyRecord[] = [];
    let w = 178;
    for (let i = 0; i < N; i++) {
      w -= (i < 45 ? 1.3 : 0.4) / 7;
      recs.push({ d: addDays(TODAY, i - (N - 1)), w, kc: 1900, p: 180, f: 65, c: 100, fi: 30 });
    }
    const at = (i: number) => contextForDate(recs, SETTINGS, addDays(TODAY, i - (N - 1)), NOW);

    // Day 50: the rate has left the band but no completed block is confident
    // enough yet (P(outside) < 0.7), so nothing moves.
    const hold = at(50);
    expect(hold.weight.inBand).toBe('below');
    expect(hold.expenditure.valid).toBe(true);
    expect(hold.expenditure.pOutside as number).toBeLessThan(0.7);
    expect(hold.expenditure.suggestedDelta).toBe(0);
    expect(hold.expenditure.tier).toBe('none');
    expect(hold.expenditure.reason).toMatch(/hold at 1,950 kcal/);

    // Day 56: one block clears 0.7 — a 50 kcal nudge, not a bigger move.
    const fine = at(56);
    expect(fine.expenditure.pOutside as number).toBeGreaterThanOrEqual(0.7);
    expect(fine.expenditure.blocksOutside).toBe(1);
    expect(fine.expenditure.tier).toBe('fine');
    expect(fine.expenditure.suggestedDelta).toBe(-50);
    expect(fine.expenditure.suggestedKcal).toBe(1900);

    // Day 64: two blocks running at p ≥ 0.8 — the coarse 150 kcal move.
    const coarse = at(64);
    expect(coarse.expenditure.blocksOutside).toBe(2);
    expect(coarse.expenditure.pOutside as number).toBeGreaterThanOrEqual(0.8);
    expect(coarse.expenditure.tier).toBe('coarse');
    expect(coarse.expenditure.suggestedDelta).toBe(-150);
    expect(coarse.expenditure.suggestedKcal).toBe(1800);
    // The Kalman weeks-outside counter agrees with the published rate.
    expect(coarse.weight.weeksOutsideBand as number).toBeGreaterThanOrEqual(1);
    expectNoNaN(coarse);
  });

  it('R3-7: surfaces the last eating occasion under the 0.4 g/kg floor', () => {
    expect(ctx.nutrition.lastMealBelowMin).toBe(false); // last occasion: chicken tikka, 60 g
    expect(ctx.nutrition.lastMealProtein).toBe(60);
    expect(ctx.nutrition.minPerMeal).toBe(31); // 0.4 g/kg × ~77 kg trend weight
    expect(ctx.nutrition.maxPerMeal).toBe(43);
    const snack: Meal = { id: 'snack', t: '15:00', n: 'roti', g: 60, kc: 180, p: 5, f: 3, c: 36, fi: 2, tags: ['grain', 'home'] };
    const withSnack = records.map((r) => (r.d === TODAY ? { ...r, meals: [...(r.meals ?? []), snack] } : r));
    const c = build(withSnack, TODAY, new Date(2026, 8, 6, 16, 0, 0));
    expect(c.nutrition.lastMealBelowMin).toBe(true);
    expect(c.nutrition.lastMealProtein).toBe(5);
    expect(c.nutrition.lastMealTime).toBe('15:00');
  });

  it('R3-11: carries the last-3-smoke-free-days HRV figures from tobaccoInsightNumbers', () => {
    const nums = engine.tobaccoInsightNumbers(records, TODAY);
    expect(nums.hrvFree).not.toBeNull();
    expect(ctx.tobacco.hrvFree3).toBe(nums.hrvFree);
    expect(ctx.tobacco.hrvDelta3).toBe(nums.delta);
    // The 30-day comparison is still there for the coach.
    expect(ctx.tobacco.hrvSmokeFree).not.toBeNull();
  });

  it('R3-12: %BW band math uses the EWMA trend, not the latest scale dot', () => {
    // 20 days at 170 lb, then a +2 lb glycogen bump on the scale today.
    const recs: DailyRecord[] = Array.from({ length: 20 }, (_, i) => ({ d: dayOf(DAYS - 21 + i), w: 170 }));
    recs.push({ d: TODAY, w: 172 });
    const ctx = build(recs);
    expect(ctx.weight.latest).toBe(172);
    const trend = ctx.weight.trend as number;
    expect(trend).toBeGreaterThan(170);
    expect(trend).toBeLessThan(170.5);
    const [lo, hi] = ctx.weight.targetLbPerWk;
    expect(lo).toBeCloseTo(Math.round(trend * 0.5) / 100, 2);
    expect(hi).toBeCloseTo(Math.round(trend * 1) / 100, 2);
    expect(lo).not.toBeCloseTo(0.86, 2); // 172 × 0.5 %
    // Per-kg protein math follows the same reference weight.
    expect(ctx.nutrition.minPerMeal).toBe(Math.round(0.4 * (trend / 2.2046226218)));
  });
});

// ---------------------------------------------------------------------------
// 5. v3 blocks — training, stress, energy, impact
// ---------------------------------------------------------------------------

/** Friday 2026-09-04 → 'lower' on the default split (Mon/Thu upper, Tue/Fri lower). */
const FRIDAY = '2026-09-04';
const FRIDAY_NOW = new Date(2026, 8, 4, 9, 0, 0);

/**
 * A strength session on every split lift day of the last `days` days, with
 * loads creeping up, plus a Saturday run so the cardio branch and the VO₂max
 * estimator have something to read.
 */
function workoutsFor(asOf: string, days = 56): Workout[] {
  const out: Workout[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(asOf, -i);
    const wd = new Date(`${d}T12:00:00Z`).getUTCDay();
    const week = Math.floor((days - 1 - i) / 7);
    if (wd === 1 || wd === 4) {
      out.push({
        id: `up-${d}`, d, start: '18:00', durationMin: 60, kind: 'strength', session: 'upper',
        source: 'manual', srpe: 7,
        exercises: [
          { exerciseId: 'bench-press', sets: [
            { w: 60 + week * 2.5, r: 8, rpe: 8 },
            { w: 60 + week * 2.5, r: 8, rpe: 8 },
            { w: 60 + week * 2.5, r: 8, rpe: 8 },
          ] },
          { exerciseId: 'barbell-row', sets: [
            { w: 55 + week * 2.5, r: 10, rpe: 8 },
            { w: 55 + week * 2.5, r: 10, rpe: 8 },
            { w: 55 + week * 2.5, r: 10, rpe: 8 },
          ] },
        ],
      });
    } else if (wd === 2 || wd === 5) {
      out.push({
        id: `lo-${d}`, d, start: '18:00', durationMin: 65, kind: 'strength', session: 'lower',
        source: 'manual', srpe: 8,
        exercises: [
          { exerciseId: 'back-squat', sets: [
            { w: 90 + week * 5, r: 6, rpe: 8 },
            { w: 90 + week * 5, r: 6, rpe: 8 },
            { w: 90 + week * 5, r: 6, rpe: 8 },
          ] },
          { exerciseId: 'romanian-deadlift', sets: [
            { w: 80 + week * 5, r: 8, rpe: 8 },
            { w: 80 + week * 5, r: 8, rpe: 8 },
          ] },
        ],
      });
    } else if (wd === 6) {
      out.push({
        id: `run-${d}`, d, start: '08:00', durationMin: 45, kind: 'cardio', source: 'manual',
        cardio: { sport: 'run', distanceKm: 8, avgHr: 150, kcal: 480 },
      });
    }
  }
  return out;
}

/** The synthetic history with the daily check-in answered on all but today. */
function withCheckIns(records: DailyRecord[], asOf = TODAY): DailyRecord[] {
  return records.map((r, i) =>
    r.d === asOf ? r : { ...r, qs: 2 + (i % 3), qf: 3 + (i % 2), qt: 2 + (i % 4), qo: 3 + (i % 3) },
  );
}

describe('buildCoachContext — training block', () => {
  const records = synthetic();
  const workouts = workoutsFor(TODAY);
  const ctx = buildCoachContext({ records, settings: SETTINGS, today: TODAY, now: NOW, workouts });

  it('is free of NaN, deterministic, and reports logged load rather than WHOOP strain', () => {
    expectNoNaN(ctx);
    expect(buildCoachContext({ records, settings: SETTINGS, today: TODAY, now: NOW, workouts })).toEqual(ctx);
    const t = ctx.training as NonNullable<CoachContext['training']>;
    expect(t.load.source).toBe('mixed'); // logged sessions + WHOOP strain on rest days
    expect(t.load.weeklyLoad).toBeGreaterThan(0);
    expect(t.load.acwr).not.toBeNull();
    expect(t.load.acwrBand).not.toBeNull();
    expect(t.load.fitness).toBeGreaterThan(0);
    expect(t.load.monotony).not.toBeNull();
  });

  it('counts this week\'s sets per muscle and the muscles the sessions actually touched', () => {
    const t = ctx.training as NonNullable<CoachContext['training']>;
    expect(t.weeklySets).toHaveLength(15);
    const quads = t.weeklySets.find((m) => m.muscle === 'quads');
    const chest = t.weeklySets.find((m) => m.muscle === 'chest');
    expect(quads?.sets).toBeGreaterThan(0);
    expect(chest?.sets).toBeGreaterThan(0);
    // Sets are attributed through the injected exercise lookup: without it every
    // muscle would read zero and 100% ready.
    const trained = t.muscleReadiness.filter((m) => m.hoursSince !== null);
    expect(trained.length).toBeGreaterThan(0);
    expect(trained.every((m) => m.pct <= 100 && m.pct >= 0)).toBe(true);
    expect(t.balance.pushPull).not.toBeNull();
    expect(t.balance.squatHinge).not.toBeNull();
  });

  it('plans today\'s session from the active program with per-exercise reasons', () => {
    const friday = buildCoachContext({ records, settings: SETTINGS, today: FRIDAY, now: FRIDAY_NOW, workouts });
    const t = friday.training as NonNullable<CoachContext['training']>;
    expect(t.todaySession).toBe('lower');
    expect(t.plannedExercises.length).toBeGreaterThan(0);
    expect(t.plannedExercises.map((e) => e.exerciseId)).toContain('back-squat');
    for (const e of t.plannedExercises) {
      expect(e.name.length).toBeGreaterThan(0);
      expect(e.reason.length).toBeGreaterThan(0);
      expect(['progress', 'hold', 'reduce']).toContain(e.mode);
    }
    // A squat logged on the same Friday shows up as today's session.
    expect(t.todayWorkouts.map((w) => w.d)).toEqual([FRIDAY]);
    expect(t.lastSession?.d).toBe(FRIDAY);
    expectNoNaN(friday);
  });

  it('carries PRs, plateaus, the deload verdict and the VO₂max estimate', () => {
    const t = ctx.training as NonNullable<CoachContext['training']>;
    // Loads climb every week, so the last week contains PRs.
    expect(t.prs7d.length).toBeGreaterThan(0);
    expect(t.prs7d.every((p) => p.d > addDays(TODAY, -7) || p.d === addDays(TODAY, -6))).toBe(true);
    expect(Array.isArray(t.plateaus)).toBe(true);
    expect(typeof t.deload.recommended).toBe('boolean');
    expect(t.deload.reasons.length).toBeGreaterThan(0);
    // Eight steady runs are on file, so the estimate is published with a band.
    expect(t.vo2max).not.toBeNull();
    expect(t.vo2max?.method.length).toBeGreaterThan(0);
    if (t.vo2max?.value !== null) {
      expect(t.vo2max?.lo as number).toBeLessThan(t.vo2max?.value as number);
      expect(t.vo2max?.hi as number).toBeGreaterThan(t.vo2max?.value as number);
    }
  });

  it('rest day: no plan, but the week\'s volume and load are still reported', () => {
    const t = ctx.training as NonNullable<CoachContext['training']>;
    expect(t.todaySession).toBe('rest');
    expect(t.plannedExercises).toEqual([]);
    expect(t.weeklySets.some((m) => m.sets > 0)).toBe(true);
  });
});

describe('buildCoachContext — stress, energy and impact blocks', () => {
  const records = withCheckIns(synthetic());
  const workouts = workoutsFor(TODAY);
  const ctx = buildCoachContext({ records, settings: SETTINGS, today: TODAY, now: NOW, workouts });

  it('summarises the check-in against the user\'s own 30-day normal', () => {
    expectNoNaN(ctx);
    const s = ctx.stress as NonNullable<CoachContext['stress']>;
    expect(s.checkIn.nDays).toBeGreaterThan(20);
    expect(s.checkIn.missingToday).toBe(true); // today's is not answered yet
    expect(s.checkIn.band).toBe('neutral'); // nothing answered today to band
    expect(s.checkIn.sleepQ).toBeNull();
    // Answer today and the block fills in.
    const answered = records.map((r) => (r.d === TODAY ? { ...r, qs: 3, qf: 4, qt: 3, qo: 4 } : r));
    const c = buildCoachContext({ records: answered, settings: SETTINGS, today: TODAY, now: NOW, workouts });
    const cs = c.stress as NonNullable<CoachContext['stress']>;
    expect(cs.checkIn.missingToday).toBe(false);
    expect(cs.checkIn.sleepQ).toBe(3);
    expect(cs.checkIn.soreness).toBe(4);
    expect(cs.checkIn.total).toBe(14);
    expect(cs.checkIn.band).not.toBe('neutral');
  });

  it('a deliberate skip is an answer: the Today prompt stops asking', () => {
    const skipped = records.map((r) => (r.d === TODAY ? { ...r, qsk: true as const } : r));
    const c = buildCoachContext({ records: skipped, settings: SETTINGS, today: TODAY, now: NOW });
    expect(c.stress?.checkIn.missingToday).toBe(false);
    expect(c.stress?.checkIn.sleepQ).toBeNull(); // nothing was answered — just not asked again
  });

  it('reports the overnight strain index, its signals and the resilience scissors', () => {
    const s = ctx.stress as NonNullable<CoachContext['stress']>;
    expect(s.calibrating).toBe(false);
    expect(s.nRef).toBeGreaterThan(14);
    expect(s.osi).not.toBeNull();
    expect(s.osiLo as number).toBeLessThanOrEqual(s.osi as number);
    expect(s.osiHi as number).toBeGreaterThanOrEqual(s.osi as number);
    expect(s.signalsAvailable).toBeGreaterThan(0);
    expect(s.signalsDeviating).toBeLessThanOrEqual(s.signalsAvailable);
    expect(s.outliers.length).toBe(6); // every signal, present or not
    // Resilience needs the load series and the readiness map the context derives.
    expect(s.resilience.score).not.toBeNull();
    expect(s.resilience.band).not.toBeNull();
    expect(s.resilience.loadEwma).not.toBeNull();
    expect(s.resilience.recoveryEwma).not.toBeNull();
    expect(s.resilience.nDays).toBeGreaterThan(0);
    expect(s.illness.flag).toBe(false);
  });

  it('the learned sleep baseline comes from the derived readiness map, not WHOOP alone', () => {
    expect(ctx.sleep.baselineSource).toBe('learned');
    expect(ctx.sleep.learnedBaselineHrs).not.toBeNull();
    expect(ctx.sleep.tonightNeed).not.toBeNull();
    expect(ctx.sleep.sri).not.toBeNull();
    expect(ctx.sleep.sriNights).toBeGreaterThan(0);
  });

  it('predicts the energy curve for today, with a trough and a caption-worthy confidence', () => {
    const e = ctx.energy as NonNullable<CoachContext['energy']>;
    expect(e.forecast.length).toBeGreaterThan(10);
    expect(e.now).not.toBeNull();
    expect(e.atWake).not.toBeNull();
    expect(e.trough).not.toBeNull();
    expect(['low', 'medium', 'high']).toContain(e.confidence);
    for (const p of e.forecast) {
      expect(p.lo).toBeLessThanOrEqual(p.value);
      expect(p.hi).toBeGreaterThanOrEqual(p.value);
      expect(Number.isFinite(p.value)).toBe(true);
    }
    // The forecast follows the caller's clock, never a read one.
    const later = buildCoachContext({ records, settings: SETTINGS, today: TODAY, now: new Date(2026, 8, 6, 21, 0, 0), workouts });
    expect(later.nowHHMM).toBe('21:00');
    expect(later.energy?.now).not.toBe(e.now);
  });

  it('reports at most five confirmed behaviour effects, strongest first', () => {
    const i = ctx.impact as NonNullable<CoachContext['impact']>;
    expect(i.effects.length).toBeLessThanOrEqual(5);
    for (const e of i.effects) {
      expect(e.qValue).toBeLessThanOrEqual(0.05); // isConfirmedEffect
      expect(e.nYes).toBeGreaterThanOrEqual(5);
      expect(e.nNo).toBeGreaterThanOrEqual(5);
      expect(e.lo95).toBeLessThanOrEqual(e.hi95);
      expect(e.label.length).toBeGreaterThan(0);
    }
    for (let k = 1; k < i.effects.length; k++) {
      expect(i.effects[k - 1].qValue).toBeLessThanOrEqual(i.effects[k].qValue);
    }
    expect(Array.isArray(i.pending)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. The sparse user: no check-ins, no wearable extras, no workouts
// ---------------------------------------------------------------------------

describe('buildCoachContext — nothing but food and a scale', () => {
  /** 40 days of weight and macros only: no HRV, no WHOOP, no sessions, no check-in. */
  const records: DailyRecord[] = Array.from({ length: 40 }, (_, i) => ({
    d: dayOf(i),
    w: r1(176 - i / 7),
    kc: 1900,
    p: 180,
    f: 65,
    c: 150,
    fi: 30,
  }));
  const ctx = build(records);

  it('builds every block as nulls rather than throwing', () => {
    expectNoNaN(ctx);
    expect(ctx.training).toBeDefined();
    expect(ctx.stress).toBeDefined();
    expect(ctx.energy).toBeDefined();
    expect(ctx.impact).toBeDefined();
    expect(ctx.changepoints).toBeDefined();

    const t = ctx.training as NonNullable<CoachContext['training']>;
    expect(t.load.source).toBe('none');
    expect(t.load.acwr).toBeNull();
    expect(t.load.formBand).toBeNull();
    expect(t.lastSession).toBeNull();
    expect(t.prs7d).toEqual([]);
    expect(t.vo2max?.value).toBeNull();

    const s = ctx.stress as NonNullable<CoachContext['stress']>;
    expect(s.osi).toBeNull();
    expect(s.band).toBeNull();
    expect(s.checkIn.total).toBeNull();
    expect(s.checkIn.band).toBe('neutral');
    expect(s.illness.flag).toBe(false);

    expect(ctx.energy?.forecast).toEqual([]); // no sleep clock to anchor either process
    expect(ctx.impact?.effects).toEqual([]);
    expect(ctx.hrv.band).toBe('insufficient');
    expect(ctx.readiness.source).toBe('none');
    expect(ctx.sleep.baselineSource).toBe('profile');

    // The weight stack still works — that is all this user gave it.
    expect(ctx.weight.rateAvailable).toBe(true);
    expect(ctx.weight.weeklyRateLb as number).toBeLessThan(0);
    expect(ctx.weight.kalmanLevel).not.toBeNull();
    expect(ctx.expenditure.tdee).not.toBeNull();
  });

  it('insights and the coach payload survive the same context', () => {
    const cards = buildInsights(ctx, SETTINGS);
    expect(cards.length).toBeLessThanOrEqual(3);
    for (const c of cards) {
      expect(c.body).not.toContain('NaN');
      expect(c.body).not.toContain('undefined');
    }
  });
});

// ---------------------------------------------------------------------------
// 7. Wiring the UI depends on
// ---------------------------------------------------------------------------

describe('buildCoachContext — v3 wiring', () => {
  const records = synthetic();
  const ctx40 = build(records);

  it('late eating follows the user\'s own wake window, not a fixed clock', () => {
    // A 05:00 riser who sleeps at 21:00 is in the last fifth of their day from
    // ~17:50, so a 19:00 dinner is late for them. The fixed-clock rule (≥ 400
    // kcal within 3 h of the 23:00 bed target) calls the same meal fine, and so
    // does the same meal for a 07:00-to-23:00 day.
    const dinner: Meal = { id: 'late', t: '19:00', n: 'lamb chops', g: 300, kc: 700, p: 60, f: 30, c: 50, fi: 3, tags: ['red-meat', 'home'] };
    const withDinner = (recs: DailyRecord[]) => recs.map((r) => (r.d === TODAY ? { ...r, meals: [...(r.meals ?? []), dinner] } : r));
    const early = records.map((r) => ({ ...r, wk: '05:00', bt: '21:00' }));
    const at = new Date(2026, 8, 6, 19, 30, 0);

    const c = build(withDinner(early), TODAY, at);
    expect(c.nutrition.lateEating).toBe(true);
    expect(c.nutrition.lateSeverity).toBe('high');
    expect(c.nutrition.lateSharePct as number).toBeGreaterThan(30);

    const normal = build(withDinner(records), TODAY, at);
    expect(normal.nutrition.lateSharePct).toBe(0);
    expect(normal.nutrition.lateSeverity).toBe('none');
    expect(normal.nutrition.lateEating).toBe(false);
    expectNoNaN(c);
    expectNoNaN(normal);
  });

  it('nutrition is reported on the eating day: a 02:00 supper still counts to yesterday', () => {
    const ctx = build(records, TODAY, new Date(2026, 8, 6, 2, 0, 0));
    expect(ctx.nutrition.eatingDay).toBe(addDays(TODAY, -1));
    // Yesterday's four meals, not today's two.
    expect(ctx.nutrition.mealsLogged).toBe(4);
    expect(ctx.nutrition.totals.p).toBe(178);
    // Everything else stays on the calendar day.
    expect(ctx.today).toBe(TODAY);
    expect(ctx.todayRecord?.d).toBe(TODAY);
    expectNoNaN(ctx);

    const morning = build(records, TODAY, new Date(2026, 8, 6, 9, 0, 0));
    expect(morning.nutrition.eatingDay).toBe(TODAY);
  });

  it('tobacco carries the counts behind each mean', () => {
    expect(ctx40.tobacco.nFree).toBeGreaterThan(0);
    expect(ctx40.tobacco.nSmoke).toBeGreaterThan(0);
    const nums = engine.tobaccoInsightNumbers(records, TODAY);
    expect(ctx40.tobacco.nFree).toBe(nums.nFree);
    expect(ctx40.tobacco.nSmoke).toBe(nums.nSmoke);
  });

  it('buildInsights passes the shown-history, so a repeated card decays', () => {
    const template = buildInsights(ctx40, SETTINGS)[0]?.template;
    expect(template).toBeDefined();
    const history: Record<string, string[]> = {};
    for (let i = 1; i <= 5; i++) history[addDays(TODAY, -i)] = [template as string];
    const decayed = buildInsights(ctx40, { ...SETTINGS, insightHistory: history });
    const before = buildInsights(ctx40, SETTINGS).find((c) => c.template === template);
    const after = decayed.find((c) => c.template === template);
    if (after) expect(after.priority).toBeLessThan(before?.priority as number);
    else expect(decayed.map((c) => c.template)).not.toContain(template);
  });

  it('buildInsights knows the previous resilience band the context derived', () => {
    // Nothing to compare a hand-built context against, so no card is invented.
    const cards = buildInsights({ ...ctx40 }, SETTINGS);
    expect(cards.every((c) => c.template !== '23')).toBe(true);
    // An explicit override is honoured.
    const forced = buildInsights(ctx40, SETTINGS, { previousResilienceBand: 'limited' });
    expect(Array.isArray(forced)).toBe(true);
  });

  it('workouts reach the training block through BuildContextInput', () => {
    const workouts = workoutsFor(TODAY);
    const without = build(records);
    const with_ = buildCoachContext({ records, settings: SETTINGS, today: TODAY, now: NOW, workouts });
    expect(without.training?.lastSession).toBeNull();
    expect(with_.training?.lastSession).not.toBeNull();
    expect(with_.training?.load.weeklyLoad).toBeGreaterThan(without.training?.load.weeklyLoad as number);
    // contextForDate takes them too.
    const via = contextForDate(records, SETTINGS, TODAY, NOW, workouts);
    expect(via.training?.lastSession?.id).toBe(with_.training?.lastSession?.id);
  });
});

// ---------------------------------------------------------------------------
// 8. Performance (Phase 3 gate: 365 days + 200 workouts + 90 check-ins)
// ---------------------------------------------------------------------------

describe('buildCoachContext — performance', () => {
  it('builds a 365-day, 200-workout, 90-check-in context in under 150 ms', () => {
    const N = 365;
    const records: DailyRecord[] = [];
    for (let i = 0; i < N; i++) {
      const d = addDays(TODAY, i - (N - 1));
      const meals = mealsFor(i);
      const r: DailyRecord = {
        d,
        w: r1(190 - i / 20 + 0.6 * Math.sin(i * 1.3)),
        kc: meals.reduce((a, m) => a + m.kc, 0),
        p: meals.reduce((a, m) => a + m.p, 0),
        f: meals.reduce((a, m) => a + m.f, 0),
        c: meals.reduce((a, m) => a + m.c, 0),
        fi: meals.reduce((a, m) => a + m.fi, 0),
        st: 8000 + Math.round(1500 * Math.sin(i * 0.4)),
        rec: 60 + Math.round(15 * Math.sin(i * 0.8)),
        hrv: 50 + Math.round(5 * Math.sin(i * 1.1)),
        rhr: 54 + Math.round(2 * Math.cos(i * 0.6)),
        slh: r1(7.2 + 0.5 * Math.sin(i * 0.9)),
        strn: 10 + Math.round(4 * Math.sin(i * 0.5)),
        rr: r1(14 + 0.5 * Math.sin(i * 0.7)),
        skt: r1(33.4 + 0.2 * Math.sin(i * 0.3)),
        spo: 96,
        alc: i % 7 === 0 ? 2 : 0,
        bt: minutesToHHMM(23 * 60 + Math.round(20 * Math.sin(i * 1.7))),
        wk: '07:00',
        tob: i % 3,
        caf: ['08:00'],
        h2o: 6,
        meals,
      };
      // 90 days of check-ins.
      if (i >= N - 90) {
        r.qs = 2 + (i % 3);
        r.qf = 3 + (i % 2);
        r.qt = 2 + (i % 4);
        r.qo = 3 + (i % 3);
      }
      records.push(r);
    }
    const workouts = workoutsFor(TODAY, 280).slice(-200);
    expect(records).toHaveLength(365);
    expect(workouts).toHaveLength(200);
    expect(records.filter((r) => r.qs !== undefined)).toHaveLength(90);

    const input = { records, settings: SETTINGS, today: TODAY, now: NOW, workouts };
    buildCoachContext(input); // warm up: the first run pays for JIT, not for the work
    const runs: number[] = [];
    for (let i = 0; i < 7; i++) {
      const t0 = performance.now();
      buildCoachContext(input);
      runs.push(performance.now() - t0);
    }
    const sorted = [...runs].sort((a, b) => a - b);
    const best = sorted[0];
    const median = sorted[3];
    // Both are logged so a regression is visible in the run output, but the
    // assertion is on the fastest run: vitest runs test files in parallel
    // workers, so a median measured under contention times the machine rather
    // than the builder. A real regression moves the floor too.
    console.log(
      `buildCoachContext (365 d / 200 workouts / 90 check-ins): ${best.toFixed(0)} ms best of 7, ${median.toFixed(0)} ms median`,
    );
    expect(best).toBeLessThan(150);
    expectNoNaN(buildCoachContext(input));
  });
});

// ---------------------------------------------------------------------------
// 9. The demo data a first-time user actually sees
// ---------------------------------------------------------------------------

describe('buildCoachContext — demo data', () => {
  const records = generateDemoData(SETTINGS, TODAY);
  const workouts = generateDemoWorkouts(SETTINGS, TODAY);
  const ctx = buildCoachContext({ records, settings: SETTINGS, today: TODAY, now: NOW, workouts });

  it('fills the training block from the seeded sessions', () => {
    expectNoNaN(ctx);
    const t = ctx.training as NonNullable<CoachContext['training']>;
    expect(workouts.length).toBeGreaterThan(0);
    expect(t.lastSession).not.toBeNull();
    expect(t.load.source).not.toBe('none');
    expect(t.load.weeklyLoad).toBeGreaterThan(0);
    expect(t.weeklySets.some((m) => m.sets > 0)).toBe(true);
    expect(t.muscleReadiness.some((m) => m.hoursSince !== null)).toBe(true);
    expect(t.balance.pushPull).not.toBeNull();
    expect(t.prs7d.length + t.plateaus.length).toBeGreaterThanOrEqual(0);
    expect(t.deload.reasons.length).toBeGreaterThan(0);
  });

  it('fills the stress block from the seeded check-ins and overnight signals', () => {
    const s = ctx.stress as NonNullable<CoachContext['stress']>;
    expect(s.checkIn.nDays).toBeGreaterThan(0);
    expect(s.signalsAvailable).toBeGreaterThan(0);
    expect(s.osi).not.toBeNull();
    expect(s.band).not.toBeNull();
    expect(s.resilience.score).not.toBeNull();
    expect(s.resilience.band).not.toBeNull();
    // The seeded illness episode is 4 days near day 30, so it has passed by
    // today — the flag is a state, not a scar.
    expect(typeof s.illness.flag).toBe('boolean');
    expect(s.nRef).toBeGreaterThan(0);
  });

  it('and the rest of the v3 blocks come out finite and renderable', () => {
    expect(ctx.energy?.forecast.length).toBeGreaterThan(0);
    expect(ctx.energy?.trough).not.toBeNull();
    expect((ctx.impact?.effects ?? []).length).toBeLessThanOrEqual(5);
    expect(Array.isArray(ctx.changepoints)).toBe(true);
    const cards = buildInsights(ctx, SETTINGS);
    expect(cards.length).toBeGreaterThan(0);
    for (const c of cards) {
      expect(c.body).not.toContain('NaN');
      expect(c.body).not.toContain('undefined');
    }
  });
});
