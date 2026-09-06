import { describe, expect, it } from 'vitest';
import { demoSummary, generateDemoData } from './seed';
import { DEFAULT_SETTINGS } from './defaults';
import type { AppSettings, DailyRecord, ISODate } from './types';
import { addDays, hhmmToMinutes, minutesSinceNoon, weekdayOf } from '../lib/dates';
import { mean } from '../lib/format';

const END: ISODate = '2026-09-06';
const gen = (end: ISODate = END, settings: AppSettings = DEFAULT_SETTINGS, days?: number) => generateDemoData(settings, end, days);

const isLift = (d: ISODate) => DEFAULT_SETTINGS.profile.split[weekdayOf(d)] !== 'rest';
const loggedBefore = (recs: DailyRecord[], end: ISODate) => recs.filter((r) => r.meals && r.d !== end);
/** Distinct eating times with a real meal (coffee is 2–3 kcal). */
const occasions = (r: DailyRecord) => new Set((r.meals ?? []).filter((m) => m.kc >= 50).map((m) => m.t)).size;

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
