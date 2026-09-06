import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE } from '../data/defaults';
import type { DailyRecord } from '../data/types';
import { addDays } from '../lib/dates';
import { hrvStatus, type HrvStatus } from './hrv';
import { BAND_THRESHOLDS, TRAINING_COPY, VERDICT_COPY, bandOf, hrvScore, readiness, rhrAdjustment } from './readiness';

const ASOF = '2026-09-06';
const MU = Math.log(60);
const CYCLE = [0.04, -0.04, 0.02, -0.02, 0.06, -0.06, 0];
const BALANCED = [0, 0, ...CYCLE, ...CYCLE, ...CYCLE, ...CYCLE];
const PROFILE = DEFAULT_PROFILE; // age 26, fat-loss, whoop

/** devs[i] → record on ASOF − (len − 1 − i); `extra(i)` merges per-day fields (e.g. rhr, rec). */
function build(
  devs: Array<number | null>,
  extra: (i: number, n: number) => Partial<DailyRecord> = () => ({}),
): DailyRecord[] {
  const out: DailyRecord[] = [];
  const n = devs.length;
  devs.forEach((dev, i) => {
    const d = addDays(ASOF, -(n - 1 - i));
    const patch = extra(i, n);
    if (dev !== null || Object.keys(patch).length) {
      out.push({ d, ...(dev !== null ? { hrv: Math.exp(MU + dev) } : {}), ...patch });
    }
  });
  return out;
}

const withToday = (dev: number | null) => [...BALANCED.slice(0, -1), dev];
/** Shift the current week (last 7 entries) so the banded 7-day mean sits at μ + dev (R3-1). */
const shiftLast7 = (dev: number) => BALANCED.map((v, i) => (i >= BALANCED.length - 7 ? v + dev : v));
const todayOnly = (patch: Partial<DailyRecord>) => (i: number, n: number) => (i === n - 1 ? patch : {});

describe('bandOf / thresholds', () => {
  it('bands 67/34 like WHOOP', () => {
    expect(BAND_THRESHOLDS).toEqual({ green: 67, yellow: 34 });
    expect(bandOf(100)).toBe('green');
    expect(bandOf(67)).toBe('green');
    expect(bandOf(66)).toBe('yellow');
    expect(bandOf(34)).toBe('yellow');
    expect(bandOf(33)).toBe('red');
    expect(bandOf(0)).toBe('red');
    expect(bandOf(null)).toBe('neutral');
    expect(bandOf(Number.NaN)).toBe('neutral');
  });
});

describe('readiness — WHOOP source', () => {
  it('maps rec → score and band with the matching copy', () => {
    const g = readiness(build(BALANCED, todayOnly({ rec: 71 })), ASOF, PROFILE);
    expect(g).toMatchObject({ score: 71, band: 'green', source: 'whoop', training: 'Progress' });
    expect(g.verdict).toBe('Primed — progress loads today');
    expect(g.detail).toMatch(/^WHOOP recovery 71%/);

    const y = readiness(build(BALANCED, todayOnly({ rec: 50 })), ASOF, PROFILE);
    expect(y).toMatchObject({ score: 50, band: 'yellow', source: 'whoop', training: 'Train, hold loads' });
    expect(y.verdict).toBe('Steady — train, hold loads');

    const r = readiness(build(BALANCED, todayOnly({ rec: 20 })), ASOF, PROFILE);
    expect(r).toMatchObject({ score: 20, band: 'red', source: 'whoop', training: 'Light day' });
    expect(r.verdict).toBe('Run down — keep today light');
    expect(r.detail).toMatch(/recovery under 34% forces a light day/);
  });

  it('uses WHOOP even when HRV is insufficient, and rounds/clamps rec', () => {
    const r = readiness([{ d: ASOF, rec: 66.6 }], ASOF, PROFILE);
    expect(r.source).toBe('whoop');
    expect(r.score).toBe(67);
    expect(r.band).toBe('green');
    expect(readiness([{ d: ASOF, rec: 140 }], ASOF, PROFILE).score).toBe(100);
  });
});

describe('readiness — HRV-only source', () => {
  it('scores a within-band day into 34–66 (yellow)', () => {
    const r = readiness(build(BALANCED), ASOF, PROFILE);
    expect(r.source).toBe('hrv');
    expect(r.score).toBe(50); // today = mean7 → middle of the band
    expect(r.band).toBe('yellow');
    expect(r.training).toBe('Train, hold loads');
  });

  it('R3-1: scores a week above the upper SWC into 67–85 (green) with no RHR data', () => {
    for (const dev of [0.03, 0.05, 0.1, 0.3]) {
      const r = readiness(build(shiftLast7(dev)), ASOF, PROFILE);
      expect(r.source).toBe('hrv');
      expect(r.score as number).toBeGreaterThanOrEqual(67);
      expect(r.score as number).toBeLessThanOrEqual(85);
      expect(r.band).toBe('green');
      expect(r.training).toBe('Progress');
    }
    expect(readiness(build(shiftLast7(0.1)), ASOF, PROFILE).score).toBe(85); // > 1 SD above → capped
  });

  it('R3-1: scores a week below the lower SWC into 10–33 (red, forced Light day)', () => {
    for (const dev of [-0.03, -0.05, -0.1, -0.3]) {
      const r = readiness(build(shiftLast7(dev)), ASOF, PROFILE);
      expect(r.source).toBe('hrv');
      expect(r.score as number).toBeGreaterThanOrEqual(10);
      expect(r.score as number).toBeLessThanOrEqual(33);
      expect(r.band).toBe('red');
      expect(r.training).toBe('Light day');
    }
    expect(readiness(build(shiftLast7(-0.1)), ASOF, PROFILE).score).toBe(10);
  });

  it('R3-1: a single outlying reading moves the score only slightly and never bands it', () => {
    // −0.1 ln on one day shifts the 7-day mean by ≈ 0.014 ln, well inside ± 0.5 SD.
    const dip = readiness(build(withToday(-0.1)), ASOF, PROFILE);
    expect(dip.band).toBe('yellow');
    expect(dip.score as number).toBeLessThan(50);
    expect(dip.score as number).toBeGreaterThanOrEqual(34);
    const spike = readiness(build(withToday(0.1)), ASOF, PROFILE);
    expect(spike.band).toBe('yellow');
    expect(spike.score as number).toBeGreaterThan(50);
    expect(spike.score as number).toBeLessThanOrEqual(66);
  });

  it('adjusts an above-band score by RHR vs its 28-day baseline (±10 cap)', () => {
    const base = readiness(build(shiftLast7(0.05)), ASOF, PROFILE).score as number;
    const rhr = (todayBpm: number) => (i: number, n: number) => ({ rhr: i === n - 1 ? todayBpm : 52 });
    const lower = readiness(build(shiftLast7(0.05), rhr(46)), ASOF, PROFILE).score as number; // −6 → +10
    const higher = readiness(build(shiftLast7(0.05), rhr(58)), ASOF, PROFILE).score as number; // +6 → −10
    const small = readiness(build(shiftLast7(0.05), rhr(50)), ASOF, PROFILE).score as number; // −2 → 0
    expect(lower).toBe(Math.min(100, base + 10));
    expect(higher).toBe(base - 10);
    expect(small).toBe(base);
    // RHR never touches a within-band score
    const inBand = readiness(build(BALANCED, rhr(40)), ASOF, PROFILE);
    expect(inBand.score).toBe(50);
    expect(inBand.detail).toMatch(/RHR 40 \(−12 vs baseline\)/);
  });

  it('rhrAdjustment is 0 inside ±3 bpm and linear to ±10 at 6 bpm', () => {
    expect(rhrAdjustment(null)).toBe(0);
    expect(rhrAdjustment(-2.9)).toBe(0);
    expect(rhrAdjustment(2.9)).toBe(0);
    expect(rhrAdjustment(-3)).toBe(5);
    expect(rhrAdjustment(3)).toBe(-5);
    expect(rhrAdjustment(-6)).toBe(10);
    expect(rhrAdjustment(-9)).toBe(10);
    expect(rhrAdjustment(9)).toBe(-10);
  });

  it('hrvScore positions the 7-day mean and stays in the documented ranges (synthetic status)', () => {
    const lo = 4.0;
    const hi = 4.1;
    // todayLn is deliberately far from mean7Ln: only the 7-day mean may drive the score (R3-1).
    const mk = (v: number): HrvStatus => ({
      todayMs: Math.exp(v - 0.5), todayLn: v - 0.5, mean7Ln: v, mean7Ms: null, baselineLn: (lo + hi) / 2, baselineMs: null,
      nBaseline: 21, sdLn: hi - lo, swcLowerLn: lo, swcUpperLn: hi, swcLowerMs: null, swcUpperMs: null, band: 'balanced',
      cv7: null, cvPrev7: null, cvTrend: null, overreachingFlag: false, overreachingNote: null, bigDrop: false,
      daysOfData: 30, baselineEstablished: true, note: '',
    });
    for (let v = 3.7; v <= 4.4; v += 0.01) {
      const s = hrvScore(mk(v), null) as number;
      if (v < lo) {
        expect(s).toBeGreaterThanOrEqual(10);
        expect(s).toBeLessThanOrEqual(33);
      } else if (v > hi) {
        expect(s).toBeGreaterThanOrEqual(67);
        expect(s).toBeLessThanOrEqual(85);
      } else {
        expect(s).toBeGreaterThanOrEqual(34);
        expect(s).toBeLessThanOrEqual(66);
      }
    }
    expect(hrvScore(mk(lo), null)).toBe(34);
    expect(hrvScore(mk(hi), null)).toBe(66);
    expect(hrvScore({ ...mk(4), band: 'insufficient' }, null)).toBeNull();
    // RHR pushes an above-band score to at most 95 / at least 57 before clamping
    expect(hrvScore(mk(4.3), { today: 46, baseline: 52, delta: -6, pct: null, n: 28, good: true })).toBe(95);
    expect(hrvScore(mk(4.1001), { today: 58, baseline: 52, delta: 6, pct: null, n: 28, good: false })).toBe(57);
  });

  it('uses a pre-computed HrvStatus when passed', () => {
    const recs = build(shiftLast7(0.1));
    const hrv = hrvStatus(recs, ASOF, { age: PROFILE.age });
    expect(readiness(recs, ASOF, PROFILE, { hrv })).toEqual(readiness(recs, ASOF, PROFILE));
  });
});

describe('readiness — forcing rule', () => {
  it('R3-1: forces red / Light day when the 7-day HRV mean is low even if WHOOP is green', () => {
    const r = readiness(build(shiftLast7(-0.05), todayOnly({ rec: 80 })), ASOF, PROFILE);
    expect(r.source).toBe('whoop');
    expect(r.score).toBe(80); // the number is the data; only the band is forced
    expect(r.band).toBe('red');
    expect(r.forced).toBe(true);
    expect(r.training).toBe('Light day');
    expect(r.verdict).toBe(VERDICT_COPY.red);
    expect(r.detail).toMatch(/7-day HRV average 57 ms is below your normal range and forces a light day/);
  });

  it('R3-1: a single low reading (bigDrop) does not force a light day over a green WHOOP recovery', () => {
    const r = readiness(build(withToday(-0.1), todayOnly({ rec: 80 })), ASOF, PROFILE);
    expect(r.band).toBe('green');
    expect(r.forced).toBeUndefined();
    expect(r.training).toBe('Progress');
  });

  it('R3-5: the HRV forcing rule waits for an established baseline (≥ 21 readings)', () => {
    // 14 readings: the last 7 sit well below the 7 before → band 'low' on a provisional range.
    const devs: Array<number | null> = Array.from({ length: 30 }, () => null);
    for (let i = 16; i < 23; i++) devs[i] = CYCLE[i % 7];
    for (let i = 23; i < 30; i++) devs[i] = CYCLE[i % 7] - 0.08;
    const recs = build(devs, todayOnly({ rec: 80 }));
    const hrv = hrvStatus(recs, ASOF, { age: PROFILE.age });
    expect(hrv.band).toBe('low');
    expect(hrv.baselineEstablished).toBe(false);
    const r = readiness(recs, ASOF, PROFILE, { hrv });
    expect(r.source).toBe('whoop');
    expect(r.band).toBe('green'); // not forced — the baseline is still forming
    expect(r.forced).toBeUndefined();
    expect(r.detail).toMatch(/HRV baseline still forming \(14 days\)/);
    // The same shape with 30 readings is forced.
    const full = build(shiftLast7(-0.08), todayOnly({ rec: 80 }));
    expect(readiness(full, ASOF, PROFILE).band).toBe('red');
  });

  it('forces Light day when rec < 34', () => {
    const r = readiness(build(BALANCED, todayOnly({ rec: 33 })), ASOF, PROFILE);
    expect(r.band).toBe('red');
    expect(r.training).toBe(TRAINING_COPY.red);
  });

  it('does not force when HRV is merely unbalanced or poor', () => {
    expect(readiness(build(shiftLast7(0.1), todayOnly({ rec: 70 })), ASOF, PROFILE).band).toBe('green');
    const poor = build(BALANCED).map((r) => ({ ...r, hrv: (r.hrv as number) * (28 / 60) }));
    const p = readiness(poor, ASOF, PROFILE);
    expect(p.source).toBe('hrv');
    expect(p.band).toBe('yellow');
  });
});

describe('readiness — no signal', () => {
  it('returns neutral with null score when there is no WHOOP and no HRV range', () => {
    const r = readiness([], ASOF, PROFILE);
    expect(r).toEqual({
      score: null,
      band: 'neutral',
      source: 'none',
      verdict: 'No recovery signal yet — log HRV/RHR or connect WHOOP',
      training: '—',
      detail: expect.stringMatching(/HRV baseline still forming \(0 days\)/),
    });
    const few = readiness([{ d: ASOF, hrv: 55, rhr: 52 }], ASOF, PROFILE);
    expect(few.source).toBe('none');
    expect(few.score).toBeNull();
    expect(few.detail).toMatch(/HRV 55 ms/);
    expect(few.detail).toMatch(/RHR 52/);
    expect(few.detail).toMatch(/baseline still forming \(1 days\)/);
  });
});

describe('readiness — detail sentence', () => {
  it('cites the actual numbers in one sentence', () => {
    const recs = build(BALANCED, (i, n) => ({ rhr: i === n - 1 ? 51 : 52, ...(i === n - 1 ? { slh: 7.4, sln: 7.9 } : {}) }));
    const r = readiness(recs, ASOF, PROFILE);
    expect(r.detail).toBe('HRV 60 ms (baseline 60), RHR 51 (−1 vs baseline), slept 7.4 h of 7.9 h need.');
  });

  it('mentions a forming baseline with the day count', () => {
    const devs: Array<number | null> = Array.from({ length: 30 }, () => null);
    for (let i = 20; i < 30; i++) devs[i] = CYCLE[i % 7];
    const r = readiness(build(devs), ASOF, PROFILE);
    expect(r.source).toBe('hrv');
    expect(r.detail).toMatch(/HRV baseline still forming \(10 days\)/);
  });

  it('falls back to the 7-day mean wording when today has no HRV', () => {
    const r = readiness(build(withToday(null)), ASOF, PROFILE);
    expect(r.source).toBe('hrv');
    expect(r.detail).toMatch(/^HRV 7-day mean 60 ms \(none logged today\)/);
  });
});
