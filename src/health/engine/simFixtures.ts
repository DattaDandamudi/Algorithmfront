/**
 * Seeded generators for the Phase 1 simulation tests — **test-only**.
 *
 * The engine's acceptance criteria are statistical ("forced red < 5% of
 * stationary days", "level RMSE < 0.6 lb after day 21", "a null behaviour is
 * confirmed in < 5% of 200 runs"), so every engine module is checked against
 * synthetic users whose truth we know. This module is the single source of
 * those users: one implementation, one set of conventions, so a sim that
 * fails points at the engine rather than at a fixture someone wrote twice.
 *
 * Rules, all enforced by construction:
 * - **Deterministic.** Everything draws from `data/prng.createRng(seed)`
 *   (mulberry32); the same seed always yields the same days. No `Math.random`.
 * - **Clock-free.** Every generator takes an explicit `end` date and a day
 *   count; nothing here reads `new Date()`, so a sim run at midnight produces
 *   the same fixture as one run at noon.
 * - **Well-formed records.** Output is `DailyRecord[]` / `Workout[]` exactly as
 *   the store would hold it: ascending by `d`, one record per day, optional
 *   fields simply absent when the simulated user did not log them.
 * - **Composable.** Generators each own a few fields; `mergeRecords` joins
 *   them by date, so "a lifter with a weight trajectory, HRV and check-ins" is
 *   three calls and a merge rather than a bespoke fixture.
 *
 * This file is imported only from `*.test.ts` / `*.sim.test.ts` and is
 * deliberately **not** re-exported from `engine/index.ts` — nothing in the app
 * bundle should be able to reach it.
 */
import type { DailyRecord, ISODate, SetEntry, Workout } from '../data/types';
import { createRng } from '../data/prng';
import { addDays, lastNDates, minutesToHHMM } from '../lib/dates';

/** Shared shape: `days` calendar days ending at `end` (inclusive). */
export interface SimWindow {
  seed: number;
  days: number;
  /** Last day of the window — always explicit; the engine never reads a clock. */
  end: ISODate;
}

/** One value per calendar day, ascending. */
export interface SimPoint {
  d: ISODate;
  v: number;
}

const round = (v: number, dp: number): number => {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
};

/**
 * Gaussian random walk / white noise around `mean` with an optional linear
 * drift. The generic building block: HRV, RHR and OSI sims use it directly
 * when they only need "a stationary metric with known parameters".
 */
export function gaussianSeries(opts: SimWindow & {
  mean: number;
  sd: number;
  /** Added to the mean each day (a trend the engine is supposed to find). */
  driftPerDay?: number;
  /** Fraction of days with no value at all. */
  skipProb?: number;
  dp?: number;
}): SimPoint[] {
  const rng = createRng(opts.seed);
  const drift = opts.driftPerDay ?? 0;
  const skip = opts.skipProb ?? 0;
  const dp = opts.dp ?? 2;
  const out: SimPoint[] = [];
  lastNDates(opts.end, opts.days).forEach((d, i) => {
    const v = rng.normal(opts.mean + drift * i, opts.sd);
    // Draw the skip after the value so the noise stream is independent of it.
    if (rng.chance(skip)) return;
    out.push({ d, v: round(v, dp) });
  });
  return out;
}

/**
 * A dieter's scale weight: a true linear trend plus daily noise, missed
 * weigh-ins, and multi-day water bumps.
 *
 * Phase 1a (Kalman) uses it for K1 (level RMSE < 0.6 lb after day 21, slope
 * within ±0.3 lb/wk at day 60, 90% band coverage 80–97%) and — with a single
 * `typoLb` day — for K2 (a 20-lb typo must move the level < 0.2 lb). Phase 1b
 * uses the same trajectory to check that a water bump never triggers a false
 * calorie cut. `lbPerWeek` is signed: negative = losing.
 */
export function weightTrajectory(opts: SimWindow & {
  startLb: number;
  lbPerWeek: number;
  /** Day-to-day scale noise, lb (0.9 is the measured real-world figure). */
  noiseSd?: number;
  /** Probability a day has no weigh-in at all. */
  skipProb?: number;
  /** Water retention: `{ every: 7, days: 3, lb: 2 }` adds a recurring bump. */
  waterBumps?: { every: number; days: number; lb: number };
  /** Index (0-based from the start of the window) of a fat-fingered entry. */
  typoDay?: number;
  typoLb?: number;
}): DailyRecord[] {
  const rng = createRng(opts.seed);
  const noise = opts.noiseSd ?? 0.9;
  const skip = opts.skipProb ?? 0;
  const bump = opts.waterBumps;
  const out: DailyRecord[] = [];
  lastNDates(opts.end, opts.days).forEach((d, i) => {
    const truth = opts.startLb + (opts.lbPerWeek / 7) * i;
    const water = bump && i % bump.every < bump.days ? bump.lb : 0;
    const w = rng.normal(truth + water, noise);
    const skipped = rng.chance(skip);
    if (i === opts.typoDay) out.push({ d, w: round(w + (opts.typoLb ?? 20), 1) });
    else if (!skipped) out.push({ d, w: round(w, 1) });
    else out.push({ d });
  });
  return out;
}

/**
 * HRV (`hrv`, rMSSD ms) and RHR (`rhr`, bpm) for one user, log-normal around
 * `meanMs` with a coefficient of variation — the shape real rMSSD has, and the
 * reason the engine works on ln rMSSD.
 *
 * Phase 1c uses the stationary form for the false-positive budget (forced red
 * < 5% of 340 days) and the `episode` form for detection latency (a −15%
 * episode must be flagged by day 4 and clear within 7). `episode.rhrDelta`
 * moves RHR the other way so the conjunctive illness rule in 1h fires too.
 */
export function hrvSeries(opts: SimWindow & {
  meanMs: number;
  /** Within-person CV of rMSSD, % (8–12 is typical). */
  cvPct?: number;
  rhrMean?: number;
  rhrSd?: number;
  /** A dip: `startDay` is 0-based from the start of the window. */
  episode?: { startDay: number; days: number; hrvPct: number; rhrDelta?: number };
  skipProb?: number;
}): DailyRecord[] {
  const rng = createRng(opts.seed);
  const sdLn = Math.log(1 + (opts.cvPct ?? 10) / 100);
  const ep = opts.episode;
  const out: DailyRecord[] = [];
  lastNDates(opts.end, opts.days).forEach((d, i) => {
    const inEp = !!ep && i >= ep.startDay && i < ep.startDay + ep.days;
    const mult = inEp ? 1 + ep.hrvPct / 100 : 1;
    const hrv = Math.exp(rng.normal(Math.log(opts.meanMs * mult), sdLn));
    const rhr = rng.normal((opts.rhrMean ?? 55) + (inEp ? (ep.rhrDelta ?? 0) : 0), opts.rhrSd ?? 2);
    if (rng.chance(opts.skipProb ?? 0)) out.push({ d });
    else out.push({ d, hrv: round(hrv, 1), rhr: Math.round(rhr) });
  });
  return out;
}

/**
 * Nights: hours slept (`slh`) plus the bed/wake clock times (`bt`/`wk`) the
 * regularity maths needs. `jitterMin` is the schedule's irregularity — Phase 1d
 * asserts SRI ≈ 100 at zero jitter and 70–90 at ±60 min, and that a single
 * 10-hour catch-up night cannot clear a week of debt.
 */
export function sleepNights(opts: SimWindow & {
  meanHrs: number;
  sdHrs?: number;
  /** Habitual bedtime, 'HH:MM' (may be after midnight). */
  bedTarget?: string;
  jitterMin?: number;
  /** Override specific days: index (0-based) → hours slept. */
  overrides?: Record<number, number>;
}): DailyRecord[] {
  const rng = createRng(opts.seed);
  const jitter = opts.jitterMin ?? 0;
  const bedMin = hhmm(opts.bedTarget ?? '23:00');
  const out: DailyRecord[] = [];
  lastNDates(opts.end, opts.days).forEach((d, i) => {
    const shift = jitter > 0 ? rng.normal(0, jitter / 2) : 0;
    const hrs = opts.overrides?.[i] ?? Math.max(2, rng.normal(opts.meanHrs, opts.sdHrs ?? 0.7));
    const bt = bedMin + shift;
    out.push({
      d,
      slh: round(hrs, 2),
      bt: minutesToHHMM(bt),
      wk: minutesToHHMM(bt + hrs * 60),
    });
  });
  return out;
}

function hhmm(t: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 23 * 60;
}

/**
 * Daily training load (`ld`) and session count (`wko`) for a lifter on a
 * `restProb` rest cadence, with an optional overload block.
 *
 * Phase 1e asserts ACWR settles at 1.00 ± 0.05 from day 35 on a constant load
 * and spikes within 4 days of a doubled week, and 1h's resilience model reads
 * the same series as its `Load(d)` input.
 */
export function loadDays(opts: SimWindow & {
  /** Mean load on a training day (Foster sRPE units: RPE × minutes). */
  meanLoad: number;
  sdLoad?: number;
  /** Chance a given day is a rest day (load 0). */
  restProb?: number;
  /** Overload block: multiply the load for `days` days from `startDay`. */
  spike?: { startDay: number; days: number; mult: number };
}): DailyRecord[] {
  const rng = createRng(opts.seed);
  const rest = opts.restProb ?? 3 / 7;
  const sp = opts.spike;
  const out: DailyRecord[] = [];
  lastNDates(opts.end, opts.days).forEach((d, i) => {
    const mult = sp && i >= sp.startDay && i < sp.startDay + sp.days ? sp.mult : 1;
    if (rng.chance(rest)) {
      out.push({ d, ld: 0, wko: 0 });
      return;
    }
    const load = Math.max(0, rng.normal(opts.meanLoad, opts.sdLoad ?? opts.meanLoad * 0.15));
    out.push({ d, ld: round(load * mult, 1), wko: 1 });
  });
  return out;
}

/**
 * A lifter's session history for one exercise: `sessionsPerWeek` strength
 * workouts, loads progressing at `gainPctPerWeek`, RPE drifting up as the load
 * does. Phase 1e uses it for e1RM trends, PR detection and `detectPlateau`
 * (set `gainPctPerWeek: 0` with `rpeDriftPerWeek > 0` to build a stalled
 * lifter the plateau rule must catch).
 */
export function strengthHistory(opts: SimWindow & {
  exerciseId: string;
  startKg: number;
  gainPctPerWeek: number;
  sets?: number;
  reps?: number;
  sessionsPerWeek?: number;
  rpeStart?: number;
  rpeDriftPerWeek?: number;
}): Workout[] {
  const rng = createRng(opts.seed);
  const perWeek = opts.sessionsPerWeek ?? 2;
  const nSets = opts.sets ?? 3;
  const reps = opts.reps ?? 8;
  const out: Workout[] = [];
  lastNDates(opts.end, opts.days).forEach((d, i) => {
    if (i % Math.round(7 / perWeek) !== 0) return;
    const weeks = i / 7;
    const kg = round(opts.startKg * (1 + (opts.gainPctPerWeek / 100) * weeks), 1);
    const rpe = Math.min(10, (opts.rpeStart ?? 8) + (opts.rpeDriftPerWeek ?? 0) * weeks);
    // RPE is logged in 0.5 steps, so the noise is rounded to the same grid.
    const sets: SetEntry[] = Array.from({ length: nSets }, () => ({
      w: kg,
      r: Math.max(1, Math.round(rng.normal(reps, 0.4))),
      rpe: Math.min(10, Math.max(6, Math.round((rpe + rng.normal(0, 0.25)) * 2) / 2)),
    }));
    out.push({
      id: `sim-${opts.seed}-${d}`,
      d,
      start: '18:00',
      durationMin: 60,
      kind: 'strength',
      source: 'demo',
      srpe: round(rpe - 1, 1),
      exercises: [{ exerciseId: opts.exerciseId, sets }],
    });
  });
  return out;
}

/**
 * Hooper check-ins (`qs`/`qf`/`qt`/`qo`, 1–7, 1 = best) on `logProb` of days.
 * Phase 1h asserts a check-in-only user (no wearable fields at all) still gets
 * a band, and that the DALDA "three consecutive days worse than normal" rule
 * fires exactly on the injected `worse` block and not before it.
 */
export function checkInSeries(opts: SimWindow & {
  /** Typical value for each item, 1–7. */
  mean?: number;
  sd?: number;
  logProb?: number;
  /** A rough patch: every item worsens by `delta` for `days` from `startDay`. */
  worse?: { startDay: number; days: number; delta: number };
}): DailyRecord[] {
  const rng = createRng(opts.seed);
  const mean = opts.mean ?? 3;
  const sd = opts.sd ?? 0.7;
  const w = opts.worse;
  const item = (m: number) => Math.min(7, Math.max(1, Math.round(rng.normal(m, sd))));
  const out: DailyRecord[] = [];
  lastNDates(opts.end, opts.days).forEach((d, i) => {
    if (!rng.chance(opts.logProb ?? 1)) {
      out.push({ d });
      return;
    }
    const m = w && i >= w.startDay && i < w.startDay + w.days ? mean + w.delta : mean;
    out.push({ d, qs: item(m), qf: item(m), qt: item(m), qo: item(m) });
  });
  return out;
}

/**
 * The overnight physiology the strain index and the illness flag read —
 * `hrv`, `rhr`, `rr`, `skt`, `spo` — with an optional illness episode that
 * moves all five the way an infection does (HRV −20%, RHR +6, RR +3 brpm,
 * skin temp +0.6 °C, SpO₂ −1.5%).
 *
 * Phase 1h asserts a stationary sleeper gets `major` strain ≤ 3% of days and
 * an illness flag ≤ 2%, and that a seeded episode is flagged by day 2 in ≥ 90%
 * of seeds and clears within 4 days of recovery.
 */
export function stressEpisode(opts: SimWindow & {
  hrvMean?: number;
  rhrMean?: number;
  rrMean?: number;
  sktMean?: number;
  spoMean?: number;
  /** 0-based index of the first ill day; omit for a stationary sleeper. */
  illnessStart?: number;
  illnessDays?: number;
}): DailyRecord[] {
  const rng = createRng(opts.seed);
  const start = opts.illnessStart ?? -1;
  const len = opts.illnessDays ?? 0;
  const out: DailyRecord[] = [];
  lastNDates(opts.end, opts.days).forEach((d, i) => {
    const ill = start >= 0 && i >= start && i < start + len;
    out.push({
      d,
      hrv: round(Math.exp(rng.normal(Math.log((opts.hrvMean ?? 60) * (ill ? 0.8 : 1)), 0.1)), 1),
      rhr: Math.round(rng.normal((opts.rhrMean ?? 55) + (ill ? 6 : 0), 2)),
      rr: round(rng.normal((opts.rrMean ?? 14.5) + (ill ? 3 : 0), 0.6), 1),
      skt: round(rng.normal((opts.sktMean ?? 33.5) + (ill ? 0.6 : 0), 0.2), 2),
      spo: round(rng.normal((opts.spoMean ?? 96) - (ill ? 1.5 : 0), 0.6), 1),
    });
  });
  return out;
}

/**
 * Run `fn` across `n` seeds and collect the results — the outer loop of every
 * simulation ("in ≥ 90% of seeds…"). Seeds are `seed0, seed0+1, …` so a
 * failing run is reproducible from the index the assertion prints. Keep
 * `n ≤ 40` and the window ≤ 200 days: the whole suite budget is < 5 s per sim.
 */
export function runSeeds<T>(n: number, fn: (seed: number, i: number) => T, seed0 = 1): T[] {
  const out: T[] = [];
  for (let i = 0; i < Math.max(0, Math.floor(n)); i++) out.push(fn(seed0 + i, i));
  return out;
}

/**
 * Join generators that each own different fields into one record per day,
 * ascending — `mergeRecords(weightTrajectory(...), hrvSeries(...))` is a user
 * who both weighs in and wears a strap. Later lists win field by field, and a
 * day present in only one list still appears.
 */
export function mergeRecords(...lists: DailyRecord[][]): DailyRecord[] {
  const byDate = new Map<ISODate, DailyRecord>();
  for (const list of lists) {
    for (const r of list) {
      const prev = byDate.get(r.d);
      byDate.set(r.d, prev ? { ...prev, ...r } : { ...r });
    }
  }
  return [...byDate.values()].sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
}

/** The date `n` days before `end` — sugar for asserting "by day 4 of the episode". */
export function simDay(end: ISODate, days: number, index: number): ISODate {
  return addDays(end, -(days - 1) + index);
}
