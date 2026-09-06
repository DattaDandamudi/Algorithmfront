import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE } from '../data/defaults';
import type { DailyRecord, ISODate } from '../data/types';
import { addDays } from '../lib/dates';
import { hrvStatus } from './hrv';
import { logistic } from './stats';
import {
  BAND_THRESHOLDS,
  READINESS_BASELINE_SCORE,
  READINESS_INTERCEPT,
  READINESS_K,
  READINESS_WEIGHTS,
  SLEEP3_WEIGHTS,
  SLEEP_Z_HOURS,
  TRAINING_COPY,
  VERDICT_COPY,
  WHOOP_RAMP_DAYS,
  Z_CLAMP,
  bandOf,
  capAtYellow,
  downgrade,
  hooperMean,
  ownScore,
  readiness,
  sleep3,
  whoopCoverage,
} from './readiness';

const ASOF = '2026-09-06';
const MU = Math.log(60);
const N = 98;
const P = DEFAULT_PROFILE; // age 26, sleepBaselineHrs 7.75
/** Zero-sum 7-day cycle so the trailing 7-day ln mean is exactly μ. */
const CYCLE = [0.04, -0.04, 0.02, -0.02, 0.06, -0.06, 0];
/** −1 / 0 / +1 keyed so index 97 (= ASOF) always lands on 0. */
const WOBBLE = (i: number): number => [-1, 0, 1][i % 3];

/**
 * A stationary user with all five inputs, arranged so every z is exactly 0 on
 * ASOF: HRV on its zero-sum cycle, RHR and Hooper wobbling around their own
 * medians, sleep exactly at need and load flat.
 */
function build(patch: (i: number, d: ISODate) => Partial<DailyRecord> = () => ({})): DailyRecord[] {
  return Array.from({ length: N }, (_, i) => {
    const d = addDays(ASOF, -(N - 1 - i));
    const base: DailyRecord = {
      d,
      hrv: Math.exp(MU + CYCLE[i % 7]),
      // RHR anti-correlated with HRV — the healthy coupling the saturation guard looks for.
      rhr: 52 - Math.round(50 * CYCLE[i % 7]),
      slh: P.sleepBaselineHrs,
      ld: 300,
      qs: 3 + WOBBLE(i),
      qf: 3 + WOBBLE(i),
      qt: 3 + WOBBLE(i),
      qo: 3 + WOBBLE(i),
    };
    return { ...base, ...patch(i, d) };
  });
}

const today = (patch: Partial<DailyRecord>) => (i: number) => (i === N - 1 ? patch : {});
/** Shift the current week's HRV so the banded 7-day mean sits at μ + dev. */
const shiftWeek = (dev: number) => (i: number): Partial<DailyRecord> =>
  i >= N - 7 ? { hrv: Math.exp(MU + CYCLE[i % 7] + dev) } : {};

const scoreOf = (x: number): number => 100 * logistic(x, READINESS_K);

describe('bands and steps', () => {
  it('bands 67/34 like WHOOP', () => {
    expect(BAND_THRESHOLDS).toEqual({ green: 67, yellow: 34 });
    expect(bandOf(100)).toBe('green');
    expect(bandOf(67)).toBe('green');
    expect(bandOf(66)).toBe('yellow');
    expect(bandOf(34)).toBe('yellow');
    expect(bandOf(33)).toBe('red');
    expect(bandOf(null)).toBe('neutral');
    expect(bandOf(Number.NaN)).toBe('neutral');
  });

  it('downgrades one step and caps at yellow, never past red', () => {
    expect(downgrade('green')).toBe('yellow');
    expect(downgrade('yellow')).toBe('red');
    expect(downgrade('red')).toBe('red');
    expect(downgrade('neutral')).toBe('neutral');
    expect(capAtYellow('green')).toBe('yellow');
    expect(capAtYellow('yellow')).toBe('yellow');
    expect(capAtYellow('red')).toBe('red');
  });
});

describe('own score — the model', () => {
  it('reads READINESS_BASELINE_SCORE when every input sits on its own reference', () => {
    const r = readiness(build(), ASOF, P);
    expect(r.score).toBe(READINESS_BASELINE_SCORE);
    expect(r.band).toBe('yellow');
    expect(r.source).toBe('hrv');
    expect(r.training).toBe(TRAINING_COPY.yellow);
    expect(r.calibrating).toBeUndefined();
    expect(r.contributors?.map((c) => c.key)).toEqual(['hrv', 'rhr', 'sleep', 'load', 'subj']);
    for (const c of r.contributors ?? []) {
      expect(c.z).toBe(0);
      expect(c.points).toBe(0);
      expect(c.effect).toBe('flat');
    }
    expect(r.confidence?.nInputs).toBe(5);
    expect(READINESS_INTERCEPT).toBeCloseTo(Math.log(55 / 45) / READINESS_K, 12);
  });

  it('exports the weights and k the plan fixes, and clamps every z to ±3', () => {
    expect(READINESS_WEIGHTS).toEqual({ hrv: 0.4, rhr: -0.22, sleep: 0.18, load: -0.1, subj: 0.1 });
    expect(READINESS_K).toBe(1.1);
    expect(Z_CLAMP).toBe(3);
    // RHR 20 bpm above a 1.48 bpm robust SD is a z of 13; it must arrive as 3.
    const r = readiness(build(today({ rhr: 72 })), ASOF, P);
    const rhrRow = r.contributors?.find((c) => c.key === 'rhr');
    expect(rhrRow?.z).toBe(Z_CLAMP);
    expect(r.score).toBe(Math.round(scoreOf(READINESS_INTERCEPT + READINESS_WEIGHTS.rhr * 3)));
  });

  it('moves each input in the documented direction', () => {
    const neutral = readiness(build(), ASOF, P).score as number;
    const worseRhr = readiness(build(today({ rhr: 56 })), ASOF, P).score as number;
    const betterRhr = readiness(build(today({ rhr: 48 })), ASOF, P).score as number;
    const shortSleep = readiness(build(today({ slh: 6 })), ASOF, P).score as number;
    const longSleep = readiness(build(today({ slh: 9 })), ASOF, P).score as number;
    const hardYesterday = readiness(
      build((i) => (i === N - 2 ? { ld: 900 } : {})),
      ASOF,
      P,
    ).score as number;
    const roughCheckIn = readiness(build(today({ qs: 6, qf: 6, qt: 6, qo: 6 })), ASOF, P)
      .score as number;
    const goodCheckIn = readiness(build(today({ qs: 1, qf: 1, qt: 1, qo: 1 })), ASOF, P)
      .score as number;
    const lowWeek = readiness(build(shiftWeek(-0.05)), ASOF, P).score as number;
    const highWeek = readiness(build(shiftWeek(0.05)), ASOF, P).score as number;

    expect(worseRhr).toBeLessThan(neutral);
    expect(betterRhr).toBeGreaterThan(neutral);
    expect(shortSleep).toBeLessThan(neutral);
    expect(longSleep).toBeGreaterThan(neutral);
    expect(hardYesterday).toBeLessThan(neutral);
    expect(roughCheckIn).toBeLessThan(neutral);
    expect(goodCheckIn).toBeGreaterThan(neutral);
    expect(lowWeek).toBeLessThan(neutral);
    expect(highWeek).toBeGreaterThan(neutral);
  });

  it('scores a missing input as z = 0 and widens the confidence band instead', () => {
    const all = readiness(build(), ASOF, P);
    const noHrv = readiness(
      build().map((r) => ({ ...r, hrv: undefined })),
      ASOF,
      P,
    );
    expect(all.score).toBe(noHrv.score); // z = 0 either way — no opinion, not a penalty
    expect(all.confidence?.nInputs).toBe(5);
    expect(noHrv.confidence?.nInputs).toBe(4);
    const width = (c?: { lo: number; hi: number }) => (c ? c.hi - c.lo : 0);
    expect(width(noHrv.confidence)).toBeGreaterThan(width(all.confidence));
    expect(noHrv.contributors?.find((c) => c.key === 'hrv')).toMatchObject({
      z: null,
      points: 0,
      effect: 'flat',
    });
  });

  it('fills contributors with signed points that name the mover', () => {
    const r = readiness(build(today({ rhr: 57, slh: 5.5 })), ASOF, P);
    const rows = Object.fromEntries((r.contributors ?? []).map((c) => [c.key, c]));
    expect(rows.rhr.effect).toBe('down');
    expect(rows.rhr.points).toBeLessThan(0);
    expect(rows.sleep.effect).toBe('down');
    expect(rows.sleep.points).toBeLessThan(0);
    expect(rows.hrv.effect).toBe('flat');
    expect(rows.rhr.weight).toBe(READINESS_WEIGHTS.rhr);
    expect(rows.sleep.value).toBe(5.5);
    expect(r.score as number).toBeLessThan(READINESS_BASELINE_SCORE);
  });

  it('ownScore is the un-blended model, exported for the ramp', () => {
    const recs = build();
    const o = ownScore(recs, ASOF, P, hrvStatus(recs, ASOF, { age: P.age }));
    expect(o.score).toBeCloseTo(READINESS_BASELINE_SCORE, 9);
    expect(o.x).toBeCloseTo(READINESS_INTERCEPT, 12);
    expect(o.nInputs).toBe(5);
    expect(o.halfWidth).toBeGreaterThan(0);
    expect(ownScore([], ASOF, P, hrvStatus([], ASOF)).score).toBeNull();
  });
});

describe('sleep3 — Garmin-style 3-night history', () => {
  it('weights the last three nights 0.5 / 0.3 / 0.2 against need', () => {
    expect(SLEEP3_WEIGHTS).toEqual([0.5, 0.3, 0.2]);
    const recs: DailyRecord[] = [
      { d: addDays(ASOF, -2), slh: 6.75 }, // −1 h
      { d: addDays(ASOF, -1), slh: 8.75 }, // +1 h
      { d: ASOF, slh: 7.75 }, //   0
    ];
    const s = sleep3(recs, ASOF, P);
    expect(s.nights).toBe(3);
    expect(s.lastNightHrs).toBe(7.75);
    const expected = (0.5 * 0 + 0.3 * (1 / SLEEP_Z_HOURS) + 0.2 * (-1 / SLEEP_Z_HOURS)) / 1;
    expect(s.z as number).toBeCloseTo(expected, 12);
  });

  it('renormalises over the nights that exist, prefers an imported need, and is null with none', () => {
    const two = sleep3(
      [
        { d: addDays(ASOF, -1), slh: 6.75 },
        { d: ASOF, slh: 7.75 },
      ],
      ASOF,
      P,
    );
    expect(two.nights).toBe(2);
    expect(two.z as number).toBeCloseTo((0.3 * (-1 / SLEEP_Z_HOURS)) / 0.8, 12);
    const imported = sleep3([{ d: ASOF, slh: 7.75, sln: 8.75 }], ASOF, P);
    expect(imported.z as number).toBeCloseTo(-1 / SLEEP_Z_HOURS, 12);
    expect(sleep3([], ASOF, P)).toEqual({ z: null, lastNightHrs: null, nights: 0 });
  });
});

describe('hooperMean', () => {
  it('averages whatever items were answered, and is null when none were', () => {
    expect(hooperMean({ d: ASOF, qs: 2, qf: 4 })).toBe(3);
    expect(hooperMean({ d: ASOF, qs: 1, qf: 2, qt: 3, qo: 6 })).toBe(3);
    expect(hooperMean({ d: ASOF })).toBeNull();
    expect(hooperMean(null)).toBeNull();
  });
});

describe('WHOOP blend', () => {
  it('ramps the weight over 7 days of coverage and rides it back down', () => {
    expect(WHOOP_RAMP_DAYS).toBe(7);
    for (let k = 0; k <= 7; k++) {
      const recs = build((i) => (i >= N - k ? { rec: 80 } : {}));
      const cov = whoopCoverage(recs, ASOF);
      expect(cov.w).toBeCloseTo(k / 7, 12);
      expect(cov.days).toBe(k);
      const r = readiness(recs, ASOF, P);
      if (k === 0) {
        expect(r.blendWeight).toBeUndefined();
        expect(r.score).toBe(READINESS_BASELINE_SCORE);
      } else {
        expect(r.blendWeight).toBeCloseTo(k / 7, 3);
        expect(r.score).toBe(Math.round((k / 7) * 80 + (1 - k / 7) * READINESS_BASELINE_SCORE));
      }
    }
  });

  it('gives WHOOP the whole ring at full coverage and clamps the imported value', () => {
    const r = readiness(build(() => ({ rec: 71 })), ASOF, P);
    expect(r.blendWeight).toBe(1);
    expect(r.score).toBe(71);
    expect(r.source).toBe('whoop');
    expect(r.detail).toMatch(/^WHOOP recovery 71% \(100% of the score\)/);
    expect(readiness([{ d: ASOF, rec: 140 }], ASOF, P).score).toBe(100);
    expect(readiness([{ d: ASOF, rec: 66.6 }], ASOF, P).score).toBe(67);
  });

  it('slides toward the own score over an import gap instead of stepping', () => {
    const full = build(() => ({ rec: 80 }));
    const gapped = full.map((r, i) => (i >= N - 3 ? { ...r, rec: undefined } : r));
    const a = readiness(full, ASOF, P);
    const b = readiness(gapped, ASOF, P);
    expect(a.score).toBe(80);
    expect(b.blendWeight).toBeCloseTo(4 / 7, 3);

    // The WHOOP side of a gap day is today's own score plus the offset measured
    // on the last day both existed — never the stale reading itself.
    const anchor = addDays(ASOF, -3);
    const own = (d: ISODate): number =>
      ownScore(gapped, d, P, hrvStatus(gapped, d, { age: P.age })).score as number;
    const term = own(ASOF) + (80 - own(anchor));
    expect(b.score).toBe(Math.round((4 / 7) * term + (3 / 7) * own(ASOF)));
    expect(Math.abs((a.score as number) - (b.score as number))).toBeLessThan(
      (80 - READINESS_BASELINE_SCORE) * 0.5,
    );
    expect(b.detail).toMatch(/No WHOOP import for 3 days; its \+\d+-point offset carried forward \(57% of the score\)/);
    // Source follows the majority holder of the ring.
    expect(b.source).toBe('whoop');
    const mostlyGone = readiness(
      full.map((r, i) => (i >= N - 5 ? { ...r, rec: undefined } : r)),
      ASOF,
      P,
    );
    expect(mostlyGone.source).toBe('hrv');
  });

  it('carries the ring alone when the own model has nothing to say', () => {
    const r = readiness([{ d: ASOF, rec: 45 }], ASOF, P);
    expect(r.score).toBe(45);
    expect(r.blendWeight).toBe(1);
    expect(r.confidence?.nInputs).toBe(1);
  });
});

describe('verdict — forcing, unbalanced and modifiers', () => {
  it('forces red when the HRV rule fires, whatever the score says', () => {
    const recs = build((i) => ({ ...shiftWeek(-0.05)(i), rec: 80 }));
    const r = readiness(recs, ASOF, P);
    expect(hrvStatus(recs, ASOF, { age: P.age }).forcing).toBe(true);
    expect(r.band).toBe('red');
    expect(r.forced).toBe(true);
    expect(r.training).toBe('Light day');
    expect(r.verdict).toMatch(/^Run down/);
    expect(r.modifiers?.[0]).toMatchObject({ key: 'hrvForcing', effect: 'downgrade' });
    expect(r.detail).toMatch(/forces a light day/);
    expect(r.score).toBeGreaterThan(BAND_THRESHOLDS.yellow); // the number is the data
  });

  it('caps an unbalanced week at yellow unless RHR is ≥ 3 bpm below baseline', () => {
    const high = build((i) => ({ ...shiftWeek(0.06)(i), rec: 85 }));
    const capped = readiness(high, ASOF, P);
    expect(hrvStatus(high, ASOF, { age: P.age }).band).toBe('unbalanced');
    expect(bandOf(capped.score)).toBe('green');
    expect(capped.band).toBe('yellow');
    expect(capped.modifiers?.some((m) => m.key === 'hrvUnbalanced')).toBe(true);

    const recovering = high.map((r, i) => (i === N - 1 ? { ...r, rhr: 48 } : r));
    const stands = readiness(recovering, ASOF, P);
    expect(stands.band).toBe('green');
    expect((stands.modifiers ?? []).some((m) => m.key === 'hrvUnbalanced')).toBe(false);
  });

  it('takes training and stress modifiers as plain arguments, one step in total', () => {
    const recs = build(() => ({ rec: 85 }));
    expect(readiness(recs, ASOF, P).band).toBe('green');
    for (const opts of [
      { formBand: 'overreached' as const },
      { stressBand: 'major' as const },
      { illness: true },
    ]) {
      expect(readiness(recs, ASOF, P, opts).band).toBe('yellow');
    }
    // All of them together are still one step, not four.
    const many = readiness(recs, ASOF, P, {
      formBand: 'overreached',
      acwr: 2,
      stressBand: 'major',
      illness: true,
    });
    expect(many.band).toBe('yellow');
    expect(many.modifiers?.length).toBe(4);
    // They never override a red.
    const red = build((i) => ({ ...shiftWeek(-0.05)(i), rec: 10 }));
    expect(readiness(red, ASOF, P, { formBand: 'fresh', acwr: 0.9 }).band).toBe('red');
    // A quiet training picture changes nothing.
    expect(readiness(recs, ASOF, P, { formBand: 'productive', acwr: 1.1 }).band).toBe('green');
  });

  it('notes vagal saturation and a big single-day drop without moving the band on its own', () => {
    const sat = build((i) => ({
      hrv: Math.exp(MU + CYCLE[i % 7]),
      rhr: 55 + Math.round(100 * CYCLE[i % 7]),
    }));
    const r = readiness(sat, ASOF, P);
    expect(hrvStatus(sat, ASOF, { age: P.age }).saturated).toBe(true);
    expect(r.modifiers?.some((m) => m.key === 'vagalSaturation' && m.effect === 'note')).toBe(true);
  });
});

describe('calibrating and degenerate input', () => {
  it('marks a forming baseline and never forces from it', () => {
    const short = build().slice(-14).map((r, i, a) => ({ ...r, hrv: i >= a.length - 7 ? 45 : 60 }));
    const r = readiness(short, ASOF, P);
    expect(r.calibrating).toBe(true);
    expect(r.verdict).toMatch(/still calibrating/);
    expect(r.forced).toBeUndefined();
    expect(r.detail).toMatch(/HRV baseline still forming/);
  });

  it('returns a neutral, null-scored readiness when nothing is logged', () => {
    const r = readiness([], ASOF, P);
    expect(r.score).toBeNull();
    expect(r.band).toBe('neutral');
    expect(r.source).toBe('none');
    expect(r.verdict).toBe(VERDICT_COPY.neutral);
    expect(r.training).toBe('—');
    expect(r.confidence).toBeUndefined();
    expect(r.blendWeight).toBeUndefined();
    expect(r.contributors).toHaveLength(5);
    expect(r.contributors?.every((c) => c.z === null && c.points === 0)).toBe(true);
    expect(r.calibrating).toBe(true);
  });

  it('survives one record, all-null fields, a future record and any input order', () => {
    expect(readiness([{ d: ASOF }], ASOF, P).score).toBeNull();
    const one = readiness([{ d: ASOF, hrv: 55, rhr: 52, slh: 7 }], ASOF, P);
    expect(one.score).not.toBeNull();
    expect(Number.isFinite(one.score as number)).toBe(true);
    expect(one.confidence?.nInputs).toBe(1); // sleep only: no reference for HRV or RHR yet

    const recs = build();
    const withFuture = [...recs, { d: addDays(ASOF, 1), hrv: 20, rhr: 80 }];
    expect(readiness(withFuture, ASOF, P)).toEqual(readiness(recs, ASOF, P));
    expect(readiness([...recs].reverse(), ASOF, P)).toEqual(readiness(recs, ASOF, P));
  });

  it('reuses a pre-computed HrvStatus', () => {
    const recs = build(shiftWeek(0.05));
    const hrv = hrvStatus(recs, ASOF, { age: P.age });
    expect(readiness(recs, ASOF, P, { hrv })).toEqual(readiness(recs, ASOF, P));
  });
});

describe('detail sentence', () => {
  it('cites the actual numbers', () => {
    const recs = build(today({ rhr: 51, slh: 7.4, sln: 7.9 }));
    const r = readiness(recs, ASOF, P);
    expect(r.detail).toBe(
      'HRV 60 ms (baseline 60), RHR 51 (−1 vs baseline), slept 7.4 h of 7.9 h need, check-in 3.0/7.',
    );
  });

  it('names the 7-day mean rather than a baseline while the reference is still forming', () => {
    const r = readiness([{ d: ASOF, hrv: 55, rhr: 52 }], ASOF, P);
    expect(r.detail).toMatch(/HRV 55 ms \(7-day avg 55\)/);
    expect(r.detail).not.toMatch(/\(baseline/);
  });
});

describe('the acute:chronic ratio never moves the verdict on its own', () => {
  // Impellizzeri 2020: the ratio has no causal identification, and the app's
  // own copy ("nothing in this app changes a recommendation on ACWR alone")
  // is printed on the Train and Trends cards. Before this rule existed, a user
  // returning from three weeks off at their usual load — Banister form fresh,
  // stress none, illness false — was told to take a light day and cut 7.5% and
  // a set, citing fatigue nothing had measured.
  const recs = build(() => ({ rec: 85 }));

  it('leaves the band alone and says so when the ratio is the only signal', () => {
    for (const opts of [{ acwr: 1.8 }, { acwrBand: 'spike' as const }, { acwr: 2.4, formBand: 'fresh' as const }]) {
      const r = readiness(recs, ASOF, P, opts);
      expect(r.band).toBe('green');
      const m = r.modifiers?.find((x) => x.key === 'acwrSpike');
      expect(m?.effect).toBe('note');
      expect(m?.reason).toMatch(/has not changed today/i);
    }
  });

  it('still contributes when something else has already fired', () => {
    const r = readiness(recs, ASOF, P, { acwr: 1.8, stressBand: 'major' });
    expect(r.band).toBe('yellow');
    const m = r.modifiers?.find((x) => x.key === 'acwrSpike');
    expect(m?.effect).toBe('downgrade');
    expect(r.modifiers?.filter((x) => x.effect === 'downgrade').length).toBe(2);
  });

  it('a ratio spike alone cannot turn a green day into a light day', () => {
    const calm = readiness(recs, ASOF, P);
    const spiked = readiness(recs, ASOF, P, { acwr: 2.5, acwrBand: 'spike' });
    expect(spiked.band).toBe(calm.band);
    expect(spiked.training).toBe(calm.training);
  });
});
