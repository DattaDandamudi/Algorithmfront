import { describe, expect, it } from 'vitest';
import type { DailyRecord, ISODate, Meal, Workout } from '../data/types';
import { addDays } from '../lib/dates';
import {
  BEHAVIOUR_PRIORS,
  BEHAVIOURS,
  HEURISTIC_BEHAVIOURS,
  IMPACT_HEURISTIC_NOTE,
  IMPACT_METRICS,
  IMPACT_WINDOW_DAYS,
  MARGIN_MIN,
  MIN_NO_DAYS,
  MIN_YES_DAYS,
  behaviourImpact,
  isConfirmedEffect,
  isConsistentEffect,
  rawDifference,
  usesHeuristicThreshold,
} from './impact';

const ASOF = '2026-09-06';
const N = 31;
/** Day `i` of an `N`-day window ending at ASOF. */
const day = (i: number, n = N): ISODate => addDays(ASOF, -(n - 1 - i));

/** Days 0–9 are "yes" days; the outcome for day i lands on day i + 1. */
const DRANK = (i: number) => i < 10;

function alcoholRecords(extra: (i: number) => Partial<DailyRecord> = () => ({})): DailyRecord[] {
  return Array.from({ length: N }, (_, i) => ({ d: day(i), alc: DRANK(i) ? 2 : 0, ...extra(i) }));
}

/**
 * Readiness of 54/56 after a drinking day (mean 55) and 69/71 otherwise
 * (mean 70) — a −15-point difference with a hand-checkable Welch se.
 */
function readinessScores(): Array<{ d: ISODate; score: number | null }> {
  return Array.from({ length: N }, (_, i) => ({
    d: day(i),
    score: i === 0 ? 65 : DRANK(i - 1) ? (i % 2 === 0 ? 54 : 56) : i % 2 === 0 ? 69 : 71,
  }));
}

describe('behaviourImpact — degenerate input', () => {
  it('returns empty blocks for no records at all', () => {
    expect(behaviourImpact([], [], ASOF)).toEqual({ effects: [], pending: [] });
  });

  it('returns no effects for a single record, and asks for more days', () => {
    expect(behaviourImpact([{ d: ASOF, alc: 2 }], [], ASOF)).toEqual({
      effects: [],
      pending: ['alcohol'],
    });
  });

  it('ignores records dated after asOf', () => {
    const recs = [...alcoholRecords(), { d: addDays(ASOF, 3), alc: 9 }];
    expect(behaviourImpact(recs, [], ASOF, { readinessScores: readinessScores() })).toEqual(
      behaviourImpact(alcoholRecords(), [], ASOF, { readinessScores: readinessScores() }),
    );
  });

  it('is order-independent', () => {
    const sorted = alcoholRecords();
    const shuffled = [...sorted].reverse();
    expect(behaviourImpact(shuffled, [], ASOF, { readinessScores: readinessScores() })).toEqual(
      behaviourImpact(sorted, [], ASOF, { readinessScores: readinessScores() }),
    );
  });

  it('says nothing about a behaviour that never happened', () => {
    const dry = Array.from({ length: N }, (_, i) => ({ d: day(i), alc: 0, hrv: 60 + (i % 3) }));
    const ctx = behaviourImpact(dry, [], ASOF);
    expect(ctx.effects).toEqual([]);
    expect(ctx.pending).toEqual([]);
  });

  it('never emits NaN on records full of holes', () => {
    const messy: DailyRecord[] = Array.from({ length: N }, (_, i) => ({
      d: day(i),
      alc: DRANK(i) ? 1 : 0,
      hrv: i % 3 === 0 ? undefined : 60 + (i % 5),
      rhr: i % 4 === 0 ? undefined : 55 + (i % 3),
      slh: i % 5 === 0 ? undefined : 7 + (i % 3) / 10,
    }));
    const ctx = behaviourImpact(messy, [], ASOF);
    for (const e of ctx.effects) {
      for (const v of [e.deltaMean, e.lo95, e.hi95, e.qValue, e.shrunkToPrior, e.nYes, e.nNo]) {
        expect(Number.isFinite(v)).toBe(true);
      }
    }
  });
});

describe('behaviourImpact — the 5/5 gate', () => {
  it('keeps WHOOP’s bar', () => {
    expect(MIN_YES_DAYS).toBe(5);
    expect(MIN_NO_DAYS).toBe(5);
  });

  it('sends a behaviour with four yes-days to pending, never to effects', () => {
    const recs = Array.from({ length: N }, (_, i) => ({ d: day(i), alc: i < 4 ? 2 : 0 }));
    const ctx = behaviourImpact(recs, [], ASOF, { readinessScores: readinessScores() });
    expect(ctx.effects).toEqual([]);
    expect(ctx.pending).toEqual(['alcohol']);
  });

  it('reports it once there are five', () => {
    const recs = Array.from({ length: N }, (_, i) => ({ d: day(i), alc: i < 5 ? 2 : 0 }));
    const ctx = behaviourImpact(recs, [], ASOF, { readinessScores: readinessScores() });
    expect(ctx.pending).toEqual([]);
    expect(ctx.effects.map((e) => e.behaviour)).toEqual(['alcohol']);
    expect(ctx.effects[0].nYes).toBe(5);
  });

  it('re-applies the gate per outcome — five drinking days with two HRV readings is not five', () => {
    const recs = alcoholRecords((i) => ({ hrv: i < 3 || i > 25 ? 60 + (i % 3) : undefined }));
    const ctx = behaviourImpact(recs, [], ASOF);
    expect(ctx.effects.some((e) => e.metric === 'hrv')).toBe(false);
    expect(ctx.pending).toEqual(['alcohol']);
  });

  it('honours a window shorter than the data', () => {
    const ctx = behaviourImpact(alcoholRecords(), [], ASOF, {
      windowDays: 12,
      readinessScores: readinessScores(),
    });
    // Only the last 12 days are in scope, and none of them is a drinking day.
    expect(ctx.effects).toEqual([]);
  });
});

describe('behaviourImpact — the estimate and its sentence', () => {
  const ctx = behaviourImpact(alcoholRecords(), [], ASOF, { readinessScores: readinessScores() });
  const effect = ctx.effects.find((e) => e.metric === 'readiness');

  it('recovers the hand-computed difference in means', () => {
    expect(effect).toBeDefined();
    expect(effect!.nYes).toBe(10);
    expect(effect!.nNo).toBe(20);
    expect(effect!.deltaMean).toBeCloseTo(-15, 6);
  });

  it('bands it with a Welch t interval (df ≈ 17.7, se ≈ 0.405)', () => {
    expect(effect!.lo95).toBeCloseTo(-15.85, 1);
    expect(effect!.hi95).toBeCloseTo(-14.15, 1);
  });

  it('writes the sentence as an association, with the interval in it', () => {
    expect(effect!.label).toBe(
      'on the 10 days you drank, next-day readiness averaged 15 points lower (95% CI 14–16)',
    );
  });

  it('never uses causal language in any sentence it writes', () => {
    const recs = alcoholRecords((i) => ({
      hrv: 60 - (DRANK(i - 1) ? 5 : 0) + (i % 3),
      rhr: 55 + (i % 4),
      slh: 7 + (i % 5) / 10,
      osi: 30 + (i % 6),
      tob: i % 3 === 0 ? 1 : 0,
    }));
    const all = behaviourImpact(recs, [], ASOF, { readinessScores: readinessScores() });
    expect(all.effects.length).toBeGreaterThan(3);
    for (const e of all.effects) {
      expect(e.label).toMatch(/^on the \d+ days .+, next-day .+ averaged .+ \(95% CI .+\)$/);
      expect(e.label).not.toMatch(/because|caused|causes|due to|makes you|improves|hurts/i);
    }
  });

  it('writes a two-sided interval when the CI straddles zero', () => {
    const recs = alcoholRecords((i) => ({ rhr: 55 + (i % 3) - (i % 2) }));
    const e = behaviourImpact(recs, [], ASOF).effects.find((x) => x.metric === 'rhr');
    expect(e).toBeDefined();
    if (e!.lo95 < 0 && e!.hi95 > 0) expect(e!.label).toMatch(/95% CI .+ lower to .+ higher/);
  });
});

describe('behaviourImpact — shrinkage toward a published prior', () => {
  // Wide yes-group spread → a big se → the prior does most of the work.
  const SPREAD = [20, 60, 25, 55, 40, 20, 60, 25, 55, 40];
  const recs = alcoholRecords((i) => ({
    hrv: DRANK(i - 1) ? SPREAD[(i - 1) % 10] : i % 2 === 0 ? 59 : 61,
  }));
  const e = behaviourImpact(recs, [], ASOF).effects.find(
    (x) => x.behaviour === 'alcohol' && x.metric === 'hrv',
  );

  it('has a published prior for alcohol on HRV and RHR', () => {
    expect(BEHAVIOUR_PRIORS['alcohol:hrv']?.deltaMean).toBe(-7);
    expect(BEHAVIOUR_PRIORS['alcohol:rhr']?.deltaMean).toBe(3);
    expect(BEHAVIOUR_PRIORS['alcohol:hrv']?.source).toMatch(/PLOS/);
  });

  it('pulls a noisy −20 ms estimate more than halfway to the −7 ms prior', () => {
    expect(e).toBeDefined();
    expect(e!.shrunkToPrior).toBeGreaterThan(0.5);
    expect(e!.deltaMean).toBeGreaterThan(-20);
    expect(e!.deltaMean).toBeLessThan(-7);
  });

  it('reports exactly `w·observed + (1 − w)·prior`', () => {
    const w = 1 - e!.shrunkToPrior;
    // `shrunkToPrior` is rounded to 2 dp, so the reconstruction is good to
    // 0.005 × |observed − prior| ≈ 0.07.
    expect(Math.abs(e!.deltaMean - (w * -20 + (1 - w) * -7))).toBeLessThan(0.1);
  });

  it('leaves a pair with no prior unshrunk', () => {
    const readiness = behaviourImpact(alcoholRecords(), [], ASOF, {
      readinessScores: readinessScores(),
    }).effects.find((x) => x.metric === 'readiness');
    expect(readiness!.shrunkToPrior).toBe(0);
  });

  it('models caffeine through sleep, not through HRV', () => {
    expect(BEHAVIOUR_PRIORS['lateCaffeine:sleepHrs']?.deltaMean).toBeLessThan(0);
    expect(BEHAVIOUR_PRIORS['lateCaffeine:hrv']).toBeUndefined();
  });
});

describe('behaviourImpact — multiplicity', () => {
  const withOneMetric = behaviourImpact(alcoholRecords(), [], ASOF, {
    readinessScores: readinessScores(),
  });
  const withFive = behaviourImpact(
    alcoholRecords((i) => ({
      hrv: 60 + (i % 3),
      rhr: 55 + (i % 4),
      slh: 7 + (i % 5) / 10,
      osi: 30 + (i % 6),
    })),
    [],
    ASOF,
    { readinessScores: readinessScores() },
  );

  it('corrects across the whole behaviour × metric grid, not per behaviour', () => {
    const one = withOneMetric.effects.find((e) => e.metric === 'readiness')!;
    const five = withFive.effects.find((e) => e.metric === 'readiness')!;
    expect(withOneMetric.effects).toHaveLength(1);
    expect(withFive.effects).toHaveLength(5);
    // Same p, five times the grid: BH multiplies the smallest p by n/rank.
    expect(five.qValue).toBeCloseTo(one.qValue * 5, 6);
  });

  it('keeps every q in [0, 1] and sorts the list by it', () => {
    for (const e of withFive.effects) {
      expect(e.qValue).toBeGreaterThanOrEqual(0);
      expect(e.qValue).toBeLessThanOrEqual(1);
    }
    const qs = withFive.effects.map((e) => e.qValue);
    expect([...qs].sort((a, b) => a - b)).toEqual(qs);
  });

  it('calls an effect confirmed only at q ≤ 0.05', () => {
    const strong = withFive.effects.find((e) => e.metric === 'readiness')!;
    expect(isConfirmedEffect(strong)).toBe(true);
    expect(isConfirmedEffect({ ...strong, qValue: 0.051 })).toBe(false);
    expect(isConfirmedEffect({ ...strong, qValue: 0.05 })).toBe(true);
  });
});

describe('behaviourImpact — confounds', () => {
  it('names a training-load imbalance on the yes-days', () => {
    const recs = alcoholRecords((i) => ({ ld: DRANK(i) ? 600 + (i % 3) * 10 : 200 + (i % 3) * 10 }));
    const e = behaviourImpact(recs, [], ASOF, { readinessScores: readinessScores() }).effects[0];
    expect(e.confound).toMatch(/harder training days/);
    expect(e.confound).toMatch(/mean load 6\d\d vs 2\d\d/);
  });

  it('stays quiet when the load is balanced', () => {
    const recs = alcoholRecords((i) => ({ ld: 300 + (i % 3) * 10 }));
    const e = behaviourImpact(recs, [], ASOF, { readinessScores: readinessScores() }).effects[0];
    expect(e.confound).toBeUndefined();
  });

  it('does not accuse the load of confounding itself', () => {
    const recs = Array.from({ length: N }, (_, i) => ({
      d: day(i),
      ld: i % 3 === 0 ? 700 : 150,
      slh: 7 + (i % 4) / 10,
    }));
    const e = behaviourImpact(recs, [], ASOF).effects.find((x) => x.behaviour === 'highLoad');
    expect(e).toBeDefined();
    expect(e!.confound).toBeUndefined();
  });

  it('points caffeine’s non-sleep rows at the sleep row', () => {
    const recs = Array.from({ length: N }, (_, i) => ({
      d: day(i),
      caf: i % 3 === 0 ? ['08:00', '16:30'] : ['08:00'],
      hrv: 60 + (i % 4),
      slh: 7 + (i % 5) / 10,
    })) as DailyRecord[];
    const ctx = behaviourImpact(recs, [], ASOF);
    const hrv = ctx.effects.find((e) => e.behaviour === 'lateCaffeine' && e.metric === 'hrv');
    const sleep = ctx.effects.find((e) => e.behaviour === 'lateCaffeine' && e.metric === 'sleepHrs');
    expect(hrv!.confound).toMatch(/through sleep/);
    expect(sleep!.confound).toBeUndefined();
  });
});

describe('behaviourImpact — behaviour definitions', () => {
  it('reads training load from workouts when the day carries none', () => {
    const recs = Array.from({ length: N }, (_, i) => ({ d: day(i), hrv: 60 + (i % 4) }));
    const workouts: Workout[] = Array.from({ length: N }, (_, i) => ({
      id: `w${i}`,
      d: day(i),
      start: '18:00',
      durationMin: 60,
      kind: 'strength' as const,
      source: 'manual' as const,
      srpe: i % 3 === 0 ? 9 : 3,
    }));
    const ctx = behaviourImpact(recs, workouts, ASOF);
    expect(ctx.effects.some((e) => e.behaviour === 'highLoad')).toBe(true);
  });

  it('prefers the caller’s load series over the stamped one', () => {
    const recs = Array.from({ length: N }, (_, i) => ({ d: day(i), ld: 300, hrv: 60 + (i % 4) }));
    const loads = recs.map((r, i) => ({ d: r.d, load: i % 3 === 0 ? 900 : 100 }));
    const ctx = behaviourImpact(recs, [], ASOF, { loads });
    const e = ctx.effects.find((x) => x.behaviour === 'highLoad');
    expect(e).toBeDefined();
    expect(e!.label).toMatch(/training load was above 900 load units/);
  });

  it('treats a metronomic sleeper as having no short nights', () => {
    const recs = Array.from({ length: N }, (_, i) => ({
      d: day(i),
      slh: 7.5 + (i % 2) / 100,
      hrv: 60 + (i % 4),
    }));
    const ctx = behaviourImpact(recs, [], ASOF);
    expect(ctx.effects.some((e) => e.behaviour === 'shortSleep')).toBe(false);
    expect(ctx.pending).toEqual([]);
  });

  it('counts caffeine after midnight as late, and morning caffeine as not', () => {
    const recs = Array.from({ length: N }, (_, i) => ({
      d: day(i),
      caf: i % 3 === 0 ? ['00:30'] : ['09:00'],
      hrv: 60 + (i % 4),
    })) as DailyRecord[];
    const e = behaviourImpact(recs, [], ASOF).effects.find((x) => x.behaviour === 'lateCaffeine');
    expect(e).toBeDefined();
    expect(e!.nYes).toBeGreaterThanOrEqual(5);
    expect(e!.label).toMatch(/you had caffeine after 2:00 pm/);
  });

  it('uses the profile cutoff when one is given', () => {
    const recs = Array.from({ length: N }, (_, i) => ({
      d: day(i),
      caf: i % 3 === 0 ? ['11:00'] : ['07:00'],
      hrv: 60 + (i % 4),
    })) as DailyRecord[];
    const ctx = behaviourImpact(recs, [], ASOF, {
      profile: { caffeineCutoff: '10:00' } as never,
    });
    const e = ctx.effects.find((x) => x.behaviour === 'lateCaffeine');
    expect(e!.label).toMatch(/you had caffeine after 10:00 am/);
  });

  it('uses the Vujović late-eating rule (≥ 400 kcal within 3 h of bed)', () => {
    const meal = (t: string, kc: number): Meal => ({
      id: `${t}-${kc}`,
      t,
      n: 'dinner',
      g: 400,
      kc,
      p: 30,
      f: 20,
      c: 60,
      fi: 6,
    });
    const recs = Array.from({ length: N }, (_, i) => ({
      d: day(i),
      meals: [i % 3 === 0 ? meal('21:30', 700) : meal('18:00', 700)],
      hrv: 60 + (i % 4),
    }));
    const e = behaviourImpact(recs, [], ASOF).effects.find((x) => x.behaviour === 'lateEating');
    expect(e).toBeDefined();
    expect(e!.nYes).toBeGreaterThanOrEqual(5);
  });

  it('covers exactly the seven behaviours and five outcomes the plan names', () => {
    expect([...BEHAVIOURS]).toEqual([
      'alcohol',
      'tobacco',
      'lateCaffeine',
      'lateEating',
      'highLoad',
      'shortSleep',
      'lateBedtime',
    ]);
    expect([...IMPACT_METRICS]).toEqual(['readiness', 'hrv', 'rhr', 'sleepHrs', 'osi']);
  });
});

// ---------------------------------------------------------------------------
// When the q-value and the shrunk posterior disagree
// ---------------------------------------------------------------------------

/** Values with an exact mean and an exact sample SD — no RNG, no drift. */
function group(n: number, mean: number, sd: number): number[] {
  const xs = Array.from({ length: n }, (_, i) => i);
  const mu = xs.reduce((a, b) => a + b, 0) / n;
  const v = xs.reduce((a, b) => a + (b - mu) ** 2, 0) / (n - 1);
  return xs.map((x) => mean + (sd * (x - mu)) / Math.sqrt(v));
}

/**
 * The measured null user: 90 days, 13 of them drinking days, next-day HRV with
 * **no true effect**. The split is pinned to the one an adversarial review hit
 * — alcohol days +12.34 ms HIGHER, Welch se 5.54, p = 0.0424 — because that is
 * the corner where the q-value (computed on the raw difference, deliberately)
 * and the reported estimate (shrunk against a −7 ms prior) point opposite ways.
 */
function nullAlcoholUser(): DailyRecord[] {
  const DAYS = 90;
  const yes = group(13, 62 + 12.335, Math.sqrt(28 * 13));
  const no = group(76, 62, Math.sqrt((5.54 ** 2 - 28) * 76));
  const drank = new Set(Array.from({ length: 13 }, (_, k) => Math.floor((k * 89) / 13)));
  const hrv: number[] = [62];
  let yi = 0;
  let ni = 0;
  for (let i = 0; i < DAYS - 1; i++) hrv.push(drank.has(i) ? yes[yi++] : no[ni++]);
  return Array.from({ length: DAYS }, (_, i) => ({
    d: day(i, DAYS),
    hrv: hrv[i],
    alc: i < DAYS - 1 && drank.has(i) ? 1 : 0,
  }));
}

describe('behaviourImpact — a q-value the posterior does not back', () => {
  const e = behaviourImpact(nullAlcoholUser(), [], ASOF).effects.find(
    (x) => x.behaviour === 'alcohol' && x.metric === 'hrv',
  )!;

  it('reproduces the split: a raw +12 ms difference reported as −0.4 ms', () => {
    expect(e.nYes).toBe(13);
    expect(e.qValue).toBe(0.0424);
    expect(e.shrunkToPrior).toBe(0.66);
    expect(e.deltaMean).toBe(-0.37);
    expect(e.label).toBe(
      'on the 13 days you drank, next-day HRV averaged 0.4 ms lower (95% CI 7.3 lower to 6.6 higher)',
    );
  });

  it('recovers the unshrunk difference the q was computed on, sign included', () => {
    const raw = rawDifference(e)!;
    expect(raw).toBeGreaterThan(11);
    expect(raw).toBeLessThan(14);
    // The point of the whole exercise: the two disagree about the direction.
    expect(raw * e.deltaMean).toBeLessThan(0);
    // No prior, or nothing shrunk → the estimate *is* the raw difference.
    expect(rawDifference({ ...e, shrunkToPrior: 0 })).toBe(e.deltaMean);
    expect(rawDifference({ ...e, metric: 'sleepHrs' })).toBe(e.deltaMean);
  });

  it('clears the q bar and still is not a consistent signal', () => {
    expect(isConfirmedEffect(e)).toBe(true);
    // The reported interval spans zero…
    expect(e.lo95).toBeLessThan(0);
    expect(e.hi95).toBeGreaterThan(0);
    expect(isConsistentEffect(e)).toBe(false);
    // …and neither does an interval clear of zero rescue it while the sign of
    // the estimate disagrees with the days that produced the q.
    expect(isConsistentEffect({ ...e, lo95: -8.4, hi95: -4.4, deltaMean: -6.4, shrunkToPrior: 0.97 })).toBe(false);
    // A clean row still passes all three tests.
    expect(isConsistentEffect({ ...e, lo95: -7.1, hi95: -1.3, deltaMean: -4.2, shrunkToPrior: 0 })).toBe(true);
  });

  it('keeps the q itself on the unshrunk p — the prior must not create evidence', () => {
    // Unchanged behaviour, restated as a guard: shrinkage moved the estimate
    // 12.7 ms and the q not at all.
    expect(e.qValue).toBe(0.0424);
    expect(e.shrunkToPrior).toBeGreaterThan(0.5);
  });
});

describe('the relative thresholds carry their heuristic label', () => {
  it('names the three behaviours it applies to, and the numbers behind them', () => {
    expect([...HEURISTIC_BEHAVIOURS]).toEqual(['highLoad', 'shortSleep', 'lateBedtime']);
    expect(usesHeuristicThreshold('shortSleep')).toBe(true);
    expect(usesHeuristicThreshold('alcohol')).toBe(false);
    expect(IMPACT_HEURISTIC_NOTE).toContain('no published cut-off');
    expect(IMPACT_HEURISTIC_NOTE).toContain(`${MARGIN_MIN} minutes`);
    expect(IMPACT_HEURISTIC_NOTE).toContain(`${IMPACT_WINDOW_DAYS} days`);
  });
});
