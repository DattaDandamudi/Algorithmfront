/**
 * The hedges have to reach the surfaces that show the verdict.
 *
 * Two of them are produced deep in the engine and were being dropped on the way
 * out of `buildCoachContext`, which is the only path a screen sees:
 *
 * - `hrvStatus.forcingSupport` / `forcingLabel` — which clause forced the light
 *   day and what it rests on (`FORCING_EVIDENCE`: the 2 × SWC cut-off is our own
 *   tunable heuristic). A verdict that took the day away has to be able to say
 *   so.
 * - `WhoopScaleFit.fitted` — whether the strain → load conversion behind the
 *   whole load block is this user's own fit or the assumed a = 25 / b = 3.5
 *   prior, carried as `training.load.whoopIsPrior` beside the τ flag.
 *
 * Both are asserted end-to-end (records in, context out) because the bug was in
 * the copying, not in either producer.
 */
import { describe, expect, it } from 'vitest';
import type { AppSettings, DailyRecord, ISODate, Workout } from '../data/types';
import { DEFAULT_PROFILE, DEFAULT_SETTINGS } from '../data/defaults';
import { addDays } from '../lib/dates';
import { buildCoachContext } from './context';
import { FORCING_EVIDENCE, hrvStatus } from './hrv';

const TODAY: ISODate = '2026-09-06';
const NOW = new Date(2026, 8, 6, 9, 0, 0);
const SETTINGS: AppSettings = DEFAULT_SETTINGS;
const N = 98;
const MU = Math.log(60);
/** Zero-sum 7-day cycle, so the trailing 7-day ln mean is exactly μ. */
const CYCLE = [0.04, -0.04, 0.02, -0.02, 0.06, -0.06, 0];

/**
 * A stationary user, optionally with the last week's HRV shifted down — the
 * fixture `readiness.test.ts` uses to make the forcing rule fire.
 */
function records(shift = 0, extra: Partial<DailyRecord> = {}): DailyRecord[] {
  return Array.from({ length: N }, (_, i) => {
    const dev = i >= N - 7 ? shift : 0;
    return {
      ...extra,
      d: addDays(TODAY, -(N - 1 - i)),
      hrv: Math.exp(MU + CYCLE[i % 7] + dev),
      rhr: 52 - Math.round(50 * CYCLE[i % 7]),
      slh: DEFAULT_PROFILE.sleepBaselineHrs,
      // A WHOOP day: a strain and no logged session, so every load in the block
      // came out of the strain conversion.
      strn: 12 + (i % 5),
    } satisfies DailyRecord;
  });
}

const build = (recs: DailyRecord[], workouts: Workout[] = []) =>
  buildCoachContext({ records: recs, workouts, settings: SETTINGS, today: TODAY, now: NOW });

describe('buildCoachContext — the forcing clause travels with its evidence', () => {
  it('copies the support and the label of the clause that fired', () => {
    // WHOOP recovery 80 keeps the score itself green, so the red band can only
    // have come from the rule — the exact case the hedge exists for.
    const recs = records(-0.05, { rec: 80 });
    const hrv = hrvStatus(recs, TODAY, { age: DEFAULT_PROFILE.age });
    expect(hrv.forcing).toBe(true);

    const ctx = build(recs);
    expect(ctx.hrv.forcing).toBe(true);
    expect(ctx.hrv.forcingReason).toBe(hrv.forcingReason);
    expect(ctx.hrv.forcingSupport).toBe(hrv.forcingSupport);
    expect(ctx.hrv.forcingLabel).toBe(hrv.forcingLabel);
    expect(typeof ctx.hrv.forcingLabel).toBe('string');
    expect([FORCING_EVIDENCE.twoSwc.label, FORCING_EVIDENCE.twoDays.label]).toContain(ctx.hrv.forcingLabel);

    // The verdict the label belongs to: a band the score alone did not give.
    expect(ctx.readiness.band).toBe('red');
    expect(ctx.readiness.forced).toBe(true);
    expect(ctx.readiness.modifiers?.find((m) => m.key === 'hrvForcing')?.reason).toBe(hrv.forcingReason);
  });

  it('leaves both null on a week the rule did not fire', () => {
    const ctx = build(records());
    expect(ctx.hrv.forcing).toBe(false);
    expect(ctx.hrv.forcingSupport).toBeNull();
    expect(ctx.hrv.forcingLabel).toBeNull();
  });
});

describe('buildCoachContext — the WHOOP strain conversion is labelled', () => {
  it('flags a load block converted on the unfitted prior', () => {
    const load = build(records()).training!.load;
    // Strains, no logged sessions: every load here went through the conversion,
    // and with nothing to fit it against the conversion is the prior.
    expect(load.source).toBe('whoop');
    expect(load.whoopIsPrior).toBe(true);
    expect(load.acute7).toBeGreaterThan(0);
  });

  it('clears the flag once enough days carry both a strain and a session', () => {
    // 20 sessions whose loads follow the strain, over a strain range wide
    // enough for `b` to be identified.
    const recs = records().map((r, i) => ({ ...r, strn: 6 + (i % 14) }));
    const workouts: Workout[] = recs.slice(-20).map((r, i) => ({
      id: `w${i}`,
      d: r.d,
      start: '18:00',
      durationMin: 40 + (r.strn as number) * 3,
      kind: 'cardio' as const,
      source: 'manual' as const,
      srpe: 7,
      cardio: { sport: 'run', avgHr: 140 },
    }));
    const load = build(recs, workouts).training!.load;
    expect(load.whoopIsPrior).toBe(false);
    expect(load.source).toBe('mixed');
  });
});
