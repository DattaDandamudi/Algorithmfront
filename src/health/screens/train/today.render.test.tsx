// @vitest-environment jsdom
/**
 * Train ▸ Today — the view that renders the prescription, and therefore the
 * view that owes the user the evidence behind it.
 *
 * Two constants with no published source change what the card tells you to
 * lift: the 60-hour muscle-recovery half-life (`load.MUSCLE_HALF_LIFE_H`, via
 * `MUSCLE_READY_MIN_PCT`) turns a progression into a hold, and `REDUCE_PCT_RED`
 * takes 7.5 % and a set off on a red day. Both labels used to exist only in the
 * engine — `LOAD_NOTES.muscleRecovery` had no render site at all and the
 * rest-day card was the only place recovery was hedged, i.e. never on the day
 * it changed the prescription. These tests assert the rendered text.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { CoachContext, ISODate, PlannedExercise, SessionType, Workout } from '../../data/types';
import { DEFAULT_LANDMARKS, DEFAULT_SETTINGS, DEFAULT_TRAINING } from '../../data/defaults';
import { LOAD_NOTES, PROGRESSION_NOTES, suggestProgression } from '../../engine';
import TodayView from './TodayView';
import { emptyTraining, type TrainModel } from './useTrainModel';

afterEach(cleanup);

const TODAY: ISODate = '2026-09-07'; // Monday — an upper day
const PROGRAM = {
  id: 'p',
  name: 'Test',
  sessions: { upper: [{ exerciseId: 'bench-press', sets: 4, reps: [4, 4] as [number, number], rpe: 8 }] },
};
/** Four straight sets at 80 kg, all at the top of the range at RPE 8 — a progression day. */
const LAST: Workout[] = [
  {
    id: 'w1',
    d: '2026-09-05',
    start: '18:00',
    durationMin: 60,
    kind: 'strength',
    session: 'upper',
    source: 'manual',
    exercises: [{ exerciseId: 'bench-press', sets: [
      { w: 80, r: 4, rpe: 8 },
      { w: 80, r: 4, rpe: 8 },
      { w: 80, r: 4, rpe: 8 },
      { w: 80, r: 4, rpe: 8 },
    ] }],
  },
];

const plan = (over: Parameters<typeof suggestProgression>[0] extends infer T ? Partial<T> : never = {}) =>
  suggestProgression({
    program: PROGRAM,
    session: 'upper',
    workouts: LAST,
    asOf: TODAY,
    training: { ...DEFAULT_TRAINING, units: 'kg' },
    ...over,
  });

function model(planned: PlannedExercise[], session: SessionType): TrainModel {
  const training = emptyTraining();
  return {
    today: TODAY,
    nowMs: Date.parse('2026-09-07T18:00:00Z'),
    settings: DEFAULT_SETTINGS,
    records: [],
    workouts: LAST,
    ctx: {} as CoachContext,
    training: {
      ...training,
      todaySession: session,
      plannedExercises: planned,
      muscleReadiness: [{ muscle: 'chest', pct: 48, hoursSince: 36 }],
    },
    units: 'kg',
    custom: [],
    landmarks: DEFAULT_LANDMARKS,
    restTimerSec: 90,
  };
}

function view(planned: PlannedExercise[], session: SessionType = 'upper'): string {
  const { container } = render(
    <TodayView model={model(planned, session)} onStart={() => {}} onLogKind={() => {}} onOpenSession={() => {}} />,
  );
  return container.textContent ?? '';
}

describe('Train ▸ Today — the heuristics that changed the prescription are on screen with it', () => {
  it('a muscle-recovery hold renders the 60-hour half-life note beside the load it suppressed', () => {
    const progress = plan();
    expect(progress[0]).toMatchObject({ mode: 'progress', loadKg: 82.5, sets: 4 });

    const held = plan({ muscleReadiness: [{ muscle: 'chest', pct: 48, hoursSince: 36 }] });
    expect(held[0]).toMatchObject({ mode: 'hold', loadKg: 80, sets: 4 });
    expect(held[0].reason).toBe('chest is only 48% recovered (36 h since you last trained it) — same load today.');

    const text = view(held);
    expect(text).toContain('chest is only 48% recovered (36 h since you last trained it)');
    // The label, not just the number it produced.
    expect(text).toContain(LOAD_NOTES.muscleRecovery);
    expect(text).toMatch(/60-hour half-life/);
  });

  it('a red-readiness cut renders the note that says 7.5 % is ours, not a finding', () => {
    const cut = plan({ readinessBand: 'red' });
    expect(cut[0]).toMatchObject({ mode: 'reduce', loadKg: 75, sets: 3 });
    expect(cut[0].reason).toContain('Readiness is red — 7.5% lighter and one set fewer today.');

    const text = view(cut);
    expect(text).toContain('Readiness is red — 7.5% lighter and one set fewer today.');
    expect(text).toContain(PROGRESSION_NOTES.steps);
    // Every step size that can reach an instruction is named in that string.
    for (const n of ['7.5', '5', '60', '9.5', '2', '40', '10', '3', '0.5']) expect(PROGRESSION_NOTES.steps).toContain(n);
    expect(PROGRESSION_NOTES.steps).toMatch(/heuristic|our own|no (study|trial)/i);
  });

  it('the rest-day card keeps its recovery note, from the same string', () => {
    const text = view([], 'rest');
    expect(text).toContain('Rest day.');
    expect(text).toContain(LOAD_NOTES.muscleRecovery);
    // Nothing is prescribed on a rest day, so the progression note stays off it.
    expect(text).not.toContain(PROGRESSION_NOTES.steps);
  });
});
