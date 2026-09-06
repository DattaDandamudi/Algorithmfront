/**
 * WeightTrendCard — the three v3 rate states (plan 2b).
 *
 * The rate is a Kalman slope, so it is published as an interval, withheld
 * while it is too uncertain, and today's weigh-in can be flagged as a likely
 * typo. All three read off `ctx.weight`; the card computes none of them.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CoachContext } from '../../data/types';
import WeightTrendCard, { RATE_UNAVAILABLE_FALLBACK, SUSPECT_HEADLINE } from './WeightTrendCard';
import type { WeightSeries } from './useTodayModel';

// TimeSeriesChart measures its container with useLayoutEffect; React warns
// about that under the server renderer. Filter just that line.
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

type Weight = CoachContext['weight'];

const weight = (patch: Partial<Weight> = {}): Weight => ({
  latest: 171.8,
  trend: 172.1,
  weeklyRateLb: -0.8,
  weeklyRatePct: -0.47,
  targetLbPerWk: [0.86, 1.72],
  inBand: 'below',
  weighInsThisWeek: 6,
  kalmanLevel: 172.05,
  levelSd: 0.31,
  rateSdLb: 0.24,
  rateLow90: -1.19,
  rateHigh90: -0.41,
  rateAvailable: true,
  suspectToday: false,
  ...patch,
});

/** 30 days of daily weigh-ins with a trend line over them. */
const series = (): WeightSeries => {
  const dots = Array.from({ length: 30 }, (_, i) => ({ d: `2026-08-${String(i + 1).padStart(2, '0')}` as const, value: 173 - i * 0.05 }));
  return { dots, line: dots.map((p) => ({ d: p.d, value: p.value })), weighIns: dots.length };
};

const render = (w: Weight, rateReason?: string | null) =>
  renderToStaticMarkup(
    <WeightTrendCard weight={w} series={series()} units="lb" rateReason={rateReason} onLogWeight={() => {}} onOpenCoach={() => {}} />,
  );

const text = (html: string) => html.replace(/<[^>]*>/g, '').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');

describe('WeightTrendCard — the rate interval', () => {
  it('writes the Kalman 90% range as a sentence, not a ± symbol', () => {
    const t = text(render(weight()));
    expect(t).toContain('90% chance your true rate is between −1.19 and −0.41 lb/wk');
    expect(t).toContain('−0.8 lb/wk');
    expect(t).toContain('slower than target');
  });

  it('converts the interval to the display unit', () => {
    const html = renderToStaticMarkup(
      <WeightTrendCard weight={weight()} series={series()} units="kg" onLogWeight={() => {}} onOpenCoach={() => {}} />,
    );
    expect(text(html)).toContain('between −0.54 and −0.19 kg/wk');
  });

  it('says nothing about an interval the engine did not send', () => {
    const t = text(render(weight({ rateLow90: null, rateHigh90: null })));
    expect(t).not.toContain('90% chance');
    expect(t).not.toContain('Rate unavailable');
  });
});

describe('WeightTrendCard — rate unavailable', () => {
  const pending = weight({ weeklyRateLb: null, weeklyRatePct: null, inBand: null, rateAvailable: false, rateSdLb: null, rateLow90: null, rateHigh90: null });

  it('quotes the engine sentence with the number of weigh-ins still needed', () => {
    const t = text(render(pending, 'Rate unavailable — about 3 more weigh-ins'));
    expect(t).toContain('Rate unavailable — about 3 more weigh-ins');
    expect(t).toContain('not published yet');
    // No interval and no rate number while the slope is withheld.
    expect(t).not.toContain('90% chance');
    expect(t).toContain('—');
  });

  it('falls back to plain copy when the engine could not put a number on it', () => {
    expect(text(render(pending, null))).toContain(RATE_UNAVAILABLE_FALLBACK);
  });
});

describe('WeightTrendCard — suspect weigh-in', () => {
  it('asks whether today’s number is a typo, quoting it, and offers one tap back to Log', () => {
    const html = render(weight({ suspectToday: true, latest: 181.4 }));
    const t = text(html);
    expect(t).toContain(SUSPECT_HEADLINE);
    expect(t).toContain("Today's 181.4 lb is far enough from your trend that it barely moved it.");
    expect(t).toContain('Check the weigh-in');
    // A status, and never a colour on its own — the headline carries the words.
    expect(html).toContain('role="status"');
  });

  it('flags it even before there is enough history to draw the chart', () => {
    const html = renderToStaticMarkup(
      <WeightTrendCard
        weight={weight({ suspectToday: true })}
        series={{ dots: [], line: [], weighIns: 1 }}
        units="lb"
        onLogWeight={() => {}}
        onOpenCoach={() => {}}
      />,
    );
    expect(text(html)).toContain('Not enough weigh-ins');
    expect(text(html)).toContain(SUSPECT_HEADLINE);
  });

  it('stays quiet when the gate accepted today', () => {
    expect(text(render(weight()))).not.toContain(SUSPECT_HEADLINE);
  });
});
