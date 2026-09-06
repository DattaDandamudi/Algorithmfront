import { describe, expect, it } from 'vitest';
import type { DailyRecord, ISODate } from '../data/types';
import { DEFAULT_PROFILE } from '../data/defaults';
import { addDays, lastNDates } from '../lib/dates';
import {
  AL_STYLE_COPY,
  AL_STYLE_LABEL,
  AL_STYLE_MIN_REF_DAYS,
  CALIBRATING_COPY,
  CHECKIN_SD_FLOOR,
  CHECKIN_WORSE_RUN,
  ILLNESS_COPY,
  OSI_MIN_REF_DAYS,
  OSI_OUTLIER_Z,
  OSI_WEIGHTS,
  RESILIENCE_BALANCE_CENTRE,
  RESILIENCE_HEURISTIC_COPY,
  RESILIENCE_SCORE_GAIN,
  SIGNAL_THRESHOLDS,
  checkInSummary,
  illnessFlag,
  overnightStrainIndex,
  resilienceBandOf,
  resilienceSummary,
  strainBandOf,
  stressSummary,
  tauToAlpha,
} from './stress';

const END: ISODate = '2026-09-06';

/** `days` records ending at `end`, each built from its index (0 = oldest). */
function build(days: number, end: ISODate, f: (i: number) => Partial<DailyRecord>): DailyRecord[] {
  return lastNDates(end, days).map((d, i) => ({ d, ...f(i) }));
}

/** Nothing in this module may ever produce a NaN. */
function noNaN(v: unknown): void {
  JSON.stringify(v, (_k, x) => {
    if (typeof x === 'number') expect(Number.isFinite(x)).toBe(true);
    return x;
  });
}

// ---------------------------------------------------------------------------
// checkInSummary
// ---------------------------------------------------------------------------

describe('checkInSummary', () => {
  it('returns the empty shape for no records at all', () => {
    const c = checkInSummary([], END);
    expect(c.total).toBeNull();
    expect(c.band).toBe('neutral');
    expect(c.nDays).toBe(0);
    expect(c.worseRun).toBe(0);
    expect(c.missingToday).toBe(true);
    expect(c.zTotal).toBeNull();
    expect(c.z).toEqual({ qs: null, qf: null, qt: null, qo: null });
    noNaN(c);
  });

  it('sums the four items into the 4–28 Hooper total', () => {
    const recs: DailyRecord[] = [{ d: END, qs: 2, qf: 3, qt: 4, qo: 1 }];
    const c = checkInSummary(recs, END);
    expect(c.total).toBe(10);
    expect(c.sleepQ).toBe(2);
    expect(c.fatigue).toBe(3);
    expect(c.stress).toBe(4);
    expect(c.soreness).toBe(1);
    expect(c.missingToday).toBe(false);
    // No reference at all → no z, and the band falls back to the raw scale.
    expect(c.zTotal).toBeNull();
    expect(c.band).toBe('green');
  });

  it('leaves the total null when an asked item is missing but keeps the rest', () => {
    const recs: DailyRecord[] = [{ d: END, qs: 2, qf: 3 }];
    const c = checkInSummary(recs, END);
    expect(c.total).toBeNull();
    expect(c.sleepQ).toBe(2);
    expect(c.soreness).toBeNull();
    expect(c.missingToday).toBe(false);
  });

  it('honours a reduced item set', () => {
    const recs: DailyRecord[] = [{ d: END, qs: 2, qf: 3 }];
    const c = checkInSummary(recs, END, { items: ['qs', 'qf'] });
    expect(c.total).toBe(5);
    expect(c.z.qt).toBeNull();
  });

  it('ignores out-of-range answers', () => {
    const recs: DailyRecord[] = [{ d: END, qs: 0, qf: 9, qt: 4, qo: 4 }];
    const c = checkInSummary(recs, END);
    expect(c.sleepQ).toBeNull();
    expect(c.fatigue).toBeNull();
    expect(c.total).toBeNull();
  });

  it('standardises today against the previous 30 days, not against itself', () => {
    // 30 days of a flat 3, then a 5 today. MAD is 0, so the floor applies:
    // z = (5 − 3) / 0.74 = 2.7027.
    const recs = build(31, END, (i) => (i < 30 ? { qs: 3, qf: 3, qt: 3, qo: 3 } : { qs: 5, qf: 5, qt: 5, qo: 5 }));
    const c = checkInSummary(recs, END);
    expect(c.z.qs).toBeCloseTo(2 / CHECKIN_SD_FLOOR, 3);
    expect(c.zTotal).toBeCloseTo(2 / CHECKIN_SD_FLOOR, 3);
    expect(c.band).toBe('red');
    expect(c.nDays).toBe(30);
  });

  it('fires the DALDA rule on the third consecutive worse-than-normal day', () => {
    const recs = build(34, END, (i) => {
      const v = i >= 31 ? 5 : 3;
      return { qs: v, qf: v, qt: v, qo: v };
    });
    // Day 31 is the first bad day; asOf is day 33 → three in a row.
    expect(checkInSummary(recs, END).worseRun).toBe(CHECKIN_WORSE_RUN);
    expect(checkInSummary(recs, addDays(END, -1)).worseRun).toBe(2);
    expect(checkInSummary(recs, addDays(END, -2)).worseRun).toBe(1);
    expect(checkInSummary(recs, addDays(END, -3)).worseRun).toBe(0);
  });

  it('breaks the run on a skipped day rather than assuming it', () => {
    const recs = build(34, END, (i) => {
      if (i === 32) return {}; // skipped
      const v = i >= 31 ? 5 : 3;
      return { qs: v, qf: v, qt: v, qo: v };
    });
    expect(checkInSummary(recs, END).worseRun).toBe(1);
  });

  it('takes the worse of the personal and the absolute band', () => {
    // A user whose normal is a 6 across the board is not "green" today just
    // because today also happens to be a 6.
    const recs = build(31, END, () => ({ qs: 6, qf: 6, qt: 6, qo: 6 }));
    const c = checkInSummary(recs, END);
    expect(c.zTotal).toBe(0);
    expect(c.band).toBe('red');
  });

  it('is order-independent and ignores future-dated records', () => {
    const recs = build(31, END, (i) => (i < 30 ? { qs: 3, qf: 3, qt: 3, qo: 3 } : { qs: 5, qf: 5, qt: 5, qo: 5 }));
    const shuffled = [...recs].reverse();
    shuffled.push({ d: addDays(END, 5), qs: 7, qf: 7, qt: 7, qo: 7 });
    expect(checkInSummary(shuffled, END)).toEqual(checkInSummary(recs, END));
  });
});

// ---------------------------------------------------------------------------
// overnightStrainIndex
// ---------------------------------------------------------------------------

describe('overnightStrainIndex', () => {
  it('suppresses everything below 14 reference days and says it is calibrating', () => {
    const recs = build(10, END, () => ({ hrv: 60, rhr: 55, rr: 14.5 }));
    const s = overnightStrainIndex(recs, END);
    expect(s.calibrating).toBe(true);
    expect(s.osi).toBeNull();
    expect(s.lo).toBeNull();
    expect(s.hi).toBeNull();
    expect(s.band).toBeNull();
    expect(s.signalsDeviating).toBe(0);
    expect(s.nRef).toBe(9);
    // The dot row is still described so the UI can grey it out.
    expect(s.signals.map((x) => x.key)).toEqual(['hrv', 'rhr', 'rr', 'skt', 'spo', 'debt']);
    expect(s.signals.every((x) => x.z === null && !x.deviating)).toBe(true);
    expect(s.signalsAvailable).toBe(3);
    noNaN(s);
  });

  it('computes the fused index from the plan formula on a single signal', () => {
    // 30 reference days alternating 54/56 → median 55, MAD 1, robust SD 1.4826.
    const recs = build(31, END, (i) => (i < 30 ? { rhr: i % 2 === 0 ? 54 : 56 } : { rhr: 60 }));
    const s = overnightStrainIndex(recs, END);
    const z = 5 / (1.4826 * 1);
    expect(s.signals.find((x) => x.key === 'rhr')?.z).toBeCloseTo(z, 3);
    expect(s.osi).toBeCloseTo(50 + 12.5 * z, 1);
    expect(s.signalsAvailable).toBe(1);
    expect(s.signalsDeviating).toBe(1);
    expect(s.band).toBe('none');
    expect(s.nRef).toBe(30);
  });

  it('orients every signal so that positive means more strain', () => {
    // HRV and SpO₂ FALL under strain; their z must come back positive.
    const recs = build(31, END, (i) =>
      i < 30 ? { hrv: i % 2 === 0 ? 55 : 65, spo: i % 2 === 0 ? 95.5 : 96.5 } : { hrv: 40, spo: 93 },
    );
    const s = overnightStrainIndex(recs, END);
    const hrv = s.signals.find((x) => x.key === 'hrv');
    const spo = s.signals.find((x) => x.key === 'spo');
    expect(hrv?.z).toBeGreaterThan(0);
    expect(spo?.z).toBeGreaterThan(0);
    // …and the displayed value is still the raw reading, not the log.
    expect(hrv?.value).toBe(40);
    expect(s.osi).toBeGreaterThan(50);
  });

  it('bands on the count, not the fused number: 0–1 none, 2 minor, ≥3 major', () => {
    expect(strainBandOf(0)).toBe('none');
    expect(strainBandOf(1)).toBe('none');
    expect(strainBandOf(2)).toBe('minor');
    expect(strainBandOf(3)).toBe('major');
    expect(strainBandOf(6)).toBe('major');

    const base = (i: number) => ({
      hrv: i % 2 === 0 ? 58 : 62,
      rhr: i % 2 === 0 ? 54 : 56,
      rr: i % 2 === 0 ? 14.3 : 14.7,
      skt: i % 2 === 0 ? 33.4 : 33.6,
    });
    const recs = build(31, END, (i) => (i < 30 ? base(i) : { hrv: 40, rhr: 62, rr: 17, skt: 34.4 }));
    const s = overnightStrainIndex(recs, END);
    expect(s.signalsDeviating).toBe(4);
    expect(s.band).toBe('major');
  });

  it('returns a credible interval that brackets the index and narrows with history', () => {
    // Even-sized references, so the alternating pair gives MAD 1 in both cases
    // and only the number of days behind the estimate differs.
    const short = build(OSI_MIN_REF_DAYS + 3, END, (i) => ({ rhr: i % 2 === 0 ? 54 : 56 }));
    short[short.length - 1] = { d: END, rhr: 59 };
    const long = build(91, END, (i) => ({ rhr: i % 2 === 0 ? 54 : 56 }));
    long[long.length - 1] = { d: END, rhr: 59 };

    const a = overnightStrainIndex(short, END);
    const b = overnightStrainIndex(long, END);
    for (const s of [a, b]) {
      expect(s.lo).not.toBeNull();
      expect(s.lo as number).toBeLessThanOrEqual(s.osi as number);
      expect(s.hi as number).toBeGreaterThanOrEqual(s.osi as number);
    }
    expect((b.hi as number) - (b.lo as number)).toBeLessThan((a.hi as number) - (a.lo as number));
  });

  it('renormalises the weights over the signals actually present', () => {
    // Only HRV and RHR are logged; their weights must sum to 1 between them, so
    // two equal z-scores give the same OSI as a single-signal day would.
    const recs = build(31, END, (i) =>
      i < 30 ? { hrv: i % 2 === 0 ? 55 : 65, rhr: i % 2 === 0 ? 54 : 56 } : { hrv: 55 * Math.exp(-0.5 * 0.12388 / 0.12388), rhr: 55 },
    );
    const s = overnightStrainIndex(recs, END);
    expect(s.osi).not.toBeNull();
    expect(OSI_WEIGHTS.hrv + OSI_WEIGHTS.rhr).toBeLessThan(1);
    noNaN(s);
  });

  it('uses the 90th-percentile outlier threshold on every signal', () => {
    expect(OSI_OUTLIER_Z).toBeCloseTo(1.2816, 3);
    for (const k of Object.keys(SIGNAL_THRESHOLDS)) {
      expect(SIGNAL_THRESHOLDS[k as keyof typeof SIGNAL_THRESHOLDS]).toBeCloseTo(OSI_OUTLIER_Z, 6);
    }
  });

  it('is order-independent and never returns NaN on degenerate input', () => {
    const recs = build(31, END, (i) => (i < 30 ? { rhr: 55 } : { rhr: 55 }));
    const shuffled = [...recs].sort((a, b) => (a.d < b.d ? 1 : -1));
    expect(overnightStrainIndex(shuffled, END)).toEqual(overnightStrainIndex(recs, END));
    // Every reading identical → MAD 0 → the floor keeps the z finite.
    noNaN(overnightStrainIndex(recs, END));
    noNaN(overnightStrainIndex([{ d: END }], END));
    noNaN(overnightStrainIndex([], END));
  });
});

// ---------------------------------------------------------------------------
// illnessFlag
// ---------------------------------------------------------------------------

/** 60 stationary reference days plus whatever the last `n` days override. */
function withRef(overrides: Record<number, Partial<DailyRecord>>, days = 63): DailyRecord[] {
  return build(days, END, (i) => {
    const base: Partial<DailyRecord> = {
      hrv: i % 2 === 0 ? 55 : 65,
      rhr: i % 2 === 0 ? 50 : 54,
      rr: i % 2 === 0 ? 14 : 15,
      skt: i % 2 === 0 ? 33.4 : 33.6,
    };
    const back = days - 1 - i;
    return { ...base, ...(overrides[back] ?? {}) };
  });
}

describe('illnessFlag', () => {
  it('is down for a stationary sleeper', () => {
    const f = illnessFlag(withRef({}), END);
    expect(f.flag).toBe(false);
    expect(f.since).toBeNull();
    expect(f.reasons).toEqual([]);
  });

  it('never fires on a single signal', () => {
    // HRV alone: deeply low, but resting HR is normal.
    const hrvOnly = illnessFlag(withRef({ 0: { hrv: 35 }, 1: { hrv: 35 } }), END);
    expect(hrvOnly.flag).toBe(false);
    // RHR alone.
    const rhrOnly = illnessFlag(withRef({ 0: { rhr: 62 }, 1: { rhr: 62 } }), END);
    expect(rhrOnly.flag).toBe(false);
  });

  it('fires the conjunctive rule on 2 of 3 days but not on 1 of 3', () => {
    const one = illnessFlag(withRef({ 0: { hrv: 40, rhr: 60 } }), END);
    expect(one.flag).toBe(false);
    const two = illnessFlag(withRef({ 0: { hrv: 40, rhr: 60 }, 1: { hrv: 40, rhr: 60 } }), END);
    expect(two.flag).toBe(true);
    expect(two.reasons[0]).toMatch(/HRV below and resting heart rate above your normal/);
  });

  it('fires on +3 brpm of respiratory rate on its own — the WHOOP cohort marker', () => {
    const f = illnessFlag(withRef({ 0: { rr: 17.6 } }), END);
    expect(f.flag).toBe(true);
    expect(f.reasons.some((r) => /Breathing rate/.test(r))).toBe(true);
  });

  it('needs two nights of +0.5 °C skin temperature, not one', () => {
    expect(illnessFlag(withRef({ 0: { skt: 34.1 } }), END).flag).toBe(false);
    const f = illnessFlag(withRef({ 0: { skt: 34.1 }, 1: { skt: 34.1 } }), END);
    expect(f.flag).toBe(true);
    expect(f.reasons.some((r) => /Skin temperature/.test(r))).toBe(true);
  });

  it('does not use the conventional +5 bpm resting-heart-rate rule', () => {
    // +5 bpm over the personal median with a normal HRV must NOT flag.
    const f = illnessFlag(withRef({ 0: { rhr: 57 }, 1: { rhr: 57 }, 2: { rhr: 57 } }), END);
    expect(f.flag).toBe(false);
  });

  it('reports `since` as the first day of the current run', () => {
    const f = illnessFlag(
      withRef({ 0: { rr: 18.5 }, 1: { rr: 18.5 }, 2: { rr: 18.5 } }),
      END,
    );
    expect(f.flag).toBe(true);
    expect(f.since).toBe(addDays(END, -2));
  });

  it('stays down while the reference is still calibrating', () => {
    const recs = build(8, END, (i) => (i < 7 ? { rr: 14.5 } : { rr: 20 }));
    expect(illnessFlag(recs, END).flag).toBe(false);
  });

  it('never names a condition', () => {
    const f = illnessFlag(withRef({ 0: { rr: 17.6 }, 1: { hrv: 40, rhr: 60 }, 2: { hrv: 40, rhr: 60 } }), END);
    const text = [ILLNESS_COPY, ...f.reasons].join(' ').toLowerCase();
    for (const word of ['covid', 'flu', 'influenza', 'infection', 'fever', 'virus', 'sick', 'diagnos']) {
      expect(text).not.toContain(word);
    }
    expect(ILLNESS_COPY).toMatch(/possible illness or heavy overload/i);
  });
});

// ---------------------------------------------------------------------------
// resilienceSummary
// ---------------------------------------------------------------------------

describe('resilienceSummary', () => {
  it('always returns both curves, even when it cannot band them', () => {
    const r = resilienceSummary([], END, { profile: DEFAULT_PROFILE });
    expect(r.series).toHaveLength(14);
    expect(r.series.every((p) => p.load === null && p.recovery === null)).toBe(true);
    expect(r.score).toBeNull();
    expect(r.band).toBeNull();
    expect(r.nDays).toBe(0);
    expect(r.alStyleCount).toBeNull();
    noNaN(r);
  });

  it('scores off the centred balance and bands with Oura vocabulary', () => {
    expect(resilienceBandOf(null)).toBeNull();
    expect(resilienceBandOf(10)).toBe('limited');
    expect(resilienceBandOf(30)).toBe('adequate');
    expect(resilienceBandOf(50)).toBe('solid');
    expect(resilienceBandOf(70)).toBe('strong');
    expect(resilienceBandOf(90)).toBe('exceptional');

    const recs = build(60, END, () => ({ slh: 8, rec: 70, osi: 40, ld: 300, st: 9000, alc: 0, tob: 0, qs: 2, qf: 2, qt: 2, qo: 2, bt: '23:00' }));
    const r = resilienceSummary(recs, END, { profile: DEFAULT_PROFILE });
    expect(r.score).toBeCloseTo(
      Math.min(100, Math.max(0, 50 + RESILIENCE_SCORE_GAIN * ((r.balance as number) - RESILIENCE_BALANCE_CENTRE))),
      1,
    );
    expect(r.balance).toBeCloseTo((r.recoveryEwma as number) - (r.loadEwma as number), 3);
    expect(r.nDays).toBe(14);
  });

  it('drops when load outruns recovery — the scissors, not the absolute level', () => {
    const calm = build(60, END, () => ({ slh: 8, rec: 70, ld: 200, qs: 2, qf: 2, qt: 2, qo: 2 }));
    const overload = build(60, END, (i) => ({
      slh: i >= 40 ? 6 : 8,
      rec: i >= 40 ? 45 : 70,
      ld: i >= 40 ? 900 : 200,
      qs: i >= 40 ? 5 : 2,
      qf: i >= 40 ? 5 : 2,
      qt: i >= 40 ? 5 : 2,
      qo: i >= 40 ? 5 : 2,
    }));
    const a = resilienceSummary(calm, END, { profile: DEFAULT_PROFILE });
    const b = resilienceSummary(overload, END, { profile: DEFAULT_PROFILE });
    expect(b.score as number).toBeLessThan(a.score as number);
    expect(b.loadEwma as number).toBeGreaterThan(a.loadEwma as number);
    expect(b.recoveryEwma as number).toBeLessThan(a.recoveryEwma as number);
  });

  it('prefers the passed-in load / readiness / OSI series over the stored fields', () => {
    const recs = build(60, END, () => ({ slh: 8, qs: 3, qf: 3, qt: 3, qo: 3 }));
    const dates = lastNDates(END, 60);
    const withScores = resilienceSummary(recs, END, {
      profile: DEFAULT_PROFILE,
      readinessScores: dates.map((d) => ({ d, score: 90 })),
      osi: dates.map((d) => ({ d, osi: 10 })),
      loads: dates.map((d) => ({ d, load: 100 })),
    });
    const without = resilienceSummary(recs, END, { profile: DEFAULT_PROFILE });
    expect(withScores.recoveryEwma as number).toBeGreaterThan(without.recoveryEwma as number);
  });

  it('reports the AL-style counter as a 0–6 per-day mean, or null below the reference floor', () => {
    const thin = build(AL_STYLE_MIN_REF_DAYS - 1, END, () => ({ hrv: 60, rhr: 55 }));
    expect(resilienceSummary(thin, END, { profile: DEFAULT_PROFILE }).alStyleCount).toBeNull();

    const full = build(90, END, (i) => ({
      hrv: 55 + (i % 7),
      rhr: 50 + (i % 5),
      rr: 14 + (i % 3) / 3,
      skt: 33.3 + (i % 4) / 10,
      spo: 95 + (i % 3) / 2,
      dbt: (i % 6) * 20,
    }));
    const c = resilienceSummary(full, END, { profile: DEFAULT_PROFILE }).alStyleCount;
    expect(c).not.toBeNull();
    expect(c as number).toBeGreaterThanOrEqual(0);
    expect(c as number).toBeLessThanOrEqual(6);
  });

  it('exposes the AL-style caveat so no screen can quietly drop it', () => {
    expect(AL_STYLE_LABEL).toMatch(/AL-style/);
    expect(AL_STYLE_COPY).toMatch(/AL-style/);
    expect(AL_STYLE_COPY).toMatch(/not validated/);
    expect(AL_STYLE_COPY.toLowerCase()).not.toMatch(/^allostatic load[^-]/);
    expect(RESILIENCE_HEURISTIC_COPY).toMatch(/not a validated scale/);
    expect(CALIBRATING_COPY).toMatch(/learning your normal/i);
  });

  it('converts a time constant to an EWMA alpha', () => {
    expect(tauToAlpha(7)).toBeCloseTo(1 - Math.exp(-1 / 7), 9);
    expect(tauToAlpha(14)).toBeCloseTo(1 - Math.exp(-1 / 14), 9);
    expect(tauToAlpha(0)).toBeCloseTo(1 - Math.exp(-1), 9);
  });
});

// ---------------------------------------------------------------------------
// stressSummary
// ---------------------------------------------------------------------------

describe('stressSummary', () => {
  it('assembles a StressContext a caller can render without guarding', () => {
    const recs = build(70, END, (i) => ({
      hrv: i % 2 === 0 ? 55 : 65,
      rhr: i % 2 === 0 ? 50 : 54,
      rr: 14.5,
      skt: 33.5,
      spo: 96,
      slh: 7.5,
      qs: 3,
      qf: 3,
      qt: 3,
      qo: 3,
      ld: 250,
    }));
    const ctx = stressSummary(recs, END, { profile: DEFAULT_PROFILE });
    expect(ctx.calibrating).toBe(false);
    expect(ctx.osi).not.toBeNull();
    expect(ctx.outliers).toHaveLength(6);
    expect(ctx.checkIn.total).toBe(12);
    expect(ctx.illness.flag).toBe(false);
    expect(ctx.resilience.band).not.toBeNull();
    noNaN(ctx);
  });

  it('degrades to nulls, never NaN, on an empty history', () => {
    const ctx = stressSummary([], END, { profile: DEFAULT_PROFILE });
    expect(ctx.osi).toBeNull();
    expect(ctx.band).toBeNull();
    expect(ctx.calibrating).toBe(true);
    expect(ctx.checkIn.band).toBe('neutral');
    expect(ctx.illness.flag).toBe(false);
    noNaN(ctx);
  });
});
