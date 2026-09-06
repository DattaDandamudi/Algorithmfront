import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { BaselineDelta, CoachContext } from '../../data/types';
import { fullContext } from '../../ai/coachContext.fixture';
import { emptyStates, suggestedPrompts } from '../../engine';
import MetricTiles from './MetricTiles';
import type { NutritionBaseline } from './useTodayModel';

const bd = (patch: Partial<BaselineDelta> = {}): BaselineDelta => ({ today: null, baseline: null, delta: null, pct: null, n: 0, good: null, ...patch });

const baseline = (dayComplete: boolean): NutritionBaseline => ({
  protein: bd({ today: 98, baseline: 176, delta: -78, n: 30 }),
  kcal: bd({ today: 1130, baseline: 1930, delta: -800, n: 30 }),
  dayComplete,
});

function render(ctx: CoachContext, dayComplete: boolean): string {
  return renderToStaticMarkup(
    <MetricTiles
      ctx={ctx}
      prompts={suggestedPrompts(ctx)}
      empty={emptyStates(ctx)}
      hrv7={[50, 51, 52, 53, 54, 55, 54]}
      smoothedTdee={null}
      bodyWeightLb={172}
      baseline={baseline(dayComplete)}
      onOpenCoach={() => {}}
    />,
  );
}

/** Markup of one tile: from its label to the next tile's label. */
function tile(html: string, label: string): string {
  const start = html.indexOf(`>${label}</span>`);
  expect(start).toBeGreaterThan(-1);
  const next = html.indexOf('hx-label', start + 1);
  return next === -1 ? html.slice(start) : html.slice(start, next);
}

/** 09:30 on the demo data (R7-4): 4,412 steps so far vs a 30-day mean of 8,048 full days. */
function morningSteps(): CoachContext {
  const ctx = fullContext();
  ctx.steps = { ...bd({ today: 4412, baseline: 8047.67, delta: -3635.67, pct: -45.2, n: 30, good: false }), goalMin: 8000, goalMax: 10000 };
  return ctx;
}

describe('MetricTiles — Steps (R7-4: no red ▼ against full days during the day)', () => {
  it('before DAY_COMPLETE_HOUR captions the 30-day mean instead of a delta', () => {
    const steps = tile(render(morningSteps(), false), 'Steps');
    expect(steps).toContain('30-day avg 8,048/day');
    expect(steps).not.toContain('▼');
    expect(steps).not.toContain('3,636');
    expect(steps).not.toContain('vs 30-day avg');
    expect(steps).not.toContain('text-hx-red');
  });

  it('once the day is complete shows the ▲/▼ delta vs the 30-day average', () => {
    const steps = tile(render(morningSteps(), true), 'Steps');
    expect(steps).toContain('▼');
    expect(steps).toContain('3,636');
    expect(steps).toContain('vs 30-day avg');
    expect(steps).not.toContain('30-day avg 8,048/day');
  });
});

describe('MetricTiles — Steps goal caption (R7-11: exact targets)', () => {
  it('uses whole thousands only when both targets are whole thousands', () => {
    expect(tile(render(morningSteps(), false), 'Steps')).toContain('Goal 8–10k');
    const ctx = morningSteps();
    ctx.steps = { ...ctx.steps, goalMin: 7500 };
    expect(tile(render(ctx, false), 'Steps')).toContain('Goal 7,500–10,000');
    expect(tile(render(ctx, false), 'Steps')).not.toContain('8–10k');
  });
});

describe('MetricTiles — HRV delta (R7-8: the 28-day reference is the one baseline)', () => {
  it('cites today − baseline28 as "vs 28-day baseline"', () => {
    const ctx = fullContext();
    ctx.hrv = { ...ctx.hrv, today: 57, baseline7: 59.4, baseline28: 59.7, baselineEstablished: true, daysOfData: 30, delta: bd({ today: 57, baseline: 59.47, delta: -2.47, n: 30, good: false }) };
    const hrv = tile(render(ctx, false), 'HRV');
    expect(hrv).toContain('vs 28-day baseline');
    expect(hrv).toMatch(/▼<\/span><span aria-hidden> 3 ms<\/span>/);
    expect(hrv).not.toContain('vs 30-day avg');
    expect(hrv).not.toMatch(/> 2 ms</);
  });

  it('falls back to the explicitly-labelled 30-day average on a context without the reference', () => {
    const ctx = fullContext();
    ctx.hrv = { ...ctx.hrv, today: 57, delta: bd({ today: 57, baseline: 59.47, delta: -2.47, n: 30, good: false }) };
    const hrv = tile(render(ctx, false), 'HRV');
    expect(hrv).toContain('vs 30-day avg');
    expect(hrv).toMatch(/▼<\/span><span aria-hidden> 2 ms<\/span>/);
  });
});
