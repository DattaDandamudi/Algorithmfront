import { describe, expect, it } from 'vitest';
import { DEFAULT_LANDMARKS } from '../data/defaults';
import type { Exercise, MovementPattern, Muscle } from '../data/types';
import {
  DEFAULT_PROGRAM,
  DEFAULT_PROGRAMS,
  DEFAULT_PROGRAM_B,
  EXERCISES,
  MUSCLES,
  exerciseById,
  exerciseName,
  landmarkDefaults,
  searchExercises,
} from './exerciseDb';

const PATTERNS: MovementPattern[] = [
  'squat',
  'hinge',
  'push-h',
  'push-v',
  'pull-h',
  'pull-v',
  'lunge',
  'carry',
  'core',
  'isolation',
  'cardio',
  'mobility',
  'sport',
];

const CONDITIONING: MovementPattern[] = ['cardio', 'mobility', 'sport'];

const custom: Exercise[] = [
  {
    id: 'my-bench',
    name: 'Bench Press (my bar)',
    muscles: { primary: ['chest'], secondary: ['triceps'] },
    pattern: 'push-h',
    equipment: 'barbell',
    custom: true,
    aliases: ['home bench'],
  },
];

describe('EXERCISES', () => {
  it('spans every movement pattern with a library of roughly 122 entries', () => {
    expect(EXERCISES.length).toBeGreaterThanOrEqual(120);
    for (const p of PATTERNS) {
      expect(EXERCISES.filter((e) => e.pattern === p).length).toBeGreaterThan(0);
    }
  });

  it('uses unique, stable, lower-kebab ids', () => {
    const ids = EXERCISES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('maps resistance work onto the 15 muscle buckets and leaves conditioning unmapped', () => {
    const valid = new Set<Muscle>(MUSCLES);
    for (const e of EXERCISES) {
      for (const m of [...e.muscles.primary, ...e.muscles.secondary]) expect(valid.has(m)).toBe(true);
      // A muscle is never both primary and secondary for the same lift.
      expect(e.muscles.primary.filter((m) => e.muscles.secondary.includes(m))).toEqual([]);
      if (CONDITIONING.includes(e.pattern)) {
        expect(e.muscles.primary).toEqual([]);
        expect(e.muscles.secondary).toEqual([]);
      } else {
        expect(e.muscles.primary.length).toBeGreaterThan(0);
      }
    }
  });

  it('marks the single-limb lifts unilateral', () => {
    const uni = EXERCISES.filter((e) => e.unilateral).map((e) => e.id);
    expect(uni).toContain('bulgarian-split-squat');
    expect(uni).toContain('dumbbell-row');
    expect(uni).toContain('single-leg-rdl');
    expect(uni).not.toContain('back-squat');
  });

  it('never ships a `custom` flag on a built-in', () => {
    expect(EXERCISES.some((e) => e.custom)).toBe(false);
  });
});

describe('exerciseById / exerciseName', () => {
  it('finds a built-in and returns null for an unknown id', () => {
    expect(exerciseById('back-squat')?.name).toBe('Back Squat');
    expect(exerciseById('deleted-thing')).toBeNull();
    expect(exerciseById('')).toBeNull();
    expect(exerciseName('deleted-thing')).toBe('deleted-thing');
  });

  it('lets a custom exercise shadow a built-in id', () => {
    const shadow: Exercise[] = [{ ...custom[0], id: 'back-squat', name: 'Back Squat (SSB)' }];
    expect(exerciseById('back-squat', shadow)?.name).toBe('Back Squat (SSB)');
  });
});

describe('searchExercises', () => {
  it('prefix-matches the name and ranks the shortest match first', () => {
    expect(searchExercises('bench')[0].id).toBe('bench-press');
    expect(searchExercises('squat')[0].id).toBe('back-squat');
    expect(searchExercises('overhead pr')[0].id).toBe('overhead-press');
  });

  it('matches the aliases people actually type', () => {
    expect(searchExercises('bp')[0].id).toBe('bench-press');
    expect(searchExercises('ohp')[0].id).toBe('overhead-press');
    expect(searchExercises('rdl')[0].id).toBe('romanian-deadlift');
    expect(searchExercises('bss')[0].id).toBe('bulgarian-split-squat');
    expect(searchExercises('pushup')[0].id).toBe('push-up');
  });

  it('tolerates one typo per token but not a two-edit guess', () => {
    expect(searchExercises('bnech')[0].id).toBe('bench-press');
    expect(searchExercises('sqaut').map((e) => e.id)).toContain('back-squat');
    expect(searchExercises('deadlfit')[0].id).toBe('deadlift');
    expect(searchExercises('zzzzz')).toEqual([]);
  });

  it('requires every token to match, so more words narrow the list', () => {
    const wide = searchExercises('press');
    const narrow = searchExercises('incline dumbbell press');
    expect(narrow.length).toBeLessThan(wide.length);
    expect(narrow[0].id).toBe('incline-dumbbell-press');
  });

  it('is case- and diacritic-insensitive', () => {
    expect(searchExercises('BENCH PRESS')[0].id).toBe('bench-press');
    expect(searchExercises('bénch')[0].id).toBe('bench-press');
  });

  it('ranks the user’s own exercises first', () => {
    const hits = searchExercises('bench', { custom });
    expect(hits[0].id).toBe('my-bench');
    expect(hits.map((e) => e.id)).toContain('bench-press');
  });

  it('returns a useful default list for an empty query, compounds first', () => {
    const empty = searchExercises('   ');
    expect(empty.length).toBe(20);
    expect(empty[0].pattern).toBe('squat');
    expect(searchExercises('', { custom })[0].id).toBe('my-bench');
    expect(searchExercises('', { limit: 3 }).length).toBe(3);
    expect(searchExercises('bench', { limit: 0 })).toEqual([]);
  });

  it('is deterministic and never returns a duplicate', () => {
    const a = searchExercises('row', { custom });
    const b = searchExercises('row', { custom });
    expect(a.map((e) => e.id)).toEqual(b.map((e) => e.id));
    expect(new Set(a.map((e) => e.id)).size).toBe(a.length);
  });
});

describe('DEFAULT_PROGRAM', () => {
  it('is a 4-day upper/lower A/B split whose every exercise id resolves', () => {
    expect(DEFAULT_PROGRAMS).toEqual([DEFAULT_PROGRAM, DEFAULT_PROGRAM_B]);
    const days = DEFAULT_PROGRAMS.flatMap((p) => Object.entries(p.sessions));
    expect(days.map(([k]) => k)).toEqual(['upper', 'lower', 'upper', 'lower']);
    for (const [, list] of days) {
      expect(list.length).toBeGreaterThanOrEqual(6);
      for (const pe of list) {
        expect(exerciseById(pe.exerciseId), pe.exerciseId).not.toBeNull();
        expect(pe.sets).toBeGreaterThan(0);
        expect(pe.reps[0]).toBeLessThan(pe.reps[1]);
        expect(pe.rpe).toBeGreaterThanOrEqual(6);
      }
    }
  });

  it('trains push, pull, squat and hinge across the week', () => {
    const patterns = new Set(
      DEFAULT_PROGRAMS.flatMap((p) => Object.values(p.sessions).flat()).map(
        (pe) => exerciseById(pe.exerciseId)?.pattern,
      ),
    );
    for (const p of ['push-h', 'push-v', 'pull-h', 'pull-v', 'squat', 'hinge'] as const) {
      expect(patterns.has(p)).toBe(true);
    }
  });
});

describe('landmarkDefaults', () => {
  it('returns the beginner table unchanged', () => {
    expect(landmarkDefaults('beginner')).toEqual(DEFAULT_LANDMARKS);
    expect(landmarkDefaults()).toEqual(DEFAULT_LANDMARKS);
  });

  it('scales intermediate ×1.4 and advanced ×1.7, rounded to whole sets', () => {
    expect(landmarkDefaults('intermediate').chest).toEqual({ mev: 8, mav: 14, mrv: 22 });
    expect(landmarkDefaults('advanced').chest).toEqual({ mev: 10, mav: 17, mrv: 27 });
    expect(landmarkDefaults('intermediate').back).toEqual({ mev: 11, mav: 17, mrv: 25 });
    expect(landmarkDefaults('advanced').quads).toEqual({ mev: 10, mav: 17, mrv: 27 });
  });

  it('covers all 15 muscles and stays monotone at every level', () => {
    for (const level of ['beginner', 'intermediate', 'advanced'] as const) {
      const table = landmarkDefaults(level);
      expect(Object.keys(table).sort()).toEqual([...MUSCLES].sort());
      for (const m of MUSCLES) {
        expect(table[m].mev).toBeLessThanOrEqual(table[m].mav);
        expect(table[m].mav).toBeLessThanOrEqual(table[m].mrv);
        expect(Number.isInteger(table[m].mrv)).toBe(true);
      }
    }
  });
});
