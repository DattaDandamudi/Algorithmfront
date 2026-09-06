/**
 * §1h simulations — the predicted-energy curve.
 *
 * Gates, not documentation. The curve is a *model*, so what can be checked is
 * that it behaves like the model it claims to be:
 *
 *   • monotone-decreasing in Process S between caffeine doses (the stretch from
 *     the end of sleep inertia to the afternoon trough, where S rises and C is
 *     flat or falling, must fall at every step);
 *   • a local peak inside the hour after every dose;
 *   • the afternoon trough 6–9 h after wake in ≥ 90 % of seeds;
 *   • caffeine at bedtime raising predicted late-evening energy — in the same
 *     run in which `sleep.caffeineCheck` warns about it.
 */
import { describe, expect, it } from 'vitest';
import type { AppSettings, DailyRecord, ISODate } from '../data/types';
import { DEFAULT_SETTINGS } from '../data/defaults';
import { hhmmToMinutes } from '../lib/dates';
import { SLEEP_INERTIA_MIN, energyForecast, energyShape } from './energy';
import { caffeineCheck } from './sleep';
import { runSeeds, sleepNights } from './simFixtures';

const END: ISODate = '2026-09-06';
const SETTINGS: AppSettings = DEFAULT_SETTINGS;

const NIGHTS = { days: 20, end: END, meanHrs: 7.5, bedTarget: '23:00', jitterMin: 30 } as const;

/** Minutes since the first forecast point, unwrapping past midnight. */
function offsetMin(hhmm: string, wakeMin: number): number {
  const m = hhmmToMinutes(hhmm) as number;
  return m < wakeMin ? m + 1440 - wakeMin : m - wakeMin;
}

function withCaffeine(recs: DailyRecord[], times: string[]): DailyRecord[] {
  return recs.map((r, i) => (i === recs.length - 1 ? { ...r, caf: times } : r));
}

describe('energy simulations', () => {
  it('lands the afternoon trough 6–9 h after wake in ≥ 90 % of seeds', () => {
    const SEEDS = 40;
    const offsets = runSeeds(SEEDS, (seed) => {
      const recs = sleepNights({ seed, ...NIGHTS });
      const e = energyForecast(recs, SETTINGS, { d: END, hhmm: '12:00' }, { osi: 50 });
      const wakeMin = hhmmToMinutes(e.forecast[0].hhmm) as number;
      return offsetMin(e.trough!.hhmm, wakeMin) / 60;
    });
    const inRange = offsets.filter((h) => h >= 6 && h <= 9).length;
    const sorted = [...offsets].sort((a, b) => a - b);
    console.log(
      `[sim 1h] trough ${inRange}/${SEEDS} in 6–9 h after wake ` +
        `(min ${sorted[0].toFixed(2)} h, median ${sorted[SEEDS >> 1].toFixed(2)} h, max ${sorted[SEEDS - 1].toFixed(2)} h)`,
    );
    expect(inRange / SEEDS).toBeGreaterThanOrEqual(0.9);
  });

  it('falls at every step from the end of sleep inertia to the trough, with no caffeine', () => {
    const SEEDS = 40;
    let checked = 0;
    runSeeds(SEEDS, (seed) => {
      const recs = sleepNights({ seed, ...NIGHTS });
      const e = energyForecast(recs, SETTINGS, { d: END, hhmm: '12:00' }, { osi: 50 });
      const wakeMin = hhmmToMinutes(e.forecast[0].hhmm) as number;
      const troughOff = offsetMin(e.trough!.hhmm, wakeMin);
      const seg = e.forecast.filter((p) => {
        const o = offsetMin(p.hhmm, wakeMin);
        return o >= SLEEP_INERTIA_MIN && o <= troughOff;
      });
      expect(seg.length).toBeGreaterThan(10);
      for (let i = 1; i < seg.length; i++) {
        expect(seg[i].value).toBeLessThan(seg[i - 1].value);
        checked++;
      }
    });
    console.log(`[sim 1h] monotone in S: ${checked} consecutive falling steps across ${SEEDS} seeds`);
  });

  it('is monotone-decreasing in S at every circadian phase', () => {
    // The model property the curve inherits, checked directly rather than
    // inferred from the plot.
    for (let c = -1; c <= 1.0001; c += 0.1) {
      for (let s = 0.36; s <= 0.64; s += 0.01) {
        expect(energyShape(s + 0.01, c)).toBeLessThan(energyShape(s, c));
      }
    }
  });

  it('peaks inside the hour after every caffeine dose', () => {
    const SEEDS = 20;
    let peaks = 0;
    let doses = 0;
    runSeeds(SEEDS, (seed) => {
      const recs = withCaffeine(sleepNights({ seed, ...NIGHTS }), ['09:00', '13:30']);
      const e = energyForecast(recs, SETTINGS, { d: END, hhmm: '12:00' }, { osi: 50 });
      for (const dose of ['09:00', '13:30']) {
        const doseMin = hhmmToMinutes(dose) as number;
        // The grid is anchored to the user's wake time, so take the last point
        // at or before the dose rather than requiring an exact hit.
        const before = e.forecast.filter((p) => (hhmmToMinutes(p.hhmm) as number) <= doseMin);
        const within = e.forecast.filter((p) => {
          const m = hhmmToMinutes(p.hhmm) as number;
          return m > doseMin && m <= doseMin + 60;
        });
        if (before.length === 0 || within.length === 0) continue;
        doses++;
        const atDose = before[before.length - 1].value;
        if (Math.max(...within.map((p) => p.value)) > atDose) peaks++;
      }
    });
    console.log(`[sim 1h] caffeine: a local peak within 60 min in ${peaks}/${doses} doses`);
    expect(doses).toBeGreaterThan(0);
    expect(peaks).toBe(doses);
  });

  it('raises predicted late-evening energy when caffeine lands at bedtime', () => {
    const SEEDS = 20;
    let raised = 0;
    let delayed = 0;
    runSeeds(SEEDS, (seed) => {
      const recs = sleepNights({ seed, ...NIGHTS });
      const plain = energyForecast(recs, SETTINGS, { d: END, hhmm: '20:00' }, { osi: 50 });
      const dosed = energyForecast(withCaffeine(recs, ['21:00']), SETTINGS, { d: END, hhmm: '20:00' }, { osi: 50 });
      const late = (e: typeof plain) =>
        e.forecast.filter((p) => {
          const m = hhmmToMinutes(p.hhmm) as number;
          return m >= 21 * 60 + 30 && m <= 23 * 60;
        });
      const a = late(plain);
      const b = late(dosed);
      expect(a.length).toBe(b.length);
      if (a.length > 0 && b.every((p, i) => p.value > a[i].value)) raised++;
      const ra = plain.bedtimeReadyAt === null ? Infinity : (hhmmToMinutes(plain.bedtimeReadyAt) as number);
      const rb = dosed.bedtimeReadyAt === null ? Infinity : (hhmmToMinutes(dosed.bedtimeReadyAt) as number);
      if (rb >= ra) delayed++;
      expect((dosed.caffeineActiveMg ?? 0) >= 0).toBe(true);
    });
    console.log(`[sim 1h] bedtime caffeine raised late-evening energy in ${raised}/${SEEDS} seeds, delayed the sleep gate in ${delayed}/${SEEDS}`);
    expect(raised).toBe(SEEDS);
    expect(delayed).toBe(SEEDS);

    // …and the sleep module warns about the same cup in the same run: the two
    // modules describe one physiology, they do not disagree about it.
    const warn = caffeineCheck(['21:00'], SETTINGS.profile.bedTarget, SETTINGS.profile.caffeineCutoff);
    expect(warn.afterCutoff).toBe('21:00');
    expect(warn.hoursBeforeBed).not.toBeNull();
  });

  it('never returns a NaN, a point outside 0–100 or an inverted band', () => {
    runSeeds(20, (seed) => {
      const recs = withCaffeine(sleepNights({ seed, ...NIGHTS }), ['07:30', '15:00']);
      for (const osi of [null, 0, 50, 100]) {
        const e = energyForecast(recs, SETTINGS, { d: END, hhmm: '12:00' }, { osi });
        for (const p of e.forecast) {
          expect(Number.isFinite(p.value)).toBe(true);
          expect(p.value).toBeGreaterThanOrEqual(0);
          expect(p.value).toBeLessThanOrEqual(100);
          expect(p.lo).toBeLessThanOrEqual(p.value);
          expect(p.hi).toBeGreaterThanOrEqual(p.value);
        }
        expect(Number.isFinite(e.now as number)).toBe(true);
      }
    });
  });
});
