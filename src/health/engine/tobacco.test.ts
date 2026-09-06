import { describe, expect, it } from 'vitest';
import type { DailyRecord } from '../data/types';
import { addDays } from '../lib/dates';
import { smokeFreeStreak, tobaccoHrvComparison, tobaccoInsightNumbers, tobaccoStats } from './tobacco';

const ASOF = '2026-09-06';
const day = (n: number) => addDays(ASOF, -n); // n days before asOf

describe('tobaccoStats', () => {
  it('reports today, 7/30-day averages over logged days only, best day and a gapped trend', () => {
    const records: DailyRecord[] = [
      { d: day(31), tob: 9 }, // outside 30-day window
      { d: day(20), tob: 6 },
      { d: day(6), tob: 4 },
      { d: day(5), tob: 2 },
      // day(4) unlogged
      { d: day(3), tob: 0 },
      { d: day(2), tob: 3 },
      { d: day(1), tob: 1 },
      { d: day(0), tob: 2 },
    ];
    const s = tobaccoStats(records, ASOF);
    expect(s.today).toBe(2);
    expect(s.avg7).toBe(2); // (4+2+0+3+1+2)/6
    expect(s.avg30).toBe(2.6); // (6+4+2+0+3+1+2)/7 = 2.571 → 2.6
    expect(s.best30).toBe(0);
    expect(s.trend7.map((p) => p.count)).toEqual([4, 2, null, 0, 3, 1, 2]);
    expect(s.trend7[0].d).toBe(day(6));
    expect(s.trend7[6].d).toBe(ASOF);
  });

  it('returns zeros/nulls with no data and ignores future records', () => {
    const s = tobaccoStats([{ d: addDays(ASOF, 1), tob: 5 }], ASOF);
    expect(s).toEqual({ today: 0, avg7: null, avg30: null, streakDays: 0, trend7: s.trend7, best30: null });
    expect(s.trend7.every((p) => p.count === null)).toBe(true);
  });
});

describe('smoke-free streak', () => {
  it('counts consecutive logged zero days ending today', () => {
    const records: DailyRecord[] = [
      { d: day(3), tob: 2 },
      { d: day(2), tob: 0 },
      { d: day(1), tob: 0 },
      { d: day(0), tob: 0 },
    ];
    expect(smokeFreeStreak(records, ASOF)).toBe(3);
    expect(tobaccoStats(records, ASOF).streakDays).toBe(3);
  });

  it('starts from yesterday when today has no entry yet', () => {
    const records: DailyRecord[] = [
      { d: day(2), tob: 0 },
      { d: day(1), tob: 0 },
      { d: day(0), st: 8000 }, // logged something else, no tob
    ];
    expect(smokeFreeStreak(records, ASOF)).toBe(2);
  });

  it('skips unlogged days without breaking, and breaks on any smoking day', () => {
    const skipped: DailyRecord[] = [
      { d: day(4), tob: 0 },
      { d: day(3), tob: 0 },
      // day(2) missing
      { d: day(1), tob: 0 },
      { d: day(0), tob: 0 },
    ];
    expect(smokeFreeStreak(skipped, ASOF)).toBe(4);

    const broken: DailyRecord[] = [
      { d: day(3), tob: 0 },
      { d: day(2), tob: 1 },
      { d: day(1), tob: 0 },
      { d: day(0), tob: 0 },
    ];
    expect(smokeFreeStreak(broken, ASOF)).toBe(2);
    expect(smokeFreeStreak([{ d: day(1), tob: 0 }, { d: day(0), tob: 3 }], ASOF)).toBe(0);
    expect(smokeFreeStreak([], ASOF)).toBe(0);
  });

  it('is order-independent and ignores records after asOf', () => {
    const records: DailyRecord[] = [
      { d: day(0), tob: 0 },
      { d: addDays(ASOF, 1), tob: 4 },
      { d: day(1), tob: 0 },
    ];
    expect(smokeFreeStreak(records, ASOF)).toBe(2);
  });
});

/**
 * Alternate smoke-free / smoking days. The morning AFTER a smoke-free day
 * reads HRV 60 / RHR 50 / rec 80; after a smoking day 50 / 55 / 55. Same-day
 * pairing would invert the result, so this pins the next-morning rule.
 */
function alternating(nDays: number): DailyRecord[] {
  const out: DailyRecord[] = [];
  for (let i = nDays; i >= 1; i--) {
    const d = day(i);
    const prevFree = (i + 1) % 2 === 0; // yesterday's tobacco decides this morning
    out.push({
      d,
      tob: i % 2 === 0 ? 0 : 3,
      hrv: prevFree ? 60 : 50,
      rhr: prevFree ? 50 : 55,
      rec: prevFree ? 80 : 55,
    });
  }
  // asOf itself: only this morning's readings (yesterday, day(1), was a smoking day) and an unscored count.
  out.push({ d: day(0), tob: 0, hrv: 50, rhr: 55, rec: 55 });
  return out;
}

describe('tobaccoHrvComparison', () => {
  it("pairs each day's tobacco with the NEXT morning's HRV/RHR/recovery", () => {
    const cmp = tobaccoHrvComparison(alternating(8), ASOF);
    expect(cmp).not.toBeNull();
    expect(cmp?.nFree).toBe(4);
    expect(cmp?.nSmoke).toBe(4);
    expect(cmp?.hrvSmokeFree).toBe(60);
    expect(cmp?.hrvSmoking).toBe(50);
    expect(cmp?.rhrSmokeFree).toBe(50);
    expect(cmp?.rhrSmoking).toBe(55);
    expect(cmp?.recSmokeFree).toBe(80);
    expect(cmp?.recSmoking).toBe(55);
    expect(cmp?.hrvDelta).toBe(10);
  });

  it('needs at least 3 paired days in each group', () => {
    expect(tobaccoHrvComparison(alternating(5), ASOF)).toBeNull(); // 3 smoking, 2 free
    expect(tobaccoHrvComparison(alternating(6), ASOF)).not.toBeNull();
    expect(tobaccoHrvComparison([], ASOF)).toBeNull();
  });

  it('ignores days whose next morning has no readings, and respects the window', () => {
    const records: DailyRecord[] = alternating(8).map((r) => (r.d === day(2) ? { d: r.d, tob: r.tob } : r));
    // day(3) is smoking; its next morning (day(2)) now has no readings → nSmoke drops to 3.
    const cmp = tobaccoHrvComparison(records, ASOF);
    expect(cmp?.nSmoke).toBe(3);
    expect(cmp?.nFree).toBe(4);
    // A 4-day window holds only 2 free / 2 smoking pairs → below the minimum.
    expect(tobaccoHrvComparison(alternating(8), ASOF, 4)).toBeNull();
  });

  it('does not count today (its morning has not happened) and reports partial metrics as null', () => {
    const records: DailyRecord[] = alternating(6).map((r) => {
      const copy: DailyRecord = { d: r.d, tob: r.tob, hrv: r.hrv }; // drop rhr/rec
      return copy;
    });
    const cmp = tobaccoHrvComparison(records, ASOF);
    expect(cmp?.nFree).toBe(3); // day(6), day(4), day(2) — today's 0 is not scored
    expect(cmp?.rhrSmokeFree).toBeNull();
    expect(cmp?.recSmoking).toBeNull();
    expect(cmp?.hrvDelta).toBe(10);
  });
});

describe('tobaccoInsightNumbers', () => {
  it('feeds template #9 with count, 7-day average, last-3 smoke-free HRV and delta', () => {
    const n = tobaccoInsightNumbers(alternating(8), ASOF);
    expect(n.count).toBe(0);
    expect(n.avg).toBe(1.3); // last 7 days: 0,3,0,3,0,3,0 → 9/7 = 1.29
    expect(n.hrvFree).toBe(60);
    expect(n.delta).toBe(10);
  });

  it('is null until three smoke-free mornings exist', () => {
    const n = tobaccoInsightNumbers(alternating(5), ASOF); // only 2 smoke-free days before today
    expect(n.hrvFree).toBeNull();
    expect(n.delta).toBeNull();
    expect(n.count).toBe(0);
  });

  it('always carries the paired-day counts — a difference of means without its n is not a finding', () => {
    expect(tobaccoInsightNumbers(alternating(8), ASOF)).toMatchObject({ nFree: 4, nSmoke: 4 });
    // Below tobaccoHrvComparison's minimum the comparison is suppressed but the
    // counts still say how far off it is (2 free / 3 smoking).
    const thin = tobaccoInsightNumbers(alternating(5), ASOF);
    expect(tobaccoHrvComparison(alternating(5), ASOF)).toBeNull();
    expect(thin).toMatchObject({ nFree: 2, nSmoke: 3 });
    expect(tobaccoInsightNumbers([], ASOF)).toMatchObject({ nFree: 0, nSmoke: 0, hrvFree: null, delta: null });
  });
});
