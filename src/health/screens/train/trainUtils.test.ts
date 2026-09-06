/**
 * Unit tests for the Train tab's pure helpers.
 *
 * The four that carry real risk are the ones this file leans on: the unit
 * conversion (a load that drifts on a round trip is a corrupted log), the
 * ghost line (the one place last session's numbers are re-read), the volume
 * maths (warm-ups and skipped sets must not count), and the estimated-max
 * deltas the finish sheet celebrates with.
 */
import { describe, expect, it } from 'vitest';
import type { SetEntry, Workout, WorkoutExercise } from '../../data/types';
import {
  countWorkingSets,
  distanceUnit,
  e1rmDeltas,
  elapsedMinutes,
  formatDistance,
  formatDuration,
  formatLoad,
  formatPct,
  formatRest,
  formatVolume,
  ghostText,
  isWorkingSet,
  kindLabel,
  lastPerformed,
  loadStepDisplay,
  muscleLabel,
  sessionLabel,
  sessionTitle,
  sessionVolumeKg,
  setRpe,
  setsRepsText,
  toDisplayDistance,
  toDisplayLoad,
  toKmDistance,
  toKgLoad,
  volumeStatusPhrase,
  volumeStatusTone,
  volumeStatusWord,
  withoutKeys,
} from './trainUtils';

const w = (over: Partial<Workout> = {}): Workout => ({
  id: 'w1',
  d: '2026-09-01',
  start: '18:00',
  durationMin: 60,
  kind: 'strength',
  source: 'manual',
  ...over,
});

const ex = (exerciseId: string, sets: SetEntry[]): WorkoutExercise => ({ exerciseId, sets });

describe('unit conversion', () => {
  it('round-trips a displayed load back to the same number', () => {
    for (const shown of [45, 95, 135, 185, 225, 315, 62.5]) {
      expect(toDisplayLoad(toKgLoad(shown, 'lb'), 'lb')).toBe(shown);
    }
    for (const shown of [20, 42.5, 60, 100, 142.5]) {
      expect(toDisplayLoad(toKgLoad(shown, 'kg'), 'kg')).toBe(shown);
    }
  });

  it('converts kilograms to pounds and leaves kilograms alone', () => {
    expect(toDisplayLoad(100, 'kg')).toBe(100);
    expect(toDisplayLoad(100, 'lb')).toBeCloseTo(220.5, 1);
    expect(toKgLoad(220.5, 'lb')).toBeCloseTo(100, 1);
  });

  it('never yields NaN for missing or broken input', () => {
    expect(toDisplayLoad(null, 'lb')).toBe(0);
    expect(toDisplayLoad(undefined, 'kg')).toBe(0);
    expect(toDisplayLoad(Number.NaN, 'lb')).toBe(0);
    expect(toKgLoad(Number.POSITIVE_INFINITY, 'lb')).toBe(0);
  });

  it('formats with the unit and drops a pointless decimal', () => {
    expect(formatLoad(toKgLoad(135, 'lb'), 'lb')).toBe('135 lb');
    expect(formatLoad(62.5, 'kg')).toBe('62.5 kg');
  });

  it('steps by the smallest increment the equipment comes in', () => {
    expect(loadStepDisplay('barbell', 'lb')).toBe(5);
    expect(loadStepDisplay('barbell', 'kg')).toBe(2.5);
    expect(loadStepDisplay('machine', 'kg')).toBe(5);
    expect(loadStepDisplay(undefined, 'lb')).toBe(loadStepDisplay('other', 'lb'));
  });

  it('shows distance in miles for a pound user and kilometres otherwise', () => {
    expect(distanceUnit('lb')).toBe('mi');
    expect(distanceUnit('kg')).toBe('km');
    expect(toDisplayDistance(8.04672, 'lb')).toBeCloseTo(5, 2);
    expect(toKmDistance(5, 'lb')).toBeCloseTo(8.047, 2);
    expect(toDisplayDistance(10, 'kg')).toBe(10);
    expect(formatDistance(10, 'kg')).toBe('10 km');
    expect(formatDistance(0, 'kg')).toBeNull();
    expect(formatDistance(null, 'lb')).toBeNull();
  });
});

describe('ghostText', () => {
  it('reads "last: <load> × <reps> @<rpe>" in the display units', () => {
    const last = { loadKg: toKgLoad(135, 'lb'), reps: [8, 8, 7], rpe: 8, d: '2026-08-30' };
    expect(ghostText(last, 'lb')).toBe('last: 135 lb × 8,8,7 @8');
    expect(ghostText({ loadKg: 60, reps: [8, 8, 7], rpe: 8 }, 'kg')).toBe('last: 60 kg × 8,8,7 @8');
  });

  it('keeps half-step RPE and drops the @ when none was logged', () => {
    expect(ghostText({ loadKg: 60, reps: [5], rpe: 8.5 }, 'kg')).toBe('last: 60 kg × 5 @8.5');
    expect(ghostText({ loadKg: 60, reps: [5] }, 'kg')).toBe('last: 60 kg × 5');
  });

  it('calls a zero load bodyweight', () => {
    expect(ghostText({ loadKg: 0, reps: [12, 10] }, 'lb')).toBe('last: BW × 12,10');
  });

  it('returns null when there is nothing to show', () => {
    expect(ghostText(null, 'lb')).toBeNull();
    expect(ghostText(undefined, 'kg')).toBeNull();
    expect(ghostText({ loadKg: 60, reps: [] }, 'kg')).toBeNull();
  });
});

describe('lastPerformed', () => {
  const history: Workout[] = [
    w({ id: 'a', d: '2026-08-25', exercises: [ex('bench-press', [{ w: 60, r: 8, rpe: 7 }])] }),
    w({
      id: 'b',
      d: '2026-08-29',
      exercises: [
        ex('bench-press', [
          { w: 40, r: 10, k: 'wu' },
          { w: 62.5, r: 8, rpe: 8 },
          { w: 62.5, r: 7, rpe: 9 },
          { w: 65, r: 3, x: true },
        ]),
      ],
    }),
  ];

  it('takes the newest session, its top working set and its hardest RPE', () => {
    const last = lastPerformed(history, 'bench-press');
    expect(last).not.toBeNull();
    expect(last?.loadKg).toBe(62.5);
    expect(last?.reps).toEqual([8, 7]); // warm-up and skipped set excluded
    expect(last?.rpe).toBe(9);
    expect(last?.d).toBe('2026-08-29');
  });

  it('excludes the session being edited so it is not its own "last time"', () => {
    const last = lastPerformed(history, 'bench-press', { excludeId: 'b' });
    expect(last?.d).toBe('2026-08-25');
    expect(last?.loadKg).toBe(60);
  });

  it('respects an as-of date and returns null for an untrained lift', () => {
    expect(lastPerformed(history, 'bench-press', { onOrBefore: '2026-08-26' })?.d).toBe('2026-08-25');
    expect(lastPerformed(history, 'deadlift')).toBeNull();
    expect(lastPerformed([], 'bench-press')).toBeNull();
  });
});

describe('volume maths', () => {
  const exercises: WorkoutExercise[] = [
    ex('bench-press', [
      { w: 40, r: 10, k: 'wu' }, // warm-up: excluded
      { w: 60, r: 8 },
      { w: 60, r: 8 },
      { w: 60, r: 5, x: true }, // skipped: excluded
    ]),
    ex('barbell-row', [{ w: 50, r: 10 }]),
  ];

  it('counts only working sets', () => {
    expect(countWorkingSets(exercises)).toBe(3);
    expect(countWorkingSets(undefined)).toBe(0);
    expect(isWorkingSet({ w: 60, r: 8 })).toBe(true);
    expect(isWorkingSet({ w: 60, r: 8, k: 'wu' })).toBe(false);
    expect(isWorkingSet({ w: 60, r: 8, x: true })).toBe(false);
    expect(isWorkingSet({ w: 60, r: 0 })).toBe(false);
    expect(isWorkingSet(null)).toBe(false);
  });

  it('sums load × reps over working sets only', () => {
    // 60×8 + 60×8 + 50×10 = 480 + 480 + 500
    expect(sessionVolumeKg(exercises)).toBe(1460);
  });

  it('shows volume in the display units', () => {
    expect(formatVolume(1000, 'kg')).toBe('1,000 kg');
    expect(formatVolume(1000, 'lb')).toBe('2,205 lb');
  });
});

describe('e1rmDeltas', () => {
  const priorHistory: Workout[] = [
    w({ id: 'old', d: '2026-08-20', exercises: [ex('bench-press', [{ w: 60, r: 8 }])] }),
  ];

  it('compares the session best against the best that preceded it', () => {
    const session = { exercises: [ex('bench-press', [{ w: 65, r: 8 }])] };
    const [row] = e1rmDeltas(session, priorHistory, '2026-09-01');
    expect(row.name).toBe('Bench Press');
    expect(row.bestKg).toBeGreaterThan(row.previousKg as number);
    expect(row.deltaKg).toBeCloseTo((row.bestKg as number) - (row.previousKg as number), 1);
  });

  it('reports no delta for a first-ever session — a baseline is not a gain', () => {
    const session = { exercises: [ex('deadlift', [{ w: 100, r: 5 }])] };
    const [row] = e1rmDeltas(session, priorHistory, '2026-09-01');
    expect(row.previousKg).toBeNull();
    expect(row.deltaKg).toBeNull();
    expect(row.bestKg).not.toBeNull();
  });

  it('gives no estimate for warm-ups only', () => {
    const session = { exercises: [ex('bench-press', [{ w: 40, r: 10, k: 'wu' as const }])] };
    const [row] = e1rmDeltas(session, priorHistory, '2026-09-01');
    expect(row.bestKg).toBeNull();
  });
});

describe('formatting and labels', () => {
  it('formats rest and duration', () => {
    expect(formatRest(90)).toBe('1:30');
    expect(formatRest(45)).toBe('0:45');
    expect(formatRest(0)).toBe('0:00');
    expect(formatDuration(48)).toBe('48m');
    expect(formatDuration(72)).toBe('1h 12m');
    expect(formatDuration(120)).toBe('2h');
    expect(formatDuration(null)).toBe('—');
  });

  it('counts elapsed minutes without ever going negative', () => {
    expect(elapsedMinutes(1_000_000, 1_000_000 + 90_000)).toBe(1);
    expect(elapsedMinutes(1_000_000, 999_000)).toBe(0);
    expect(elapsedMinutes(Number.NaN, 1)).toBe(0);
  });

  it('signs percentages and falls back to an em dash', () => {
    expect(formatPct(8)).toBe('+8%');
    expect(formatPct(-3)).toBe('−3%');
    expect(formatPct(0)).toBe('0%');
    expect(formatPct(null)).toBe('—');
  });

  it('writes the set × rep-range line', () => {
    expect(setsRepsText(4, [5, 8])).toBe('4 × 5–8');
    expect(setsRepsText(3, [8, 8])).toBe('3 × 8');
    expect(setsRepsText(3, undefined)).toBe('3 sets');
  });

  it('names muscles, sessions and kinds in words', () => {
    expect(muscleLabel('front-delts')).toBe('Front delts');
    expect(muscleLabel('unknown-muscle')).toBe('unknown-muscle');
    expect(sessionLabel('upper')).toBe('Upper body');
    expect(sessionLabel(null)).toBe('Session');
    expect(kindLabel('mobility')).toBe('Mobility');
  });

  it('names a session by its title, then its slot, then its kind', () => {
    expect(sessionTitle({ title: 'Deload upper', kind: 'strength' })).toBe('Deload upper');
    expect(sessionTitle({ kind: 'strength', session: 'lower' })).toBe('Lower body session');
    expect(sessionTitle({ kind: 'strength' })).toBe('Strength session');
    expect(sessionTitle({ kind: 'cardio', cardio: { sport: 'run' } })).toBe('Cardio · run');
  });

  it('reads RPE straight or converts it from RIR', () => {
    expect(setRpe({ w: 60, r: 8, rpe: 8.5 })).toBe(8.5);
    expect(setRpe({ w: 60, r: 8, rir: 2 })).toBe(8);
    expect(setRpe({ w: 60, r: 8 })).toBeNull();
  });
});

describe('volume status wording', () => {
  it('never turns a landmark into a prohibition', () => {
    expect(volumeStatusWord('high')).toBe('high');
    expect(volumeStatusPhrase('high')).toBe('more than most people need to grow');
    // No band is worded as a cap, a limit or an instruction to cut.
    for (const status of ['below-mev', 'building', 'productive', 'high'] as const) {
      const words = `${volumeStatusWord(status)} ${volumeStatusPhrase(status)}`.toLowerCase();
      expect(words).not.toMatch(/too much|cut|stop|limit|cap|exceed/);
    }
  });

  it('pairs every status with a tone, so colour is decoration and not the message', () => {
    expect(volumeStatusTone('productive')).toBe('green');
    expect(volumeStatusTone('below-mev')).toBe('yellow');
    expect(volumeStatusWord('below-mev')).toBe('below MEV');
  });
});

describe('withoutKeys', () => {
  it('removes keys rather than setting them undefined', () => {
    const set: SetEntry = { w: 60, r: 8, rpe: 8, k: 'wu' };
    const cleared = withoutKeys(set, ['rpe', 'k']);
    expect(Object.keys(cleared).sort()).toEqual(['r', 'w']);
    expect(JSON.stringify(cleared)).toBe('{"w":60,"r":8}');
    // The original is untouched.
    expect(set.rpe).toBe(8);
  });
});
