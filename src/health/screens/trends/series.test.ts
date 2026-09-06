import { describe, expect, it } from 'vitest';
import { DEFAULT_LANDMARKS, DEFAULT_PROFILE, DEFAULT_SETTINGS, DEFAULT_TARGETS } from '../../data/defaults';
import type { CoachContext, DailyRecord, ISODate, Workout } from '../../data/types';
import {
  MIN_BLOCK_LOG_DAYS,
  MIN_BLOCK_WEIGH_INS,
  RHR_BASELINE_DAYS,
  adherenceGrid,
  bedtimeConsistency,
  buildCoachContext,
  checkInSummary,
  computeKalmanTrend,
  kalmanAt,
  overnightStrainIndex,
  smoothKalman,
  type AcwrPoint,
  type KalmanResult,
  type LoadPoint,
} from '../../engine';
import { addDays } from '../../lib/dates';
import {
  BAND_MIN_READINGS,
  STRESS_SERIES_MAX_DAYS,
  VOLUME_WEEKS,
  WEIGHT_BAND_Z,
  baselineBand,
  bedtimeOffsetSeries,
  bedtimeSdSeries,
  bedtimeSdTone,
  goalBandLabel,
  hrvBandTone,
  loadSeries,
  perWeek,
  rangeCaption,
  rangeWindow,
  rateBandState,
  resilienceCurves,
  rollingMeanSeries,
  sleepSeries,
  stressSeries,
  volumeWeeks,
  weightSeries,
} from './series';
import {
  TDEE_BAND_Z,
  blockProgress,
  coverageCaption,
  frequencyRows,
  heatDay,
  heatWindowDays,
  intakeSuggestion,
  tdeeChartRange,
  tdeeSeries,
  v3BlockProgress,
  weekEndingFormat,
} from './summaries';

const TODAY = '2026-09-06'; // a Sunday
const SETTINGS = { ...DEFAULT_SETTINGS, profile: DEFAULT_PROFILE, targets: DEFAULT_TARGETS };

/**
 * The §1a filter exactly as `buildCoachContext` builds it. Both the weight
 * band (smoothed) and the expenditure posterior (filtered) are functions of
 * it, so every assertion below that compares a series against the context has
 * to start from the same object the context started from.
 */
const filterOf = (recs: DailyRecord[], today: ISODate = TODAY): KalmanResult =>
  computeKalmanTrend(recs, today, { cycle: { enabled: DEFAULT_PROFILE.tracksCycle === true } });

const tdeeOpts = (recs: DailyRecord[]) => ({
  profile: DEFAULT_PROFILE,
  targets: DEFAULT_TARGETS,
  kalman: filterOf(recs),
  alpha: DEFAULT_TARGETS.ewmaAlpha,
});

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
  const smoothed = (recs: DailyRecord[]) => smoothKalman(filterOf(recs));

  it('draws the smoothed Kalman level with its 90% band, and ends on the context number', () => {
    const recs = demo(40);
    const s = weightSeries(recs, rangeWindow('30D', TODAY), smoothed(recs), 'lb');
    expect(s.dots).toHaveLength(30);
    expect(s.weighIns).toBe(30);
    expect(s.suspectCount).toBe(0);
    const last = s.trend[s.trend.length - 1];
    const band = s.band[s.band.length - 1];
    const point = kalmanAt(smoothed(recs), TODAY);
    // The drawn line ends on the level the context publishes (§1a: at `today`
    // the smoother and the filter agree), and the ribbon is that level's own
    // 90% interval — not a fixed water-noise width.
    expect(last.value).toBeCloseTo(point!.level, 2);
    expect(band.hi! - band.lo!).toBeCloseTo(2 * WEIGHT_BAND_Z * point!.levelSd, 1);
    expect(s.bandHalf).toBeCloseTo(WEIGHT_BAND_Z * point!.levelSd, 2);
  });

  it('draws a rejected weigh-in hollow instead of dropping it', () => {
    // One 250 lb entry in a 172 lb history: the outlier gate rejects it, so it
    // leaves the trend but stays on the chart as a `suspect` point.
    const typo = demo(40).map((r) => (r.d === addDays(TODAY, -10) ? { ...r, w: 250 } : r));
    const s = weightSeries(typo, rangeWindow('30D', TODAY), smoothed(typo), 'lb');
    expect(s.suspectCount).toBe(1);
    expect(s.weighIns).toBe(29);
    expect(s.suspect.filter((p) => p.value !== null)).toEqual([{ d: addDays(TODAY, -10), value: 250 }]);
    // …and it is not in the accepted series, nor did it drag the trend up.
    expect(s.dots.find((p) => p.d === addDays(TODAY, -10))!.value).toBeNull();
    const clean = weightSeries(demo(40), rangeWindow('30D', TODAY), smoothed(demo(40)), 'lb');
    const at = (w: typeof s, d: string) => w.trend.find((p) => p.d === d)!.value!;
    expect(Math.abs(at(s, TODAY) - at(clean, TODAY))).toBeLessThan(1);
  });

  it('converts to kg for kg profiles and buckets weekly at 90D', () => {
    const recs = demo(40);
    const lb = weightSeries(recs, rangeWindow('7D', TODAY), smoothed(recs), 'lb');
    const kg = weightSeries(recs, rangeWindow('7D', TODAY), smoothed(recs), 'kg');
    expect(kg.dots[6].value! * 2.2046226218).toBeCloseTo(lb.dots[6].value!, 1);
    const weekly = weightSeries(recs, rangeWindow('90D', TODAY), smoothed(recs), 'lb');
    expect(weekly.dots.length).toBeLessThanOrEqual(14);
    expect(weekly.dots[0].d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('counts weigh-ins ever separately from weigh-ins in the range (R2-3)', () => {
    // 60 days of history, but only 3 weigh-ins in the last 7 → the trend is still established.
    const recs = demo(60).map((r, i) => (i >= 53 && i % 2 === 0 ? { ...r, w: undefined } : r));
    const s = weightSeries(recs, rangeWindow('7D', TODAY), smoothed(recs), 'lb');
    expect(s.weighIns).toBeLessThan(5);
    expect(s.totalWeighIns).toBeGreaterThan(50);
    // The filter predicts through the gaps, so every day still has a level.
    expect(s.trend.every((p) => p.value !== null)).toBe(true);
    expect(s.band.every((p) => p.lo !== null && p.hi !== null)).toBe(true);
  });

  it('handles no records', () => {
    const s = weightSeries([], rangeWindow('30D', TODAY), smoothed([]), 'lb');
    expect(s.weighIns).toBe(0);
    expect(s.suspectCount).toBe(0);
    expect(s.bandHalf).toBeNull();
    expect(s.dots.every((p) => p.value === null)).toBe(true);
    expect(s.trend.every((p) => p.value === null)).toBe(true);
    expect(s.band.every((p) => p.lo === null && p.hi === null)).toBe(true);
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
  it('adds the 30-night sleep range once 7 nights exist (R2-7)', () => {
    const s = sleepSeries(demo(40), rangeWindow('30D', TODAY), DEFAULT_PROFILE);
    expect(s.band).not.toBeNull();
    expect(s.band!.lo).toBeLessThan(s.band!.mean);
    expect(s.band!.hi).toBeGreaterThan(s.band!.mean);
    expect(sleepSeries(demo(4), rangeWindow('30D', TODAY), DEFAULT_PROFILE).band).toBeNull();
  });
  it('plots the rolling 7-night bedtime SD and waits for 3 nights (R2-4 / R2-9)', () => {
    const s = bedtimeSdSeries(demo(40), rangeWindow('30D', TODAY));
    expect(s.series).toHaveLength(30);
    expect(s.nights).toBe(7);
    // Alternating 22:50 / 23:10 → SD ≈ 10.8 min, the engine's own number.
    expect(s.sdMin).toBe(bedtimeConsistency(demo(40), TODAY, 7).bedtimeSdMin);
    expect(s.series[s.series.length - 1].value).toBe(s.sdMin);
    expect(s.series.every((p) => p.value !== null)).toBe(true);
    // Two bedtimes: the engine would already report an SD, the card waits for the third night.
    const two = demo(2);
    expect(bedtimeConsistency(two, TODAY, 7).bedtimeSdMin).not.toBeNull();
    const gated = bedtimeSdSeries(two, rangeWindow('7D', TODAY));
    expect(gated.sdMin).toBeNull();
    expect(gated.nights).toBe(2);
    expect(gated.series.every((p) => p.value === null)).toBe(true);
    const three = bedtimeSdSeries(demo(3), rangeWindow('7D', TODAY));
    expect(three.sdMin).not.toBeNull();
    expect(three.series[three.series.length - 1].value).toBe(three.sdMin);
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

describe('tdeeSeries (engine v3 posterior)', () => {
  it('is range-invariant and its last point equals ctx.expenditure (R2-1)', () => {
    const recs = demo(120);
    const by = (r: '7D' | '30D' | '90D' | '1Y') => tdeeSeries(recs, rangeWindow(r, TODAY), tdeeOpts(recs));
    const short = by('7D');
    const long = by('1Y');
    // The 4 points 7D plots are exactly the last 4 of the 17 completed blocks that 1Y plots (R7-7: never 52 padded ones).
    expect(short.points).toEqual(long.points.slice(-4));
    expect(by('30D').points).toEqual(long.points.slice(-5));
    expect(by('90D').points).toEqual(long.points.slice(-13));
    // …and the readout number is the Today / coach number, whatever the range.
    // This is the whole reason `tdeeSeries` takes the context's own Kalman
    // result: the posterior is a function of it, so a chart that re-derived
    // the trend its own way would quietly publish a different TDEE.
    const ctx = buildCoachContext({ records: recs, settings: SETTINGS, today: TODAY, now: new Date(2026, 8, 6, 9, 0, 0) });
    expect(ctx.expenditure.tdee).not.toBeNull();
    for (const r of ['7D', '30D', '90D', '1Y'] as const) {
      const t = by(r);
      expect(t.result.tdee).toBe(ctx.expenditure.tdee);
      expect(t.points[t.points.length - 1].value).toBe(ctx.expenditure.tdee);
    }
    // Each historical point is the posterior as it stood the morning that block closed.
    const blocks = long.result.blocks;
    expect(long.points.map((p) => p.value)).toEqual(blocks.map((b) => b.tdee));
  });

  it('draws the 90% credible band around every point', () => {
    const recs = demo(120);
    const t = tdeeSeries(recs, rangeWindow('90D', TODAY), tdeeOpts(recs));
    expect(t.band).toHaveLength(t.points.length);
    t.band.forEach((b, i) => {
      const block = t.result.blocks[i];
      expect(b.d).toBe(t.points[i].d);
      // Whole kcal in, whole kcal out — the band is the engine's own sd × z, to the rounding.
      expect(Math.abs(b.hi! - b.lo! - 2 * TDEE_BAND_Z * block.tdeeSd)).toBeLessThanOrEqual(2);
      expect(b.lo!).toBeLessThan(t.points[i].value!);
      expect(b.hi!).toBeGreaterThan(t.points[i].value!);
    });
    // The interval narrows as blocks accumulate — that is what "calibrating" means.
    const width = (i: number) => t.band[i].hi! - t.band[i].lo!;
    expect(width(t.band.length - 1)).toBeLessThan(width(0));
    // …and the published half-width is the same quantity the readout quotes.
    expect(t.result.hi - t.result.lo).toBeCloseTo(2 * t.result.ci, 0);
  });

  it('plots one point per weekly block with markers only on measured blocks', () => {
    const recs = demo(40);
    const t = tdeeSeries(recs, rangeWindow('30D', TODAY), tdeeOpts(recs));
    expect(t.points).toHaveLength(5);
    // Blocks are anchored to the first weigh-in (39 days ago), so the latest COMPLETED block ends 5 days ago.
    const lastBlock = t.result.blocks[t.result.blocks.length - 1];
    expect(t.points[t.points.length - 1].d).toBe(lastBlock.end);
    expect(lastBlock.end).toBe(addDays(TODAY, -5));
    expect(t.result.valid).toBe(true);
    expect(t.annotations).toHaveLength(t.result.blocks.filter((b) => b.valid).length);
    expect(t.annotations[0].label).toMatch(/weigh-ins/);
    expect(t.annotations[0].label).toMatch(/days logged/);
    // Steady 1,900 kcal with a 1 lb/wk loss → a little over 2,200 kcal/day at
    // this body's Forbes/Hall density (the folk 3,500 kcal/lb read higher).
    expect(t.result.tdee).toBeGreaterThan(2000);
    expect(t.result.tdee).toBeLessThan(2500);
  });

  it('holds the estimate and widens the band when a block cannot be measured', () => {
    // One weigh-in a week and no step counts: every block misses the
    // 3-weigh-in gate and has no steps observation to fall back on, so nothing
    // updates the posterior. v3 does not blank the line for that — the mean is
    // held, the interval grows with the drift, and the copy says predict-only.
    const weekly = demo(40).map((r, i) => ({ ...r, st: undefined, w: i % 7 === 0 ? r.w : undefined }));
    const t = tdeeSeries(weekly, rangeWindow('30D', TODAY), tdeeOpts(weekly));
    expect(t.result.blocks.some((b) => b.valid)).toBe(false);
    expect(t.annotations).toEqual([]);
    expect(t.points.every((p) => p.value !== null)).toBe(true);
    expect(t.result.blocks[0].reason).toMatch(/predict-only/);
    const width = (i: number) => t.band[i].hi! - t.band[i].lo!;
    expect(width(t.band.length - 1)).toBeGreaterThan(width(0));
    // Held, not moved: every block sits on the Mifflin prior it started from.
    expect(new Set(t.points.map((p) => p.value)).size).toBe(1);
    expect(t.result.valid).toBe(false);
  });

  it('keeps only the latest update marker at 1Y', () => {
    const recs = demo(40);
    const t = tdeeSeries(recs, rangeWindow('1Y', TODAY), tdeeOpts(recs));
    // R7-7: 1Y asks for 52 blocks but only 5 have completed since the first
    // weigh-in (39 days ago) — the series is never padded with phantom
    // blocks dated before the user ever weighed in.
    expect(t.points).toHaveLength(5);
    expect(t.points[0].d).toBe(addDays(t.result.firstWeighIn as string, 6));
    expect(t.points.every((p) => p.d > (t.result.firstWeighIn as string))).toBe(true);
    expect(t.annotations).toHaveLength(1);
    expect(t.annotations[0].d).toBe(t.result.blocks[t.result.blocks.length - 1].end);
  });

  it('plots only completed blocks since the first weigh-in at every range (R7-7)', () => {
    // demo(120): 17 completed 7-day blocks (day 119 sits in block 17) → 17 points at 1Y, not 52.
    const recs = demo(120);
    const t = tdeeSeries(recs, rangeWindow('1Y', TODAY), tdeeOpts(recs));
    expect(t.points).toHaveLength(17);
    expect(t.points[0].d).toBe(addDays(t.result.firstWeighIn as string, 6));
    expect(t.points.every((p) => p.value !== null)).toBe(true);
  });

  it('captions the coverage the latest block earned', () => {
    const recs = demo(40);
    const t = tdeeSeries(recs, rangeWindow('30D', TODAY), tdeeOpts(recs));
    expect(coverageCaption(t.result.coverage)).toBe('7 of 7 days logged');
    expect(coverageCaption({ logged: 5, days: 7 })).toBe('5 of 7 days logged');
    // Never a divide-by-nothing or a NaN when no block has closed.
    expect(coverageCaption(undefined)).toBe('0 of 7 days logged');
    // The engine's own sentence names the interval, the coverage and the factor.
    expect(t.result.reason).toMatch(/90%/);
    expect(t.result.reason).toMatch(/7 of 7 days logged/);
    expect(t.result.reason).toMatch(/kcal per lb/);
  });

  it('words the in-progress block as progress, not failure (anchored blocks)', () => {
    // demo(40): first weigh-in 39 days ago → the open block started 4 days ago (5 of 7 days incl. today), 2 left.
    const recs = demo(40);
    const t = tdeeSeries(recs, rangeWindow('30D', TODAY), tdeeOpts(recs));
    const b = v3BlockProgress(t.result, TODAY);
    expect(b.daysLeft).toBe(2);
    expect(b.weighIns).toBe(5);
    expect(b.intakeDays).toBe(5);
    expect(b.met).toBe(true);
    expect(b.tone).toBe('green');
    expect(b.text).toBe('Gate met — 5/7 weigh-ins, 5/7 logged days · 2 days left');
    // Day 2 of a block with no weigh-ins yet: neutral, never yellow.
    const early = v3BlockProgress({ ...t.result, firstWeighIn: addDays(TODAY, -8), weighInsThisWeek: 0, loggedDaysThisWeek: 2 }, TODAY);
    expect(early.daysLeft).toBe(5);
    expect(early).toMatchObject({ met: false, unreachable: false, tone: 'neutral' });
    expect(early.text).toBe('0/7 weigh-ins, 2/7 logged days so far · 5 days left');
    // Day 7 of a block with no weigh-ins: today is the last chance, and one
    // weigh-in cannot reach three → yellow, and the estimate holds and widens.
    const late = v3BlockProgress({ ...t.result, firstWeighIn: addDays(TODAY, -13), weighInsThisWeek: 0, loggedDaysThisWeek: 6 }, TODAY);
    expect(late.daysLeft).toBe(0);
    expect(late).toMatchObject({ met: false, unreachable: true, tone: 'yellow' });
    expect(late.text).toBe('Too few weigh-ins for a measured block — the estimate holds and widens · block closes tonight');
    // Before any weigh-in: no block, plain counts.
    expect(v3BlockProgress({ ...t.result, firstWeighIn: null, weighInsThisWeek: 0, loggedDaysThisWeek: 0 }, TODAY)).toMatchObject({
      daysLeft: null,
      tone: 'neutral',
      text: '0/7 weigh-ins, 0/7 logged days so far',
    });
  });

  it('keeps the symmetric 5/5 default so the Log screen cross-check still means what it says', () => {
    const base = { firstWeighIn: addDays(TODAY, -8), weighInsThisWeek: 4, intakeDaysThisWeek: 5 };
    // 4 weigh-ins clears v3's gate of 3 but not v2's 5 — the default is v2's.
    expect(blockProgress(base, TODAY).met).toBe(false);
    expect(v3BlockProgress(base, TODAY).met).toBe(true);
    expect(v3BlockProgress(base, TODAY)).toEqual(blockProgress(base, TODAY, MIN_BLOCK_WEIGH_INS, MIN_BLOCK_LOG_DAYS));
    // Either field name is read, so one function serves both engines.
    expect(blockProgress({ ...base, intakeDaysThisWeek: undefined, loggedDaysThisWeek: 5 }, TODAY)).toEqual(blockProgress(base, TODAY));
    expect(blockProgress({ ...base, weighInsThisWeek: 6, intakeDaysThisWeek: 6 }, TODAY).met).toBe(true);
    expect(v3BlockProgress(base, TODAY).text).toMatch(/logged days/);
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
    expect(intakeSuggestion(base)).toEqual({ text: 'Hold 1,950 kcal', tone: 'green', hold: true, tier: 'none' });
  });
  it('explains an adjustment', () => {
    const slow = { ...base, expenditure: { ...base.expenditure, suggestedKcal: 1850, suggestedDelta: -100 }, weight: { weeklyRateLb: -0.4, inBand: 'below' } } as unknown as CoachContext;
    expect(intakeSuggestion(slow)?.text).toBe('Adjust to 1,850 kcal — losing slower than target');
    const up = { ...slow, weight: { weeklyRateLb: 0.3, inBand: 'below' } } as unknown as CoachContext;
    expect(intakeSuggestion(up)?.text).toMatch(/trend is rising/);
    const fast = { ...base, expenditure: { ...base.expenditure, suggestedKcal: 2050, suggestedDelta: 100 }, weight: { weeklyRateLb: -2.4, inBand: 'above' } } as unknown as CoachContext;
    expect(intakeSuggestion(fast)).toMatchObject({ tone: 'yellow', text: 'Adjust to 2,050 kcal — losing faster than target' });
  });
  it('carries the tier that earned the change', () => {
    const fine = { ...base, expenditure: { ...base.expenditure, suggestedKcal: 1900, suggestedDelta: -50, tier: 'fine' } } as unknown as CoachContext;
    expect(intakeSuggestion(fine)?.tier).toBe('fine');
    const coarse = { ...base, expenditure: { ...base.expenditure, suggestedKcal: 1800, suggestedDelta: -150, tier: 'coarse' } } as unknown as CoachContext;
    expect(intakeSuggestion(coarse)?.tier).toBe('coarse');
    // A context built before the tier existed reads as "no tier", never as a crash.
    expect(intakeSuggestion(base)?.tier).toBe('none');
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

describe('baselineBand', () => {
  it('is the mean ± SD of the days before today and needs 7 readings', () => {
    const b = baselineBand(demo(40), 'rhr', TODAY, RHR_BASELINE_DAYS);
    expect(b).not.toBeNull();
    expect(b!.n).toBe(RHR_BASELINE_DAYS);
    expect(b!.hi - b!.mean).toBeCloseTo(b!.sd, 2);
    expect(b!.mean - b!.lo).toBeCloseTo(b!.sd, 2);
    expect(baselineBand(demo(BAND_MIN_READINGS), 'rhr', TODAY, 28)).toBeNull(); // today excluded → 6 readings
    expect(baselineBand(demo(BAND_MIN_READINGS + 1), 'rhr', TODAY, 28)).not.toBeNull();
    expect(baselineBand([], 'rhr', TODAY, 28)).toBeNull();
  });
});

describe('goalBandLabel', () => {
  it('abbreviates whole thousands', () => {
    expect(goalBandLabel(8000, 10000)).toBe('8–10k');
    expect(goalBandLabel(7500, 10000)).toBe('7,500–10,000');
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

// ---------------------------------------------------------------------------
// Training load, volume, stress — the §1e / §1h series behind the new cards
// ---------------------------------------------------------------------------

describe('loadSeries', () => {
  /** `days` days of load ending today, `every`th day a session. */
  const loads = (days: number, every = 2, units = 400): LoadPoint[] =>
    Array.from({ length: days }, (_, i) => {
      const d = addDays(TODAY, -(days - 1 - i));
      const trained = i % every === 0;
      return { d, load: trained ? units : 0, source: trained ? ('logged' as const) : ('none' as const), workouts: trained ? 1 : 0 };
    });
  const acwr = (pts: LoadPoint[]): AcwrPoint[] =>
    pts.map((p, i) => ({ d: p.d, acute: 200 + i, chronic: 180 + i, acwr: i >= 27 ? 1.1 : null, band: i >= 27 ? ('sweet' as const) : null }));

  it('clips to the window, keeps rest days as zero and counts trained days', () => {
    const pts = loads(180);
    const s = loadSeries(pts, acwr(pts), rangeWindow('30D', TODAY));
    expect(s.daily).toHaveLength(30);
    expect(s.days).toBe(30);
    expect(s.trainedDays).toBe(15);
    // A rest day is a real zero, not a gap: the EWMAs behind the ratio need it.
    expect(s.daily.every((p) => p.value !== null)).toBe(true);
    expect(s.daily.filter((p) => p.value === 0)).toHaveLength(15);
  });

  it('leaves the ratio null until the engine has established it', () => {
    const pts = loads(40);
    const s = loadSeries(pts, acwr(pts), rangeWindow('30D', TODAY));
    // The first 27 days of the 40-day series carry no ratio; only the tail does.
    expect(s.acwr.some((p) => p.value === null)).toBe(true);
    expect(s.acwr[s.acwr.length - 1].value).toBe(1.1);
  });

  it('reports the engine window rather than inventing days it does not have', () => {
    // A 1Y range over a 180-day load window plots 180 days, not 365 of nulls:
    // re-integrating the EWMAs over a year would move them away from the
    // context's own numbers.
    const pts = loads(180);
    const s = loadSeries(pts, acwr(pts), rangeWindow('1Y', TODAY));
    expect(s.days).toBe(180);
    expect(s.daily.length).toBeLessThanOrEqual(7); // monthly buckets at 1Y
  });

  it('is null-safe with nothing logged', () => {
    const s = loadSeries([], [], rangeWindow('30D', TODAY));
    expect(s).toMatchObject({ days: 0, trainedDays: 0 });
    expect(s.daily).toEqual([]);
    expect(s.acwr).toEqual([]);
  });
});

describe('volumeWeeks', () => {
  const squat = (d: string): Workout => ({
    id: `w-${d}`,
    d,
    start: '18:00',
    durationMin: 60,
    kind: 'strength',
    source: 'manual',
    srpe: 8,
    exercises: [{ exerciseId: 'back-squat', sets: [{ w: 100, r: 5 }, { w: 100, r: 5 }, { w: 100, r: 5 }] }],
  });

  it('returns 12 Mon-start weeks of all 15 muscles, oldest first', () => {
    const weeks = volumeWeeks([], TODAY, DEFAULT_LANDMARKS);
    expect(weeks).toHaveLength(VOLUME_WEEKS);
    expect(weeks[0].muscles).toHaveLength(15);
    expect(weeks[0].weekStart < weeks[weeks.length - 1].weekStart).toBe(true);
    // 2026-09-06 is a Sunday, so the week in progress started Mon 31 Aug.
    expect(weeks[weeks.length - 1].weekStart).toBe('2026-08-31');
    expect(weeks.every((w) => w.muscles.every((m) => m.sets === 0 && m.status === 'below-mev'))).toBe(true);
  });

  it('counts a primary muscle whole and a secondary at half, in the right week', () => {
    // Tue of the week in progress, and one in the week before it.
    const weeks = volumeWeeks([squat('2026-09-01'), squat('2026-08-26')], TODAY, DEFAULT_LANDMARKS);
    const setsFor = (i: number, muscle: string) => weeks[i].muscles.find((m) => m.muscle === muscle)!.sets;
    expect(setsFor(VOLUME_WEEKS - 1, 'quads')).toBe(3);
    expect(setsFor(VOLUME_WEEKS - 1, 'hamstrings')).toBe(1.5); // secondary → half a set
    expect(setsFor(VOLUME_WEEKS - 2, 'quads')).toBe(3);
    expect(setsFor(VOLUME_WEEKS - 3, 'quads')).toBe(0);
  });
});

describe('stressSeries / resilienceCurves', () => {
  /** `n` days of overnight signals with a check-in on every day. */
  const nights = (n: number): DailyRecord[] =>
    Array.from({ length: n }, (_, i) => {
      const back = n - 1 - i;
      return {
        d: addDays(TODAY, -back),
        hrv: 50 + (i % 5),
        rhr: 52 + (i % 3),
        rr: 14 + (i % 2) * 0.5,
        slh: 7 + (i % 2) * 0.5,
        qs: 2,
        qf: 2,
        qt: 2,
        qo: 2,
      } as DailyRecord;
    });

  it('ends on the engine numbers the context publishes', () => {
    const recs = nights(60);
    const s = stressSeries(recs, rangeWindow('30D', TODAY), DEFAULT_SETTINGS.checkIn);
    expect(s.osi).toHaveLength(30);
    expect(s.checkIn).toHaveLength(30);
    expect(s.osi[s.osi.length - 1].value).toBe(overnightStrainIndex(recs, TODAY).osi);
    expect(s.checkIn[s.checkIn.length - 1].value).toBe(checkInSummary(recs, TODAY, { items: DEFAULT_SETTINGS.checkIn.items }).total);
    // Hooper is 4 items of 1–7, so a "2 everywhere" day totals 8 of a 4–28 scale.
    expect(s.checkIn[s.checkIn.length - 1].value).toBe(8);
    expect(s.checkInDays).toBe(30);
  });

  it('draws the credible interval around the index and never inverts it', () => {
    const recs = nights(60);
    const s = stressSeries(recs, rangeWindow('30D', TODAY), DEFAULT_SETTINGS.checkIn);
    expect(s.osiDays).toBeGreaterThan(0);
    expect(s.osiBand).toHaveLength(s.osi.length);
    s.osiBand.forEach((b, i) => {
      const v = s.osi[i].value;
      if (v === null || b.lo === null || b.hi === null) return;
      expect(b.lo).toBeLessThanOrEqual(v);
      expect(b.hi).toBeGreaterThanOrEqual(v);
    });
  });

  it('stays calibrating rather than inventing an index from two nights', () => {
    const s = stressSeries(nights(2), rangeWindow('7D', TODAY), DEFAULT_SETTINGS.checkIn);
    expect(s.osiDays).toBe(0);
    expect(s.osi.every((p) => p.value === null)).toBe(true);
    expect(s.osiBand.every((p) => p.lo === null && p.hi === null)).toBe(true);
  });

  it('is null-safe on empty records', () => {
    const s = stressSeries([], rangeWindow('30D', TODAY), DEFAULT_SETTINGS.checkIn);
    expect(s.osi).toHaveLength(30);
    expect(s.osi.every((p) => p.value === null)).toBe(true);
    expect(s.checkInDays).toBe(0);
  });

  it('caps the window it evaluates and says how far it actually went', () => {
    // Each point is a full engine pass over a rolling 60-day reference, so a
    // year would cost ~200 ms on a range flip for four monthly buckets.
    expect(stressSeries([], rangeWindow('30D', TODAY), undefined).days).toBe(30);
    expect(stressSeries([], rangeWindow('1Y', TODAY), undefined).days).toBe(STRESS_SERIES_MAX_DAYS);
    const year = stressSeries(nights(200), rangeWindow('1Y', TODAY), DEFAULT_SETTINGS.checkIn);
    // Monthly buckets over the capped span, and still ending on today's number.
    expect(year.osi.length).toBeLessThanOrEqual(6);
    expect(year.osi[year.osi.length - 1].d <= TODAY).toBe(true);
  });

  it('splits the scissors into two plottable curves without rescaling them', () => {
    const { load, recovery } = resilienceCurves([
      { d: addDays(TODAY, -1), load: 0.42, recovery: 0.61 },
      { d: TODAY, load: null, recovery: 0.58 },
    ]);
    expect(load).toEqual([{ d: addDays(TODAY, -1), value: 0.42 }, { d: TODAY, value: null }]);
    expect(recovery.map((p) => p.value)).toEqual([0.61, 0.58]);
    expect(resilienceCurves([])).toEqual({ load: [], recovery: [] });
  });
});
