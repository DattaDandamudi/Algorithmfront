import { describe, expect, it } from 'vitest';
import { DEFAULT_LANDMARKS, DEFAULT_TRAINING } from '../data/defaults';
import type {
  ISODate,
  Muscle,
  Program,
  SetEntry,
  TrainingSettings,
  VolumeLandmark,
  Workout,
} from '../data/types';
import { MUSCLES } from './exerciseDb';
import {
  DELOAD_SCHEDULE_NOTE,
  VOLUME_ADVISORY_NOTE,
  formulaLabel,
  volumeStatusLabel,
  balanceRatios,
  bodyRegion,
  deloadCheck,
  detectPRs,
  detectPlateau,
  e1rmBrzycki,
  e1rmEpley,
  e1rmWathan,
  exerciseHistory,
  isBalancedRatio,
  roundLoad,
  rpeTablePct,
  setE1rm,
  suggestProgression,
  volumeStatus,
  weeklySetsByMuscle,
  weekStartMonday,
} from './strength';

const ASOF: ISODate = '2026-09-07'; // a Monday

const s = (w: number, r: number, over: Partial<SetEntry> = {}): SetEntry => ({ w, r, ...over });

const wk = (d: ISODate, exerciseId: string, sets: SetEntry[], over: Partial<Workout> = {}): Workout => ({
  id: `w-${d}-${exerciseId}`,
  d,
  start: '18:00',
  durationMin: 60,
  kind: 'strength',
  source: 'manual',
  exercises: [{ exerciseId, sets }],
  ...over,
});

const training: TrainingSettings = { ...DEFAULT_TRAINING, units: 'kg' };

const programFor = (session: 'upper' | 'lower', exerciseId: string): Program => ({
  id: 'test-prog',
  name: 'Test',
  sessions: { [session]: [{ exerciseId, sets: 3, reps: [6, 8], rpe: 8 }] },
});

// 3 × 8 at 60 kg, every set at RPE 7 — the plan's worked progression example.
const threeByEight = (exerciseId: string, d: ISODate = '2026-09-04'): Workout[] => [
  wk(d, exerciseId, [s(40, 8, { k: 'wu' }), s(60, 8, { rpe: 7 }), s(60, 8, { rpe: 7 }), s(60, 8, { rpe: 7 })]),
];

// ---------------------------------------------------------------------------

describe('e1RM formulas', () => {
  it('matches the plan’s worked numbers for 100 kg × 5', () => {
    expect(e1rmEpley(100, 5)).toBeCloseTo(116.67, 2); // 100 × (1 + 5/30)
    expect(e1rmBrzycki(100, 5)).toBe(112.5); // 3600 / 32
    expect(e1rmWathan(100, 5)).toBeCloseTo(116.58, 2); // 10000 / (48.8 + 53.8·e^−0.375)
  });

  it('returns null rather than NaN or Infinity on degenerate input', () => {
    for (const f of [e1rmEpley, e1rmBrzycki, e1rmWathan]) {
      expect(f(0, 5)).toBeNull(); // bodyweight
      expect(f(-100, 5)).toBeNull();
      expect(f(100, 0)).toBeNull();
      expect(f(Number.NaN, 5)).toBeNull();
      expect(f(100, Number.POSITIVE_INFINITY)).toBeNull();
    }
    expect(e1rmBrzycki(100, 37)).toBeNull(); // the formula's pole
    expect(e1rmBrzycki(100, 40)).toBeNull();
  });

  it('agrees with a tested 1RM at one rep on Brzycki', () => {
    expect(e1rmBrzycki(140, 1)).toBe(140);
  });
});

describe('rpeTablePct', () => {
  it('reads the standard chart at reps + RIR − 1', () => {
    expect(rpeTablePct(1, 0)).toBe(100);
    expect(rpeTablePct(8, 2)).toBe(73.9); // 8 reps @ RPE 8
    expect(rpeTablePct(5, 2)).toBe(81.1); // 5 reps @ RPE 8
  });

  it('interpolates the half-RIR rows that RPE 7.5 produces', () => {
    expect(rpeTablePct(8, 2.5)).toBeCloseTo(72.8, 1); // between 73.9 and 71.7
  });

  it('is null off the end of the table or on nonsense input', () => {
    expect(rpeTablePct(20, 2)).toBeNull();
    expect(rpeTablePct(0, 0)).toBeNull();
    expect(rpeTablePct(5, -1)).toBeNull();
  });
});

describe('setE1rm', () => {
  it('auto-selects Brzycki ≤ 6, Epley 7–10, Wathan 11–15 (LeSuer 1997)', () => {
    expect(setE1rm(s(100, 5))).toEqual({ value: 112.5, formula: 'brzycki' });
    expect(setE1rm(s(100, 6))).toEqual({ value: 116.1, formula: 'brzycki' });
    expect(setE1rm(s(100, 7))).toEqual({ value: 123.3, formula: 'epley' });
    expect(setE1rm(s(100, 8))).toEqual({ value: 126.7, formula: 'epley' }); // 100 × (1 + 8/30)
    expect(setE1rm(s(100, 10))).toEqual({ value: 133.3, formula: 'epley' });
    expect(setE1rm(s(100, 11)).formula).toBe('wathan');
    expect(setE1rm(s(100, 15)).formula).toBe('wathan');
  });

  it('returns null above 15 reps so a 20-rep back-off set never drags the trend', () => {
    expect(setE1rm(s(100, 16))).toEqual({ value: null, formula: null });
    expect(setE1rm(s(100, 20))).toEqual({ value: null, formula: null });
  });

  it('blends 50/50 with the RPE table when RPE or RIR is logged', () => {
    // 100 × 5 @ RPE 8 → RIR 2 → RPE_TABLE[6] = 81.1% → 123.30 kg.
    // Blended with the auto-selected Brzycki (112.5): (112.5 + 123.30) / 2 = 117.9.
    // (The plan quotes 118.9, which is the blend against the *mean* of Epley
    // and Brzycki — 114.58 — rather than the auto-selected formula.)
    expect(setE1rm(s(100, 5, { rpe: 8 }))).toEqual({ value: 117.9, formula: 'blend' });
    expect(setE1rm(s(100, 5, { rir: 2 }))).toEqual({ value: 117.9, formula: 'blend' });
    // An RPE 10 set is the formula and the table agreeing at the same point.
    expect(setE1rm(s(100, 5, { rpe: 10 })).value).toBeCloseTo(114.2, 1);
  });

  it('ignores warm-ups, skipped sets and bodyweight', () => {
    expect(setE1rm(s(100, 5, { k: 'wu' }))).toEqual({ value: null, formula: null });
    expect(setE1rm(s(100, 5, { x: true }))).toEqual({ value: null, formula: null });
    expect(setE1rm(s(0, 12))).toEqual({ value: null, formula: null });
    expect(setE1rm(s(100, 5, { k: 'dr' })).value).toBe(112.5); // a drop set is still work
  });
});

describe('exerciseHistory', () => {
  const workouts: Workout[] = [
    wk('2026-09-07', 'bench-press', [s(102.5, 5)]),
    wk('2026-08-24', 'bench-press', [s(100, 5), s(100, 5), s(100, 5), s(60, 8, { k: 'wu' })]),
    wk('2026-09-14', 'bench-press', [s(200, 5)]), // future-dated: not evidence yet
    wk('2026-08-31', 'bench-press', [s(100, 6)]),
    wk('2026-08-31', 'back-squat', [s(140, 5)]),
  ];

  it('builds ascending per-session points from unsorted input and ignores the future', () => {
    const h = exerciseHistory(workouts, 'bench-press', ASOF);
    expect(h.name).toBe('Bench Press');
    expect(h.points.map((p) => p.d)).toEqual(['2026-08-24', '2026-08-31', '2026-09-07']);
    expect(h.nSessions).toBe(3);
    expect(h.latest?.d).toBe('2026-09-07');
    expect(h.best).toBe(116.1); // the 100 × 6 session
  });

  it('reports volume, working sets and the top set, warm-ups excluded', () => {
    const first = exerciseHistory(workouts, 'bench-press', ASOF).points[0];
    expect(first.sets).toBe(3);
    expect(first.volumeKg).toBe(1500); // 3 × 100 × 5, the 60 kg warm-up excluded
    expect(first.topSet).toEqual({ w: 100, r: 5 });
    expect(first.meanRpe).toBeNull();
  });

  it('smooths the session bests with an EWMA at α = 0.3', () => {
    const h = exerciseHistory(workouts, 'bench-press', ASOF);
    expect(h.points.map((p) => p.ewma)).toEqual([112.5, 113.6, 114.1]);
  });

  it('averages the logged RPE across working sets', () => {
    const h = exerciseHistory(
      [wk('2026-09-07', 'bench-press', [s(100, 5, { rpe: 7 }), s(100, 5, { rpe: 8 })])],
      'bench-press',
      ASOF,
    );
    expect(h.points[0].meanRpe).toBe(7.5);
  });

  it('degrades to an empty history rather than throwing', () => {
    expect(exerciseHistory([], 'bench-press', ASOF)).toEqual({
      exerciseId: 'bench-press',
      name: 'Bench Press',
      points: [],
      latest: null,
      best: null,
      nSessions: 0,
    });
    expect(exerciseHistory(workouts, 'not-an-exercise', ASOF).name).toBe('not-an-exercise');
    expect(exerciseHistory([wk(ASOF, 'bench-press', [])], 'bench-press', ASOF).points).toEqual([]);
  });
});

describe('detectPRs', () => {
  it('celebrates a weight and e1RM PR that beat the previous best by > 1%', () => {
    const prs = detectPRs(
      [wk('2026-08-24', 'bench-press', [s(100, 5)]), wk('2026-09-05', 'bench-press', [s(105, 5)])],
      ASOF,
    );
    expect(prs.map((p) => p.kind).sort()).toEqual(['e1rm', 'weight']);
    expect(prs.find((p) => p.kind === 'weight')).toMatchObject({ value: 105, previous: 100, d: '2026-09-05' });
    expect(prs.find((p) => p.kind === 'e1rm')).toMatchObject({ value: 118.1, previous: 112.5 });
  });

  it('counts more reps at a weight already lifted', () => {
    const prs = detectPRs(
      [wk('2026-08-24', 'bench-press', [s(100, 5)]), wk('2026-09-05', 'bench-press', [s(100, 7)])],
      ASOF,
    );
    expect(prs.find((p) => p.kind === 'reps')).toMatchObject({ value: 7, previous: 5 });
  });

  it('ignores rounding-noise improvements and first-ever sessions', () => {
    expect(
      detectPRs([wk('2026-08-24', 'bench-press', [s(100, 5)]), wk('2026-09-05', 'bench-press', [s(100.5, 5)])], ASOF),
    ).toEqual([]);
    expect(detectPRs([wk('2026-09-05', 'bench-press', [s(140, 5)])], ASOF)).toEqual([]);
    expect(detectPRs([], ASOF)).toEqual([]);
  });

  it('ignores warm-ups and anything outside the window', () => {
    expect(
      detectPRs(
        [wk('2026-08-24', 'bench-press', [s(100, 5)]), wk('2026-09-05', 'bench-press', [s(200, 5, { k: 'wu' })])],
        ASOF,
      ),
    ).toEqual([]);
    // The 105 kg session is 10 days back — outside the 7-day report window.
    expect(
      detectPRs([wk('2026-08-20', 'bench-press', [s(100, 5)]), wk('2026-08-28', 'bench-press', [s(105, 5)])], ASOF),
    ).toEqual([]);
  });
});

describe('detectPlateau', () => {
  const stalled = ['2026-08-24', '2026-08-27', '2026-08-31', '2026-09-03', ASOF].map((d, i) =>
    wk(d, 'bench-press', [s(100, 5, { rpe: 7 + i * 0.5 }), s(100, 5, { rpe: 7 + i * 0.5 })]),
  );

  it('flags an exercise whose e1RM stopped moving while RPE climbed', () => {
    const [p] = detectPlateau(stalled, ASOF);
    expect(p).toMatchObject({ exerciseId: 'bench-press', name: 'Bench Press', sessions: 5 });
    expect(p.gainPct).toBeLessThanOrEqual(1);
    expect(p.rpeTrend).toBeCloseTo(2, 5); // 0.5 per session across 4 gaps
  });

  it('needs at least four sessions in the window', () => {
    expect(detectPlateau(stalled.slice(0, 3), ASOF)).toEqual([]);
    expect(detectPlateau([], ASOF)).toEqual([]);
  });

  it('says nothing when the lift is still going up or RPE is flat', () => {
    const rising = ['2026-08-24', '2026-08-27', '2026-08-31', '2026-09-03', ASOF].map((d, i) =>
      wk(d, 'bench-press', [s(100 + i * 5, 5, { rpe: 8 })]),
    );
    expect(detectPlateau(rising, ASOF)).toEqual([]);
    const flat = stalled.map((w) => ({
      ...w,
      exercises: [{ exerciseId: 'bench-press', sets: [s(100, 5, { rpe: 8 })] }],
    }));
    expect(detectPlateau(flat, ASOF)).toEqual([]);
  });
});

describe('weeklySetsByMuscle', () => {
  it('counts 1 per primary muscle and 0.5 per secondary, warm-ups excluded', () => {
    const rows = weeklySetsByMuscle(
      [wk(ASOF, 'bench-press', [s(60, 8, { k: 'wu' }), s(100, 5), s(100, 5), s(100, 5)])],
      ASOF,
      DEFAULT_LANDMARKS,
    );
    const by = (m: Muscle) => rows.find((r) => r.muscle === m)?.sets;
    expect(by('chest')).toBe(3);
    expect(by('triceps')).toBe(1.5);
    expect(by('front-delts')).toBe(1.5);
    expect(by('quads')).toBe(0);
  });

  it('returns all 15 muscles in MUSCLES order with their band attached', () => {
    const rows = weeklySetsByMuscle([], ASOF, DEFAULT_LANDMARKS);
    expect(rows.map((r) => r.muscle)).toEqual([...MUSCLES]);
    expect(rows[0]).toMatchObject({ muscle: 'chest', sets: 0, mev: 6, mav: 10, mrv: 16, status: 'below-mev' });
  });

  it('counts the Mon–Sun week containing asOf, and nothing outside it', () => {
    expect(weekStartMonday(ASOF)).toBe(ASOF); // 2026-09-07 is a Monday
    expect(weekStartMonday('2026-09-13')).toBe(ASOF); // the Sunday still belongs to it
    const rows = weeklySetsByMuscle(
      [wk('2026-09-06', 'bench-press', [s(100, 5)]), wk('2026-09-13', 'bench-press', [s(100, 5)])],
      ASOF,
      DEFAULT_LANDMARKS,
    );
    expect(rows.find((r) => r.muscle === 'chest')?.sets).toBe(1); // only the 09-13 session
  });

  it('skips exercises it cannot resolve instead of throwing', () => {
    const rows = weeklySetsByMuscle([wk(ASOF, 'deleted-lift', [s(100, 5)])], ASOF, DEFAULT_LANDMARKS);
    expect(rows.every((r) => r.sets === 0)).toBe(true);
  });
});

describe('volumeStatus', () => {
  const chest: VolumeLandmark = { mev: 6, mav: 10, mrv: 16 };

  it('bands a week of sets without ever saying "cut"', () => {
    expect(volumeStatus(0, chest)).toBe('below-mev');
    expect(volumeStatus(5.5, chest)).toBe('below-mev');
    expect(volumeStatus(6, chest)).toBe('building');
    expect(volumeStatus(10, chest)).toBe('productive');
    expect(volumeStatus(16, chest)).toBe('productive');
    expect(volumeStatus(17, chest)).toBe('high');
    // Well past MRV is still only "high" — hypertrophy keeps rising with sets.
    expect(volumeStatus(40, chest)).toBe('high');
  });

  it('never calls zero sets "building", even where MEV is 0', () => {
    expect(volumeStatus(0, { mev: 0, mav: 4, mrv: 8 })).toBe('below-mev');
    expect(volumeStatus(2, { mev: 0, mav: 4, mrv: 8 })).toBe('building');
  });

  it('gives the copy wording that never prohibits anything', () => {
    expect(volumeStatusLabel('high')).toBe('more than most people need to grow');
    expect(volumeStatusLabel('productive')).toBe('productive');
    for (const status of ['below-mev', 'building', 'productive', 'high'] as const) {
      expect(volumeStatusLabel(status)).not.toMatch(/cut|too much|exceed|reduce|stop/i);
    }
    expect(VOLUME_ADVISORY_NOTE).toContain('advisory bands, not caps');
    expect(VOLUME_ADVISORY_NOTE).toContain('MRV has no trial support');
  });
});

describe('formulaLabel', () => {
  it('names the formula the set actually used, for the tooltip', () => {
    expect(formulaLabel(setE1rm(s(100, 5)).formula)).toBe('Brzycki');
    expect(formulaLabel(setE1rm(s(100, 8)).formula)).toBe('Epley');
    expect(formulaLabel(setE1rm(s(100, 12)).formula)).toBe('Wathan');
    expect(formulaLabel(setE1rm(s(100, 8, { rpe: 8 })).formula)).toBe('formula + RPE chart');
    expect(formulaLabel(setE1rm(s(100, 20)).formula)).toBe('—');
  });
});

describe('balanceRatios', () => {
  it('divides push by pull and squat by hinge over the trailing 28 days', () => {
    const out = balanceRatios(
      [
        wk('2026-09-02', 'bench-press', [s(100, 5), s(100, 5), s(100, 5), s(100, 5)]),
        wk('2026-09-03', 'barbell-row', [s(80, 8), s(80, 8)]),
        wk('2026-09-04', 'back-squat', [s(140, 5), s(140, 5), s(140, 5)]),
        wk('2026-09-05', 'romanian-deadlift', [s(120, 8), s(120, 8), s(120, 8)]),
      ],
      ASOF,
    );
    expect(out.pushPull).toBe(2);
    expect(out.squatHinge).toBe(1);
    expect(isBalancedRatio(out.pushPull)).toBe(false);
    expect(isBalancedRatio(out.squatHinge)).toBe(true);
    expect(isBalancedRatio(0.5)).toBe(false);
  });

  it('is null when a side has no sets at all', () => {
    const out = balanceRatios([wk(ASOF, 'bench-press', [s(100, 5)])], ASOF);
    expect(out).toEqual({ pushPull: null, squatHinge: null });
    expect(balanceRatios([], ASOF)).toEqual({ pushPull: null, squatHinge: null });
    expect(isBalancedRatio(null)).toBe(true);
  });
});

describe('roundLoad', () => {
  it('lands on a load the user can actually build', () => {
    expect(roundLoad(61.5, 'barbell', 'kg')).toBe(62.5);
    expect(roundLoad(55.5, 'barbell', 'kg')).toBe(55);
    expect(roundLoad(41.2, 'dumbbell', 'kg')).toBe(42);
    expect(roundLoad(63, 'machine', 'kg')).toBe(65);
    expect(roundLoad(63, 'other', 'kg')).toBe(63);
  });

  it('rounds in pounds when that is what the gym is plated in', () => {
    expect(roundLoad(61.5, 'barbell', 'lb')).toBeCloseTo(61.235, 3); // 135.6 lb → 135 lb
  });

  it('returns 0 rather than NaN for nonsense', () => {
    expect(roundLoad(Number.NaN, 'barbell', 'kg')).toBe(0);
    expect(roundLoad(-5, 'barbell', 'kg')).toBe(0);
    expect(roundLoad(0, 'barbell', 'kg')).toBe(0);
  });
});

describe('bodyRegion', () => {
  it('splits the step by what the lift actually trains', () => {
    expect(bodyRegion({ id: 'x', name: 'x', pattern: 'squat', equipment: 'barbell', muscles: { primary: ['quads'], secondary: [] } })).toBe('lower');
    expect(bodyRegion({ id: 'x', name: 'x', pattern: 'isolation', equipment: 'machine', muscles: { primary: ['calves'], secondary: [] } })).toBe('lower');
    expect(bodyRegion({ id: 'x', name: 'x', pattern: 'push-h', equipment: 'barbell', muscles: { primary: ['chest'], secondary: [] } })).toBe('upper');
    expect(bodyRegion(null)).toBe('upper');
  });
});

describe('suggestProgression', () => {
  const base = { workouts: threeByEight('bench-press'), asOf: ASOF, training };

  it('takes the +2.5% upper-body step when every set hit the top of the range', () => {
    const [p] = suggestProgression({ ...base, program: programFor('upper', 'bench-press'), session: 'upper' });
    // 60 × 1.025 = 61.5 kg → the nearest real barbell load is 62.5 kg.
    expect(p).toMatchObject({ exerciseId: 'bench-press', mode: 'progress', loadKg: 62.5, sets: 3 });
    expect(p.reason).toContain('2.5%');
    expect(p.last).toMatchObject({ loadKg: 60, reps: [8, 8, 8], rpe: 7, d: '2026-09-04' });
  });

  it('takes the bigger +5% step on lower body', () => {
    const [p] = suggestProgression({
      ...base,
      workouts: threeByEight('back-squat'),
      program: programFor('lower', 'back-squat'),
      session: 'lower',
    });
    // 60 × 1.05 = 63 kg raw; the plan quotes that number, but 63 kg cannot be
    // loaded on a 2.5 kg-plated bar, so `roundLoad` lands it on 62.5 kg.
    expect(p.mode).toBe('progress');
    expect(p.loadKg).toBe(62.5);
    expect(p.reason).toContain('5%');

    // On equipment with a 1 kg increment the raw 5% step survives intact.
    const custom = [
      { id: 'sled', name: 'Sled', pattern: 'squat' as const, equipment: 'other' as const, muscles: { primary: ['quads' as Muscle], secondary: [] } },
    ];
    const [q] = suggestProgression({
      ...base,
      workouts: threeByEight('sled'),
      program: programFor('lower', 'sled'),
      session: 'lower',
      training: { ...training, customExercises: custom },
    });
    expect(q.loadKg).toBe(63);
  });

  it('holds and adds a rep when the top of the range is not there yet', () => {
    const [p] = suggestProgression({
      ...base,
      workouts: [wk('2026-09-04', 'bench-press', [s(60, 8, { rpe: 7 }), s(60, 7, { rpe: 8 })])],
      program: programFor('upper', 'bench-press'),
      session: 'upper',
    });
    expect(p).toMatchObject({ mode: 'hold', loadKg: 60 });
    expect(p.reason).toContain('one more rep');
  });

  it('backs off 5% after an RPE 9.5 session or two missed sets', () => {
    const grind = suggestProgression({
      ...base,
      workouts: [wk('2026-09-04', 'bench-press', [s(60, 8, { rpe: 9.5 }), s(60, 6, { rpe: 10 })])],
      program: programFor('upper', 'bench-press'),
      session: 'upper',
    })[0];
    expect(grind).toMatchObject({ mode: 'reduce', loadKg: 57.5 }); // 60 × 0.95 = 57

    const missed = suggestProgression({
      ...base,
      workouts: [wk('2026-09-04', 'bench-press', [s(60, 8, { rpe: 8 }), s(60, 3, { x: true }), s(60, 2, { x: true })])],
      program: programFor('upper', 'bench-press'),
      session: 'upper',
    })[0];
    expect(missed).toMatchObject({ mode: 'reduce', loadKg: 57.5 });
    expect(missed.reason).toContain('missed');
  });

  it('cuts 7.5% and a set on a red-readiness day', () => {
    const [p] = suggestProgression({
      ...base,
      program: programFor('upper', 'bench-press'),
      session: 'upper',
      readinessBand: 'red',
    });
    // 60 × 0.925 = 55.5 kg → 55 kg on the bar, and 3 sets become 2.
    expect(p).toMatchObject({ mode: 'reduce', loadKg: 55, sets: 2 });
    expect(p.reason).toContain('red');
  });

  it('holds on yellow readiness, on overreached form, and on a cold muscle', () => {
    const yellow = suggestProgression({
      ...base,
      program: programFor('upper', 'bench-press'),
      session: 'upper',
      readinessBand: 'yellow',
    })[0];
    expect(yellow).toMatchObject({ mode: 'hold', loadKg: 60, sets: 3 });

    const overreached = suggestProgression({
      ...base,
      program: programFor('upper', 'bench-press'),
      session: 'upper',
      formBand: 'overreached',
    })[0];
    expect(overreached).toMatchObject({ mode: 'hold', loadKg: 60 });
    expect(overreached.reason).toContain('overreached');

    const cold = suggestProgression({
      ...base,
      program: programFor('upper', 'bench-press'),
      session: 'upper',
      muscleReadiness: [{ muscle: 'chest', pct: 45, hoursSince: 20 }],
    })[0];
    expect(cold).toMatchObject({ mode: 'hold', loadKg: 60 });
    expect(cold.reason).toContain('45%');
    expect(cold.reason).toContain('20 h'); // hours since the last stimulus
  });

  it('never guesses a load it has no history for, and skips rest days', () => {
    const [p] = suggestProgression({
      ...base,
      workouts: [],
      program: programFor('upper', 'bench-press'),
      session: 'upper',
    });
    expect(p).toMatchObject({ mode: 'hold', loadKg: null, sets: 3 });
    expect(p.reason).toContain('First time');
    expect(suggestProgression({ ...base, program: programFor('upper', 'bench-press'), session: 'rest' })).toEqual([]);
    expect(suggestProgression({ ...base, program: programFor('upper', 'bench-press'), session: 'lower' })).toEqual([]);
  });

  it('NEVER reduces sets or load because a volume landmark was crossed', () => {
    // Six chest sessions in one Mon–Sun week: 36 hard chest sets against an
    // MRV of 16.
    const sunday: ISODate = '2026-09-13';
    const bigWeek: Workout[] = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12'].map(
      (d) => wk(d, 'bench-press', Array.from({ length: 6 }, () => s(60, 8, { rpe: 7 }))),
    );
    const chest = weeklySetsByMuscle(bigWeek, sunday, DEFAULT_LANDMARKS).find((r) => r.muscle === 'chest');
    expect(chest?.sets).toBe(36);
    expect(chest?.status).toBe('high'); // the grid says "more than most people need"

    const input = { workouts: bigWeek, asOf: sunday, program: programFor('upper', 'bench-press'), session: 'upper' as const };
    const suggestion = suggestProgression({ ...input, training });
    expect(suggestion[0]).toMatchObject({ mode: 'progress', loadKg: 62.5, sets: 3 });

    // And the landmarks are not even an input: zeroing or tripling them
    // changes nothing about the plan.
    const zeroed = {} as Record<Muscle, VolumeLandmark>;
    const tripled = {} as Record<Muscle, VolumeLandmark>;
    for (const m of MUSCLES) {
      zeroed[m] = { mev: 0, mav: 0, mrv: 0 };
      tripled[m] = { mev: 30, mav: 60, mrv: 90 };
    }
    expect(suggestProgression({ ...input, training: { ...training, volumeLandmarks: zeroed } })).toEqual(suggestion);
    expect(suggestProgression({ ...input, training: { ...training, volumeLandmarks: tripled } })).toEqual(suggestion);
  });
});

describe('deloadCheck', () => {
  const none = { formBand: null, plateaus: [], redReadinessStreak: 0, accumulationWeeks: 0 };
  const plateau = [{ exerciseId: 'bench-press', name: 'Bench Press', sessions: 5, gainPct: 0.2, rpeTrend: 1.5 }];

  it('recommends a deload only when two signals agree', () => {
    const two = deloadCheck({ ...none, formBand: 'overreached', plateaus: plateau });
    expect(two.recommended).toBe(true);
    expect(two.reasons.some((r) => r.includes('40%'))).toBe(true);

    const one = deloadCheck({ ...none, formBand: 'overreached' });
    expect(one.recommended).toBe(false);
  });

  it('counts a red-readiness streak and four accumulation weeks', () => {
    expect(deloadCheck({ ...none, redReadinessStreak: 3, accumulationWeeks: 4 }).recommended).toBe(true);
    expect(deloadCheck({ ...none, redReadinessStreak: 2, accumulationWeeks: 3 }).recommended).toBe(false);
  });

  it('cites Coleman 2024 when it declines to schedule one', () => {
    const out = deloadCheck({ ...none, accumulationWeeks: 8 });
    expect(out.recommended).toBe(false);
    expect(out.reasons).toContain(DELOAD_SCHEDULE_NOTE);
    expect(DELOAD_SCHEDULE_NOTE).toContain('Coleman 2024');
  });

  it('survives an empty input without throwing', () => {
    expect(deloadCheck(none)).toEqual({ recommended: false, reasons: [DELOAD_SCHEDULE_NOTE] });
  });
});
