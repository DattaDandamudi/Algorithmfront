import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE, DEFAULT_TARGETS } from '../data/defaults';
import type { DailyRecord, Meal } from '../data/types';
import {
  adherenceCounts,
  adherenceGrid,
  loggingStreak,
  monthStartOf,
  weeklyAggregate,
  weekStartOf,
  weighInStreak,
} from './adherence';

const meal = (over: Partial<Meal> = {}): Meal => ({ id: 'm', t: '12:00', n: 'x', g: 100, kc: 400, p: 40, f: 10, c: 30, fi: 3, ...over });

// Window ending Monday 2026-09-07; 09-03 is unlogged, 09-05 has only a weigh-in.
const ASOF = '2026-09-07';
const records: DailyRecord[] = [
  { d: '2026-09-01', kc: 1900, p: 175, w: 172.4 }, // stored totals: protein hit, kcal hit
  { d: '2026-09-02', kc: 2001, p: 169 }, // both miss (kcal +51, protein −11)
  { d: '2026-09-04', w: 172.0, meals: [meal({ kc: 1550, p: 172 })] }, // kcal −400 exactly → hit
  { d: '2026-09-05', w: 171.8 }, // weigh-in only → not logged
  { d: '2026-09-06', kc: 1549, p: 190 }, // kcal under by 401 → miss; protein hit
  { d: ASOF, meals: [meal({ kc: 500, p: 60 })] }, // partial day counts as logged
];

describe('adherenceGrid', () => {
  it('emits one cell per calendar day, oldest first, with tolerant hit rules', () => {
    const grid = adherenceGrid(records, ASOF, 7, DEFAULT_TARGETS, DEFAULT_PROFILE);
    expect(grid.map((c) => c.d)).toEqual(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06', ASOF]);

    expect(grid[0]).toMatchObject({ logged: true, proteinHit: true, kcalHit: true, weighed: true, proteinG: 175, kcal: 1900 });
    expect(grid[1]).toMatchObject({ logged: true, proteinHit: false, kcalHit: false, weighed: false });
    expect(grid[2]).toMatchObject({ logged: false, proteinHit: null, kcalHit: null, weighed: false, proteinG: null, kcal: null });
    expect(grid[3]).toMatchObject({ logged: true, proteinHit: true, kcalHit: true, weighed: true, proteinG: 172, kcal: 1550 });
    expect(grid[4]).toMatchObject({ logged: false, proteinHit: null, kcalHit: null, weighed: true });
    expect(grid[5]).toMatchObject({ logged: true, proteinHit: true, kcalHit: false });
    expect(grid[6]).toMatchObject({ logged: true, proteinHit: false, kcalHit: false, proteinG: 60, kcal: 500 });
  });

  it('carries the lift/rest day type from the split and override', () => {
    const grid = adherenceGrid([{ d: '2026-09-06', lift: true }], ASOF, 2, DEFAULT_TARGETS, DEFAULT_PROFILE);
    expect(grid[0]).toMatchObject({ d: '2026-09-06', dayType: 'lift' }); // Sunday rest, overridden
    expect(grid[1]).toMatchObject({ d: ASOF, dayType: 'lift' }); // Monday upper
  });

  it('returns an empty grid for zero days', () => {
    expect(adherenceGrid(records, ASOF, 0, DEFAULT_TARGETS, DEFAULT_PROFILE)).toEqual([]);
  });
});

describe('loggingStreak', () => {
  it('counts consecutive logged days ending today', () => {
    expect(loggingStreak(records, ASOF)).toBe(2); // 09-06, 09-07 (09-05 breaks it)
  });

  it('survives an unlogged today by ending at yesterday', () => {
    const recs: DailyRecord[] = [
      { d: '2026-09-03', kc: 1800 },
      { d: '2026-09-04', kc: 1800 },
      { d: '2026-09-05', kc: 1800 },
    ];
    expect(loggingStreak(recs, '2026-09-06')).toBe(3);
    expect(loggingStreak(recs, '2026-09-07')).toBe(0); // two-day gap
  });

  it('stops at gaps and ignores future records', () => {
    const recs: DailyRecord[] = [
      { d: '2026-09-01', kc: 1800 },
      { d: '2026-09-03', kc: 1800 },
      { d: '2026-09-04', meals: [meal()] },
      { d: '2026-09-05', kc: 0 }, // kc 0 is not logged
      { d: '2026-09-08', kc: 1800 },
    ];
    expect(loggingStreak(recs, '2026-09-04')).toBe(2);
    expect(loggingStreak(recs, '2026-09-05')).toBe(2);
    expect(loggingStreak(recs, '2026-09-06')).toBe(0);
    expect(loggingStreak([], ASOF)).toBe(0);
  });
});

describe('weighInStreak', () => {
  it('counts consecutive weigh-ins ending today or yesterday', () => {
    expect(weighInStreak(records, '2026-09-05')).toBe(2); // 09-04, 09-05
    expect(weighInStreak(records, '2026-09-06')).toBe(2); // ends yesterday
    expect(weighInStreak(records, ASOF)).toBe(0);
    expect(weighInStreak([{ d: ASOF, w: 0 }], ASOF)).toBe(0); // 0 lb is not a weigh-in
  });
});

describe('adherenceCounts', () => {
  it('totals the grid and reports a 0–1 logging rate', () => {
    const grid = adherenceGrid(records, ASOF, 7, DEFAULT_TARGETS, DEFAULT_PROFILE);
    expect(adherenceCounts(grid)).toEqual({ loggedDays: 5, proteinHitDays: 3, kcalHitDays: 2, weighInDays: 3, loggingRate: 0.71 });
    expect(adherenceCounts([])).toEqual({ loggedDays: 0, proteinHitDays: 0, kcalHitDays: 0, weighInDays: 0, loggingRate: 0 });
  });
});

describe('weeklyAggregate', () => {
  it('buckets by ISO week (Monday start) with means and counts', () => {
    const points = [
      { d: '2026-09-05', v: 10 }, // Sat → week of 08-31
      { d: '2026-09-06', v: 20 }, // Sun → week of 08-31
      { d: '2026-09-07', v: 30 }, // Mon → week of 09-07
      { d: '2026-09-08', v: null },
      { d: '2026-09-09', v: 33 },
    ];
    expect(weeklyAggregate(points, 'weekly')).toEqual([
      { d: '2026-08-31', v: 15, n: 2 },
      { d: '2026-09-07', v: 31.5, n: 2 },
    ]);
  });

  it('buckets by month and keeps empty buckets as null', () => {
    const points = [
      { d: '2026-08-30', v: 172.4 },
      { d: '2026-08-31', v: 172.0 },
      { d: '2026-09-01', v: null },
      { d: '2026-09-15', v: null },
      { d: '2026-10-02', v: 170.1 },
    ];
    expect(weeklyAggregate(points, 'monthly')).toEqual([
      { d: '2026-08-01', v: 172.2, n: 2 },
      { d: '2026-09-01', v: null, n: 0 },
      { d: '2026-10-01', v: 170.1, n: 1 },
    ]);
  });

  it('sorts buckets ascending regardless of input order and handles empty input', () => {
    const out = weeklyAggregate([{ d: '2026-09-14', v: 1 }, { d: '2026-09-01', v: 2 }], 'weekly');
    expect(out.map((b) => b.d)).toEqual(['2026-08-31', '2026-09-14']);
    expect(weeklyAggregate([], 'monthly')).toEqual([]);
  });

  it('exposes the bucket-start helpers', () => {
    expect(weekStartOf('2026-09-06')).toBe('2026-08-31');
    expect(weekStartOf('2026-09-07')).toBe('2026-09-07');
    expect(monthStartOf('2026-09-30')).toBe('2026-09-01');
  });
});
