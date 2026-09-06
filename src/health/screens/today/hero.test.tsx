import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Readiness, ReadinessContributor } from '../../data/types';
import ReadinessHero, {
  CALIBRATING_NOTE,
  CALIBRATING_WORD,
  FORCED_REASON,
  MODIFIERS_TITLE,
  SHORT_VERDICT,
  WHOOP_ONLY_NOTE,
  WHY_SUMMARY,
  contributorFacts,
  contributorValueText,
  contributorZText,
} from './ReadinessHero';

const render = (r: Readiness) => renderToStaticMarkup(<ReadinessHero readiness={r} onAskCoach={() => {}} />);

/** Markup with the tags stripped — what a reader actually sees. */
const text = (html: string) => html.replace(/<[^>]*>/g, '').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');

const base: Readiness = { score: 72, band: 'green', source: 'whoop', verdict: 'Primed — progress loads today', training: 'Progress', detail: 'WHOOP recovery 72%.' };

/** The persona's typical morning: five own inputs, four of them with a reading. */
const contributors: ReadinessContributor[] = [
  { key: 'hrv', label: 'HRV (7-day vs baseline)', value: 54, z: 0.42, weight: 0.4, points: 3.6, effect: 'up' },
  { key: 'rhr', label: 'Resting HR', value: 52, z: -0.6, weight: -0.22, points: 2.8, effect: 'up' },
  { key: 'sleep', label: 'Sleep vs need (3 nights)', value: 7.4, z: -0.35, weight: 0.18, points: -1.3, effect: 'down' },
  { key: 'load', label: "Yesterday's training load", value: 496, z: 0.9, weight: -0.1, points: -1.9, effect: 'down' },
  { key: 'subj', label: 'Check-in (Hooper)', value: null, z: null, weight: 0.1, points: 0, effect: 'flat' },
];

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

describe('ReadinessHero — "Why this score" (plan 2b)', () => {
  const withWhy: Readiness = {
    ...base,
    contributors,
    confidence: { lo: 66, hi: 78, nInputs: 4 },
  };

  it('is a native disclosure, collapsed by default, that needs no JavaScript', () => {
    const html = render(withWhy);
    expect(html).toContain('<details');
    expect(html).not.toContain('<details open');
    expect(html).toContain(WHY_SUMMARY);
  });

  it('lists every contributor with its value, its distance from normal and the points it moved', () => {
    const t = text(render(withWhy));
    expect(t).toContain('HRV (7-day vs baseline)');
    expect(t).toContain('54 ms · 0.4 SD above your normal · raised the score');
    expect(t).toContain('+3.6 pts');
    expect(t).toContain('52 bpm · 0.6 SD below your normal · raised the score');
    expect(t).toContain('7.4 h · 0.4 SD below your normal · lowered the score');
    expect(t).toContain('−1.3 pts');
    expect(t).toContain('496 load · 0.9 SD above your normal · lowered the score');
    // A missing input is listed as missing, never as a zero reading.
    expect(t).toContain('no reading yet, so it counts as unknown · no effect');
  });

  it('does not claim an imported score is missing just because it has no z', () => {
    const whoop: ReadinessContributor = { key: 'whoop', label: 'WHOOP recovery', value: 63, z: null, weight: 1, points: 8.6, effect: 'up' };
    expect(contributorFacts(whoop, 'raised the score')).toBe('63% · raised the score');
    expect(contributorFacts(contributors[4], 'no effect')).toBe('no reading yet, so it counts as unknown · no effect');
  });

  it('names the confidence band and how many inputs it came from', () => {
    const t = text(render(withWhy));
    expect(t).toContain('Confidence 66–78');
    expect(t).toContain('built from 4 of 5 inputs');
  });

  it('spells the WHOOP blend out when the score is part imported', () => {
    const t = text(render({ ...withWhy, blendWeight: 0.6 }));
    expect(t).toContain('60% WHOOP recovery, 40% your own signals');
    expect(text(render(withWhy))).not.toContain('WHOOP recovery,');
  });

  it('explains a fully-imported score, where every own input scores zero', () => {
    const t = text(render({ ...withWhy, blendWeight: 1 }));
    expect(t).toContain(WHOOP_ONLY_NOTE);
    expect(t).not.toContain('0% your own signals');
  });

  it('has nothing to disclose when the engine sent no contributors', () => {
    expect(render(base)).not.toContain('<details');
  });

  it('formats values in their own unit and z-scores in words', () => {
    expect(contributorValueText(contributors[0])).toBe('54 ms');
    expect(contributorValueText({ ...contributors[0], key: 'subj', value: 12 })).toBe('12 of 28');
    expect(contributorValueText({ ...contributors[0], key: 'whoop', value: 71 })).toBe('71%');
    expect(contributorZText(0)).toBe('right on your normal');
    expect(contributorZText(-1.25)).toBe('1.3 SD below your normal');
    expect(contributorZText(null)).toBe('not compared with your normal');
  });
});

describe('ReadinessHero — modifiers (plan 2b)', () => {
  it('says what changed the verdict, in words, with the engine reason under it', () => {
    const t = text(
      render({
        ...base,
        band: 'yellow',
        verdict: 'Steady — train, hold loads',
        training: 'Train, hold loads',
        modifiers: [
          { key: 'stressMajor', label: 'Overnight strain: major', effect: 'downgrade', reason: 'Overnight physiology is well outside your normal range.' },
          { key: 'hrvBigDrop', label: 'Sharp single-day HRV drop', effect: 'note', reason: 'Today sits well below your reference.' },
        ],
      }),
    );
    expect(t).toContain(MODIFIERS_TITLE);
    expect(t).toContain('Lowered the verdict · Overnight strain: major');
    expect(t).toContain('Overnight physiology is well outside your normal range.');
    expect(t).toContain('Worth knowing · Sharp single-day HRV drop');
  });

  it('does not repeat the forcing rule that already has its own block', () => {
    const html = render({
      ...base,
      band: 'red',
      forced: true,
      detail: '7-day HRV average 49 ms is below your normal range and forces a light day.',
      modifiers: [{ key: 'hrvForcing', label: 'HRV forcing rule', effect: 'downgrade', reason: 'Your 7-day HRV average is well below your normal range.' }],
    });
    expect(html).toContain(FORCED_REASON);
    expect(html).not.toContain(MODIFIERS_TITLE);
    expect(html).not.toContain('HRV forcing rule');
  });

  it('shows nothing when nothing moved the verdict', () => {
    expect(render(base)).not.toContain(MODIFIERS_TITLE);
  });
});

describe('ReadinessHero — calibrating (plan 2b)', () => {
  const calibrating: Readiness = {
    ...base,
    score: 62,
    verdict: 'Primed — progress loads today (still calibrating)',
    calibrating: true,
    contributors,
    confidence: { lo: 48, hi: 76, nInputs: 3 },
  };

  it('shows the word, not the number, and no coloured arc behind it', () => {
    const html = render(calibrating);
    expect(html).toContain(CALIBRATING_WORD);
    expect(html).not.toContain('>62<');
    expect(html).not.toContain('stroke="var(--hx-green)"');
    expect(html).toContain('Readiness: no data yet');
  });

  it('explains why there is no number and still lists the inputs behind it', () => {
    const t = text(render(calibrating));
    expect(t).toContain(CALIBRATING_NOTE);
    expect(t).toContain(WHY_SUMMARY);
    expect(t).toContain('HRV (7-day vs baseline)');
    // The range is labelled provisional, never sold as a settled confidence band.
    expect(t).toContain('Provisional 48–76');
    expect(t).not.toContain('Confidence 48–76');
  });

  it('keeps the engine verdict and the training chip, which do not need the number', () => {
    const t = text(render(calibrating));
    expect(t).toContain('Primed — progress loads today (still calibrating)');
    expect(t).toContain(SHORT_VERDICT.green);
    expect(t).not.toContain(SHORT_VERDICT.neutral);
    expect(t).toContain('Progress');
  });
});
