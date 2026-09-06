import { describe, expect, it } from 'vitest';
import {
  aggregateByBucket,
  autoDecimals,
  bucketForRange,
  bucketStart,
  buildAreaBetween,
  buildPath,
  definedIndices,
  extent,
  fillDaily,
  formatTick,
  formatTickDate,
  lastDefined,
  nearestIndex,
  niceStep,
  niceTicks,
  scaleLinear,
  sparseIndices,
  tickDecimals,
  xLabelIndices,
  xPositions,
} from './chartUtils';

describe('niceStep', () => {
  it('rounds up to 1 / 2 / 5 × 10^k', () => {
    expect(niceStep(1)).toBe(1);
    expect(niceStep(1.3)).toBe(2);
    expect(niceStep(2)).toBe(2);
    expect(niceStep(3.7)).toBe(5);
    expect(niceStep(7)).toBe(10);
    expect(niceStep(0.13)).toBeCloseTo(0.2);
    expect(niceStep(1234)).toBe(2000);
  });
  it('falls back to 1 for junk', () => {
    expect(niceStep(0)).toBe(1);
    expect(niceStep(-3)).toBe(1);
    expect(niceStep(NaN)).toBe(1);
  });
});

describe('niceTicks', () => {
  it('covers the range with clean steps (weight-like)', () => {
    expect(niceTicks(163, 176, 4)).toEqual([160, 165, 170, 175, 180]);
  });
  it('handles thousands (steps) and TDEE ranges', () => {
    expect(niceTicks(5800, 12400, 4)).toEqual([5000, 10000, 15000]);
    expect(niceTicks(7200, 9800, 4)).toEqual([7000, 8000, 9000, 10000]);
    expect(niceTicks(2150, 2620, 4)).toEqual([2000, 2200, 2400, 2600, 2800]);
  });
  it('produces fractional ticks without float noise', () => {
    expect(niceTicks(6.4, 8.1, 4)).toEqual([6, 7, 8, 9]);
    expect(niceTicks(6.9, 7.6, 4)).toEqual([6.5, 7, 7.5, 8]);
    expect(niceTicks(0.11, 0.39, 4)).toEqual([0.1, 0.2, 0.3, 0.4]);
  });
  it('pads a degenerate range so a single reading still has an axis', () => {
    const t = niceTicks(172, 172, 4);
    expect(t.length).toBeGreaterThanOrEqual(2);
    expect(t[0]).toBeLessThan(172);
    expect(t[t.length - 1]).toBeGreaterThan(172);
  });
  it('swaps a reversed range and rejects non-finite input', () => {
    expect(niceTicks(176, 163, 4)).toEqual([160, 165, 170, 175, 180]);
    expect(niceTicks(NaN, 5)).toEqual([]);
    expect(niceTicks(0, Infinity)).toEqual([]);
  });
  it('never returns fewer than 2 ticks', () => {
    expect(niceTicks(0, 1, 1).length).toBeGreaterThanOrEqual(2);
  });
  it('tick labels get the decimals the step needs', () => {
    expect(tickDecimals([6, 6.5, 7])).toBe(1);
    expect(tickDecimals([0, 0.25, 0.5])).toBe(2);
    expect(tickDecimals([2000, 2200])).toBe(0);
    expect(tickDecimals([5])).toBe(0);
    expect(formatTick(1950)).toBe('1,950');
    expect(formatTick(7.5, 1)).toBe('7.5');
  });
});

describe('extent', () => {
  it('pads by a fraction of the span and ignores nulls / NaN', () => {
    expect(extent([10, null, 20, undefined, NaN], 0.1)).toEqual([9, 21]);
  });
  it('pads a flat series so it is never zero-height', () => {
    const e = extent([50, 50]) as [number, number];
    expect(e[0]).toBeLessThan(50);
    expect(e[1]).toBeGreaterThan(50);
  });
  it('returns null when nothing is finite', () => {
    expect(extent([null, undefined, NaN])).toBeNull();
    expect(extent([])).toBeNull();
  });
});

describe('scaleLinear', () => {
  it('maps domain to range (inverted for SVG y) and back', () => {
    const y = scaleLinear([0, 100], [180, 20]);
    expect(y(0)).toBe(180);
    expect(y(100)).toBe(20);
    expect(y(50)).toBe(100);
    expect(y.invert(100)).toBe(50);
    expect(y.domain).toEqual([0, 100]);
  });
  it('collapses a zero-span domain to the range midpoint', () => {
    const s = scaleLinear([5, 5], [0, 100]);
    expect(s(5)).toBe(50);
    expect(s(99)).toBe(50);
  });
});

describe('xPositions / sparseIndices / xLabelIndices', () => {
  it('spaces n points evenly by index from x0 to x1', () => {
    expect(xPositions(3, 0, 100)).toEqual([0, 50, 100]);
    expect(xPositions(1, 0, 100)).toEqual([50]);
    expect(xPositions(0, 0, 100)).toEqual([]);
  });
  it('spreads label indices with both ends included', () => {
    expect(sparseIndices(30, 3)).toEqual([0, 15, 29]);
    expect(sparseIndices(12, 4)).toEqual([0, 4, 7, 11]);
    expect(sparseIndices(3, 5)).toEqual([0, 1, 2]);
    expect(sparseIndices(0, 3)).toEqual([]);
  });
  it('picks per-range label density', () => {
    expect(xLabelIndices(7, '7D')).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(xLabelIndices(30, '30D')).toEqual([0, 15, 29]);
    expect(xLabelIndices(13, '90D')).toEqual([0, 6, 12]);
    expect(xLabelIndices(12, '1Y')).toEqual([0, 4, 7, 11]);
  });
});

describe('formatTickDate', () => {
  it('formats per range', () => {
    expect(formatTickDate('2026-09-06', '7D')).toBe('Sun');
    expect(formatTickDate('2026-09-06', '30D')).toBe('6 Sep');
    expect(formatTickDate('2026-09-06', '90D')).toBe('6 Sep');
    expect(formatTickDate('2026-09-06', '1Y')).toBe('Sep');
    expect(formatTickDate('2026-01-01', '1Y')).toBe('Jan');
  });
  it('returns an empty label for a malformed date', () => {
    expect(formatTickDate('nope', '30D')).toBe('');
  });
});

describe('nearestIndex', () => {
  const xs = [0, 10, 20, 30];
  it('snaps to the closest x', () => {
    expect(nearestIndex(xs, -5)).toBe(0);
    expect(nearestIndex(xs, 4)).toBe(0);
    expect(nearestIndex(xs, 6)).toBe(1);
    expect(nearestIndex(xs, 24)).toBe(2);
    expect(nearestIndex(xs, 99)).toBe(3);
  });
  it('resolves exact hits and ties to the lower index', () => {
    expect(nearestIndex(xs, 20)).toBe(2);
    expect(nearestIndex(xs, 15)).toBe(1);
  });
  it('handles single and empty arrays', () => {
    expect(nearestIndex([42], 0)).toBe(0);
    expect(nearestIndex([], 0)).toBe(-1);
    expect(nearestIndex(xs, NaN)).toBe(-1);
  });
});

describe('buildPath', () => {
  it('joins consecutive points with L', () => {
    expect(buildPath([{ x: 0, y: 10 }, { x: 5, y: 12 }, { x: 10, y: 8 }])).toBe('M0 10L5 12L10 8');
  });
  it('lifts the pen at null gaps and restarts with M', () => {
    expect(buildPath([{ x: 0, y: 10 }, { x: 5, y: null }, { x: 10, y: 8 }, { x: 15, y: 9 }])).toBe('M0 10M10 8L15 9');
  });
  it('rounds to 0.01 px', () => {
    expect(buildPath([{ x: 1.23456, y: 9.876 }, { x: 2.005, y: 1 }])).toBe('M1.23 9.88L2.01 1');
  });
  it('returns an empty string for no drawable points', () => {
    expect(buildPath([])).toBe('');
    expect(buildPath([{ x: 0, y: null }, { x: 1, y: NaN }])).toBe('');
  });
});

describe('buildAreaBetween', () => {
  it('closes a band forward along upper and back along lower', () => {
    const lo = [{ x: 0, y: 20 }, { x: 10, y: 22 }];
    const hi = [{ x: 0, y: 10 }, { x: 10, y: 12 }];
    expect(buildAreaBetween(lo, hi)).toBe('M0 10L10 12L10 22L0 20Z');
  });
  it('splits into sub-paths where either bound is null', () => {
    const lo = [{ x: 0, y: 20 }, { x: 10, y: null }, { x: 20, y: 24 }, { x: 30, y: 26 }];
    const hi = [{ x: 0, y: 10 }, { x: 10, y: 12 }, { x: 20, y: 14 }, { x: 30, y: 16 }];
    expect(buildAreaBetween(lo, hi)).toBe('M0 10L0 20ZM20 14L30 16L30 26L20 24Z');
  });
  it('is empty when nothing overlaps', () => {
    expect(buildAreaBetween([{ x: 0, y: null }], [{ x: 0, y: 1 }])).toBe('');
    expect(buildAreaBetween([], [])).toBe('');
  });
});

describe('buckets', () => {
  it('maps ranges to buckets', () => {
    expect(bucketForRange('7D')).toBe('day');
    expect(bucketForRange('30D')).toBe('day');
    expect(bucketForRange('90D')).toBe('week');
    expect(bucketForRange('1Y')).toBe('month');
  });
  it('finds Monday-start weeks and month starts', () => {
    expect(bucketStart('2026-09-06', 'week')).toBe('2026-08-31'); // Sunday → previous Monday
    expect(bucketStart('2026-08-31', 'week')).toBe('2026-08-31'); // Monday stays
    expect(bucketStart('2026-09-02', 'week')).toBe('2026-08-31');
    expect(bucketStart('2026-09-17', 'month')).toBe('2026-09-01');
    expect(bucketStart('2026-09-17', 'day')).toBe('2026-09-17');
  });
  it('aggregates by mean / sum / last / count, ignoring nulls', () => {
    const pts = [
      { d: '2026-08-31', value: 10 },
      { d: '2026-09-01', value: null },
      { d: '2026-09-02', value: 20 },
      { d: '2026-09-07', value: 5 },
      { d: '2026-09-08', value: null },
    ];
    expect(aggregateByBucket(pts, 'week')).toEqual([
      { d: '2026-08-31', value: 15 },
      { d: '2026-09-07', value: 5 },
    ]);
    expect(aggregateByBucket(pts, 'week', 'sum')).toEqual([
      { d: '2026-08-31', value: 30 },
      { d: '2026-09-07', value: 5 },
    ]);
    expect(aggregateByBucket(pts, 'week', 'last')).toEqual([
      { d: '2026-08-31', value: 20 },
      { d: '2026-09-07', value: 5 },
    ]);
    expect(aggregateByBucket(pts, 'week', 'count')).toEqual([
      { d: '2026-08-31', value: 2 },
      { d: '2026-09-07', value: 1 },
    ]);
  });
  it('yields null for an all-null bucket and passes days through', () => {
    const pts = [{ d: '2026-09-01', value: null }, { d: '2026-09-02', value: NaN }];
    expect(aggregateByBucket(pts, 'month')).toEqual([{ d: '2026-09-01', value: null }]);
    expect(aggregateByBucket(pts, 'day')).toEqual([{ d: '2026-09-01', value: null }, { d: '2026-09-02', value: null }]);
  });
  it('fills a daily range with nulls for missing days', () => {
    expect(fillDaily([{ d: '2026-09-02', value: 3 }], '2026-09-01', '2026-09-03')).toEqual([
      { d: '2026-09-01', value: null },
      { d: '2026-09-02', value: 3 },
      { d: '2026-09-03', value: null },
    ]);
  });
});

describe('series helpers', () => {
  it('lastDefined / definedIndices skip nulls', () => {
    expect(lastDefined([1, null, 3, null])).toEqual({ index: 2, value: 3 });
    expect(lastDefined([null, null])).toBeNull();
    expect(definedIndices([null, 1, NaN, 2])).toEqual([1, 3]);
  });
  it('autoDecimals: integers → 0 dp, fractional narrow data → 1 dp, wide → 0 dp', () => {
    expect(autoDecimals([52, 54, null, 58])).toBe(0); // RHR bpm
    expect(autoDecimals([171.8, 170.2, null])).toBe(1); // weight lb
    expect(autoDecimals([6.5, 7.25, 8])).toBe(1); // sleep hours
    expect(autoDecimals([2310.5, 2480.2, 2650.7])).toBe(0); // kcal, span ≥ 20
    expect(autoDecimals([null, undefined])).toBe(0);
  });
});
