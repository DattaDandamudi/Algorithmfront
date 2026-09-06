import { describe, expect, it } from 'vitest';
import type { AppSettings, DailyRecord, ISODate } from '../data/types';
import { DEFAULT_SETTINGS } from '../data/defaults';
import { addDays, hhmmToMinutes, lastNDates } from '../lib/dates';
import {
  CAFFEINE_ABSORPTION_MIN,
  CAFFEINE_DEFAULT_MG,
  CAFFEINE_HALF_LIFE_H,
  CIRCADIAN_HARMONICS,
  CIRCADIAN_TROUGH_OFFSET_H,
  FORECAST_STEP_MIN,
  TAU_DECAY_H,
  TAU_RISE_H,
  caffeineActiveMg,
  circadianC,
  energyForecast,
  energyShape,
  pressureAsleep,
  pressureAwake,
} from './energy';

const END: ISODate = '2026-09-06';
const SETTINGS: AppSettings = DEFAULT_SETTINGS;

/** A regular sleeper: `days` nights of 23:00 → 07:00. */
function nights(days: number, extra: (i: number) => Partial<DailyRecord> = () => ({})): DailyRecord[] {
  return lastNDates(END, days).map((d, i) => ({ d, bt: '23:00', wk: '07:00', slh: 8, ...extra(i) }));
}

function noNaN(v: unknown): void {
  JSON.stringify(v, (_k, x) => {
    if (typeof x === 'number') expect(Number.isFinite(x)).toBe(true);
    return x;
  });
}

// ---------------------------------------------------------------------------
// The two processes
// ---------------------------------------------------------------------------

describe('process S', () => {
  it('rises toward 1 while awake with τ_r = 18 h', () => {
    expect(pressureAwake(0.1, 0)).toBeCloseTo(0.1, 9);
    expect(pressureAwake(0.1, TAU_RISE_H)).toBeCloseTo(1 - 0.9 * Math.exp(-1), 9);
    expect(pressureAwake(0.1, 1000)).toBeCloseTo(1, 6);
    expect(pressureAwake(0.5, 6)).toBeGreaterThan(0.5);
  });

  it('decays toward 0 while asleep with τ_d = 4.2 h', () => {
    expect(pressureAsleep(0.6, 0)).toBeCloseTo(0.6, 9);
    expect(pressureAsleep(0.6, TAU_DECAY_H)).toBeCloseTo(0.6 * Math.exp(-1), 9);
    expect(pressureAsleep(0.6, 1000)).toBeCloseTo(0, 6);
  });

  it('is total: no NaN for any input', () => {
    for (const s of [NaN, Infinity, -1, 2, 0]) {
      for (const h of [NaN, Infinity, -5, 0, 8]) {
        expect(Number.isFinite(pressureAwake(s, h))).toBe(true);
        expect(Number.isFinite(pressureAsleep(s, h))).toBe(true);
      }
    }
  });

  it('reaches a stable fixed point for a repeating 8 h / 16 h schedule', () => {
    let s = 0.35;
    let prev = -1;
    for (let n = 0; n < 30; n++) {
      prev = s;
      s = pressureAsleep(pressureAwake(s, 16), 8);
    }
    expect(Math.abs(s - prev)).toBeLessThan(1e-6);
    expect(s).toBeGreaterThan(0.05);
    expect(s).toBeLessThan(0.2);
  });
});

describe('process C', () => {
  it('is the five-harmonic UMP waveform', () => {
    expect(CIRCADIAN_HARMONICS).toEqual([0.97, 0.22, 0.07, 0.03, 0.001]);
    const p = 17.5;
    // Σ aₖ sin(2πk(t − p)/24), evaluated by hand at t = p + 2.
    const x = (2 * Math.PI * 2) / 24;
    const byHand = CIRCADIAN_HARMONICS.reduce((s, a, k) => s + a * Math.sin((k + 1) * x), 0);
    expect(circadianC(p + 2, p)).toBeCloseTo(byHand, 12);
  });

  it('is 24-hour periodic and zero at the phase', () => {
    expect(circadianC(10, 17.5)).toBeCloseTo(circadianC(34, 17.5), 9);
    expect(circadianC(17.5, 17.5)).toBeCloseTo(0, 9);
  });

  it('puts its minimum 4 h before the phase and its maximum 4 h after', () => {
    const p = 17.5;
    let minAt = 0;
    let maxAt = 0;
    for (let t = 0; t < 24; t += 1 / 60) {
      if (circadianC(t, p) < circadianC(minAt, p)) minAt = t;
      if (circadianC(t, p) > circadianC(maxAt, p)) maxAt = t;
    }
    expect(minAt).toBeCloseTo(p - 4, 1);
    expect(maxAt).toBeCloseTo((p + 4) % 24, 1);
    expect(circadianC(maxAt, p)).toBeCloseTo(1.004, 2);
  });

  it('returns 0 rather than NaN for a non-finite input', () => {
    expect(circadianC(NaN, 17.5)).toBe(0);
    expect(circadianC(12, NaN)).toBe(0);
  });
});

describe('energyShape', () => {
  it('is strictly decreasing in sleep pressure', () => {
    // Inside the unclamped band — outside it the 0–1 clamp is deliberate.
    for (const c of [-1, -0.5, 0, 0.5, 1]) {
      let prev = Infinity;
      for (let s = 0.35; s <= 0.65; s += 0.02) {
        const v = energyShape(s, c);
        expect(v).toBeLessThan(prev);
        expect(v).toBeGreaterThan(0);
        expect(v).toBeLessThan(1);
        prev = v;
      }
    }
  });

  it('rises with the circadian term and falls with sleep inertia', () => {
    expect(energyShape(0.4, 0.8)).toBeGreaterThan(energyShape(0.4, -0.8));
    expect(energyShape(0.2, 0, 0.25)).toBeLessThan(energyShape(0.2, 0, 0));
  });

  it('stays inside 0–1 and never returns NaN', () => {
    for (const s of [NaN, -1, 0, 1, 2]) {
      for (const c of [NaN, -5, 0, 5]) {
        const v = energyShape(s, c, NaN);
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Caffeine
// ---------------------------------------------------------------------------

describe('caffeineActiveMg', () => {
  it('is zero with nothing logged and zero before the dose', () => {
    expect(caffeineActiveMg(undefined, 600)).toBe(0);
    expect(caffeineActiveMg([], 600)).toBe(0);
    expect(caffeineActiveMg(['08:00'], 7 * 60)).toBe(0);
    expect(caffeineActiveMg(['nonsense'], 600)).toBe(0);
  });

  it('peaks about 40 minutes after the dose', () => {
    const doseAt = 8 * 60;
    const peak = caffeineActiveMg(['08:00'], doseAt + CAFFEINE_ABSORPTION_MIN);
    expect(peak).toBeGreaterThan(caffeineActiveMg(['08:00'], doseAt + 10));
    expect(peak).toBeGreaterThan(caffeineActiveMg(['08:00'], doseAt + 90));
    // A one-compartment oral model peaks at ~91 % of the dose.
    expect(peak / CAFFEINE_DEFAULT_MG).toBeGreaterThan(0.85);
    expect(peak / CAFFEINE_DEFAULT_MG).toBeLessThan(0.95);
  });

  it('halves roughly every 5 hours once absorption is done', () => {
    const at = (h: number) => caffeineActiveMg(['08:00'], 8 * 60 + h * 60);
    const a = at(2);
    const b = at(2 + CAFFEINE_HALF_LIFE_H);
    expect(b / a).toBeCloseTo(0.5, 1);
  });

  it('adds doses together and honours an explicit dose', () => {
    const one = caffeineActiveMg(['08:00'], 11 * 60);
    const two = caffeineActiveMg(['08:00', '10:00'], 11 * 60);
    expect(two).toBeGreaterThan(one);
    expect(caffeineActiveMg(['08:00'], 11 * 60, 190)).toBeCloseTo(2 * one, 0);
  });
});

// ---------------------------------------------------------------------------
// energyForecast
// ---------------------------------------------------------------------------

describe('energyForecast', () => {
  it('returns the empty forecast rather than inventing a curve', () => {
    const e = energyForecast([], SETTINGS, { d: END, hhmm: '09:00' });
    expect(e.forecast).toEqual([]);
    expect(e.now).toBeNull();
    expect(e.atWake).toBeNull();
    expect(e.trough).toBeNull();
    expect(e.bedtimeReadyAt).toBeNull();
    expect(e.confidence).toBe('low');
    noNaN(e);
    // Records with no times and no hours are no history either.
    expect(energyForecast([{ d: END, kc: 2000 }], SETTINGS, { d: END, hhmm: '09:00' }).forecast).toEqual([]);
  });

  it('runs 15-minute steps from the logged wake to the habitual bedtime', () => {
    const e = energyForecast(nights(14), SETTINGS, { d: END, hhmm: '12:00' });
    expect(e.forecast[0].hhmm).toBe('07:00');
    expect(e.forecast[e.forecast.length - 1].hhmm).toBe('23:00');
    expect(e.forecast).toHaveLength((16 * 60) / FORECAST_STEP_MIN + 1);
    expect(e.forecast[1].hhmm).toBe('07:15');
    expect(e.atWake).toBe(e.forecast[0].value);
    noNaN(e);
  });

  it('puts the afternoon trough in the interior of the waking day', () => {
    const e = energyForecast(nights(14), SETTINGS, { d: END, hhmm: '12:00' });
    expect(e.trough).not.toBeNull();
    const troughMin = hhmmToMinutes(e.trough!.hhmm) as number;
    const wakeMin = hhmmToMinutes(e.forecast[0].hhmm) as number;
    const hoursAfterWake = (troughMin - wakeMin) / 60;
    expect(hoursAfterWake).toBeGreaterThanOrEqual(6);
    expect(hoursAfterWake).toBeLessThanOrEqual(9);
    // It really is the lowest point of the day, not a window artefact.
    const min = Math.min(...e.forecast.map((p) => p.value));
    expect(e.trough!.value).toBe(min);
    // …and the circadian anchor is what puts it there.
    expect(CIRCADIAN_TROUGH_OFFSET_H).toBeGreaterThan(8);
  });

  it('finds a sleep gate in the evening', () => {
    const e = energyForecast(nights(14), SETTINGS, { d: END, hhmm: '12:00' });
    expect(e.bedtimeReadyAt).not.toBeNull();
    const readyMin = hhmmToMinutes(e.bedtimeReadyAt as string) as number;
    expect(readyMin).toBeGreaterThan(hhmmToMinutes(e.trough!.hhmm) as number);
  });

  it('scales the whole curve by (100 − osi), not only its start', () => {
    const recs = nights(14);
    const fresh = energyForecast(recs, SETTINGS, { d: END, hhmm: '12:00' }, { osi: 20 });
    const strained = energyForecast(recs, SETTINGS, { d: END, hhmm: '12:00' }, { osi: 80 });
    expect(fresh.forecast).toHaveLength(strained.forecast.length);
    for (let i = 0; i < fresh.forecast.length; i++) {
      expect(strained.forecast[i].value).toBeLessThan(fresh.forecast[i].value);
    }
    expect((strained.now as number)).toBeLessThan(fresh.now as number);
  });

  it('lowers the curve after a hard training day', () => {
    const recs = nights(30, () => ({ ld: 300 }));
    const rested = energyForecast(recs, SETTINGS, { d: END, hhmm: '12:00' }, { yesterdayLoad: 0 });
    const hammered = energyForecast(recs, SETTINGS, { d: END, hhmm: '12:00' }, { yesterdayLoad: 900 });
    for (let i = 0; i < rested.forecast.length; i++) {
      expect(hammered.forecast[i].value).toBeLessThan(rested.forecast[i].value);
    }
  });

  it('widens the band and drops the confidence as inputs go missing', () => {
    const full = energyForecast(nights(14, () => ({ caf: ['08:00'] })), SETTINGS, { d: END, hhmm: '12:00' }, {
      osi: 45,
      yesterdayLoad: 200,
    });
    const sparse = energyForecast(nights(14).slice(-2), SETTINGS, { d: END, hhmm: '12:00' });
    const width = (e: typeof full) => e.forecast[0].hi - e.forecast[0].lo;
    expect(width(sparse)).toBeGreaterThan(width(full));
    expect(full.confidence).toBe('high');
    expect(sparse.confidence).not.toBe('high');
    // The band also widens with distance from `now`.
    const near = full.forecast.find((p) => p.hhmm === '12:00');
    const far = full.forecast[full.forecast.length - 1];
    expect(far.hi - far.lo).toBeGreaterThan((near as { hi: number; lo: number }).hi - (near as { lo: number }).lo);
  });

  it('peaks shortly after a caffeine dose', () => {
    const recs = nights(14, (i) => (i === 13 ? { caf: ['10:00'] } : {}));
    const e = energyForecast(recs, SETTINGS, { d: END, hhmm: '12:00' });
    const at = (h: string) => e.forecast.find((p) => p.hhmm === h)?.value as number;
    expect(at('10:15')).toBeGreaterThan(at('10:00'));
    expect(at('10:30')).toBeGreaterThan(at('10:00'));
    // …and without the dose the same slot is lower.
    const plain = energyForecast(nights(14), SETTINGS, { d: END, hhmm: '12:00' });
    const plainAt = plain.forecast.find((p) => p.hhmm === '10:30')?.value as number;
    expect(at('10:30')).toBeGreaterThan(plainAt);
  });

  it('raises predicted late-evening energy when caffeine is drunk at bedtime', () => {
    const plain = energyForecast(nights(14), SETTINGS, { d: END, hhmm: '22:00' });
    const late = energyForecast(nights(14, (i) => (i === 13 ? { caf: ['21:00'] } : {})), SETTINGS, {
      d: END,
      hhmm: '22:00',
    });
    const at = (e: typeof plain, h: string) => e.forecast.find((p) => p.hhmm === h)?.value as number;
    expect(at(late, '22:30')).toBeGreaterThan(at(plain, '22:30'));
    expect(late.bedtimeReadyAt === null || (hhmmToMinutes(late.bedtimeReadyAt) as number) >= (hhmmToMinutes(plain.bedtimeReadyAt as string) as number)).toBe(true);
    expect(late.caffeineActiveMg as number).toBeGreaterThan(0);
  });

  it('carries yesterday evening caffeine into this morning', () => {
    const recs = nights(14, (i) => (i === 12 ? { caf: ['23:30'] } : {}));
    const e = energyForecast(recs, SETTINGS, { d: END, hhmm: '07:30' });
    expect(e.caffeineActiveMg as number).toBeGreaterThan(0);
  });

  it('takes `now` as a parameter and handles it outside the waking window', () => {
    const recs = nights(14);
    const before = energyForecast(recs, SETTINGS, { d: END, hhmm: '06:00' });
    const during = energyForecast(recs, SETTINGS, { d: END, hhmm: '12:00' });
    const after = energyForecast(recs, SETTINGS, { d: END, hhmm: '00:30' });
    for (const e of [before, during, after]) {
      expect(e.now).not.toBeNull();
      expect(e.now as number).toBeGreaterThanOrEqual(0);
      expect(e.now as number).toBeLessThanOrEqual(100);
      noNaN(e);
    }
    // The curve itself does not move when only the clock does.
    expect(before.forecast.map((p) => p.value)).toEqual(during.forecast.map((p) => p.value));
  });

  it('names its drivers', () => {
    const recs = nights(14, (i) => (i === 13 ? { caf: ['08:00'], dbt: 180 } : {}));
    const e = energyForecast(recs, SETTINGS, { d: END, hhmm: '12:00' }, { osi: 62 });
    expect(e.drivers.some((s) => /sleep debt/.test(s))).toBe(true);
    expect(e.drivers.some((s) => /caffeine at 08:00/.test(s))).toBe(true);
    expect(e.drivers.some((s) => /overnight strain 62/.test(s))).toBe(true);
  });

  it('fills unlogged nights from the user own medians instead of a 40-hour day', () => {
    const gappy = nights(14).map((r, i) => (i >= 5 && i <= 8 ? { d: r.d } : r));
    const e = energyForecast(gappy, SETTINGS, { d: END, hhmm: '12:00' });
    const full = energyForecast(nights(14), SETTINGS, { d: END, hhmm: '12:00' });
    expect(e.forecast).toHaveLength(full.forecast.length);
    expect(Math.abs(e.atWake as number) - (full.atWake as number)).toBeLessThan(15);
    noNaN(e);
  });

  it('is order-independent and ignores future-dated records', () => {
    const recs = nights(14);
    const shuffled = [...recs].reverse();
    shuffled.push({ d: addDays(END, 3), bt: '02:00', wk: '11:00', slh: 9 });
    expect(energyForecast(shuffled, SETTINGS, { d: END, hhmm: '12:00' })).toEqual(
      energyForecast(recs, SETTINGS, { d: END, hhmm: '12:00' }),
    );
  });

  it('follows a late chronotype rather than the clock', () => {
    const early = energyForecast(nights(14), SETTINGS, { d: END, hhmm: '12:00' });
    const lateRecs = lastNDates(END, 14).map((d) => ({ d, bt: '03:00', wk: '11:00', slh: 8 }));
    const late = energyForecast(lateRecs, SETTINGS, { d: END, hhmm: '12:00' });
    const troughMin = (e: typeof early) => hhmmToMinutes(e.trough!.hhmm) as number;
    expect(troughMin(late)).toBeGreaterThan(troughMin(early) + 3 * 60);
    expect(late.forecast[0].hhmm).toBe('11:00');
  });
});
