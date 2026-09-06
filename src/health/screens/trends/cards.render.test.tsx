/**
 * Render checks for the Trends cards this phase changed or added.
 *
 * These are not snapshot tests. Each one asserts a promise the plan makes
 * about what a user can read *without* a pointer and without colour vision:
 * that the expenditure card shows its interval, its coverage and the energy
 * density it converted with; that the weight card explains its hollow dots;
 * that the load card puts absolute load and week-on-week change *above* the
 * acute:chronic ratio and prints the Impellizzeri note; and that none of them
 * leak an `undefined` or a `NaN` into the markup on either full or empty data.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFAULT_LANDMARKS, DEFAULT_PROFILE, DEFAULT_SETTINGS, DEFAULT_TARGETS } from '../../data/defaults';
import type { DailyRecord, Workout } from '../../data/types';
import { buildCoachContext, computeKalmanTrend, smoothKalman } from '../../engine';
import { addDays } from '../../lib/dates';
import { fmt } from '../../lib/format';
import ExpenditureCard from './ExpenditureCard';
import LoadCard from './LoadCard';
import VolumeCard from './VolumeCard';
import WeightCard from './WeightCard';
import { loadSeries, rangeWindow, volumeWeeks, weightSeries } from './series';
import { tdeeSeries } from './summaries';

const TODAY = '2026-09-06';
const SETTINGS = { ...DEFAULT_SETTINGS, profile: DEFAULT_PROFILE, targets: DEFAULT_TARGETS };
const noop = () => {};

// The chart primitives measure their container with useLayoutEffect and are
// client-only in the app; React warns about that under the server renderer.
// Filter just that line so a real console error still fails loudly.
const realError = console.error;
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].includes('useLayoutEffect does nothing on the server')) return;
    realError(...args);
  };
});
afterAll(() => {
  console.error = realError;
});

function demo(n: number): DailyRecord[] {
  const out: DailyRecord[] = [];
  for (let i = n - 1; i >= 0; i--) {
    out.push({
      d: addDays(TODAY, -i),
      kc: 1900,
      p: 180,
      w: 172 - (n - 1 - i) / 7,
      rhr: 52 + (i % 3),
      hrv: 50 + (i % 5),
      slh: 7 + (i % 2) * 0.5,
      st: 9000,
    });
  }
  return out;
}

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

const ctxOf = (records: DailyRecord[], workouts: Workout[] = []) =>
  buildCoachContext({ records, settings: SETTINGS, today: TODAY, now: new Date(2026, 8, 6, 9, 0, 0), workouts });

/** Nothing on a card may render as a raw `undefined` or `NaN`. */
const clean = (html: string) => {
  expect(html).not.toMatch(/>undefined</);
  expect(html).not.toMatch(/NaN/);
  return html;
};

describe('WeightCard', () => {
  const win = rangeWindow('30D', TODAY);

  it('draws the smoothed band and explains the hollow dots in words', () => {
    const recs = demo(40);
    const ctx = ctxOf(recs);
    const series = weightSeries(recs, win, smoothKalman(computeKalmanTrend(recs, TODAY, { cycle: { enabled: false } })), 'lb');
    const html = clean(
      renderToStaticMarkup(
        <WeightCard weight={ctx.weight} series={series} win={win} units="lb" targets={DEFAULT_TARGETS} onLogWeight={noop} onOpenCoach={noop} />,
      ),
    );
    expect(html).toMatch(/Hollow dots are readings the outlier check set aside/);
    expect(html).toMatch(/90%/);
    // The hidden data table twin carries the accepted/set-aside state as text.
    expect(html).toMatch(/<th scope="col">Used<\/th>/);
  });

  it('names the set-aside weigh-ins rather than silently dropping them', () => {
    const typo = demo(40).map((r) => (r.d === addDays(TODAY, -10) ? { ...r, w: 250 } : r));
    const ctx = ctxOf(typo);
    const series = weightSeries(typo, win, smoothKalman(computeKalmanTrend(typo, TODAY, { cycle: { enabled: false } })), 'lb');
    const html = clean(
      renderToStaticMarkup(
        <WeightCard weight={ctx.weight} series={series} win={win} units="lb" targets={DEFAULT_TARGETS} onLogWeight={noop} onOpenCoach={noop} />,
      ),
    );
    expect(html).toMatch(/1 weigh-in set aside/);
    expect(html).toMatch(/Nothing is deleted/);
  });
});

describe('ExpenditureCard', () => {
  const win = rangeWindow('30D', TODAY);
  const cardFor = (recs: DailyRecord[]) => {
    const ctx = ctxOf(recs);
    const t = tdeeSeries(recs, win, {
      profile: DEFAULT_PROFILE,
      targets: DEFAULT_TARGETS,
      kalman: computeKalmanTrend(recs, TODAY, { cycle: { enabled: false } }),
      alpha: DEFAULT_TARGETS.ewmaAlpha,
    });
    return { ctx, t, html: clean(renderToStaticMarkup(<ExpenditureCard ctx={ctx} tdee={t} win={win} targets={DEFAULT_TARGETS} onLogWeight={noop} onOpenCoach={noop} />)) };
  };

  it('shows the interval, the coverage and the energy-density factor', () => {
    const { ctx, t, html } = cardFor(demo(40));
    expect(html).toMatch(/7 of 7 days logged/);
    expect(html).toMatch(/90%/);
    expect(html).toMatch(/kcal per lb/);
    expect(html).toMatch(/rather than the folk 3,500 kcal per lb/);
    // The number on the card is the number the coach and Today quote.
    expect(html).toContain(fmt(ctx.expenditure.tdee));
    expect(t.result.tdee).toBe(ctx.expenditure.tdee);
  });

  it('says where the number came from before any block has closed', () => {
    const { html } = cardFor(demo(3));
    expect(html).toMatch(/Expenditure not measured yet/);
    expect(html).toMatch(/Mifflin/);
  });
});

describe('LoadCard', () => {
  const win = rangeWindow('30D', TODAY);
  const days = Array.from({ length: 30 }, (_, i) => addDays(TODAY, -(29 - i)));
  const workouts = days.filter((_, i) => i % 2 === 0).map(squat);

  it('leads on absolute load and week-on-week, with the ratio below and captioned', () => {
    const recs = demo(60);
    const ctx = ctxOf(recs, workouts);
    const series = loadSeries(
      days.map((d, i) => ({ d, load: i % 2 === 0 ? 420 : 0, source: i % 2 === 0 ? ('logged' as const) : ('none' as const), workouts: i % 2 === 0 ? 1 : 0 })),
      days.map((d, i) => ({ d, acute: 210, chronic: 200, acwr: i >= 27 ? 1.05 : null, band: i >= 27 ? ('sweet' as const) : null })),
      win,
    );
    const html = clean(renderToStaticMarkup(<LoadCard load={ctx.training?.load} series={series} win={win} />));
    // Impellizzeri 2020: the ratio is descriptive, so it must not be the headline.
    const acute = html.indexOf('Acute load');
    const wow = html.indexOf('Week on week');
    const ratio = html.indexOf('Acute:chronic ratio');
    expect(acute).toBeGreaterThan(-1);
    expect(wow).toBeGreaterThan(-1);
    expect(ratio).toBeGreaterThan(Math.max(acute, wow));
    expect(html).toMatch(/no causal identification/);
    expect(html).toMatch(/soft/);
  });

  it('offers a way in rather than an empty chart when nothing is logged', () => {
    const series = loadSeries([], [], win);
    const html = clean(renderToStaticMarkup(<LoadCard load={undefined} series={series} win={win} onOpenTrain={noop} />));
    expect(html).toMatch(/No training logged yet/);
    expect(html).toMatch(/Open Train/);
  });
});

describe('VolumeCard', () => {
  it('reuses the Train grid and keeps the advisory note with it', () => {
    const weeks = volumeWeeks([squat('2026-09-01'), squat('2026-08-26')], TODAY, DEFAULT_LANDMARKS);
    const ctx = ctxOf(demo(40), [squat('2026-09-01')]);
    const html = clean(renderToStaticMarkup(<VolumeCard weeklySets={ctx.training?.weeklySets} weeks={weeks} />));
    expect(html).toMatch(/still in progress/);
    expect(html).toMatch(/advisory bands, not caps/);
    expect(html).toMatch(/hard sets/);
  });

  it('is an empty state, not a grid of zeroes, before the first session', () => {
    const html = clean(renderToStaticMarkup(<VolumeCard weeks={volumeWeeks([], TODAY, DEFAULT_LANDMARKS)} onOpenTrain={noop} />));
    expect(html).toMatch(/No sets logged yet/);
  });
});
