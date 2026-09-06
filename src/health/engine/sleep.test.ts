import { describe, expect, it } from 'vitest';
import type { DailyRecord, Profile } from '../data/types';
import { DEFAULT_PROFILE } from '../data/defaults';
import { addDays } from '../lib/dates';
import {
  bedtimeConsistency,
  bedtimeCountdown,
  caffeineCheck,
  debtSleepAddMin,
  sleepDebt,
  sleepNeed,
  sleepSummary,
  strainSleepAddMin,
} from './sleep';

const ASOF = '2026-09-06';
const day = (n: number) => addDays(ASOF, -n); // n days before asOf
const profile: Profile = { ...DEFAULT_PROFILE, sleepBaselineHrs: 8, bedTarget: '23:00', wakeTarget: '07:00', caffeineCutoff: '14:00' };
const at = (h: number, m: number) => new Date(2026, 8, 6, h, m);

describe('strainSleepAddMin (logistic)', () => {
  it('≈2 min at strain 4, 30 at 12, ≈58 at 21', () => {
    expect(strainSleepAddMin(4)).toBeCloseTo(2.35, 1);
    expect(strainSleepAddMin(12)).toBeCloseTo(30, 6);
    expect(strainSleepAddMin(21)).toBeCloseTo(58.4, 1);
  });
  it('is 0 for missing strain and bounded by 60', () => {
    expect(strainSleepAddMin(null)).toBe(0);
    expect(strainSleepAddMin(undefined)).toBe(0);
    expect(strainSleepAddMin(NaN)).toBe(0);
    expect(strainSleepAddMin(100)).toBeLessThanOrEqual(60);
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
    expect(r.strainAddMin).toBe(30);
    expect(r.debtAddMin).toBe(30);
    expect(r.napCreditMin).toBe(30);
    expect(r.needHrs).toBe(8.25);
  });
  it('equals the baseline with no inputs and floors at 5 h', () => {
    expect(sleepNeed({ baselineHrs: 7.75 }).needHrs).toBe(7.75);
    expect(sleepNeed({ baselineHrs: 6, napMin: 180 }).needHrs).toBe(5);
    expect(sleepNeed({ baselineHrs: NaN }).needHrs).toBe(7.75);
  });
});

describe('sleepDebt', () => {
  it('accumulates (need − slept) × 60 across nights, oldest to newest', () => {
    const records: DailyRecord[] = [
      { d: day(2), slh: 7, sln: 8 },
      { d: day(1), slh: 7, sln: 8 },
      { d: day(0), slh: 7, sln: 8 },
    ];
    expect(sleepDebt(records, ASOF, profile)).toEqual({ debtMin: 180, nights: 3 });
  });

  it('caps at 300 min and never goes negative', () => {
    const short: DailyRecord[] = Array.from({ length: 7 }, (_, i) => ({ d: day(6 - i), slh: 5, sln: 8 }));
    expect(sleepDebt(short, ASOF, profile).debtMin).toBe(300);
    const long: DailyRecord[] = Array.from({ length: 5 }, (_, i) => ({ d: day(4 - i), slh: 10, sln: 8 }));
    expect(sleepDebt(long, ASOF, profile)).toEqual({ debtMin: 0, nights: 5 });
  });

  it('skips nights without sleep hours, ignores records outside the 14-night window', () => {
    const records: DailyRecord[] = [
      { d: day(20), slh: 4, sln: 8 }, // outside window
      { d: day(3), slh: 7, sln: 8 },
      { d: day(2), strn: 15 }, // no slh → skipped
      { d: day(1), slh: 7, sln: 8 },
      { d: day(0), sln: 8 },
    ];
    expect(sleepDebt(records, ASOF, profile)).toEqual({ debtMin: 120, nights: 2 });
    expect(sleepDebt([], ASOF, profile)).toEqual({ debtMin: 0, nights: 0 });
  });

  it("computes need from the previous day's strain and the running debt when sln is absent", () => {
    const records: DailyRecord[] = [
      { d: day(1), slh: 8, strn: 21 }, // baseline 8, no prior strain → need 8 → debt 0
      { d: day(0), slh: 8 }, // need = 8 + 58.4 min from yesterday's strain 21
    ];
    const r = sleepDebt(records, ASOF, profile);
    expect(r.nights).toBe(2);
    expect(r.debtMin).toBe(58);
    // Debt feeds back into need: 58 min debt adds ~19.5 min to the next night's need.
    const next = sleepDebt([...records, { d: addDays(ASOF, 1), slh: 8 }], addDays(ASOF, 1), profile);
    expect(next.debtMin).toBe(78);
  });

  it("prefers an imported dbt on asOf's record", () => {
    const records: DailyRecord[] = [
      { d: day(1), slh: 7, sln: 8 },
      { d: day(0), slh: 7, sln: 8, dbt: 42 },
    ];
    expect(sleepDebt(records, ASOF, profile)).toEqual({ debtMin: 42, nights: 2 });
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
});

describe('sleepSummary', () => {
  it('reports hours vs need, debt, last bedtime, consistency and the 30-night mean', () => {
    const records: DailyRecord[] = [
      { d: day(40), slh: 5 }, // outside the 30-night history
      { d: day(2), slh: 7, sln: 8, bt: '23:10' },
      { d: day(1), slh: 7.5, sln: 8, bt: '23:40', wk: '07:10' },
      { d: day(0), slh: 7, sln: 8, bt: '23:00' },
    ];
    const s = sleepSummary(records, ASOF, profile);
    expect(s.hours).toBe(7);
    expect(s.need).toBe(8);
    expect(s.debtMin).toBe(150);
    expect(s.deltaVsNeedMin).toBe(-60);
    expect(s.lastBedtime).toBe('23:00');
    expect(s.consistency.n).toBe(3);
    expect(s.hours30dMean).toBe(7.25);
  });

  it('projects tonight’s need when last night is not logged yet', () => {
    const records: DailyRecord[] = [
      { d: day(1), slh: 7, sln: 8, bt: '23:30' },
      { d: day(0), strn: 12 }, // today: strain 12 → +30 min, debt 60 → +20 min
    ];
    const s = sleepSummary(records, ASOF, profile);
    expect(s.hours).toBeNull();
    expect(s.deltaVsNeedMin).toBeNull();
    expect(s.debtMin).toBe(60);
    expect(s.need).toBeCloseTo(8.83, 2);
    expect(s.lastBedtime).toBe('23:30');
    expect(sleepSummary([], ASOF, profile).need).toBe(8);
    expect(sleepSummary([], ASOF, profile).hours30dMean).toBeNull();
  });
});
