import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Readiness } from '../../data/types';
import ReadinessHero, { FORCED_REASON, SHORT_VERDICT } from './ReadinessHero';

const render = (r: Readiness) => renderToStaticMarkup(<ReadinessHero readiness={r} onAskCoach={() => {}} />);

const base: Readiness = { score: 72, band: 'green', source: 'whoop', verdict: 'Primed — progress loads today', training: 'Progress', detail: 'WHOOP recovery 72%.' };

describe('ReadinessHero (R1-1 / R1-7 / R6-11)', () => {
  it('paints the ring and number from the score band and puts the short verdict in the centre', () => {
    const html = render(base);
    expect(html).toContain('stroke="var(--hx-green)"');
    expect(html).toContain('>72<');
    expect(html).toContain(`>${SHORT_VERDICT.green}<`);
    expect(html).toContain('Primed — progress loads today');
    expect(html).not.toContain(FORCED_REASON);
  });

  it('keeps a forced downgrade off the ring: green arc for 72, red verdict/chip, and the reason line', () => {
    const forced: Readiness = { ...base, band: 'red', verdict: 'Run down — keep today light', training: 'Light day', forced: true, detail: '7-day HRV average 49 ms is below your normal range and forces a light day.' };
    const html = render(forced);
    expect(html).toContain('stroke="var(--hx-green)"');
    expect(html).not.toContain('stroke="var(--hx-red)"');
    expect(html).toMatch(/text-hx-red[^>]*>Run down</);
    expect(html).toMatch(/text-hx-red[^>]*>Run down — keep today light</);
    expect(html).toContain(FORCED_REASON);
    expect(html).toContain('below your normal range and forces a light day');
    expect(html).toMatch(/<button[^>]*bg-hx-red\/15[^>]*>/);
  });

  it('renders the training chip as an action, never as a toggle', () => {
    expect(render(base)).not.toContain('aria-pressed');
    expect(render(base)).toContain('Ask the coach &quot;Should I train today?&quot;');
  });

  it('shows the neutral state with no score', () => {
    const html = render({ score: null, band: 'neutral', source: 'none', verdict: 'No recovery signal yet', training: '—', detail: '' });
    expect(html).toContain('>—<');
    expect(html).toContain(`>${SHORT_VERDICT.neutral}<`);
    expect(html).toContain('No verdict yet');
  });
});
