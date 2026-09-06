import { describe, expect, it } from 'vitest';
import type { DailyRecord, Profile } from '../data/types';
import { DEFAULT_PROFILE } from '../data/defaults';
import { addDays } from '../lib/dates';
import {
  CAFFEINE_ANCHORS,
  CAFFEINE_DRAKE_CHECK,
  SLEEP_DEBT_HALFLIFE_DAYS,
  SLEEP_DEBT_REPAY_CAP_MIN,
  bedtimeConsistency,
  bedtimeCountdown,
  caffeineCheck,
  caffeineCutoff,
  caffeineCutoffHours,
  circadianDelay,
  debtSleepAddMin,
  learnedSleepBaseline,
  sleepDebt,
  sleepNeed,
  sleepRegularityIndex,
  sleepSummary,
  socialJetlag,
  strainSleepAddMin,
} from './sleep';

const ASOF = '2026-09-06';
const day = (n: number) => addDays(ASOF, -n); // n days before asOf
const profile: Profile = { ...DEFAULT_PROFILE, sleepBaselineHrs: 8, bedTarget: '23:00', wakeTarget: '07:00', caffeineCutoff: '14:00' };
const at = (h: number, m: number) => new Date(2026, 8, 6, h, m);

/** `n` nights ending at `end`, newest last, with a regular bed/wake schedule. */
function nights(n: number, opts: { end?: string; bt?: string; wk?: string; slh?: number } = {}): DailyRecord[] {
  const end = opts.end ?? ASOF;
  return Array.from({ length: n }, (_, i) => ({
    d: addDays(end, -(n - 1 - i)),
    slh: opts.slh ?? 8,
    bt: opts.bt ?? '23:00',
    wk: opts.wk ?? '07:00',
  }));
}

describe('strainSleepAddMin (logistic, midpoint 13.5 / scale 3)', () => {
  it('≈2.4 min at strain 4, 30 at the 13.5 midpoint, ≈55 at 21', () => {
    // v3 moved the midpoint from 12 to 13.5 and the scale from 2.5 to 3, so a
    // moderate day no longer asks for half an hour of extra sleep.
    expect(strainSleepAddMin(4)).toBeCloseTo(2.43, 2);
    expect(strainSleepAddMin(12)).toBeCloseTo(22.65, 2);
    expect(strainSleepAddMin(13.5)).toBeCloseTo(30, 6);
    expect(strainSleepAddMin(21)).toBeCloseTo(55.45, 2);
  });
  it('is 0 for missing strain and bounded by 60', () => {
    expect(strainSleepAddMin(null)).toBe(0);
    expect(strainSleepAddMin(undefined)).toBe(0);
    expect(strainSleepAddMin(NaN)).toBe(0);
    expect(strainSleepAddMin(100)).toBeLessThanOrEqual(60);
    expect(strainSleepAddMin(-100)).toBeGreaterThanOrEqual(0);
  });
});

describe('debtSleepAddMin', () => {
  it('repays a third of the debt, capped at 45 min', () => {
    expect(debtSleepAddMin(90)).toBe(30);
    expect(debtSleepAddMin(300)).toBe(45);
    expect(debtSleepAddMin(0)).toBe(0);
    expect(debtSleepAddMin(-20)).toBe(0);
    expect(debtSleepAddMin(null)).toBe(0);
  });
});

describe('sleepNeed', () => {
  it('adds strain and debt minutes and credits naps', () => {
    const r = sleepNeed({ baselineHrs: 7.75, strain: 12, debtMin: 90, napMin: 30 });
    expect(r.strainAddMin).toBe(22.7);
    expect(r.debtAddMin).toBe(30);
    expect(r.napCreditMin).toBe(30);
    expect(r.circadianAddMin).toBe(0);
    expect(r.needHrs).toBe(8.13);
  });
  it('adds the circadian-delay penalty (Depner 2019)', () => {
    const r = sleepNeed({ baselineHrs: 8, circadianPenaltyMin: 15 });
    expect(r.circadianAddMin).toBe(15);
    expect(r.needHrs).toBe(8.25);
    expect(sleepNeed({ baselineHrs: 8, circadianPenaltyMin: -5 }).circadianAddMin).toBe(0);
  });
  it('equals the baseline with no inputs and floors at 5 h', () => {
    expect(sleepNeed({ baselineHrs: 7.75 }).needHrs).toBe(7.75);
    expect(sleepNeed({ baselineHrs: 6, napMin: 180 }).needHrs).toBe(5);
    expect(sleepNeed({ baselineHrs: NaN }).needHrs).toBe(7.75);
  });
});

describe('sleepDebt (λ = 0.85 decay, 28 nights, 2 h/night repayment cap)', () => {
  it('carries 85% of yesterday and adds (need − slept) × 60', () => {
    // 60 → 0.85·60 + 60 = 111 → 0.85·111 + 60 = 154.35.
    const records: DailyRecord[] = [
      { d: day(2), slh: 7 },
      { d: day(1), slh: 7 },
      { d: day(0), slh: 7 },
    ];
    expect(sleepDebt(records, ASOF, profile)).toEqual({ debtMin: 154, nights: 3, repayCapped: false });
  });

  it('has a half-life of ≈ 4.3 days (Kitamura 2016)', () => {
    expect(SLEEP_DEBT_HALFLIFE_DAYS).toBeCloseTo(4.27, 2);
    // One 4 h deficit, then nothing logged: half of it is gone in ~4 nights.
    const one: DailyRecord[] = [{ d: day(13), slh: 4 }];
    const start = sleepDebt(one, day(13), profile).debtMin;
    expect(start).toBe(240);
    expect(sleepDebt(one, day(9), profile).debtMin / start).toBeCloseTo(0.5, 1);
  });

  it('caps at 300 min and never goes negative', () => {
    const short: DailyRecord[] = Array.from({ length: 7 }, (_, i) => ({ d: day(6 - i), slh: 5 }));
    expect(sleepDebt(short, ASOF, profile).debtMin).toBe(300);
    const long: DailyRecord[] = Array.from({ length: 5 }, (_, i) => ({ d: day(4 - i), slh: 10 }));
    expect(sleepDebt(long, ASOF, profile)).toEqual({ debtMin: 0, nights: 5, repayCapped: false });
  });

  it('lets a single long night retire at most 2 h of debt (Banks 2010)', () => {
    expect(SLEEP_DEBT_REPAY_CAP_MIN).toBe(120);
    // Five 5 h nights pin the debt at the 300 min cap; one 11 h night would
    // otherwise wipe 180 min of it in a single go.
    const week: DailyRecord[] = Array.from({ length: 5 }, (_, i) => ({ d: day(5 - i), slh: 5 }));
    expect(sleepDebt(week, day(1), profile).debtMin).toBe(300);
    const withLieIn = sleepDebt([...week, { d: day(0), slh: 11 }], ASOF, profile);
    // 0.85·300 − 120 = 135, not 0.85·300 − 180 = 75.
    expect(withLieIn.debtMin).toBe(135);
    expect(withLieIn.repayCapped).toBe(true);
    expect(withLieIn.debtMin).toBeGreaterThanOrEqual(60);
  });

  it('decays on nights without sleep hours and ignores records outside the 28-night window', () => {
    const records: DailyRecord[] = [
      { d: day(30), slh: 4 }, // outside the 28-night window
      { d: day(3), slh: 7 }, // +60 → 60
      { d: day(2), strn: 15 }, // no slh → decay to 51 (and sets tomorrow's strain)
      { d: day(1), slh: 7 }, // need 8.62 h → 0.85·51 + 97.2 = 140.55
      { d: day(0) }, // no slh → decay to 119.5
    ];
    expect(sleepDebt(records, ASOF, profile)).toEqual({ debtMin: 119, nights: 2, repayCapped: false });
    expect(sleepDebt([], ASOF, profile)).toEqual({ debtMin: 0, nights: 0, repayCapped: false });
  });

  it("computes need from the previous day's strain and the running debt when sln is absent", () => {
    const records: DailyRecord[] = [
      { d: day(1), slh: 8, strn: 21 }, // baseline 8, no prior strain → need 8 → debt 0
      { d: day(0), slh: 8 }, // need = 8 + 55.4 min from yesterday's strain 21
    ];
    const r = sleepDebt(records, ASOF, profile);
    expect(r.nights).toBe(2);
    expect(r.debtMin).toBe(55);
    // f(debt) is a pay-back ask shown in tonight's need, not extra debt (R3-2);
    // a baseline night now *decays* the 55 min rather than carrying it forever.
    const next = sleepDebt([...records, { d: addDays(ASOF, 1), slh: 8 }], addDays(ASOF, 1), profile);
    expect(next.debtMin).toBe(47); // 0.85 × 55.2
    expect(sleepSummary([...records, { d: addDays(ASOF, 1), slh: 8 }], addDays(ASOF, 1), profile).need).toBeCloseTo(8.31, 2);
  });

  it('uses an imported sln for accrual only when a dbt accompanies it', () => {
    // sln alone is a vendor target the vendor never reconciled — ignored, so the
    // 8 h profile baseline is used and a 7 h night costs 60 min, not 120.
    const bare: DailyRecord[] = [{ d: day(0), slh: 7, sln: 9 }];
    expect(sleepDebt(bare, ASOF, profile).debtMin).toBe(60);
    // With a dbt on the same record the imported need is trusted for accrual…
    const paired: DailyRecord[] = [
      { d: day(1), slh: 7, sln: 9, dbt: 30 },
      { d: day(0), slh: 7 },
    ];
    // day(1): (9 − 7) × 60 = 120 → 120; day(0): 0.85·120 + 60 = 162.
    expect(sleepDebt(paired, ASOF, profile).debtMin).toBe(162);
  });

  it("prefers an imported dbt on asOf's record", () => {
    const records: DailyRecord[] = [
      { d: day(1), slh: 7, sln: 8, dbt: 10 },
      { d: day(0), slh: 7, sln: 8, dbt: 42 },
    ];
    expect(sleepDebt(records, ASOF, profile).debtMin).toBe(42);
  });

  it('is order-independent and ignores future-dated records', () => {
    const inOrder: DailyRecord[] = [{ d: day(2), slh: 6 }, { d: day(1), slh: 7 }, { d: day(0), slh: 8 }];
    const shuffled = [inOrder[2], inOrder[0], inOrder[1], { d: addDays(ASOF, 3), slh: 2 }];
    expect(sleepDebt(shuffled, ASOF, profile)).toEqual(sleepDebt(inOrder, ASOF, profile));
  });

  it('never returns NaN for degenerate records', () => {
    const junk: DailyRecord[] = [{ d: day(1) }, { d: day(0), slh: NaN as unknown as number }];
    const r = sleepDebt(junk, ASOF, profile);
    expect(Number.isFinite(r.debtMin)).toBe(true);
    expect(r.nights).toBe(0);
  });
});

describe('bedtimeConsistency', () => {
  it('handles bedtimes across midnight on the noon axis (23:30, 00:15, 22:50)', () => {
    const records: DailyRecord[] = [
      { d: day(2), bt: '23:30', wk: '07:00' },
      { d: day(1), bt: '00:15', wk: '07:00' },
      { d: day(0), bt: '22:50', wk: '07:00' },
    ];
    const c = bedtimeConsistency(records, ASOF);
    expect(c.n).toBe(3);
    expect(c.bedtimeSdMin).toBeCloseTo(42.5, 0);
    expect(c.bedtimeSdMin as number).toBeLessThan(60);
    expect(c.meanBedtime).toBe('23:32');
    // midpoints: 23:30+3h45 = 03:15, 00:15+3h22.5 = 03:37.5, 22:50+4h05 = 02:55 → SD ≈ 21 min
    expect(c.midpointSdMin).toBeCloseTo(21.3, 0);
    expect(c.meanMidpoint).toBe('03:16');
  });

  it('falls back to slh for the midpoint when no wake time, and returns nulls for < 2 nights', () => {
    const one = bedtimeConsistency([{ d: day(0), bt: '23:00', slh: 8 }], ASOF);
    expect(one).toEqual({ bedtimeSdMin: null, midpointSdMin: null, meanBedtime: '23:00', meanMidpoint: '03:00', n: 1 });
    const none = bedtimeConsistency([{ d: day(0), slh: 8 }], ASOF);
    expect(none.n).toBe(0);
    expect(none.meanBedtime).toBeNull();
  });

  it('only looks at the requested window', () => {
    const records: DailyRecord[] = [
      { d: day(9), bt: '02:00' },
      { d: day(1), bt: '23:00' },
      { d: day(0), bt: '23:10' },
    ];
    const c = bedtimeConsistency(records, ASOF, 7);
    expect(c.n).toBe(2);
    expect(c.bedtimeSdMin).toBeCloseTo(7.1, 1);
  });
});

describe('circadianDelay (Depner 2019)', () => {
  it('charges 15 min when the midpoint lands more than an hour late', () => {
    // 13 regular nights (midpoint 03:00) then a lie-in: bed 01:00, up at 11:00
    // → midpoint 06:00, three hours later than usual.
    const recs: DailyRecord[] = [...nights(13, { end: day(1) }), { d: day(0), bt: '01:00', wk: '11:00' }];
    const c = circadianDelay(recs, ASOF);
    expect(c.medianMidpoint).toBe('03:00');
    expect(c.lastMidpoint).toBe('06:00');
    expect(c.delayMin).toBe(180);
    expect(c.delayed).toBe(true);
    expect(c.penaltyMin).toBe(15);
    expect(c.reason).toMatch(/circadian alignment/);
  });

  it('does not fire for a half-hour drift, and stays quiet without a reference', () => {
    const steady: DailyRecord[] = [...nights(13, { end: day(1) }), { d: day(0), bt: '23:30', wk: '07:30' }];
    const c = circadianDelay(steady, ASOF);
    expect(c.delayMin).toBe(30);
    expect(c.delayed).toBe(false);
    expect(c.penaltyMin).toBe(0);
    expect(c.reason).toMatch(/in line with/);

    const thin = circadianDelay(nights(3), ASOF);
    expect(thin.delayMin).toBeNull();
    expect(thin.penaltyMin).toBe(0);
    expect(thin.reason).toBeTruthy();
    expect(circadianDelay([], ASOF).delayed).toBe(false);
  });
});

describe('sleepRegularityIndex (Phillips 2017)', () => {
  it('is 100 for a perfectly regular schedule', () => {
    const r = sleepRegularityIndex(nights(20), ASOF);
    expect(r.sri).toBe(100);
    expect(r.nights).toBe(20);
    expect(r.pairs).toBe(19);
    expect(r.flagged).toBe(false);
  });

  it('drops when bedtime alternates by two hours, and flags below 70', () => {
    const recs = Array.from({ length: 20 }, (_, i) => ({
      d: addDays(ASOF, -(19 - i)),
      bt: i % 2 === 0 ? '23:00' : '01:00',
      wk: i % 2 === 0 ? '07:00' : '09:00',
    }));
    const r = sleepRegularityIndex(recs, ASOF);
    // Every pair is out of phase by 120 min at both ends: 240/1440 mismatched.
    expect(r.sri).toBeCloseTo(66.7, 1);
    expect(r.flagged).toBe(true);
    expect(r.reason).toMatch(/below 70/);
  });

  it('is null below 14 nights and never NaN on empty input', () => {
    expect(sleepRegularityIndex(nights(13), ASOF).sri).toBeNull();
    expect(sleepRegularityIndex(nights(14), ASOF).sri).toBe(100);
    const empty = sleepRegularityIndex([], ASOF);
    expect(empty.sri).toBeNull();
    expect(empty.nights).toBe(0);
    expect(empty.reason).toMatch(/14 nights/);
  });

  it('only compares back-to-back nights, so a gap removes pairs rather than faking wakefulness', () => {
    const recs = nights(20).filter((_, i) => i !== 10);
    const r = sleepRegularityIndex(recs, ASOF);
    expect(r.nights).toBe(19);
    expect(r.pairs).toBe(17); // the missing night removes two pairs
    expect(r.sri).toBe(100);
  });
});

describe('socialJetlag (MCTQ)', () => {
  it('measures the midsleep gap between rest days and training days', () => {
    // DEFAULT_SPLIT rests on Sun/Wed/Sat. Nights before a rest day run 90 min late.
    const recs = Array.from({ length: 28 }, (_, i) => {
      const d = addDays(ASOF, -(27 - i));
      const rest = [0, 3, 6].includes(new Date(`${d}T00:00:00`).getDay());
      return { d, bt: rest ? '00:30' : '23:00', wk: rest ? '08:30' : '07:00' };
    });
    const j = socialJetlag(recs, ASOF, profile);
    expect(j.trainingMidpoint).toBe('03:00');
    expect(j.restMidpoint).toBe('04:30');
    expect(j.minutes).toBe(90);
    expect(j.nRest).toBeGreaterThanOrEqual(3);
    expect(j.nTraining).toBeGreaterThanOrEqual(3);
  });

  it('is null until three nights of each kind exist', () => {
    const j = socialJetlag(nights(4), ASOF, profile);
    expect(j.minutes).toBeNull();
    expect(j.reason).toMatch(/3 logged nights/);
    expect(socialJetlag([], ASOF, profile).minutes).toBeNull();
  });

  it('honours a `lift` override on the record', () => {
    // Every day is scheduled rest, but the user marks half of them as lift days.
    const restOnly: Profile = { ...profile, split: { 0: 'rest', 1: 'rest', 2: 'rest', 3: 'rest', 4: 'rest', 5: 'rest', 6: 'rest' } };
    const recs = Array.from({ length: 14 }, (_, i) => ({
      d: addDays(ASOF, -(13 - i)),
      bt: i % 2 === 0 ? '23:00' : '00:00',
      wk: i % 2 === 0 ? '07:00' : '08:00',
      lift: i % 2 === 0 ? true : undefined,
    }));
    const j = socialJetlag(recs, ASOF, restOnly);
    expect(j.minutes).toBe(60);
  });
});

describe('learnedSleepBaseline', () => {
  const recovered = (n: number, goodHrs: number): DailyRecord[] =>
    Array.from({ length: n }, (_, i) => ({
      d: addDays(ASOF, -(n - 1 - i)),
      slh: i % 2 === 0 ? goodHrs : 7,
      rec: i % 2 === 0 ? 90 : 50,
    }));

  it('takes the median of nights followed by top-tercile readiness', () => {
    const l = learnedSleepBaseline(recovered(30, 8.5), ASOF, profile);
    expect(l.nights).toBe(15);
    expect(l.thresholdReadiness).toBe(90);
    expect(l.rawHrs).toBe(8.5);
    expect(l.hrs).toBe(8.5);
    expect(l.clamped).toBe(false);
  });

  it('clamps to the profile baseline ± 0.75 h', () => {
    const l = learnedSleepBaseline(recovered(30, 9.6), ASOF, profile);
    expect(l.rawHrs).toBe(9.6);
    expect(l.hrs).toBe(8.75);
    expect(l.clamped).toBe(true);
    expect(l.reason).toMatch(/held at 8.75 h/);
  });

  it('stays null below 14 qualifying nights and without readiness data', () => {
    expect(learnedSleepBaseline(recovered(20, 8.5), ASOF, profile).hrs).toBeNull(); // only 10 good nights
    expect(learnedSleepBaseline(nights(40), ASOF, profile).hrs).toBeNull(); // no readiness at all
    expect(learnedSleepBaseline([], ASOF, profile).hrs).toBeNull();
  });

  it('accepts a readiness map from the caller (never imports readiness)', () => {
    const recs = Array.from({ length: 30 }, (_, i) => ({ d: addDays(ASOF, -(29 - i)), slh: i % 2 === 0 ? 8.4 : 7 }));
    const readiness: Record<string, number> = {};
    recs.forEach((r, i) => { readiness[r.d] = i % 2 === 0 ? 88 : 44; });
    const l = learnedSleepBaseline(recs, ASOF, profile, { readiness });
    expect(l.nights).toBe(15);
    expect(l.hrs).toBe(8.4);
  });
});

describe('bedtimeCountdown', () => {
  it('is active from 60 min before to 90 min after the target', () => {
    expect(bedtimeCountdown(at(21, 59), '23:00', '07:00')).toBeNull();
    expect(bedtimeCountdown(at(22, 0), '23:00', '07:00')?.minutesToBed).toBe(60);
    expect(bedtimeCountdown(at(0, 30), '23:00', '07:00')?.minutesToBed).toBe(-90);
    expect(bedtimeCountdown(at(0, 31), '23:00', '07:00')).toBeNull();
    expect(bedtimeCountdown(at(12, 0), '23:00', '07:00')).toBeNull();
  });

  it('produces the wind-down and past messages with achievable hours', () => {
    const wind = bedtimeCountdown(at(22, 15), '23:00', '07:00');
    expect(wind?.phase).toBe('wind-down');
    expect(wind?.message).toBe('Wind-down: 45 min to bed for 8 h before your 07:00 alarm');
    expect(wind?.achievableHrs).toBe(8.75);

    const past = bedtimeCountdown(at(23, 20), '23:00', '07:00');
    expect(past?.phase).toBe('past');
    expect(past?.minutesToBed).toBe(-20);
    expect(past?.message).toBe("You're 20 min past your 23:00 bedtime — lights out protects tomorrow's recovery");
    expect(past?.achievableHrs).toBeCloseTo(7.67, 2);
  });

  it('works for a target after midnight and rejects malformed input', () => {
    const r = bedtimeCountdown(at(0, 10), '00:30', '07:30');
    expect(r?.minutesToBed).toBe(20);
    expect(r?.message).toBe('Wind-down: 20 min to bed for 7 h before your 07:30 alarm');
    expect(bedtimeCountdown(at(23, 0), 'bad', '07:00')).toBeNull();
    expect(bedtimeCountdown(new Date(NaN), '23:00', '07:00')).toBeNull();
  });
});

describe('caffeineCutoffHours (Gardiner 2023)', () => {
  it('reproduces the published anchor pairs', () => {
    // Verified against the Gardiner 2023 abstract: 107 mg → 8.8 h, 217.5 mg →
    // 13.2 h, 47 mg (a cup of black tea) → no cut-off.
    for (const a of CAFFEINE_ANCHORS) expect(caffeineCutoffHours(a.mg)).toBeCloseTo(a.hours, 1);
    expect(caffeineCutoffHours(107)).toBe(8.8);
    expect(caffeineCutoffHours(217.5)).toBe(13.2);
    expect(caffeineCutoffHours(47)).toBe(0);
    expect(caffeineCutoffHours(20)).toBe(0);
  });

  it('interpolates in ln(dose) and rises monotonically', () => {
    const mid = caffeineCutoffHours(150) as number;
    expect(mid).toBeGreaterThan(8.8);
    expect(mid).toBeLessThan(13.2);
    let prev = -1;
    for (const mg of [50, 80, 107, 150, 217.5, 300, 400, 600]) {
      const h = caffeineCutoffHours(mg) as number;
      expect(h).toBeGreaterThanOrEqual(prev);
      prev = h;
    }
  });

  it('clears the Drake 2013 floor at 400 mg and stays capped', () => {
    // Drake 2013: 400 mg six hours before bed still cost > 1 h of sleep, so the
    // curve must ask for more than 6 h at that dose.
    expect(caffeineCutoffHours(CAFFEINE_DRAKE_CHECK.mg) as number).toBeGreaterThan(CAFFEINE_DRAKE_CHECK.hours);
    expect(caffeineCutoffHours(5000) as number).toBeLessThanOrEqual(16);
  });

  it('is null for a missing or nonsense dose', () => {
    expect(caffeineCutoffHours(null)).toBeNull();
    expect(caffeineCutoffHours(undefined)).toBeNull();
    expect(caffeineCutoffHours(NaN)).toBeNull();
    expect(caffeineCutoffHours(0)).toBeNull();
  });
});

describe('caffeineCutoff', () => {
  it('turns a dose into a clock time before the bed target', () => {
    const c = caffeineCutoff(107, '23:00', '14:00');
    expect(c.source).toBe('dose');
    expect(c.hoursBeforeBed).toBe(8.8);
    expect(c.cutoff).toBe('14:12');
    expect(c.extrapolated).toBe(false);
    expect(c.label).toMatch(/107 mg/);
  });

  it('flags an extrapolated dose above the studied range', () => {
    const c = caffeineCutoff(400, '23:00', '14:00');
    expect(c.extrapolated).toBe(true);
    expect(c.label).toMatch(/extrapolation/);
    expect(c.hoursBeforeBed).toBeGreaterThan(13.2);
  });

  it('falls back to the profile cutoff, labelled as the default, with no dose', () => {
    const c = caffeineCutoff(null, '23:00', '14:00');
    expect(c.source).toBe('default');
    expect(c.cutoff).toBe('14:00');
    expect(c.hoursBeforeBed).toBe(9);
    expect(c.doseMg).toBeNull();
    expect(c.label).toMatch(/Default cutoff/);
  });

  it('never throws or returns NaN on malformed input', () => {
    const c = caffeineCutoff(120, 'nonsense', null);
    expect(c.source).toBe('default');
    expect(Number.isFinite(c.hoursBeforeBed)).toBe(true);
    expect(caffeineCutoff(undefined, '23:00').cutoff).toBe('15:00');
  });
});

describe('caffeineCheck', () => {
  it('flags the latest caffeine after the cutoff and its distance from bed', () => {
    expect(caffeineCheck(['08:00', '15:30'], '23:00', '14:00')).toEqual({ afterCutoff: '15:30', latest: '15:30', hoursBeforeBed: 7.5 });
    expect(caffeineCheck(['09:00', '13:59'], '23:00', '14:00')).toEqual({ afterCutoff: null, latest: '13:59', hoursBeforeBed: 9 });
    expect(caffeineCheck(undefined, '23:00', '14:00')).toEqual({ afterCutoff: null, latest: null, hoursBeforeBed: null });
    expect(caffeineCheck([], '23:00', '14:00').latest).toBeNull();
  });
  it('handles a bed target after midnight and malformed entries', () => {
    expect(caffeineCheck(['16:00', 'nope'], '00:30', '14:00')).toEqual({ afterCutoff: '16:00', latest: '16:00', hoursBeforeBed: 8.5 });
  });
  it('judges an entry against its own dose when one is logged', () => {
    // 13:00 is inside the fixed 14:00 cutoff, but 200 mg wants 12.7 h before a
    // 23:00 bed — i.e. 10:18 — so it is late after all.
    expect(caffeineCheck(['13:00'], '23:00', '14:00').afterCutoff).toBeNull();
    expect(caffeineCheck(['13:00'], '23:00', '14:00', [200]).afterCutoff).toBe('13:00');
    // A 40 mg tea at 15:00 has no published cutoff, so it stops being flagged.
    expect(caffeineCheck(['15:00'], '23:00', '14:00').afterCutoff).toBe('15:00');
    expect(caffeineCheck(['15:00'], '23:00', '14:00', [40]).afterCutoff).toBeNull();
    // A missing dose falls back to the fixed cutoff for that entry only.
    expect(caffeineCheck(['09:00', '15:00'], '23:00', '14:00', [200, undefined]).afterCutoff).toBe('15:00');
  });
});

describe('sleepSummary', () => {
  it('reports hours vs need, debt, last bedtime, consistency and the 30-night mean', () => {
    const records: DailyRecord[] = [
      { d: day(40), slh: 5 }, // outside the 30-night history
      { d: day(2), slh: 7, bt: '23:10' },
      { d: day(1), slh: 7.5, bt: '23:40', wk: '07:10' },
      { d: day(0), slh: 7, bt: '23:00' },
    ];
    const s = sleepSummary(records, ASOF, profile);
    expect(s.hours).toBe(7);
    // 60 → 0.85·60 + 30 = 81 → 0.85·81 + 60 = 128.85.
    expect(s.debtMin).toBe(129);
    // Last night's displayed need carries f(debt before it) = 81/3 = 27 min.
    expect(s.need).toBe(8.45);
    expect(s.deltaVsNeedMin).toBe(-87);
    expect(s.lastBedtime).toBe('23:00');
    expect(s.consistency.n).toBe(3);
    expect(s.hours30dMean).toBe(7.25);
    expect(s.baselineHrs).toBe(8);
    expect(s.baselineSource).toBe('profile');
    expect(s.learnedBaselineHrs).toBeNull();
  });

  it('always computes tonight’s need, even when last night is not logged yet', () => {
    const records: DailyRecord[] = [
      { d: day(1), slh: 7, bt: '23:30' },
      { d: day(0), strn: 12 }, // today: strain 12 → +22.7 min, debt 51 → +17 min
    ];
    const s = sleepSummary(records, ASOF, profile);
    expect(s.hours).toBeNull();
    expect(s.deltaVsNeedMin).toBeNull();
    expect(s.debtMin).toBe(51); // 60 decayed one night
    expect(s.tonightNeed).toBeCloseTo(8.66, 2);
    expect(s.need).toBe(s.tonightNeed);
    expect(s.lastBedtime).toBe('23:30');
    expect(s.tonightNeedReason).toMatch(/Baseline 8 h/);

    const blank = sleepSummary([], ASOF, profile);
    expect(blank.need).toBe(8);
    expect(blank.tonightNeed).toBe(8);
    expect(blank.hours30dMean).toBeNull();
    expect(blank.sri).toBeNull();
    expect(blank.socialJetlagMin).toBeNull();
    expect(blank.midpointSdMin).toBeNull();
    expect(blank.debtRepayCapped).toBe(false);
  });

  it('adds the circadian penalty to tonight’s need and says why', () => {
    const recs: DailyRecord[] = [...nights(13, { end: day(1) }), { d: day(0), bt: '01:00', wk: '11:00', slh: 10 }];
    const s = sleepSummary(recs, ASOF, profile);
    expect(s.circadian.delayed).toBe(true);
    expect(s.tonightNeed).toBeCloseTo(8.25, 2);
    expect(s.tonightNeedReason).toMatch(/circadian alignment/);
    expect(s.tonightNeedReason).not.toMatch(/well done|great/i);
  });

  it('surfaces the regularity block: SRI, social jetlag and the midpoint SD', () => {
    const s = sleepSummary(nights(28), ASOF, profile);
    expect(s.sri).toBe(100);
    expect(s.sriNights).toBe(28);
    expect(s.sriFlagged).toBe(false);
    expect(s.midpointSdMin).toBe(0);
    expect(s.socialJetlagMin).toBe(0); // same schedule on rest and training days
  });

  it('uses the learned baseline once it exists and labels the source', () => {
    const recs: DailyRecord[] = Array.from({ length: 30 }, (_, i) => ({
      d: addDays(ASOF, -(29 - i)),
      slh: i % 2 === 0 ? 8.5 : 7,
      rec: i % 2 === 0 ? 90 : 50,
    }));
    const s = sleepSummary(recs, ASOF, profile);
    expect(s.learnedBaselineHrs).toBe(8.5);
    expect(s.baselineSource).toBe('learned');
    expect(s.baselineHrs).toBe(8.5);
    // An imported need on asOf (with its debt) takes over the label.
    const imported = sleepSummary([...recs.slice(0, 29), { ...recs[29], sln: 8.2, dbt: 20 }], ASOF, profile);
    expect(imported.baselineSource).toBe('imported');
    expect(imported.debtMin).toBe(20);
  });
});

describe('R3-2 — sleep debt accrues against baseline + f(strain) − naps only', () => {
  it('a user sleeping exactly baseline every night never accrues debt', () => {
    const recs: DailyRecord[] = Array.from({ length: 14 }, (_, i) => ({ d: day(13 - i), slh: 8 }));
    expect(sleepDebt(recs, ASOF, profile)).toEqual({ debtMin: 0, nights: 14, repayCapped: false });
  });

  it('one short night decays away instead of compounding, and a surplus night clears it', () => {
    // Night 1: 7 h on an 8 h baseline (−60); nights 2–13: exactly 8 h.
    const recs: DailyRecord[] = [{ d: day(13), slh: 7 }, ...Array.from({ length: 12 }, (_, i) => ({ d: day(12 - i), slh: 8 }))];
    const walked = sleepDebt(recs, day(1), profile);
    expect(walked.nights).toBe(13);
    // v1 carried the 60 min for ever; v3 decays it at λ = 0.85 (Kitamura 2016).
    expect(walked.debtMin).toBe(9); // 60 × 0.85¹² ≈ 8.5, never 80 → 106 → … → 300
    const s = sleepSummary(recs, day(1), profile);
    expect(s.debtMin).toBe(9);
    expect(s.need).toBeCloseTo(8.06, 2); // the pay-back ask on 10 min of debt
    // A 9 h night clears what is left.
    expect(sleepDebt([...recs, { d: day(0), slh: 9 }], ASOF, profile).debtMin).toBe(0);
  });

  it('strain still raises the accrual need; naps still lower it', () => {
    const recs: DailyRecord[] = [
      { d: day(1), slh: 8, strn: 21, nap: 30 }, // yesterday: hard day + a 30 min nap
      { d: day(0), slh: 8 }, // need = 8 h + 55.4 min strain − 30 min nap → 25 min short
    ];
    expect(sleepDebt(recs, ASOF, profile).debtMin).toBe(25);
  });
});
