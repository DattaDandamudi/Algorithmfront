import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { demoSummary, generateDemoData, generateDemoWorkouts } from './seed';
import { DEFAULT_SETTINGS } from './defaults';
import type { AppSettings, DailyRecord, ISODate, Workout } from './types';
import { addDays, hhmmToMinutes, lastNDates, minutesSinceNoon, weekdayOf } from '../lib/dates';
import { mean } from '../lib/format';
import { exerciseById } from '../engine/exerciseDb';
import { detectPRs } from '../engine/strength';

const END: ISODate = '2026-09-06';
const gen = (end: ISODate = END, settings: AppSettings = DEFAULT_SETTINGS, days?: number) => generateDemoData(settings, end, days);
const genW = (end: ISODate = END, settings: AppSettings = DEFAULT_SETTINGS, days?: number) => generateDemoWorkouts(settings, end, days);

const isLift = (d: ISODate) => DEFAULT_SETTINGS.profile.split[weekdayOf(d)] !== 'rest';
const loggedBefore = (recs: DailyRecord[], end: ISODate) => recs.filter((r) => r.meals && r.d !== end);
/** Distinct eating times with a real meal (coffee is 2–3 kcal). */
const occasions = (r: DailyRecord) => new Set((r.meals ?? []).filter((m) => m.kc >= 50).map((m) => m.t)).size;

/**
 * The seeded illness window, from the module's own constants: it starts 15
 * days before `endDate` and runs four days, so on a 45-day set it is indices
 * 29–32. Kept here rather than exported so a change to the episode has to be
 * a deliberate edit in both places.
 */
const ILL_FIRST = 45 - 1 - 15;
const ILL_LAST = ILL_FIRST + 3;
const isIllIdx = (i: number) => i >= ILL_FIRST && i <= ILL_LAST;

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const round1 = (x: number) => Math.round(x * 10) / 10;

/** Pearson r, for the subjective/objective agreement checks. */
function pearson(xs: number[], ys: number[]): number {
  const mx = avg(xs);
  const my = avg(ys);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  return num / Math.sqrt(dx * dy);
}

const hooperSum = (r: DailyRecord) => (r.qs as number) + (r.qf as number) + (r.qt as number) + (r.qo as number);
/** Working sets only — warm-ups are not evidence of anything. */
const workingSetsOf = (w: Workout) => (w.exercises ?? []).flatMap((e) => e.sets.filter((s) => s.k !== 'wu'));

/**
 * Invariants from the task brief. They must hold for ANY endDate (the store
 * calls the generator with today's date), so the test below runs them for a
 * full week of weekday alignments.
 */
function checkInvariants(recs: DailyRecord[], end: ISODate): void {
  expect(recs).toHaveLength(45);
  expect(recs[recs.length - 1].d).toBe(end);
  for (let i = 1; i < recs.length; i++) expect(recs[i - 1].d < recs[i].d).toBe(true);
  // Trend weight and lift flag are derived by the store / split — never seeded.
  expect(recs.every((r) => r.wt === undefined && r.lift === undefined)).toBe(true);

  // Weigh-ins: 1–2 missing per week, but the last 7 days keep ≥ 5 so the §6.2 gate passes.
  const weighIns = recs.filter((r) => typeof r.w === 'number');
  expect(weighIns.length).toBeGreaterThanOrEqual(45 - 2 * 7);
  expect(weighIns.length).toBeLessThanOrEqual(45 - 6);
  expect(recs.slice(-7).filter((r) => typeof r.w === 'number').length).toBeGreaterThanOrEqual(5);

  // Nutrition bands on logged days (today is partial and checked separately).
  const logged = loggedBefore(recs, end);
  for (const r of logged) {
    expect(r.kc, `${r.d} kcal`).toBeGreaterThanOrEqual(1850);
    expect(r.kc, `${r.d} kcal`).toBeLessThanOrEqual(2150);
    expect(r.p, `${r.d} protein`).toBeGreaterThanOrEqual(160);
    expect(r.p, `${r.d} protein`).toBeLessThanOrEqual(195);
    expect(r.f, `${r.d} fat`).toBeGreaterThanOrEqual(55);
    expect(r.f, `${r.d} fat`).toBeLessThanOrEqual(80);
    expect(r.fi, `${r.d} fiber`).toBeGreaterThanOrEqual(18);
    expect(r.fi, `${r.d} fiber`).toBeLessThanOrEqual(34);
    expect(occasions(r), `${r.d} occasions`).toBeGreaterThanOrEqual(3);
    expect(occasions(r), `${r.d} occasions`).toBeLessThanOrEqual(5);
    // Totals are exactly what the store's withTotals() would recompute.
    const sums = r.meals!.reduce((a, m) => ({ kc: a.kc + m.kc, p: a.p + m.p, f: a.f + m.f, c: a.c + m.c, fi: a.fi + m.fi }), { kc: 0, p: 0, f: 0, c: 0, fi: 0 });
    expect(r.kc).toBe(Math.round(sums.kc));
    expect(r.p).toBe(Math.round(sums.p));
    expect(r.f).toBe(Math.round(sums.f));
    expect(r.c).toBe(Math.round(sums.c));
    expect(r.fi).toBe(Math.round(sums.fi * 10) / 10);
  }
  const lowFat = logged.filter((r) => (r.f as number) < 60).length;
  expect(lowFat).toBeGreaterThanOrEqual(2);
  expect(lowFat).toBeLessThanOrEqual(3);
  const liftC = mean(logged.filter((r) => isLift(r.d)).map((r) => r.c as number)) as number;
  const restC = mean(logged.filter((r) => !isLift(r.d)).map((r) => r.c as number)) as number;
  expect(liftC, `${end} lift-day carbs should exceed rest-day carbs`).toBeGreaterThan(restC + 10);

  // Missed logging: 2–3 days, all in the older half, none in the last 7 days.
  const missed = recs.filter((r) => !r.meals).map((r) => recs.indexOf(r));
  expect(missed.length).toBeGreaterThanOrEqual(2);
  expect(missed.length).toBeLessThanOrEqual(3);
  expect(missed.every((i) => i < 22)).toBe(true);
  expect(recs.slice(-7).every((r) => r.meals && r.meals.length > 0)).toBe(true);
}

describe('generateDemoData', () => {
  it('is deterministic (same output twice, byte for byte)', () => {
    expect(JSON.stringify(gen())).toBe(JSON.stringify(gen()));
    expect(JSON.stringify(gen('2026-03-15'))).toBe(JSON.stringify(gen('2026-03-15')));
  });

  it('holds the spec bands for every weekday alignment of endDate', () => {
    for (let k = 0; k < 7; k++) {
      const end = addDays(END, -k);
      checkInvariants(gen(end), end);
    }
  });

  it('weight trends down ~1 lb/wk from ~176 lb with noise and occasional water bumps', () => {
    const recs = gen();
    const pts = recs.map((r, i) => ({ i, w: r.w })).filter((p): p is { i: number; w: number } => typeof p.w === 'number');
    expect(pts[0].w).toBeGreaterThan(173);
    expect(pts[0].w).toBeLessThan(180);
    const xm = mean(pts.map((p) => p.i)) as number;
    const ym = mean(pts.map((p) => p.w)) as number;
    const slope = pts.reduce((a, p) => a + (p.i - xm) * (p.w - ym), 0) / pts.reduce((a, p) => a + (p.i - xm) ** 2, 0);
    expect(slope * 7).toBeGreaterThan(-1.4);
    expect(slope * 7).toBeLessThan(-0.7);
    // Every weight is a 0.1 lb reading in a plausible range.
    for (const p of pts) {
      expect(p.w).toBeGreaterThan(165);
      expect(p.w).toBeLessThan(181);
      expect(Math.round(p.w * 10) / 10).toBe(p.w);
    }
    // At least one day jumps ≥ 1.5 lb over the previous weigh-in (water after biryani / restaurant night).
    const jumps = pts.slice(1).map((p, i) => p.w - pts[i].w);
    expect(jumps.some((j) => j >= 1.5)).toBe(true);
  });

  it('produces WHOOP-like recovery, HRV, RHR and strain', () => {
    const recs = gen();
    for (const r of recs) {
      expect(r.hrv).toBeGreaterThanOrEqual(35);
      expect(r.hrv).toBeLessThanOrEqual(95);
      expect(r.rhr).toBeGreaterThanOrEqual(46);
      expect(r.rhr).toBeLessThanOrEqual(60);
      expect(r.rec).toBeGreaterThanOrEqual(0);
      expect(r.rec).toBeLessThanOrEqual(100);
      expect(Number.isInteger(r.hrv) && Number.isInteger(r.rhr) && Number.isInteger(r.rec)).toBe(true);
    }
    const hrvMean = mean(recs.map((r) => r.hrv as number)) as number;
    expect(hrvMean).toBeGreaterThan(52);
    expect(hrvMean).toBeLessThan(66);
    const rhrMean = mean(recs.map((r) => r.rhr as number)) as number;
    expect(rhrMean).toBeGreaterThan(50);
    expect(rhrMean).toBeLessThan(55);
    const recs30 = recs.slice(-30);
    expect(recs30.filter((r) => (r.rec as number) < 34).length).toBeGreaterThanOrEqual(1);
    expect(recs30.filter((r) => (r.rec as number) > 67).length).toBeGreaterThanOrEqual(3);
    expect(recs.filter((r) => (r.rec as number) >= 40 && (r.rec as number) <= 80).length).toBeGreaterThan(recs.length / 2);
    // Recovery correlates with HRV: green days have higher HRV than red days.
    const hrvGreen = mean(recs.filter((r) => (r.rec as number) > 67).map((r) => r.hrv as number)) as number;
    const hrvRed = mean(recs.filter((r) => (r.rec as number) < 34).map((r) => r.hrv as number)) as number;
    expect(hrvGreen).toBeGreaterThan(hrvRed);

    const past = recs.slice(0, -1);
    for (const r of past) {
      expect(r.strn).toBeGreaterThanOrEqual(6);
      expect(r.strn).toBeLessThanOrEqual(16);
    }
    const strnLift = mean(past.filter((r) => isLift(r.d)).map((r) => r.strn as number)) as number;
    const strnRest = mean(past.filter((r) => !isLift(r.d)).map((r) => r.strn as number)) as number;
    expect(strnLift).toBeGreaterThan(strnRest + 2);
  });

  it('produces plausible sleep: hours, need, debt, bed/wake times, naps', () => {
    const recs = gen();
    for (const r of recs) {
      expect(r.slh).toBeGreaterThanOrEqual(6.2);
      expect(r.slh).toBeLessThanOrEqual(8.3);
      expect(r.sln).toBeGreaterThanOrEqual(7.6);
      expect(r.sln).toBeLessThanOrEqual(8.4);
      expect(r.dbt).toBeGreaterThanOrEqual(0);
      expect(r.dbt).toBeLessThanOrEqual(120);
      expect(Number.isInteger(r.dbt)).toBe(true);
      const bt = minutesSinceNoon(r.bt) as number; // 22:40 → 640, 00:25 → 745
      expect(bt).toBeGreaterThanOrEqual(640);
      expect(bt).toBeLessThanOrEqual(745);
      const wk = hhmmToMinutes(r.wk) as number;
      expect(wk).toBeGreaterThanOrEqual(6 * 60 + 40);
      expect(wk).toBeLessThanOrEqual(7 * 60 + 30);
      if (r.nap !== undefined) {
        expect(r.nap).toBeGreaterThanOrEqual(15);
        expect(r.nap).toBeLessThanOrEqual(45);
      }
    }
    const slh30 = mean(recs.slice(-30).map((r) => r.slh as number)) as number;
    expect(slh30).toBeGreaterThan(7.0);
    expect(slh30).toBeLessThan(7.4);
    expect(recs.some((r) => r.bt!.startsWith('00:'))).toBe(true);
    expect(recs.some((r) => r.nap !== undefined)).toBe(true);
    expect(recs.filter((r) => r.nap !== undefined).length).toBeLessThan(12);
    expect(recs.some((r) => (r.dbt as number) > 0 && (r.dbt as number) < 120)).toBe(true);
  });

  it('logs steps, water and a tobacco taper with a 2-day smoke-free streak ending yesterday', () => {
    const recs = gen();
    const n = recs.length;
    for (const r of recs.slice(0, -1)) {
      expect(r.st).toBeGreaterThanOrEqual(5500);
      expect(r.st).toBeLessThanOrEqual(11500);
      expect(r.h2o).toBeGreaterThanOrEqual(6);
      expect(r.h2o).toBeLessThanOrEqual(11);
      expect(Number.isInteger(r.tob)).toBe(true);
    }
    const firstWeek = mean(recs.slice(0, 7).map((r) => r.tob as number)) as number;
    const lastWeek = mean(recs.slice(-8, -1).map((r) => r.tob as number)) as number;
    expect(firstWeek).toBeGreaterThan(4);
    expect(firstWeek).toBeLessThan(6.5);
    expect(lastWeek).toBeLessThan(3);
    const lastTwoWeeks = recs.slice(n - 15, n - 1);
    const zeros = lastTwoWeeks.filter((r) => r.tob === 0).length;
    expect(zeros).toBeGreaterThanOrEqual(3);
    expect(zeros).toBeLessThanOrEqual(4);
    expect(recs[n - 2].tob).toBe(0);
    expect(recs[n - 3].tob).toBe(0);
    expect(recs[n - 4].tob).toBeGreaterThan(0);
    expect(recs.slice(0, n - 15).every((r) => (r.tob as number) >= 1)).toBe(true);
  });

  it('builds meals from favorites + basics with tags, coffee/caffeine, fish weekly and red meat 2–3×/wk', () => {
    const recs = gen();
    const logged = loggedBefore(recs, END);
    const entries = logged.flatMap((r) => r.meals!);
    // Meal ids: deterministic counter, unique across the dataset.
    const ids = recs.flatMap((r) => r.meals ?? []).map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^m_demo_\d{3,}$/.test(id))).toBe(true);
    // Names come from the default favorites or the inline basics; every entry has tags and a venue.
    const favNames = new Set(DEFAULT_SETTINGS.favorites.map((f) => f.name));
    expect(entries.some((m) => favNames.has(m.n))).toBe(true);
    expect(entries.filter((m) => favNames.has(m.n)).every((m) => m.src === 'favorite')).toBe(true);
    for (const m of entries) {
      expect(m.tags && m.tags.length).toBeTruthy();
      expect(m.tags!.includes('home') || m.tags!.includes('restaurant')).toBe(true);
      expect(/^\d{2}:\d{2}$/.test(m.t)).toBe(true);
      expect(m.g).toBeGreaterThan(0);
    }
    const times = new Set(entries.map((m) => m.t));
    expect(times.has('08:30') && times.has('13:00') && times.has('20:15')).toBe(true);
    expect(times.has('22:30')).toBe(true);
    // Restaurant share of real food ≈ 60 % (soft target — persona eats out most days).
    const food = entries.filter((m) => m.kc >= 30);
    const restaurantShare = food.filter((m) => m.tags!.includes('restaurant')).length / food.length;
    expect(restaurantShare).toBeGreaterThan(0.45);
    expect(restaurantShare).toBeLessThan(0.75);
    // Fish ~1×/wk, red meat 2–3×/wk over ~6 weeks of logged days.
    const fishDays = logged.filter((r) => r.meals!.some((m) => m.tags!.includes('fish'))).length;
    const redDays = logged.filter((r) => r.meals!.some((m) => m.tags!.includes('red-meat'))).length;
    expect(fishDays).toBeGreaterThanOrEqual(4);
    expect(fishDays).toBeLessThanOrEqual(9);
    expect(redDays).toBeGreaterThanOrEqual(10);
    expect(redDays).toBeLessThanOrEqual(20);
    // Coffee is a caffeine-tagged entry mirrored into `caf`; some days have a 16:30 cup (after the 14:00 cutoff).
    for (const r of logged) {
      const coffeeTimes = r.meals!.filter((m) => m.tags!.includes('caffeine')).map((m) => m.t);
      expect(r.caf).toEqual(coffeeTimes);
    }
    expect(logged.filter((r) => r.caf!.includes('08:00')).length).toBeGreaterThan(logged.length * 0.9);
    const late = logged.filter((r) => r.caf!.some((t) => (hhmmToMinutes(t) as number) > 14 * 60)).length;
    expect(late).toBeGreaterThanOrEqual(3);
    expect(late).toBeLessThan(logged.length / 2);
    // Unlogged days carry no nutrition or caffeine at all.
    for (const r of recs.filter((r) => !r.meals)) {
      expect(r.kc ?? r.p ?? r.f ?? r.c ?? r.fi ?? r.caf).toBeUndefined();
      expect(r.w !== undefined || r.hrv !== undefined).toBe(true);
    }
  });

  it('makes today a partial day: weigh-in, WHOOP morning data, coffee + 2 meals ≈ 85 g protein, ~4,200 steps, no tobacco yet', () => {
    const today = gen()[44];
    expect(today.d).toBe(END);
    expect(typeof today.w).toBe('number');
    for (const k of ['rec', 'hrv', 'rhr', 'slh', 'sln', 'dbt', 'bt', 'wk'] as const) expect(today[k], k).toBeDefined();
    expect(today.strn).toBeUndefined();
    expect(today.tob).toBeUndefined();
    expect(today.nap).toBeUndefined();
    expect(today.st).toBeGreaterThan(3900);
    expect(today.st).toBeLessThan(4500);
    expect(today.caf).toEqual(['08:05']);
    const meals = today.meals!;
    expect(meals.some((m) => m.t === '08:05' && m.tags!.includes('caffeine'))).toBe(true);
    expect(occasions(today)).toBe(2);
    expect(new Set(meals.filter((m) => m.kc >= 50).map((m) => m.t))).toEqual(new Set(['08:30', '13:00']));
    expect(today.p).toBeGreaterThanOrEqual(75);
    expect(today.p).toBeLessThanOrEqual(95);
    expect(today.kc).toBeLessThan(1300);
  });

  it('respects the training split from settings and the `days` argument', () => {
    const allRest: AppSettings = { ...DEFAULT_SETTINGS, profile: { ...DEFAULT_SETTINGS.profile, split: { 0: 'rest', 1: 'rest', 2: 'rest', 3: 'rest', 4: 'rest', 5: 'rest', 6: 'rest' } } };
    const recs = gen(END, allRest);
    expect(recs.slice(0, -1).every((r) => (r.strn as number) <= 11)).toBe(true);
    expect(gen(END, DEFAULT_SETTINGS, 0)).toEqual([]);
    const ten = gen(END, DEFAULT_SETTINGS, 10);
    expect(ten).toHaveLength(10);
    expect(ten[9].d).toBe(END);
    expect(ten[0].d).toBe(addDays(END, -9));
    expect(ten[9].tob).toBeUndefined();
    expect(ten[8].tob).toBe(0);
  });

  it('keeps the dataset compact enough for localStorage', () => {
    const bytes = JSON.stringify(gen()).length * 2; // UTF-16 upper bound
    expect(bytes).toBeLessThan(200 * 1024);
  });
});

describe('generateDemoWorkouts', () => {
  /** Every day the generator covers — `endDate` itself is deliberately left empty. */
  const trainingDays = (end: ISODate = END, days = 45) => lastNDates(end, days).slice(0, -1);

  it('puts one session on every lift day plus a Saturday run, and nothing after endDate', () => {
    for (let k = 0; k < 7; k++) {
      const end = addDays(END, -k);
      const ws = genW(end);
      const days = trainingDays(end);
      const lifts = days.filter((d) => isLift(d)).length;
      const runs = days.filter((d) => weekdayOf(d) === 6).length;
      expect(ws.filter((w) => w.kind === 'strength'), `${end} strength`).toHaveLength(lifts);
      expect(ws.filter((w) => w.kind === 'cardio'), `${end} cardio`).toHaveLength(runs);
      expect(ws).toHaveLength(lifts + runs);
      // Nothing today (the partial day) and nothing in the future; ascending order.
      for (const w of ws) expect(w.d < end, `${w.id} must precede ${end}`).toBe(true);
      expect(ws[0].d >= days[0], `${end} first session inside the window`).toBe(true);
      for (let i = 1; i < ws.length; i++) expect(ws[i - 1].d <= ws[i].d).toBe(true);
    }
  });

  it('gives every session a demo source and a stable id derived from its date', () => {
    const ws = genW();
    const ids = ws.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const w of ws) {
      expect(w.source).toBe('demo');
      expect(w.id).toBe(`w_demo_${w.d}_${w.kind === 'strength' ? 's' : 'c'}`);
      expect(/^\d{2}:\d{2}$/.test(w.start)).toBe(true);
      expect(w.durationMin).toBeGreaterThan(20);
      expect(w.durationMin).toBeLessThan(130);
    }
    // Regenerating cannot re-key a session: ids depend only on the date.
    expect(genW().map((w) => w.id)).toEqual(ids);
  });

  it('is byte-identical across two runs and across two processes', () => {
    expect(JSON.stringify(genW())).toBe(JSON.stringify(genW()));
    expect(JSON.stringify(genW('2026-03-15'))).toBe(JSON.stringify(genW('2026-03-15')));

    const here = dirname(fileURLToPath(import.meta.url));
    const root = resolve(here, '../../..');
    const dir = mkdtempSync(join(tmpdir(), 'seed-xproc-'));
    try {
      const script = join(dir, 'run.mts');
      writeFileSync(
        script,
        [
          `import { generateDemoData, generateDemoWorkouts } from ${JSON.stringify(join(here, 'seed.ts'))};`,
          `import { DEFAULT_SETTINGS } from ${JSON.stringify(join(here, 'defaults.ts'))};`,
          `console.log(JSON.stringify({`,
          `  records: generateDemoData(DEFAULT_SETTINGS, ${JSON.stringify(END)}),`,
          `  workouts: generateDemoWorkouts(DEFAULT_SETTINGS, ${JSON.stringify(END)}),`,
          `}));`,
        ].join('\n'),
      );
      const stdout = execFileSync('node', [join(root, 'node_modules/vite-node/dist/cli.mjs'), script], {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
      });
      const lines = stdout.trim().split('\n');
      const other = lines[lines.length - 1];
      expect(other).toBe(JSON.stringify({ records: gen(), workouts: genW() }));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('leaves the daily records byte-identical whether or not workouts are generated', () => {
    const before = JSON.stringify(gen());
    genW();
    genW('2026-03-15', DEFAULT_SETTINGS, 12);
    expect(JSON.stringify(gen())).toBe(before);
    // And the other way round: the record generator never touches the workout stream.
    const ws = JSON.stringify(genW());
    gen();
    expect(JSON.stringify(genW())).toBe(ws);
  });

  it('draws every exercise from the built-in program and resolves each id', () => {
    const ws = genW();
    const strength = ws.filter((w) => w.kind === 'strength');
    expect(strength.length).toBeGreaterThan(20);
    for (const w of strength) {
      expect(w.programId).toMatch(/^builtin-ul4/);
      expect(w.session === 'upper' || w.session === 'lower').toBe(true);
      expect(w.title).toMatch(/^(Upper|Lower) [AB]$/);
      expect(w.exercises && w.exercises.length).toBeGreaterThanOrEqual(6);
      for (const ex of w.exercises ?? []) {
        expect(exerciseById(ex.exerciseId), ex.exerciseId).not.toBeNull();
        expect(ex.sets.length).toBeGreaterThanOrEqual(3);
        const working = ex.sets.filter((s) => s.k !== 'wu');
        expect(working.length).toBeGreaterThanOrEqual(3);
        for (const s of ex.sets) {
          expect(s.r).toBeGreaterThanOrEqual(1);
          expect(s.w).toBeGreaterThanOrEqual(0);
          if (s.k !== 'wu') {
            expect(s.rpe).toBeGreaterThanOrEqual(6);
            expect(s.rpe).toBeLessThanOrEqual(10);
            expect((s.rpe as number) * 2).toBe(Math.round((s.rpe as number) * 2));
          }
        }
        // The first working set is the top set: nothing after it is heavier,
        // longer or easier. That is what keeps `detectPRs` from turning
        // back-off noise into a personal record.
        const top = working[0];
        for (const s of working) {
          expect(s.w, `${ex.exerciseId} load`).toBeLessThanOrEqual(top.w);
          expect(s.r, `${ex.exerciseId} reps`).toBeLessThanOrEqual(top.r);
          expect(s.rpe as number, `${ex.exerciseId} rpe`).toBeGreaterThanOrEqual(top.rpe as number);
        }
      }
      const working = workingSetsOf(w);
      expect(working.length).toBeGreaterThanOrEqual(15);
      expect(working.length).toBeLessThanOrEqual(30);
    }
    // Each session type alternates A → B across the training week.
    const titles = new Set(strength.map((w) => w.title));
    expect(titles).toEqual(new Set(['Upper A', 'Lower A', 'Upper B', 'Lower B']));
  });

  it('progresses loads across the block and lands 3–5 personal records on lift days', () => {
    for (let k = 0; k < 7; k++) {
      const end = addDays(END, -k);
      const ws = genW(end);
      const prs = detectPRs(ws, end);
      expect(prs.length, `${end} PR count`).toBeGreaterThanOrEqual(3);
      expect(prs.length, `${end} PR count`).toBeLessThanOrEqual(5);
      // One record per lift, each a real improvement, each on a training day.
      expect(new Set(prs.map((p) => p.exerciseId)).size).toBe(prs.length);
      for (const p of prs) {
        expect(isLift(p.d), `${p.exerciseId} PR on ${p.d}`).toBe(true);
        expect(p.value).toBeGreaterThan(p.previous as number);
        expect(p.d < end).toBe(true);
      }
    }
    // Loads actually move: the last bench session is heavier than the first.
    const bench = genW()
      .flatMap((w) => (w.exercises ?? []).filter((e) => e.exerciseId === 'bench-press').map((e) => ({ d: w.d, top: Math.max(...e.sets.filter((s) => s.k !== 'wu').map((s) => s.w)) })));
    expect(bench.length).toBeGreaterThanOrEqual(5);
    expect(bench[bench.length - 1].top).toBeGreaterThan(bench[0].top);
    // …and the block has a deload: at least one week sits under its neighbours.
    expect(Math.min(...bench.map((b) => b.top))).toBeLessThan(bench[0].top);
  });

  it('precomputes load with the same Foster / Edwards maths the engine uses', () => {
    for (const w of genW()) {
      if (w.kind === 'strength') {
        expect(w.srpe).toBeGreaterThanOrEqual(5);
        expect(w.srpe).toBeLessThanOrEqual(10);
        expect(w.load).toBe(Math.round((w.srpe as number) * w.durationMin * 10) / 10);
      } else {
        const zones = w.cardio?.zoneMin as number[];
        expect(zones).toHaveLength(6);
        expect(zones.reduce((a, m) => a + m, 0)).toBe(w.durationMin);
        expect(w.load).toBe(zones.reduce((a, m, i) => a + m * i, 0));
        expect(w.cardio?.distanceKm).toBeGreaterThan(4);
        expect(w.cardio?.distanceKm).toBeLessThan(12);
        expect(w.cardio?.avgHr).toBeGreaterThan(135);
        expect(w.cardio?.avgHr).toBeLessThan(170);
        expect(w.cardio?.maxHr as number).toBeGreaterThan(w.cardio?.avgHr as number);
      }
      expect(w.load).toBeGreaterThan(0);
    }
  });

  it('stays small enough to ship inside the demo dataset', () => {
    expect(JSON.stringify(genW()).length).toBeLessThan(60 * 1024);
    expect(genW(END, DEFAULT_SETTINGS, 0)).toEqual([]);
    const ten = genW(END, DEFAULT_SETTINGS, 10);
    expect(ten.length).toBeGreaterThan(0);
    expect(ten.every((w) => w.d >= addDays(END, -9) && w.d < END)).toBe(true);
    // An all-rest split still gets the Saturday runs and nothing else.
    const allRest: AppSettings = { ...DEFAULT_SETTINGS, profile: { ...DEFAULT_SETTINGS.profile, split: { 0: 'rest', 1: 'rest', 2: 'rest', 3: 'rest', 4: 'rest', 5: 'rest', 6: 'rest' } } };
    const rested = genW(END, allRest);
    expect(rested.every((w) => w.kind === 'cardio')).toBe(true);
    expect(rested.length).toBe(trainingDays().filter((d) => weekdayOf(d) === 6).length);
  });
});

describe('stress inputs', () => {
  const recs = gen();
  const past = recs.slice(0, -1);
  const checked = past.filter((r) => r.qs !== undefined);
  const healthy = recs.filter((_, i) => !isIllIdx(i));

  it('asks the four Hooper items on ~80 % of past days, never on today', () => {
    expect(checked.length / past.length).toBeGreaterThan(0.7);
    expect(checked.length / past.length).toBeLessThan(0.92);
    // All four move together — a check-in is one save, not four.
    for (const r of past) {
      const present = [r.qs, r.qf, r.qt, r.qo].filter((v) => v !== undefined).length;
      expect(present === 0 || present === 4).toBe(true);
      for (const v of [r.qs, r.qf, r.qt, r.qo]) {
        if (v === undefined) continue;
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(7);
      }
    }
    const today = recs[recs.length - 1];
    expect([today.qs, today.qf, today.qt, today.qo]).toEqual([undefined, undefined, undefined, undefined]);
    // Days he never logged carry no check-in either.
    expect(recs.filter((r) => !r.meals).every((r) => r.qs === undefined)).toBe(true);
  });

  it('correlates the check-in with recovery without making it a copy of it', () => {
    const r = pearson(checked.map((x) => x.rec as number), checked.map(hooperSum));
    expect(r, 'subjective and objective should agree more often than not').toBeLessThan(-0.35);
    expect(r, 'but they must not be the same measurement twice').toBeGreaterThan(-0.95);
    // Stress is the item that goes its own way — it rides a life cycle of its own.
    const perItem = (['qs', 'qf', 'qt', 'qo'] as const).map((k) =>
      pearson(checked.map((x) => x.rec as number), checked.map((x) => x[k] as number)),
    );
    for (const c of perItem) expect(c).toBeLessThan(-0.15);
    expect(Math.max(...perItem)).toBe(perItem[2]);
    // And they really do diverge: a decent share of days land on opposite sides.
    const medRec = [...checked.map((x) => x.rec as number)].sort((a, b) => a - b)[Math.floor(checked.length / 2)];
    const medSum = [...checked.map(hooperSum)].sort((a, b) => a - b)[Math.floor(checked.length / 2)];
    const disagree = checked.filter((x) => (x.rec as number) > medRec === hooperSum(x) > medSum).length;
    expect(disagree).toBeGreaterThanOrEqual(3);
  });

  it('logs respiratory rate, skin temperature and SpO₂ at plausible means', () => {
    for (const r of recs) {
      expect(r.rr, `${r.d} rr`).toBeGreaterThanOrEqual(11);
      expect(r.rr, `${r.d} rr`).toBeLessThanOrEqual(22);
      expect(r.skt, `${r.d} skt`).toBeGreaterThanOrEqual(32);
      expect(r.skt, `${r.d} skt`).toBeLessThanOrEqual(35.5);
      expect(r.spo, `${r.d} spo`).toBeGreaterThanOrEqual(95);
      expect(r.spo, `${r.d} spo`).toBeLessThanOrEqual(99);
      expect(Number.isInteger(r.spo)).toBe(true);
      expect(round1(r.rr as number)).toBe(r.rr);
      expect(round1(r.skt as number)).toBe(r.skt);
    }
    expect(avg(healthy.map((r) => r.rr as number))).toBeGreaterThan(14);
    expect(avg(healthy.map((r) => r.rr as number))).toBeLessThan(16);
    expect(avg(healthy.map((r) => r.skt as number))).toBeGreaterThan(33);
    expect(avg(healthy.map((r) => r.skt as number))).toBeLessThan(34);
    expect(avg(healthy.map((r) => r.spo as number))).toBeGreaterThan(96);
    expect(avg(healthy.map((r) => r.spo as number))).toBeLessThan(98.5);
  });

  it('marks ~2 drinking evenings a week whose next morning carries the published effect', () => {
    const drinkDays = recs.filter((r) => r.alc !== undefined);
    expect(drinkDays.length / (45 / 7)).toBeGreaterThan(1.2);
    expect(drinkDays.length / (45 / 7)).toBeLessThan(3);
    for (const r of drinkDays) {
      expect(Number.isInteger(r.alc)).toBe(true);
      expect(r.alc).toBeGreaterThanOrEqual(1);
      expect(r.alc).toBeLessThanOrEqual(4);
    }
    // Today's evening has not happened, and he does not drink while ill.
    expect(recs[recs.length - 1].alc).toBeUndefined();
    expect(recs.filter((_, i) => isIllIdx(i)).every((r) => r.alc === undefined)).toBe(true);

    const after: DailyRecord[] = [];
    const rest: DailyRecord[] = [];
    for (let i = 1; i < recs.length; i++) (recs[i - 1].alc ? after : rest).push(recs[i]);
    expect(after.length).toBeGreaterThanOrEqual(5); // impact.MIN_YES_DAYS
    expect(avg(after.map((r) => r.hrv as number))).toBeLessThan(avg(rest.map((r) => r.hrv as number)) - 3);
    expect(avg(after.map((r) => r.rhr as number))).toBeGreaterThan(avg(rest.map((r) => r.rhr as number)) + 1.5);
  });

  it('seeds a 4-day illness episode with the documented deviations', () => {
    const window = recs.filter((_, i) => isIllIdx(i));
    expect(window).toHaveLength(4);
    // Consecutive days, and clear of both ends so a 60-day reference exists.
    for (let i = 1; i < window.length; i++) expect(window[i].d).toBe(addDays(window[i - 1].d, 1));
    expect(window[window.length - 1].d < addDays(END, -7)).toBe(true);

    const base = {
      rr: avg(healthy.map((r) => r.rr as number)),
      skt: avg(healthy.map((r) => r.skt as number)),
      hrv: avg(healthy.map((r) => r.hrv as number)),
      rhr: avg(healthy.map((r) => r.rhr as number)),
    };
    expect(avg(window.map((r) => r.rr as number)), 'rr +3').toBeGreaterThan(base.rr + 2.2);
    expect(avg(window.map((r) => r.skt as number)), 'skin temp +0.5 °C').toBeGreaterThan(base.skt + 0.35);
    expect(avg(window.map((r) => r.hrv as number)), 'hrv −20 %').toBeLessThan(base.hrv * 0.9);
    expect(avg(window.map((r) => r.rhr as number)), 'rhr +6').toBeGreaterThan(base.rhr + 2.5);
    for (const r of window) {
      expect(r.rec, `${r.d} recovery`).toBeLessThanOrEqual(30);
      expect(r.rr as number).toBeGreaterThan(base.rr + 1);
      expect(r.spo as number).toBeLessThanOrEqual(98);
    }
    // The episode ends: the days either side are back to normal.
    expect(recs[ILL_FIRST - 1].rr as number).toBeLessThan(base.rr + 2);
    expect(recs[ILL_LAST + 1].rr as number).toBeLessThan(base.rr + 2);
    expect(recs[ILL_LAST + 1].rec as number).toBeGreaterThan(30);
  });
});

describe('demoSummary', () => {
  it('counts days, weigh-ins and meal entries', () => {
    const recs = gen();
    const s = demoSummary(recs);
    expect(s.days).toBe(45);
    expect(s.weighIns).toBe(recs.filter((r) => typeof r.w === 'number').length);
    expect(s.meals).toBe(recs.reduce((a, r) => a + (r.meals?.length ?? 0), 0));
    expect(s.weighIns).toBeGreaterThanOrEqual(31);
    expect(s.meals).toBeGreaterThan(300);
    expect(demoSummary([])).toEqual({ days: 0, weighIns: 0, meals: 0 });
    expect(demoSummary([{ d: '2026-01-01', w: Number.NaN }])).toEqual({ days: 1, weighIns: 0, meals: 0 });
  });
});
