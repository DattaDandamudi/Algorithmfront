import { describe, expect, it } from 'vitest';
import type { DailyRecord, Exercise, Profile, SetEntry, Workout } from '../data/types';
import { DEFAULT_PROFILE } from '../data/defaults';
import { addDays, lastNDates } from '../lib/dates';
import {
  ACWR_LAMBDA,
  LOAD_NOTES,
  MUSCLE_FATIGUE_FULL,
  MUSCLE_HALF_LIFE_H,
  TAU_PRIOR,
  WHOOP_SCALE_PRIOR,
  acwrBandOf,
  acwrSeries,
  banisterSeries,
  dailyLoadSeries,
  estimateVo2max,
  fitBanisterTau,
  fitWhoopScale,
  formBandOf,
  fosterMonotony,
  loadChartSeries,
  maxHeartRate,
  muscleFatigueSeries,
  muscleReadiness,
  sessionLoad,
  trainingLoadSummary,
  weekOverWeekLoad,
  whoopStrainToLoad,
  type LoadPoint,
  type SessionLoadOpts,
} from './load';

const END = '2026-06-30';
const MALE: SessionLoadOpts = { profile: { age: 30, sex: 'male' } };
const FEMALE: SessionLoadOpts = { profile: { age: 30, sex: 'female' } };

function workout(patch: Partial<Workout> = {}): Workout {
  return {
    id: patch.id ?? 'w1',
    d: patch.d ?? END,
    start: patch.start ?? '18:00',
    durationMin: patch.durationMin ?? 60,
    kind: patch.kind ?? 'strength',
    source: patch.source ?? 'manual',
    ...patch,
  };
}

const sets = (n: number, s: SetEntry): SetEntry[] => Array.from({ length: n }, () => ({ ...s }));

const BENCH: Exercise = {
  id: 'bench-press',
  name: 'Bench Press',
  muscles: { primary: ['chest'], secondary: ['triceps', 'front-delts'] },
  pattern: 'push-h',
  equipment: 'barbell',
};
const lookup = (id: string): Exercise | undefined => (id === BENCH.id ? BENCH : undefined);

const profile = (patch: Partial<Profile> = {}): Profile => ({ ...DEFAULT_PROFILE, ...patch });

// ---------------------------------------------------------------------------
// sessionLoad
// ---------------------------------------------------------------------------

describe('sessionLoad — strength (Foster sRPE)', () => {
  it('uses the logged sRPE × minutes and keeps volume load as a cross-check', () => {
    const w = workout({
      srpe: 7,
      durationMin: 60,
      exercises: [{ exerciseId: 'bench-press', sets: sets(3, { w: 100, r: 5 }) }],
    });
    const out = sessionLoad(w, MALE);
    expect(out.load).toBe(420);
    expect(out.method).toBe('srpe');
    expect(out.srpe).toBe(7);
    expect(out.volumeKg).toBe(1500);
  });

  it('falls back to the mean working-set RPE', () => {
    const w = workout({
      durationMin: 60,
      exercises: [
        {
          exerciseId: 'bench-press',
          sets: [
            { w: 100, r: 5, rpe: 8 },
            { w: 100, r: 5, rpe: 8 },
            { w: 100, r: 5, rpe: 9 },
          ],
        },
      ],
    });
    const out = sessionLoad(w, MALE);
    expect(out.srpe).toBeCloseTo(8.33, 2);
    expect(out.load).toBeCloseTo(500, 0);
  });

  it('falls back to 10 − RIR when no RPE is logged', () => {
    const w = workout({
      durationMin: 45,
      exercises: [{ exerciseId: 'bench-press', sets: sets(3, { w: 60, r: 8, rir: 2 }) }],
    });
    const out = sessionLoad(w, MALE);
    expect(out.srpe).toBe(8);
    expect(out.load).toBe(360);
  });

  it('falls back to 7 when the session logged no effort at all', () => {
    const out = sessionLoad(workout({ durationMin: 50 }), MALE);
    expect(out.srpe).toBe(7);
    expect(out.load).toBe(350);
    expect(out.volumeKg).toBeNull();
  });

  it('excludes warm-ups and skipped sets from both effort and volume', () => {
    const w = workout({
      durationMin: 60,
      exercises: [
        {
          exerciseId: 'bench-press',
          sets: [
            { w: 40, r: 10, rpe: 4, k: 'wu' },
            { w: 100, r: 5, rpe: 8 },
            { w: 100, r: 5, rpe: 8, x: true },
          ],
        },
      ],
    });
    const out = sessionLoad(w, MALE);
    expect(out.srpe).toBe(8);
    expect(out.volumeKg).toBe(500);
  });

  it('returns method none (not NaN) for a zero-duration session', () => {
    const w = workout({ durationMin: 0, srpe: 8 });
    expect(sessionLoad(w, MALE)).toEqual({
      load: 0,
      method: 'none',
      volumeKg: null,
      srpe: null,
    });
  });
});

describe('sessionLoad — cardio', () => {
  it('prefers Edwards summated zones', () => {
    const w = workout({
      kind: 'cardio',
      durationMin: 50,
      cardio: { zoneMin: [0, 10, 20, 15, 5, 0], avgHr: 150 },
    });
    const out = sessionLoad(w, MALE);
    // 10·1 + 20·2 + 15·3 + 5·4 = 115
    expect(out.load).toBe(115);
    expect(out.method).toBe('edwards');
  });

  it('falls back to Banister TRIMP with the male weighting', () => {
    const w = workout({ kind: 'cardio', durationMin: 45, cardio: { avgHr: 150 } });
    const out = sessionLoad(w, MALE);
    // maxHr = 208 − 0.7·30 = 187, rest 60 → HRr = 90/127 = 0.70866
    // 45 · 0.70866 · 0.64·e^{1.92·0.70866} = 79.6
    expect(out.load).toBeCloseTo(79.6, 1);
    expect(out.method).toBe('trimp');
  });

  it('uses the female weighting for a female profile', () => {
    const w = workout({ kind: 'cardio', durationMin: 45, cardio: { avgHr: 150 } });
    const hrr = (150 - 60) / (208 - 0.7 * 30 - 60);
    const expected = 45 * hrr * 0.86 * Math.exp(1.67 * hrr);
    expect(sessionLoad(w, FEMALE).load).toBeCloseTo(expected, 1);
  });

  it('honours a measured max HR and the 28-day median RHR', () => {
    const w = workout({ kind: 'cardio', durationMin: 45, cardio: { avgHr: 150 } });
    const opts: SessionLoadOpts = {
      profile: { age: 30, sex: 'male', maxHrMeasured: 195 },
      restHr: 48,
    };
    const hrr = (150 - 48) / (195 - 48);
    const expected = 45 * hrr * 0.64 * Math.exp(1.92 * hrr);
    expect(sessionLoad(w, opts).load).toBeCloseTo(expected, 1);
  });

  it('falls back to duration × RPE 6 with no heart-rate data', () => {
    const out = sessionLoad(workout({ kind: 'cardio', durationMin: 40 }), MALE);
    expect(out.load).toBe(240);
    expect(out.method).toBe('duration');
    expect(out.srpe).toBe(6);
  });

  it('falls back to duration × RPE when avg HR is at or below resting', () => {
    const w = workout({ kind: 'cardio', durationMin: 40, cardio: { avgHr: 55 }, srpe: 4 });
    const out = sessionLoad(w, MALE);
    expect(out.load).toBe(160);
    expect(out.method).toBe('duration');
  });
});

describe('sessionLoad — mobility and sport', () => {
  it('discounts duration × RPE by 0.6', () => {
    const out = sessionLoad(workout({ kind: 'mobility', durationMin: 30, srpe: 5 }), MALE);
    expect(out.load).toBe(90);
    expect(out.method).toBe('duration');
  });

  it('defaults sport RPE to 6', () => {
    expect(sessionLoad(workout({ kind: 'sport', durationMin: 90 }), MALE).load).toBe(324);
  });
});

describe('maxHeartRate', () => {
  it('uses Tanaka when no measured max exists', () => {
    expect(maxHeartRate({ age: 40 })).toEqual({ maxHr: 180, estimated: true });
  });
  it('prefers a measured max', () => {
    expect(maxHeartRate({ age: 40, maxHrMeasured: 192 })).toEqual({
      maxHr: 192,
      estimated: false,
    });
  });
  it('returns null rather than NaN for a missing age', () => {
    expect(maxHeartRate({ age: NaN as unknown as number }).maxHr).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// WHOOP strain
// ---------------------------------------------------------------------------

describe('whoopStrainToLoad', () => {
  it('applies the 25 / 3.5 prior', () => {
    // 25·(2^(14/3.5) − 1) = 25·15 = 375
    expect(whoopStrainToLoad(14)).toBe(375);
    expect(whoopStrainToLoad(0)).toBe(0);
  });

  it('rejects strains outside WHOOP’s 0–21 scale', () => {
    expect(whoopStrainToLoad(21.5)).toBeNull();
    expect(whoopStrainToLoad(-1)).toBeNull();
    expect(whoopStrainToLoad(NaN)).toBeNull();
  });

  it('uses a fitted scale when one is supplied', () => {
    const fit = { a: 10, b: 3, n: 20, fitted: true, rmse: 12, note: '' };
    expect(whoopStrainToLoad(9, fit)).toBe(70); // 10·(2^3 − 1)
  });
});

describe('fitWhoopScale', () => {
  const opts = MALE;

  function whoopDays(n: number, a: number, b: number, strains: number[]) {
    const dates = lastNDates(END, n);
    const records: DailyRecord[] = [];
    const workouts: Workout[] = [];
    dates.forEach((d, i) => {
      const s = strains[i % strains.length];
      const load = a * (2 ** (s / b) - 1);
      records.push({ d, strn: s });
      // A strength session whose sRPE × minutes reproduces `load` exactly.
      workouts.push(workout({ id: `w${i}`, d, durationMin: load / 8, srpe: 8 }));
    });
    return { records, workouts };
  }

  it('recovers the generating constants from clean days', () => {
    const { records, workouts } = whoopDays(20, 30, 4, [8, 10, 12, 14, 16, 18, 11, 15]);
    const fit = fitWhoopScale(records, workouts, opts);
    expect(fit.fitted).toBe(true);
    expect(fit.n).toBe(20);
    expect(fit.a).toBeCloseTo(30, 0);
    expect(fit.b).toBeCloseTo(4, 1);
    expect(fit.rmse).toBeLessThan(1);
    expect(fit.note).toBe(LOAD_NOTES.whoopFitted);
  });

  it('returns the labelled prior below 8 usable days', () => {
    const { records, workouts } = whoopDays(7, 30, 4, [8, 12, 16]);
    const fit = fitWhoopScale(records, workouts, opts);
    expect(fit).toMatchObject({ ...WHOOP_SCALE_PRIOR, n: 7, fitted: false, rmse: null });
    expect(fit.note).toBe(LOAD_NOTES.whoopPrior);
  });

  it('refuses to fit when strain never varies (b is unidentified)', () => {
    const { records, workouts } = whoopDays(20, 30, 4, [12]);
    expect(fitWhoopScale(records, workouts, opts).fitted).toBe(false);
  });

  it('ignores days with a strain but no logged session', () => {
    const { records } = whoopDays(20, 30, 4, [8, 12, 16]);
    expect(fitWhoopScale(records, [], opts)).toMatchObject({ n: 0, fitted: false });
  });

  it('survives empty input', () => {
    expect(fitWhoopScale([], [], opts)).toMatchObject({ n: 0, fitted: false, a: 25, b: 3.5 });
  });
});

// ---------------------------------------------------------------------------
// Daily series
// ---------------------------------------------------------------------------

describe('dailyLoadSeries', () => {
  it('zero-fills rest days and marks the source', () => {
    const s = dailyLoadSeries(
      [],
      [workout({ d: addDays(END, -2), srpe: 6, durationMin: 60 })],
      END,
      { ...MALE, days: 5 },
    );
    expect(s.map((p) => p.load)).toEqual([0, 0, 360, 0, 0]);
    expect(s.map((p) => p.source)).toEqual(['none', 'none', 'logged', 'none', 'none']);
    expect(s[2].workouts).toBe(1);
    expect(s[s.length - 1].d).toBe(END);
  });

  it('fills days with no session from the WHOOP strain', () => {
    const s = dailyLoadSeries([{ d: END, strn: 14 }], [], END, { ...MALE, days: 2 });
    expect(s[1]).toMatchObject({ load: 375, source: 'whoop', workouts: 0 });
  });

  it('prefers logged work over a strain on the same day', () => {
    const s = dailyLoadSeries(
      [{ d: END, strn: 14 }],
      [workout({ d: END, srpe: 8, durationMin: 60 })],
      END,
      { ...MALE, days: 2 },
    );
    expect(s[1]).toMatchObject({ load: 480, source: 'logged' });
  });

  it('uses a stamped daily total when only the record carries load', () => {
    const s = dailyLoadSeries([{ d: END, ld: 300, wko: 1 }], [], END, { ...MALE, days: 2 });
    expect(s[1]).toMatchObject({ load: 300, source: 'logged', workouts: 1 });
  });

  it('drops future-dated and out-of-window entries, and sorts unsorted input', () => {
    const s = dailyLoadSeries(
      [
        { d: addDays(END, 3), strn: 18 },
        { d: addDays(END, -40), strn: 18 },
        { d: END, strn: 10 },
      ],
      [workout({ d: addDays(END, 1), srpe: 9, durationMin: 90 })],
      END,
      { ...MALE, days: 7 },
    );
    expect(s).toHaveLength(7);
    expect(s.filter((p) => p.load > 0)).toHaveLength(1);
    expect(s[6].source).toBe('whoop');
  });

  it('sums several sessions on one day', () => {
    const s = dailyLoadSeries(
      [],
      [
        workout({ id: 'a', d: END, srpe: 6, durationMin: 60 }),
        workout({ id: 'b', d: END, kind: 'cardio', durationMin: 30 }),
      ],
      END,
      { ...MALE, days: 1 },
    );
    expect(s[0]).toMatchObject({ load: 360 + 180, workouts: 2, source: 'logged' });
  });

  it('falls back to a stamped workout load it cannot recompute', () => {
    const s = dailyLoadSeries(
      [],
      [workout({ d: END, durationMin: 0, load: 210, source: 'whoop' })],
      END,
      { ...MALE, days: 1 },
    );
    expect(s[0].load).toBe(210);
  });

  it('returns an empty-but-well-formed series with no data at all', () => {
    const s = dailyLoadSeries([], [], END, { ...MALE, days: 3 });
    expect(s).toHaveLength(3);
    expect(s.every((p) => p.load === 0 && p.source === 'none')).toBe(true);
  });
});

const flat = (n: number, load: number, end = END): LoadPoint[] =>
  lastNDates(end, n).map((d) => ({
    d,
    load,
    source: load > 0 ? ('logged' as const) : ('none' as const),
    workouts: load > 0 ? 1 : 0,
  }));

describe('banisterSeries', () => {
  it('applies one impulse with the 42/7 priors', () => {
    const s = banisterSeries([{ d: END, load: 100, source: 'logged', workouts: 1 }]);
    expect(s[0].fitness).toBeCloseTo(100 * (1 - Math.exp(-1 / TAU_PRIOR.tau1)), 1);
    expect(s[0].fatigue).toBeCloseTo(100 * (1 - Math.exp(-1 / TAU_PRIOR.tau2)), 1);
    expect(s[0].form).toBeCloseTo(2.35 - 13.31, 1);
    expect(s[0].formBand).toBeNull(); // one day is not enough history
  });

  it('converges on the constant load and reports a neutral form', () => {
    const s = banisterSeries(flat(200, 400));
    const last = s[s.length - 1];
    expect(last.fitness).toBeGreaterThan(380);
    expect(Math.abs(last.form)).toBeLessThan(20);
    expect(last.formBand).toBe('neutral');
  });

  it('bands a taper as fresh and a doubled block as overreached', () => {
    const base = flat(120, 400);
    const taper: LoadPoint[] = base.map((p, i) => (i >= 110 ? { ...p, load: 0 } : p));
    expect(banisterSeries(taper)[119].formBand).toBe('fresh');
    const surge: LoadPoint[] = base.map((p, i) => (i >= 110 ? { ...p, load: 1200 } : p));
    expect(banisterSeries(surge)[119].formBand).toBe('overreached');
  });

  it('honours a fitted tau', () => {
    const fitted = { tau1: 50, tau2: 5, fitted: true, n: 120 };
    const a = banisterSeries(flat(30, 400));
    const b = banisterSeries(flat(30, 400), fitted);
    expect(b[29].fitness).not.toBeCloseTo(a[29].fitness, 1);
  });

  it('is empty for an empty series', () => {
    expect(banisterSeries([])).toEqual([]);
  });
});

describe('formBandOf', () => {
  it('bands at the plan’s cut points', () => {
    expect(formBandOf(100, 6)).toBe('fresh');
    expect(formBandOf(100, 5)).toBe('neutral');
    expect(formBandOf(100, -9.9)).toBe('neutral');
    expect(formBandOf(100, -10)).toBe('productive');
    expect(formBandOf(100, -30)).toBe('productive');
    expect(formBandOf(100, -30.1)).toBe('overreached');
    expect(formBandOf(0, -5)).toBeNull();
  });
});

describe('acwrSeries', () => {
  it('uses the Williams EWMA constants', () => {
    expect(ACWR_LAMBDA.acute).toBeCloseTo(0.25, 10);
    expect(ACWR_LAMBDA.chronic).toBeCloseTo(2 / 29, 10);
  });

  it('is null until 28 days and 1.00 on a constant load', () => {
    const s = acwrSeries(flat(40, 300));
    expect(s[26].acwr).toBeNull();
    expect(s[27].acwr).toBeCloseTo(1, 3);
    expect(s[39].acwr).toBeCloseTo(1, 3);
    expect(s[39].band).toBe('sweet');
  });

  it('rises when the load doubles', () => {
    const days = flat(60, 300).map((p, i) => (i >= 50 ? { ...p, load: 600 } : p));
    const s = acwrSeries(days);
    expect(s[49].acwr).toBeCloseTo(1, 3);
    expect((s[54].acwr ?? 0)).toBeGreaterThan(1.3);
  });

  it('bands at the plan’s cut points', () => {
    expect(acwrBandOf(0.79)).toBe('low');
    expect(acwrBandOf(0.8)).toBe('sweet');
    expect(acwrBandOf(1.3)).toBe('sweet');
    expect(acwrBandOf(1.31)).toBe('high');
    expect(acwrBandOf(1.5)).toBe('high');
    expect(acwrBandOf(1.51)).toBe('spike');
    expect(acwrBandOf(null)).toBeNull();
  });

  it('is empty for an empty series', () => {
    expect(acwrSeries([])).toEqual([]);
  });
});

describe('weekOverWeekLoad', () => {
  it('compares the two 7-day totals and flags the soft cap', () => {
    const days = flat(14, 100).map((p, i) => (i >= 7 ? { ...p, load: 120 } : p));
    const out = weekOverWeekLoad(days, END);
    expect(out.thisWeek).toBe(840);
    expect(out.lastWeek).toBe(700);
    expect(out.pct).toBe(20);
    expect(out.exceedsSoftCap).toBe(true);
  });

  it('does not flag a +10% week (the line is soft and inclusive)', () => {
    const days = flat(14, 100).map((p, i) => (i >= 7 ? { ...p, load: 110 } : p));
    expect(weekOverWeekLoad(days, END).exceedsSoftCap).toBe(false);
  });

  it('returns null rather than dividing by a zero week', () => {
    const days = flat(14, 0).map((p, i) => (i >= 7 ? { ...p, load: 100 } : p));
    expect(weekOverWeekLoad(days, END)).toMatchObject({ pct: null, exceedsSoftCap: false });
  });

  it('handles an empty series', () => {
    expect(weekOverWeekLoad([], END)).toEqual({
      thisWeek: 0,
      lastWeek: 0,
      pct: null,
      exceedsSoftCap: false,
    });
  });
});

describe('fosterMonotony', () => {
  it('computes monotony and strain over the last 7 days', () => {
    const loads = [100, 200, 0, 150, 0, 300, 50];
    const days: LoadPoint[] = lastNDates(END, 7).map((d, i) => ({
      d,
      load: loads[i],
      source: 'logged',
      workouts: 1,
    }));
    const out = fosterMonotony(days, END);
    expect(out.weeklyLoad).toBe(800);
    expect(out.monotony).toBe(1.03);
    expect(out.strain).toBe(824);
    expect(out.descriptiveOnly).toBe(true);
  });

  it('returns null (not Infinity) for a perfectly even week', () => {
    expect(fosterMonotony(flat(7, 300), END)).toMatchObject({ monotony: null, strain: null });
  });
});

describe('fitBanisterTau', () => {
  it('returns the labelled prior below 12 weeks of load', () => {
    const fit = fitBanisterTau(flat(83, 400));
    expect(fit).toMatchObject({ ...TAU_PRIOR, fitted: false, n: 83 });
    expect(fit.note).toBe(LOAD_NOTES.tauPrior);
  });

  it('keeps the prior when form explains nothing about the next session', () => {
    // A perfectly constant lifter: no information about tau at all.
    expect(fitBanisterTau(flat(140, 400)).fitted).toBe(false);
  });

  it('never returns a tau outside the searched grid', () => {
    const fit = fitBanisterTau(flat(140, 400));
    expect(fit.tau1).toBeGreaterThanOrEqual(30);
    expect(fit.tau1).toBeLessThanOrEqual(60);
    expect(fit.tau2).toBeGreaterThanOrEqual(4);
    expect(fit.tau2).toBeLessThanOrEqual(12);
  });

  it('survives an empty series', () => {
    expect(fitBanisterTau([])).toMatchObject({ fitted: false, n: 0, tau1: 42, tau2: 7 });
  });

  it('fits a form-driven lifter and reports what the fit saw', () => {
    // A deterministic self-regulating athlete: load = 450 + 0.8·form on five
    // days a week. `load.sim.test.ts` measures how close the τ actually land.
    const k1 = 1 - Math.exp(-1 / 42);
    const k2 = 1 - Math.exp(-1 / 7);
    let fitness = 0;
    let fatigue = 0;
    const loads: number[] = [];
    for (let i = 0; i < 120; i++) {
      const rest = i % 7 === 3 || i % 7 === 6;
      const load = rest ? 0 : Math.max(60, 450 + 0.8 * (fitness - fatigue));
      fitness += (load - fitness) * k1;
      fatigue += (load - fatigue) * k2;
      loads.push(load);
    }
    const days: LoadPoint[] = lastNDates(END, 120).map((d, i) => ({
      d,
      load: loads[i],
      source: loads[i] > 0 ? 'logged' : 'none',
      workouts: loads[i] > 0 ? 1 : 0,
    }));
    const fit = fitBanisterTau(days);
    expect(fit.fitted).toBe(true);
    expect(fit.n).toBe(120);
    expect(fit.scored).toBeGreaterThan(50);
    expect(fit.r2).toBeGreaterThan(0.5);
    expect(fit.note).toBe(LOAD_NOTES.tauFitted);
    expect(Math.abs(fit.tau1 - 42) / 42).toBeLessThanOrEqual(0.2);
    expect(Math.abs(fit.tau2 - 7) / 7).toBeLessThanOrEqual(0.2);
  });
});

// ---------------------------------------------------------------------------
// Summary and chart
// ---------------------------------------------------------------------------

describe('trainingLoadSummary', () => {
  it('assembles a block a screen can render without guarding', () => {
    const records: DailyRecord[] = lastNDates(END, 60).map((d) => ({ d }));
    const workouts = lastNDates(END, 60)
      .filter((_, i) => i % 2 === 0)
      .map((d, i) => workout({ id: `w${i}`, d, srpe: 7, durationMin: 60 }));
    const out = trainingLoadSummary(records, workouts, END, MALE);
    expect(out.today).toBe(0); // day 60 is odd-indexed → a rest day
    expect(out.weeklyLoad).toBe(420 * 3);
    expect(out.acwr).not.toBeNull();
    expect(out.acwrBand).toBe('sweet');
    expect(out.source).toBe('logged');
    expect(out.tauIsPrior).toBe(true);
    expect(out.fitness).toBeGreaterThan(0);
    expect(out.monotony).not.toBeNull();
    expect(Number.isNaN(out.form)).toBe(false);
  });

  it('reports mixed when WHOOP filled some days', () => {
    const records: DailyRecord[] = lastNDates(END, 30).map((d, i) => ({
      d,
      ...(i % 3 === 0 ? { strn: 12 } : {}),
    }));
    const workouts = [workout({ d: END, srpe: 7, durationMin: 60 })];
    expect(trainingLoadSummary(records, workouts, END, MALE).source).toBe('mixed');
  });

  it('returns zeros and nulls, never NaN, with no data', () => {
    const out = trainingLoadSummary([], [], END, MALE);
    expect(out).toMatchObject({
      today: 0,
      acwr: null,
      acwrBand: null,
      weekOverWeekPct: null,
      formBand: null,
      monotony: null,
      source: 'none',
      tauIsPrior: true,
    });
    expect(Number.isNaN(out.fitness)).toBe(false);
  });
});

describe('loadChartSeries', () => {
  it('joins the three series on the date and trims to the window', () => {
    const loads = flat(40, 300);
    const rows = loadChartSeries(loads, banisterSeries(loads), acwrSeries(loads), END, 10);
    expect(rows).toHaveLength(10);
    expect(rows[9].d).toBe(END);
    expect(rows[9].acwr).toBeCloseTo(1, 3);
    expect(rows[9].fitness).toBeGreaterThan(0);
  });

  it('tolerates missing banister/acwr rows', () => {
    const rows = loadChartSeries(flat(3, 100), [], [], END, 3);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ acute: 0, chronic: 0, acwr: null, fitness: 0 });
  });
});

// ---------------------------------------------------------------------------
// VO₂max
// ---------------------------------------------------------------------------

function run(d: string, km: number, min: number, hr: number): Workout {
  return workout({ id: `r${d}`, d, kind: 'cardio', durationMin: min, cardio: { sport: 'run', distanceKm: km, avgHr: hr } });
}

describe('estimateVo2max', () => {
  const rhr50: DailyRecord[] = lastNDates(END, 28).map((d) => ({ d, rhr: 50 }));

  it('is suppressed entirely with an age-estimated HRmax and < 8 runs', () => {
    const runs = lastNDates(END, 7).map((d) => run(d, 8, 40, 150));
    const out = estimateVo2max(runs, profile({ age: 30 }), rhr50, END);
    expect(out.value).toBeNull();
    expect(out.lo).toBeNull();
    expect(out.nRuns).toBe(7);
    expect(out.hrMaxEstimated).toBe(true);
    expect(out.method).toMatch(/7 runs/);
  });

  it('publishes Uth–Sørensen alone when HRmax is measured', () => {
    const out = estimateVo2max([], profile({ maxHrMeasured: 190 }), rhr50, END);
    // 14.5 × 190/50 = 55.1
    expect(out.value).toBeCloseTo(55.1, 1);
    expect(out.uthSorensen).toBeCloseTo(55.1, 1);
    expect(out.regression).toBeNull();
    expect(out.hrMaxEstimated).toBe(false);
    expect(out.method).toMatch(/Uth/);
  });

  it('uses the female coefficient', () => {
    const out = estimateVo2max([], profile({ sex: 'female', maxHrMeasured: 190 }), rhr50, END);
    expect(out.value).toBeCloseTo(15.3 * (190 / 50), 1);
  });

  it('regresses speed on HR fraction and publishes a ±3.5 band', () => {
    // Truth: HRmax 190, HRrest 50, VO₂max 55.1 (so both arms agree).
    const truth = 55.1;
    const runs = lastNDates(END, 8).map((d, i) => {
      const frac = 0.72 + i * 0.02; // 0.72 … 0.86
      const hr = frac * 190;
      const vo2 = 3.5 + ((hr - 50) / (190 - 50)) * (truth - 3.5);
      const mPerMin = (vo2 - 3.5) / 0.2;
      const min = 40;
      return run(d, (mPerMin * min) / 1000, min, hr);
    });
    const out = estimateVo2max(runs, profile({ maxHrMeasured: 190 }), rhr50, END);
    expect(out.regression).toBeCloseTo(truth, 0);
    expect(out.value).toBeCloseTo(truth, 0);
    expect(out.hi! - out.lo!).toBeCloseTo(7, 5);
    expect(out.nRuns).toBe(8);
    expect(out.method).toMatch(/regression/);
  });

  it('ignores runs outside the 70–90% HR window and non-runs', () => {
    const runs = [
      ...lastNDates(END, 4).map((d) => run(d, 8, 40, 120)), // 63% of 190 — too easy
      ...lastNDates(addDays(END, -10), 4).map((d) => run(d, 8, 30, 180)), // 95% — too hard
      workout({ id: 'ride', d: END, kind: 'cardio', durationMin: 60, cardio: { sport: 'cycle', distanceKm: 30, avgHr: 145 } }),
    ];
    const out = estimateVo2max(runs, profile({ age: 30 }), rhr50, END);
    expect(out.nRuns).toBe(0);
    expect(out.value).toBeNull();
  });

  it('has no number to publish when there is no RHR and no usable runs', () => {
    const out = estimateVo2max([], profile({ maxHrMeasured: 190 }), [], END);
    expect(out.value).toBeNull();
    expect(out.method).toMatch(/resting heart rate/);
  });

  it('never returns NaN for an empty history', () => {
    const out = estimateVo2max([], profile(), [], END);
    expect(out.value).toBeNull();
    expect(out.nRuns).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Per-muscle recovery
// ---------------------------------------------------------------------------

describe('muscleReadiness', () => {
  const bench = (d: string, n = 4, rpe = 8): Workout =>
    workout({
      id: `b${d}`,
      d,
      start: '18:00',
      kind: 'strength',
      exercises: [{ exerciseId: 'bench-press', sets: sets(n, { w: 80, r: 8, rpe }) }],
    });

  it('reports every muscle rested when nothing is attributed', () => {
    const out = muscleReadiness([bench(END)], END); // no lookup injected
    expect(out).toHaveLength(15);
    expect(out.every((m) => m.pct === 100 && m.hoursSince === null)).toBe(true);
  });

  it('splits stimulus 1.0 primary / 0.5 secondary', () => {
    const out = muscleReadiness([bench(END)], END, { lookup, atHour: 18 });
    const chest = out.find((m) => m.muscle === 'chest')!;
    const triceps = out.find((m) => m.muscle === 'triceps')!;
    // 4 sets × (8 − 4)/6 = 2.667 units → 100·(1 − 2.667/6) = 55.6%
    expect(chest.pct).toBe(56);
    expect(chest.hoursSince).toBe(0);
    expect(triceps.pct).toBe(78);
    expect(out.find((m) => m.muscle === 'back')!.pct).toBe(100);
  });

  it('recovers on a 60 h half-life', () => {
    const now = muscleReadiness([bench(END)], END, { lookup, atHour: 18 });
    const later = muscleReadiness([bench(addDays(END, -3))], END, { lookup, atHour: 18 });
    const chestNow = 100 - now.find((m) => m.muscle === 'chest')!.pct;
    const chestLater = 100 - later.find((m) => m.muscle === 'chest')!.pct;
    // 72 h ≈ 1.2 half-lives → 2^-1.2 = 0.435 of the deficit remains
    expect(chestLater / chestNow).toBeCloseTo(2 ** (-72 / MUSCLE_HALF_LIFE_H), 1);
    expect(later.find((m) => m.muscle === 'chest')!.hoursSince).toBe(72);
  });

  it('crosses back above 60% around 48 h after a hard six-set session', () => {
    const six = (d: string) => bench(d, 6, 8);
    const at24 = muscleReadiness([six(addDays(END, -1))], END, { lookup, atHour: 18 });
    const at48 = muscleReadiness([six(addDays(END, -2))], END, { lookup, atHour: 18 });
    expect(at24.find((m) => m.muscle === 'chest')!.pct).toBeLessThan(60);
    expect(at48.find((m) => m.muscle === 'chest')!.pct).toBeGreaterThanOrEqual(60);
  });

  it('weights sets by proximity to failure', () => {
    const hard = muscleReadiness([bench(END, 4, 10)], END, { lookup, atHour: 18 });
    const easy = muscleReadiness([bench(END, 4, 6)], END, { lookup, atHour: 18 });
    expect(hard.find((m) => m.muscle === 'chest')!.pct).toBeLessThan(
      easy.find((m) => m.muscle === 'chest')!.pct,
    );
    // RPE 10 → 4 × 1.0 = 4 units → 100·(1 − 4/6) = 33%
    expect(hard.find((m) => m.muscle === 'chest')!.pct).toBe(33);
  });

  it('accumulates across sessions and clamps at 0', () => {
    const many = lastNDates(END, 3).map((d) => bench(d, 10, 10));
    const out = muscleReadiness(many, END, { lookup, atHour: 18 });
    expect(out.find((m) => m.muscle === 'chest')!.pct).toBe(0);
    expect(MUSCLE_FATIGUE_FULL).toBe(6);
  });

  it('ignores warm-ups, skipped sets and unknown exercises', () => {
    const w = workout({
      d: END,
      exercises: [
        { exerciseId: 'bench-press', sets: [{ w: 40, r: 10, rpe: 5, k: 'wu' }, { w: 80, r: 8, rpe: 9, x: true }] },
        { exerciseId: 'mystery-lift', sets: sets(5, { w: 50, r: 10, rpe: 9 }) },
      ],
    });
    const out = muscleReadiness([w], END, { lookup, atHour: 18 });
    expect(out.every((m) => m.pct === 100)).toBe(true);
  });

  it('resolves custom exercises ahead of the injected library', () => {
    const custom: Exercise = {
      id: 'bench-press',
      name: 'My Bench',
      muscles: { primary: ['back'], secondary: [] },
      pattern: 'push-h',
      equipment: 'barbell',
      custom: true,
    };
    const out = muscleReadiness([bench(END)], END, { lookup, custom: [custom], atHour: 18 });
    expect(out.find((m) => m.muscle === 'back')!.pct).toBe(56);
    expect(out.find((m) => m.muscle === 'chest')!.pct).toBe(100);
  });

  it('ignores sessions outside the window and in the future', () => {
    const out = muscleReadiness(
      [bench(addDays(END, -30)), bench(addDays(END, 2))],
      END,
      { lookup, atHour: 18 },
    );
    expect(out.every((m) => m.pct === 100 && m.hoursSince === null)).toBe(true);
  });

  it('exposes the heuristic label for the caption', () => {
    expect(LOAD_NOTES.muscleRecovery).toMatch(/not a vendor formula/);
    expect(LOAD_NOTES.acwrDescriptive).toMatch(/Impellizzeri 2020/);
  });
});

describe('muscleFatigueSeries', () => {
  it('walks a day-indexed series that decays after the session', () => {
    const w = workout({
      d: addDays(END, -2),
      start: '12:00',
      exercises: [{ exerciseId: 'bench-press', sets: sets(4, { w: 80, r: 8, rpe: 8 }) }],
    });
    const s = muscleFatigueSeries([w], END, { lookup, days: 5, atHour: 12 });
    expect(s).toHaveLength(5);
    expect(s.map((p) => p.d)).toEqual(lastNDates(END, 5));
    expect(s[1].fatigue.chest).toBe(0); // before the session
    expect(s[2].fatigue.chest).toBeCloseTo(2.667, 2);
    expect(s[3].fatigue.chest).toBeCloseTo(2.667 * 2 ** (-24 / 60), 2);
    expect(s[4].fatigue.chest).toBeCloseTo(2.667 * 2 ** (-48 / 60), 2);
    expect(Object.keys(s[0].fatigue)).toHaveLength(15);
  });

  it('is all zeros with no workouts', () => {
    const s = muscleFatigueSeries([], END, { days: 3 });
    expect(s).toHaveLength(3);
    expect(s.every((p) => Object.values(p.fatigue).every((v) => v === 0))).toBe(true);
  });
});
