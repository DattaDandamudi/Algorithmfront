import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE, DEFAULT_TARGETS } from '../../data/defaults';
import type { CoachContext, DailyRecord } from '../../data/types';
import { adherenceGrid } from '../../engine';
import { addDays } from '../../lib/dates';
import {
  bedtimeOffsetSeries,
  bedtimeSdTone,
  frequencyRows,
  heatDay,
  heatWindowDays,
  hrvBandTone,
  intakeSuggestion,
  perWeek,
  rangeCaption,
  rangeWindow,
  rateBandState,
  rollingMeanSeries,
  sleepSeries,
  tdeeChartRange,
  tdeeSeries,
  weekEndingFormat,
  weightSeries,
} from './series';

const TODAY = '2026-09-06'; // a Sunday

/** `n` days ending today with a steady 1 lb/wk loss, 1,900 kcal intake and a 23:00 bedtime. */
function demo(n: number, opts: { skipWeighEvery?: number } = {}): DailyRecord[] {
  const out: DailyRecord[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = addDays(TODAY, -i);
    const rec: DailyRecord = { d, kc: 1900, p: 180, rhr: 52 + (i % 3), hrv: 50 + (i % 5), slh: 7 + (i % 2) * 0.5, bt: i % 2 ? '23:10' : '22:50', st: 9000 };
    if (!(opts.skipWeighEvery && i % opts.skipWeighEvery === 0)) rec.w = 172 - (n - 1 - i) / 7;
    out.push(rec);
  }
  return out;
}

describe('rangeWindow / rangeCaption', () => {
  it('maps ranges to days, buckets and TDEE weeks', () => {
    expect(rangeWindow('7D', TODAY)).toMatchObject({ days: 7, start: '2026-08-31', end: TODAY, bucket: 'day', tdeeWeeks: 4 });
    expect(rangeWindow('90D', TODAY)).toMatchObject({ days: 90, bucket: 'week', tdeeWeeks: 13 });
    expect(rangeWindow('1Y', TODAY)).toMatchObject({ days: 365, bucket: 'month', tdeeWeeks: 52 });
  });
  it('writes the header caption', () => {
    expect(rangeCaption(rangeWindow('30D', TODAY))).toBe('Last 30 days · daily · 8 Aug – 6 Sep');
    expect(rangeCaption(rangeWindow('90D', TODAY))).toMatch(/^Last 90 days · weekly averages · /);
  });
});

describe('weightSeries', () => {
  it('returns dots, a trend and a noise band in lb, counting weigh-ins in the window', () => {
    const s = weightSeries(demo(40), rangeWindow('30D', TODAY), 0.1, 'lb');
    expect(s.dots).toHaveLength(30);
    expect(s.weighIns).toBe(30);
    expect(s.noise).toBeGreaterThan(0);
    const last = s.trend[s.trend.length - 1];
    const band = s.band[s.band.length - 1];
    expect(last.value).not.toBeNull();
    expect(band.hi! - band.lo!).toBeCloseTo(2 * s.noise, 5);
  });
  it('converts to kg for kg profiles and buckets weekly at 90D', () => {
    const lb = weightSeries(demo(40), rangeWindow('7D', TODAY), 0.1, 'lb');
    const kg = weightSeries(demo(40), rangeWindow('7D', TODAY), 0.1, 'kg');
    expect(kg.dots[6].value! * 2.2046226218).toBeCloseTo(lb.dots[6].value!, 1);
    const weekly = weightSeries(demo(40), rangeWindow('90D', TODAY), 0.1, 'lb');
    expect(weekly.dots.length).toBeLessThanOrEqual(14);
    expect(weekly.dots[0].d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('handles no records', () => {
    const s = weightSeries([], rangeWindow('30D', TODAY), 0.1, 'lb');
    expect(s.weighIns).toBe(0);
    expect(s.dots.every((p) => p.value === null)).toBe(true);
    expect(s.trend.every((p) => p.value === null)).toBe(true);
  });
});

describe('rateBandState / hrvBandTone / bedtimeSdTone', () => {
  it('words the band state', () => {
    expect(rateBandState('in', -1.1)).toEqual({ tone: 'green', text: 'Inside your target band' });
    expect(rateBandState('below', 0.3).text).toMatch(/rising/);
    expect(rateBandState('below', -0.3).text).toMatch(/slower/);
    expect(rateBandState('above', -2.5).tone).toBe('yellow');
    expect(rateBandState(null, null).tone).toBe('neutral');
  });
  it('matches the Today tile colours for HRV bands', () => {
    expect(hrvBandTone('balanced')).toBe('green');
    expect(hrvBandTone('unbalanced')).toBe('yellow');
    expect(hrvBandTone('low')).toBe('red');
    expect(hrvBandTone('poor')).toBe('red');
    expect(hrvBandTone('insufficient')).toBe('neutral');
  });
  it('flags bedtime SD at 30 / 60 min', () => {
    expect(bedtimeSdTone(null)).toBe('neutral');
    expect(bedtimeSdTone(12)).toBe('green');
    expect(bedtimeSdTone(45)).toBe('yellow');
    expect(bedtimeSdTone(75)).toBe('red');
  });
});

describe('rollingMeanSeries', () => {
  it('starts with a full 7-day mean thanks to the run-in', () => {
    const s = rollingMeanSeries(demo(40), 'rhr', rangeWindow('7D', TODAY), 7);
    expect(s.dots).toHaveLength(7);
    expect(s.line[0].value).not.toBeNull();
    expect(s.meanLast).toBeGreaterThan(51);
    expect(s.meanLast).toBeLessThan(55);
  });
  it('is null-safe on empty data', () => {
    const s = rollingMeanSeries([], 'rhr', rangeWindow('7D', TODAY), 7);
    expect(s.meanLast).toBeNull();
    expect(s.line.every((p) => p.value === null)).toBe(true);
  });
});

describe('sleepSeries / bedtimeOffsetSeries', () => {
  it('pairs hours with a need for every logged night', () => {
    const s = sleepSeries(demo(20), rangeWindow('7D', TODAY), DEFAULT_PROFILE);
    expect(s.nights).toBe(7);
    expect(s.hours.every((p) => p.value !== null)).toBe(true);
    expect(s.need.every((p) => p.value !== null && p.value >= 5)).toBe(true);
    expect(s.mean7).toBeCloseTo(7.25, 1);
  });
  it('measures bedtime offsets on the noon axis so post-midnight nights read as late', () => {
    const recs: DailyRecord[] = [
      { d: addDays(TODAY, -2), bt: '22:30' },
      { d: addDays(TODAY, -1), bt: '00:20' },
      { d: TODAY, bt: '23:00' },
    ];
    const s = bedtimeOffsetSeries(recs, rangeWindow('7D', TODAY), '23:00');
    expect(s.slice(-3).map((p) => p.value)).toEqual([-30, 80, 0]);
    expect(s[0].value).toBeNull();
  });
});

describe('tdeeSeries', () => {
  it('plots one point per weekly block with markers only on valid weeks', () => {
    const t = tdeeSeries(demo(40), rangeWindow('30D', TODAY), 0.1);
    expect(t.points).toHaveLength(5);
    expect(t.points[t.points.length - 1].d).toBe(TODAY);
    expect(t.result.valid).toBe(true);
    expect(t.annotations.length).toBeGreaterThan(0);
    expect(t.annotations[0].label).toMatch(/weigh-ins/);
    // Steady 1,900 kcal with a 1 lb/wk loss → ≈ 2,400 kcal/day.
    expect(t.result.tdee).toBeGreaterThan(2300);
    expect(t.result.tdee).toBeLessThan(2500);
  });
  it('leaves gaps for weeks that fail the gate', () => {
    // Weigh in only every third day → < 5 weigh-ins per week → never valid.
    const t = tdeeSeries(demo(40, { skipWeighEvery: 3 }).map((r) => (r.w === undefined ? r : r)), rangeWindow('30D', TODAY), 0.1);
    const sparse = demo(40).map((r, i) => (i % 2 ? { ...r, w: undefined } : r));
    const t2 = tdeeSeries(sparse, rangeWindow('30D', TODAY), 0.1);
    expect(t2.result.valid).toBe(false);
    expect(t2.points.every((p) => p.value === null)).toBe(true);
    expect(t2.annotations).toEqual([]);
    expect(t.points.length).toBe(5);
  });
  it('formats weekly points and picks the weekly date-label range', () => {
    expect(tdeeChartRange('7D')).toBe('90D');
    expect(tdeeChartRange('1Y')).toBe('1Y');
    expect(weekEndingFormat(TODAY)).toBe('Week ending 6 Sep');
  });
});

describe('intakeSuggestion', () => {
  const base = { expenditure: { tdee: 2400, valid: true, reason: '', suggestedKcal: 1950, suggestedDelta: 0 }, weight: { weeklyRateLb: -1.1, inBand: 'in' } } as unknown as CoachContext;
  it('holds inside the band', () => {
    expect(intakeSuggestion(base)).toEqual({ text: 'Hold 1,950 kcal', tone: 'green', hold: true });
  });
  it('explains an adjustment', () => {
    const slow = { ...base, expenditure: { ...base.expenditure, suggestedKcal: 1850, suggestedDelta: -100 }, weight: { weeklyRateLb: -0.4, inBand: 'below' } } as unknown as CoachContext;
    expect(intakeSuggestion(slow)?.text).toBe('Adjust to 1,850 kcal — losing slower than target');
    const up = { ...slow, weight: { weeklyRateLb: 0.3, inBand: 'below' } } as unknown as CoachContext;
    expect(intakeSuggestion(up)?.text).toMatch(/trend is rising/);
    const fast = { ...base, expenditure: { ...base.expenditure, suggestedKcal: 2050, suggestedDelta: 100 }, weight: { weeklyRateLb: -2.4, inBand: 'above' } } as unknown as CoachContext;
    expect(intakeSuggestion(fast)).toMatchObject({ tone: 'yellow', text: 'Adjust to 2,050 kcal — losing faster than target' });
  });
  it('says nothing when the week is not valid', () => {
    expect(intakeSuggestion({ ...base, expenditure: { ...base.expenditure, valid: false, suggestedKcal: null } } as unknown as CoachContext)).toBeNull();
  });
});

describe('heatmap helpers', () => {
  it('covers 12 Monday-start weeks ending with today', () => {
    // 2026-09-06 is a Sunday: its week starts Mon 31 Aug; 12 weeks back is Mon 15 Jun → 84 days.
    expect(heatWindowDays(TODAY)).toBe(84);
    expect(heatWindowDays('2026-09-07')).toBe(78);
  });
  it('levels protein, kcal and logging cells', () => {
    const recs: DailyRecord[] = [
      { d: addDays(TODAY, -1), kc: 1980, p: 175, meals: [{ id: 'a', t: '12:00', n: 'x', g: 100, kc: 990, p: 90, f: 0, c: 0, fi: 0 }, { id: 'b', t: '19:00', n: 'y', g: 100, kc: 990, p: 85, f: 0, c: 0, fi: 0 }] },
      { d: TODAY, w: 171 },
    ];
    const grid = adherenceGrid(recs, TODAY, 2, DEFAULT_TARGETS, DEFAULT_PROFILE);
    const byDate = new Map(recs.map((r) => [r.d, r]));
    const y = grid[0];
    expect(heatDay('protein', y, byDate.get(y.d), DEFAULT_TARGETS)).toMatchObject({ level: 2, title: expect.stringMatching(/175 g protein — hit/) });
    expect(heatDay('kcal', y, byDate.get(y.d), DEFAULT_TARGETS)).toMatchObject({ level: 3, title: expect.stringMatching(/on target/) });
    expect(heatDay('logging', y, byDate.get(y.d), DEFAULT_TARGETS)).toMatchObject({ level: 2, title: '2 meals logged' });
    const t = grid[1];
    expect(heatDay('protein', t, byDate.get(t.d), DEFAULT_TARGETS).level).toBeNull();
  });
});

describe('frequency helpers', () => {
  it('normalises servings per week', () => {
    expect(perWeek(6, 30)).toBe(1.4);
    expect(perWeek(2, 7)).toBe(2);
    expect(perWeek(1, 0)).toBe(0);
  });
  it('builds the four rows', () => {
    const week = { redMeatServings: 2, fishServings: 1, seafoodServings: 0, poultryServings: 3, restaurantMeals: 6, homeMeals: 4, totalMeals: 10, restaurantPct: 60, homeCookedPct: 40, fiberAvg: 24.5, daysLogged: 7, days: 7 };
    const range = { ...week, redMeatServings: 9, fishServings: 3, homeCookedPct: null, fiberAvg: null, days: 30 };
    const rows = frequencyRows(week, range, 30);
    expect(rows.map((r) => [r.label, r.week, r.range])).toEqual([
      ['Red meat', '2×/wk', '2.1×/wk'],
      ['Fish', '1×/wk', '0.7×/wk'],
      ['Home-cooked', '40%', '—'],
      ['Fiber', '24.5 g', '—'],
    ]);
    expect(rows[3].hint).toMatch(/30 g target/);
  });
});
