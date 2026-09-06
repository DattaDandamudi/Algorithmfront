/**
 * Phase 1d simulations — seeded, deterministic, gates rather than documentation.
 *
 * Every user here comes from `simFixtures.sleepNights`, so a failure points at
 * the sleep model, not at a fixture written twice. The bounds are the plan's:
 *
 *  S1  A baseline sleeper (habitually meets their need, realistic 0.7 h
 *      night-to-night variation) sits at a mean debt < 60 min with p95 < 100 —
 *      the debt number must stay quiet for someone who is fine.
 *  S2  Three −1.5 h nights peak at ≤ 270 min and are back under 30 within 14
 *      nights — Kitamura's ≈4.3-day half-life, not a fortnight of guilt.
 *  S3  One 10 h night after five 5 h nights leaves ≥ 60 min of debt standing —
 *      the Banks 2010 repayment cap doing its job.
 *  S4  SRI is 100 ± 1 on a perfectly regular schedule, 70–90 with ±60 min of
 *      jitter, and null at 13 nights.
 *
 * Fixture note: `sleepNights` draws the nightly bedtime shift as
 * `normal(0, jitterMin/2)`, so `jitterMin: 60` is a 30-min SD — a ±60 min
 * schedule at ~2 SD.
 */
import { describe, expect, it } from 'vitest';
import type { DailyRecord, Profile } from '../data/types';
import { DEFAULT_PROFILE } from '../data/defaults';
import { runSeeds, simDay, sleepNights } from './simFixtures';
import { quantile } from './stats';
import { SLEEP_DEBT_CAP_MIN, sleepDebt, sleepRegularityIndex } from './sleep';

const END = '2026-09-06';
const profile: Profile = { ...DEFAULT_PROFILE, sleepBaselineHrs: 8, bedTarget: '23:00', wakeTarget: '07:00' };
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('S1 — a baseline sleeper carries almost no debt', () => {
  it('mean debt < 60 min and p95 < 100 min across 40 seeded users', () => {
    const DAYS = 120;
    const WARMUP = 40; // let the 28-night walk fill before we start scoring
    // "Baseline sleeper" = habitually meets an 8 h need (median 8.25 h) with the
    // real-world 0.7 h night-to-night spread. A sleeper centred exactly on the
    // need is a knife-edge case: the 0-floor rectifies the noise, so short
    // nights accumulate while long ones cannot go below zero.
    const all: number[] = [];
    runSeeds(40, (seed) => {
      const recs = sleepNights({ seed, days: DAYS, end: END, meanHrs: 8.25, sdHrs: 0.7 });
      for (let i = WARMUP; i < DAYS; i++) {
        all.push(sleepDebt(recs, simDay(END, DAYS, i), profile).debtMin);
      }
    });
    const p95 = quantile(all, 0.95) as number;
    expect(mean(all)).toBeLessThan(60); // measured ≈ 21
    expect(p95).toBeLessThan(100); // measured ≈ 87
    // And it never runs away: nobody meeting their need should hit the cap.
    expect(Math.max(...all)).toBeLessThan(SLEEP_DEBT_CAP_MIN);
  });
});

describe('S2 — three short nights peak and then clear', () => {
  it('peaks at ≤ 270 min and falls under 30 within 14 nights, on every seed', () => {
    const DAYS = 60;
    const SHORT = 20; // 0-based index of the first −1.5 h night
    // A regular sleeper (0.45 h spread) so the number under test is the block
    // itself rather than the noise floor it landed on.
    const peaks: number[] = [];
    const increments: number[] = [];
    const cleared: number[] = [];
    runSeeds(30, (seed) => {
      const recs = sleepNights({
        seed,
        days: DAYS,
        end: END,
        meanHrs: 8.25,
        sdHrs: 0.45,
        overrides: { [SHORT]: 6.5, [SHORT + 1]: 6.5, [SHORT + 2]: 6.5 },
      });
      const debtAt = (i: number) => sleepDebt(recs, simDay(END, DAYS, i), profile).debtMin;
      const before = debtAt(SHORT - 1);
      let peak = 0;
      for (let i = SHORT; i <= SHORT + 3; i++) peak = Math.max(peak, debtAt(i));
      peaks.push(peak);
      increments.push(peak - before);
      let k = Infinity;
      for (let n = 1; n <= 16; n++) {
        if (debtAt(SHORT + 2 + n) < 30) {
          k = n;
          break;
        }
      }
      cleared.push(k);
    });
    expect(Math.max(...peaks)).toBeLessThanOrEqual(270); // measured 269
    // 3 × 90 min with λ = 0.85 is 231.5 — the block must actually register, or
    // an upper bound alone would pass a model that shrugged off 4.5 h of sleep.
    expect(Math.min(...increments)).toBeGreaterThan(190);
    expect(Math.max(...increments)).toBeLessThan(260);
    expect(Math.max(...cleared)).toBeLessThanOrEqual(14); // measured 9
  });
});

describe('S3 — one long night cannot buy back a week (Banks 2010)', () => {
  it('leaves ≥ 60 min of debt after five 5 h nights and one 10 h night', () => {
    const DAYS = 40;
    const SHORT = 30;
    const standing: number[] = [];
    runSeeds(30, (seed) => {
      const overrides: Record<number, number> = { [SHORT + 5]: 10 };
      for (let i = 0; i < 5; i++) overrides[SHORT + i] = 5;
      const recs = sleepNights({ seed, days: DAYS, end: END, meanHrs: 8, sdHrs: 0.5, overrides });
      standing.push(sleepDebt(recs, simDay(END, DAYS, SHORT + 5), profile).debtMin);
    });
    expect(Math.min(...standing)).toBeGreaterThanOrEqual(60); // measured 135 on every seed
  });

  it('an uncapped model would have cleared far more of it', () => {
    // Same five 5 h nights, then a night long enough that the raw arithmetic
    // would retire 3 h: the cap holds the repayment to 2 h.
    const recs: DailyRecord[] = [
      ...Array.from({ length: 5 }, (_, i) => ({ d: simDay(END, 6, i), slh: 5 })),
      { d: END, slh: 11 },
    ];
    const r = sleepDebt(recs, END, profile);
    expect(r.repayCapped).toBe(true);
    expect(r.debtMin).toBe(135); // 0.85 × 300 − 120, not − 180
  });
});

describe('S4 — Sleep Regularity Index (Phillips 2017)', () => {
  const sriFor = (jitterMin: number, sdHrs = 0.7) =>
    runSeeds(20, (seed) => sleepRegularityIndex(sleepNights({ seed, days: 28, end: END, meanHrs: 8, sdHrs, jitterMin }), END).sri as number);

  it('is 100 ± 1 on a perfectly regular schedule', () => {
    const sris = sriFor(0, 0.05);
    expect(Math.min(...sris)).toBeGreaterThanOrEqual(99); // measured 99.4–99.7
    expect(Math.max(...sris)).toBeLessThanOrEqual(100);
  });

  it('sits in the 70–90 band with ±60 min of jitter', () => {
    const sris = sriFor(60);
    // Measured 84.1–91.0, mean 87.2. The mismatch is exactly the arithmetic:
    // E|Δbedtime| + E|Δwake| ≈ 92 of 1440 min → 100 − 2·92/1440·100 ≈ 87.
    expect(mean(sris)).toBeGreaterThanOrEqual(70);
    expect(mean(sris)).toBeLessThanOrEqual(90);
    expect(Math.min(...sris)).toBeGreaterThanOrEqual(70);
    expect(Math.max(...sris)).toBeLessThanOrEqual(92);
  });

  it('degrades monotonically as the schedule loosens', () => {
    const tight = mean(sriFor(0));
    const loose = mean(sriFor(60));
    const chaotic = mean(sriFor(120));
    expect(tight).toBeGreaterThan(loose);
    expect(loose).toBeGreaterThan(chaotic);
    expect(chaotic).toBeLessThanOrEqual(90);
  });

  it('is null at 13 nights and available at 14', () => {
    runSeeds(10, (seed) => {
      expect(sleepRegularityIndex(sleepNights({ seed, days: 13, end: END, meanHrs: 8 }), END).sri).toBeNull();
      expect(sleepRegularityIndex(sleepNights({ seed, days: 14, end: END, meanHrs: 8 }), END).sri).not.toBeNull();
    });
  });
});
