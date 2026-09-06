// @vitest-environment jsdom
/**
 * The live-session draft: the promise that closing the app mid-workout loses
 * nothing.
 *
 * Three things are tested because three things can break it — the shape
 * survives a JSON round trip through `hx:wk:draft`, a corrupt or foreign value
 * yields `null` instead of throwing (a crash here would lose the session the
 * draft exists to protect), and `draftToWorkout` produces a `Workout` the
 * store will accept without empty collections bloating the shard.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { Workout } from '../../data/types';
import { readWorkoutDraft, writeWorkoutDraft } from '../../data/storage';
import {
  DRAFT_VERSION,
  clearDraft,
  draftDurationMin,
  draftEndTime,
  draftFromWorkout,
  draftToWorkout,
  newDraft,
  parseDraft,
  readDraft,
  writeDraft,
  type WorkoutDraft,
} from './draft';

const NOW = Date.UTC(2026, 8, 6, 18, 0, 0);

afterEach(() => {
  clearDraft();
});

function liveDraft(): WorkoutDraft {
  const d = newDraft({
    d: '2026-09-06',
    start: '18:00',
    kind: 'strength',
    nowMs: NOW,
    session: 'upper',
    exercises: [
      {
        exerciseId: 'bench-press',
        sets: [
          { w: 40, r: 10, k: 'wu' },
          { w: 60, r: 8, rpe: 8 },
          { w: 60, r: 7, rpe: 9 },
        ],
        superset: 'A',
      },
      { exerciseId: 'barbell-row', sets: [{ w: 50, r: 10 }], superset: 'A' },
    ],
  });
  return { ...d, restEndsAt: NOW + 90_000, restSec: 90 };
}

describe('draft round trip', () => {
  it('survives the storage round trip byte for byte', () => {
    const draft = liveDraft();
    writeDraft(draft);
    const back = readDraft();
    expect(back).toEqual(draft);
    // Really went through localStorage, not a module-level cache.
    expect(typeof localStorage.getItem('hx:wk:draft')).toBe('string');
  });

  it('is restored with every set, RPE, warm-up flag and superset tag intact', () => {
    writeDraft(liveDraft());
    const back = readDraft();
    expect(back?.exercises).toHaveLength(2);
    expect(back?.exercises[0].sets).toEqual([
      { w: 40, r: 10, k: 'wu' },
      { w: 60, r: 8, rpe: 8 },
      { w: 60, r: 7, rpe: 9 },
    ]);
    expect(back?.exercises[0].superset).toBe('A');
    expect(back?.restEndsAt).toBe(NOW + 90_000);
  });

  it('clears the key rather than storing null', () => {
    writeDraft(liveDraft());
    clearDraft();
    expect(readDraft()).toBeNull();
    expect(localStorage.getItem('hx:wk:draft')).toBeNull();
  });
});

describe('parseDraft', () => {
  it('rejects anything it does not recognise instead of throwing', () => {
    for (const bad of [null, undefined, 0, 'x', [], {}, { v: DRAFT_VERSION }]) {
      expect(parseDraft(bad)).toBeNull();
    }
  });

  it('rejects a different draft version, a bad date and an unknown kind', () => {
    const ok = liveDraft();
    expect(parseDraft({ ...ok, v: DRAFT_VERSION + 1 })).toBeNull();
    expect(parseDraft({ ...ok, d: 'yesterday' })).toBeNull();
    expect(parseDraft({ ...ok, start: '6pm' })).toBeNull();
    expect(parseDraft({ ...ok, kind: 'juggling' })).toBeNull();
  });

  it('drops individual sets that are not numbers, keeping the rest of the session', () => {
    const ok = liveDraft();
    const dirty = {
      ...ok,
      exercises: [
        { exerciseId: 'bench-press', sets: [{ w: 60, r: 8 }, { w: 'heavy', r: 8 }, null] },
        { exerciseId: '', sets: [{ w: 60, r: 8 }] },
      ],
    };
    const parsed = parseDraft(dirty);
    expect(parsed?.exercises).toHaveLength(1);
    expect(parsed?.exercises[0].sets).toEqual([{ w: 60, r: 8 }]);
  });

  it('survives a truncated JSON write without throwing', () => {
    localStorage.setItem('hx:wk:draft', '{"v":1,"id":"w1","exer');
    expect(readWorkoutDraft()).toBeNull();
    expect(readDraft()).toBeNull();
  });
});

describe('draftToWorkout', () => {
  it('produces a Workout with the session numbers and no empty collections', () => {
    const w = draftToWorkout(liveDraft(), { durationMin: 62, srpe: 8 });
    expect(w.id).toMatch(/^w/);
    expect(w.d).toBe('2026-09-06');
    expect(w.start).toBe('18:00');
    expect(w.durationMin).toBe(62);
    expect(w.srpe).toBe(8);
    expect(w.kind).toBe('strength');
    expect(w.session).toBe('upper');
    expect(w.source).toBe('manual');
    expect(w.exercises).toHaveLength(2);
    expect('cardio' in w).toBe(false);
    expect('note' in w).toBe(false);
  });

  it('drops exercises that were added but never logged', () => {
    const draft = { ...liveDraft(), exercises: [{ exerciseId: 'deadlift', sets: [] }] };
    const w = draftToWorkout(draft, { durationMin: 30 });
    expect('exercises' in w).toBe(false);
  });

  it('never writes a negative or fractional duration', () => {
    expect(draftToWorkout(liveDraft(), { durationMin: -5 }).durationMin).toBe(0);
    expect(draftToWorkout(liveDraft(), { durationMin: 61.6 }).durationMin).toBe(62);
    expect(draftToWorkout(liveDraft(), { durationMin: Number.NaN }).durationMin).toBe(0);
  });
});

describe('editing a saved session', () => {
  const saved: Workout = {
    id: 'w-old',
    d: '2026-09-01',
    start: '17:30',
    durationMin: 58,
    kind: 'strength',
    session: 'lower',
    source: 'manual',
    srpe: 7,
    exercises: [{ exerciseId: 'back-squat', sets: [{ w: 100, r: 5, rpe: 8 }] }],
  };

  it('keeps the id and banks the duration already logged', () => {
    const draft = draftFromWorkout(saved, NOW);
    expect(draft.id).toBe('w-old');
    expect(draft.editing).toBe(true);
    expect(draft.baseMinutes).toBe(58);
    // Two minutes of corrections must not turn a 58-minute session into 2.
    expect(draftDurationMin(draft, NOW + 2 * 60_000)).toBe(60);
    expect(draftToWorkout(draft, { durationMin: 60 }).id).toBe('w-old');
  });

  it('keeps an imported session imported through an edit', () => {
    // Relabelling a WHOOP session `manual` rewrites where the load came from:
    // the Train tab's source caption and the strain-conversion hedge both read
    // `Workout.source`.
    const imported: Workout = { ...saved, source: 'whoop', externalId: 'whoop:2026-09-01T17:30' };
    const draft = draftFromWorkout(imported, NOW);
    expect(draft.source).toBe('whoop');
    expect(draft.externalId).toBe('whoop:2026-09-01T17:30');

    const edited = draftToWorkout({ ...draft, srpe: 8 }, { durationMin: 60 });
    expect(edited.source).toBe('whoop');
    // …and it still dedupes against the next import of the same export.
    expect(edited.externalId).toBe('whoop:2026-09-01T17:30');

    // The provenance survives the storage round trip, too.
    writeDraft(draft);
    expect(draftToWorkout(readDraft() as WorkoutDraft, { durationMin: 60 }).source).toBe('whoop');
  });

  it('still calls a hand-logged session manual, including an older draft with no source', () => {
    expect(draftToWorkout(liveDraft(), { durationMin: 60 }).source).toBe('manual');
    expect(draftFromWorkout(saved, NOW).source).toBe('manual');
    const legacy = { ...liveDraft() } as WorkoutDraft & { source?: string };
    delete legacy.source;
    expect(draftToWorkout(legacy, { durationMin: 60 }).source).toBe('manual');
    expect('externalId' in draftToWorkout(legacy, { durationMin: 60 })).toBe(false);
    // A junk source in a hand-edited draft is dropped, not carried.
    expect(parseDraft({ ...JSON.parse(JSON.stringify(liveDraft())), source: 'nonsense' })?.source).toBeUndefined();
  });

  it('starts a new session at zero and counts up from its own clock', () => {
    const draft = newDraft({ d: '2026-09-06', start: '18:00', kind: 'strength', nowMs: NOW });
    expect(draft.baseMinutes).toBe(0);
    expect(draft.editing).toBe(false);
    expect(draftDurationMin(draft, NOW)).toBe(0);
    expect(draftDurationMin(draft, NOW + 62 * 60_000)).toBe(62);
    // A clock that jumped backwards must not report negative minutes.
    expect(draftDurationMin(draft, NOW - 60_000)).toBe(0);
  });

  it('derives the end clock time from the start and the duration', () => {
    const draft = newDraft({ d: '2026-09-06', start: '18:00', kind: 'strength', nowMs: NOW });
    expect(draftEndTime(draft, 62)).toBe('19:02');
    expect(draftEndTime({ ...draft, start: '23:30' }, 60)).toBe('00:30');
  });
});

describe('storage failures', () => {
  it('a draft written by an older build is ignored, not half-read', () => {
    writeWorkoutDraft({ v: 0, id: 'w1', d: '2026-09-06', start: '18:00', kind: 'strength', exercises: [] });
    expect(readDraft()).toBeNull();
  });
});
