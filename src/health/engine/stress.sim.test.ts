/**
 * §1h simulations — the false-positive budget for the stress stack.
 *
 * These are **gates**, not documentation. If one fails the algorithm is wrong,
 * not the bound: a stress product that cries "major" on one ordinary day in ten
 * is exactly the vendor behaviour this module exists to replace, and it cannot
 * be argued away by moving the threshold in the test.
 *
 * Bounds (plan §1h):
 *   stationary 340-day sleeper   major ≤ 3 % of days, minor ≤ 12 %, illness ≤ 2 %
 *   injected 5-day episode        flagged by day 2 in ≥ 90 % of seeds,
 *                                 cleared within 4 days of recovery
 *   check-in-only user            still gets a band, and no OSI at all
 */
import { describe, expect, it } from 'vitest';
import type { ISODate } from '../data/types';
import { checkInSummary, illnessFlag, overnightStrainIndex } from './stress';
import { checkInSeries, runSeeds, simDay, stressEpisode } from './simFixtures';

const END: ISODate = '2026-09-06';

describe('stress simulations', () => {
  it('keeps a stationary sleeper inside the false-positive budget', () => {
    const DAYS = 340;
    const SEEDS = 4;
    // Skip the first 90 days: they are the reference the rest is measured
    // against, and grading a window against itself proves nothing.
    const FROM = 90;
    let none = 0;
    let minor = 0;
    let major = 0;
    let ill = 0;
    let total = 0;

    runSeeds(SEEDS, (seed) => {
      const recs = stressEpisode({ seed, days: DAYS, end: END });
      for (let i = FROM; i < DAYS; i++) {
        const d = simDay(END, DAYS, i);
        const s = overnightStrainIndex(recs, d);
        expect(s.calibrating).toBe(false);
        total++;
        if (s.band === 'major') major++;
        else if (s.band === 'minor') minor++;
        else none++;
        if (illnessFlag(recs, d).flag) ill++;
      }
    });

    const pct = (n: number) => (100 * n) / total;
    // Reported so the numbers are visible in CI, not only asserted.
    console.log(
      `[sim 1h] stationary ${total} days: none ${pct(none).toFixed(2)}%, ` +
        `minor ${pct(minor).toFixed(2)}%, major ${pct(major).toFixed(2)}%, illness ${pct(ill).toFixed(2)}%`,
    );
    expect(pct(major)).toBeLessThanOrEqual(3);
    expect(pct(minor)).toBeLessThanOrEqual(12);
    expect(pct(ill)).toBeLessThanOrEqual(2);
    expect(none + minor + major).toBe(total);
  }, 30_000);

  it('flags an injected illness episode by day 2 and clears it within 4 days', () => {
    const DAYS = 200;
    const START = 150;
    const LEN = 5;
    const SEEDS = 40;

    const runs = runSeeds(SEEDS, (seed) => {
      const recs = stressEpisode({ seed, days: DAYS, end: END, illnessStart: START, illnessDays: LEN });
      const flagOn = (i: number) => illnessFlag(recs, simDay(END, DAYS, i)).flag;
      const byDay2 = flagOn(START) || flagOn(START + 1);
      let clearedAfter: number | null = null;
      for (let k = 0; k <= 8; k++) {
        if (!flagOn(START + LEN + k)) {
          clearedAfter = k;
          break;
        }
      }
      const band = overnightStrainIndex(recs, simDay(END, DAYS, START + 1)).band;
      return { byDay2, clearedAfter, band };
    });

    const detected = runs.filter((r) => r.byDay2).length;
    const cleared = runs.filter((r) => r.clearedAfter !== null && r.clearedAfter <= 4).length;
    const major = runs.filter((r) => r.band === 'major').length;
    console.log(
      `[sim 1h] episode: flagged by day 2 in ${detected}/${SEEDS}, cleared ≤ 4 days in ${cleared}/${SEEDS}, ` +
        `strain 'major' on day 2 in ${major}/${SEEDS}`,
    );
    expect(detected / SEEDS).toBeGreaterThanOrEqual(0.9);
    expect(cleared / SEEDS).toBeGreaterThanOrEqual(0.9);
  }, 30_000);

  it('never flags before the episode starts', () => {
    const DAYS = 200;
    const START = 150;
    const runs = runSeeds(20, (seed) => {
      const recs = stressEpisode({ seed, days: DAYS, end: END, illnessStart: START, illnessDays: 5 });
      let pre = 0;
      for (let i = 100; i < START; i++) if (illnessFlag(recs, simDay(END, DAYS, i)).flag) pre++;
      return pre;
    });
    const preFlags = runs.reduce((a, b) => a + b, 0);
    const preDays = 20 * (START - 100);
    console.log(`[sim 1h] pre-episode false flags: ${preFlags}/${preDays} days (${((100 * preFlags) / preDays).toFixed(2)}%)`);
    expect((100 * preFlags) / preDays).toBeLessThanOrEqual(2);
  }, 30_000);

  it('gives a check-in-only user a band and no overnight strain at all', () => {
    const DAYS = 90;
    runSeeds(10, (seed) => {
      const recs = checkInSeries({ seed, days: DAYS, end: END, mean: 3, logProb: 0.9 });
      const c = checkInSummary(recs, END);
      const s = overnightStrainIndex(recs, END);
      // A band either way: a logged day gets one, a skipped day says "neutral".
      expect(['green', 'yellow', 'red', 'neutral']).toContain(c.band);
      if (!c.missingToday) expect(c.band).not.toBe('neutral');
      // nDays counts the 30-day reference window, not the whole history.
      expect(c.nDays).toBeGreaterThan(20);
      // …and nothing at all is claimed about physiology we do not have.
      expect(s.osi).toBeNull();
      expect(s.lo).toBeNull();
      expect(s.band).toBeNull();
      expect(s.calibrating).toBe(true);
      expect(s.signalsAvailable).toBe(0);
      expect(s.signalsDeviating).toBe(0);
      expect(illnessFlag(recs, END).flag).toBe(false);
    });
  });

  it('fires the DALDA run on the injected rough patch and not before it', () => {
    const DAYS = 90;
    const START = 80;
    const runs = runSeeds(20, (seed) => {
      const recs = checkInSeries({
        seed,
        days: DAYS,
        end: END,
        mean: 3,
        worse: { startDay: START, days: 6, delta: 2 },
      });
      const before = checkInSummary(recs, simDay(END, DAYS, START - 1)).worseRun;
      const third = checkInSummary(recs, simDay(END, DAYS, START + 2)).worseRun;
      return { before, third };
    });
    const quietBefore = runs.filter((r) => r.before < 3).length;
    const firedByThird = runs.filter((r) => r.third >= 3).length;
    console.log(`[sim 1h] DALDA: quiet before in ${quietBefore}/20, fired by the third worse day in ${firedByThird}/20`);
    expect(quietBefore).toBe(20);
    expect(firedByThird / 20).toBeGreaterThanOrEqual(0.9);
  }, 30_000);
});
