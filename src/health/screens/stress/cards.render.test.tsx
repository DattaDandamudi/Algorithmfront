import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { EnergyContext, ImpactContext, StressContext } from '../../data/types';
import EnergyCard from './EnergyCard';
import ImpactCard from './ImpactCard';
import ResilienceCard from './ResilienceCard';
import SignalDots from './SignalDots';
import StressCard from './StressCard';
import StressStrip from './StressStrip';
import { IMPACT_HEURISTIC_NOTE } from '../../engine/impact';
import { ENERGY_CAPTION, IMPACT_CAVEAT } from './format';

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

/** A context with every field null — the shape the engine hands over on day one. */
const blankStress = (): StressContext => ({
  osi: null,
  osiLo: null,
  osiHi: null,
  signalsDeviating: 0,
  signalsAvailable: 0,
  band: null,
  outliers: [],
  checkIn: { sleepQ: null, fatigue: null, stress: null, soreness: null, total: null, band: 'neutral', nDays: 0, worseRun: 0, missingToday: true },
  resilience: { score: null, band: null, loadEwma: null, recoveryEwma: null, balance: null, nDays: 0, alStyleCount: null },
  illness: { flag: false, since: null, reasons: [] },
  calibrating: true,
  nRef: 0,
});

const fullStress = (): StressContext => ({
  ...blankStress(),
  osi: 61,
  osiLo: 48,
  osiHi: 74,
  signalsDeviating: 2,
  signalsAvailable: 5,
  band: 'minor',
  // `z` is the engine's: STRAIN axis, positive = more strain. HRV falls under
  // strain, so a 41 ms night (below this user's normal) ships as z +2.2 — the
  // opposite sign to the reading, which is exactly what the row has to undo.
  outliers: [
    { key: 'hrv', label: 'HRV', value: 41, z: 2.2, threshold: 1.5, deviating: true },
    { key: 'rhr', label: 'Resting HR', value: 58, z: 1.9, threshold: 1.5, deviating: true },
  ],
  checkIn: { sleepQ: 4, fatigue: 5, stress: 3, soreness: 4, total: 16, band: 'yellow', nDays: 21, worseRun: 3, missingToday: false },
  resilience: { score: 62, band: 'adequate', loadEwma: 55.2, recoveryEwma: 47.1, balance: 8.1, nDays: 14, alStyleCount: 4 },
  calibrating: false,
  nRef: 28,
});

describe('StressStrip', () => {
  it('prompts into Log when there is no context at all', () => {
    const html = renderToStaticMarkup(<StressStrip onCheckIn={noop} />);
    expect(html).toContain('How did you sleep and how do you feel?');
    expect(html).toContain('Check in');
    expect(html).not.toContain('outside your range');
  });

  it('prompts when today’s check-in is missing, even with overnight data', () => {
    const stress = { ...fullStress(), checkIn: { ...fullStress().checkIn, missingToday: true } };
    expect(renderToStaticMarkup(<StressStrip stress={stress} onCheckIn={noop} />)).toContain('How did you sleep and how do you feel?');
  });

  it('switches to the band word and the signal count once the check-in is done', () => {
    const html = renderToStaticMarkup(<StressStrip stress={fullStress()} onCheckIn={noop} />);
    expect(html).toContain('Feeling off');
    expect(html).toContain('2 of 5 overnight signals outside your range');
    expect(html).toContain('Some overnight strain');
    expect(html).toContain('16 of 28');
    expect(html).toContain('3 days in a row worse than your usual');
  });

  it('carries the calibrating line while the reference window is short', () => {
    const stress = { ...blankStress(), nRef: 6, checkIn: { ...blankStress().checkIn, missingToday: false, band: 'neutral' as const } };
    expect(renderToStaticMarkup(<StressStrip stress={stress} onCheckIn={noop} />)).toContain('Still learning your normal (6 of 14 nights).');
  });

  it('shows the illness note with its reasons and never a diagnosis', () => {
    const stress: StressContext = { ...fullStress(), illness: { flag: true, since: '2026-09-02', reasons: ['Skin temperature up 0.6 °C', 'Respiratory rate up 2.1 rpm'] } };
    const html = renderToStaticMarkup(<StressStrip stress={stress} onCheckIn={noop} />);
    expect(html).toContain('Skin temperature up 0.6');
    expect(html).toContain('This is not a diagnosis');
    expect(html).toContain('check with your doctor');
  });
});

describe('SignalDots', () => {
  it('says so plainly when there is nothing to list', () => {
    expect(renderToStaticMarkup(<SignalDots signals={[]} />)).toContain('No overnight signals yet');
  });

  it('gives every dot a word, a distance from normal and a one-sided threshold', () => {
    const html = renderToStaticMarkup(<SignalDots signals={fullStress().outliers} />);
    expect(html).toContain('Outside your range');
    // HRV fell (41 ms), resting HR rose (58 bpm) — each described as the
    // READING moved, not as the strain axis moved.
    expect(html).toContain('2.2 SD below your normal');
    expect(html).toContain('1.9 SD above your normal');
    expect(html).toContain('flags from 1.5 SD below');
    expect(html).toContain('flags from 1.5 SD above');
    expect(html).not.toContain('±');
    expect(html).toContain('41 ms');
  });
});

describe('StressCard', () => {
  it('renders the empty state with no series and no context', () => {
    const html = renderToStaticMarkup(<StressCard osi={[]} range="30D" />);
    expect(html).toContain('No overnight signals yet');
  });

  it('leads with the signal count, draws the interval band and overlays the check-in', () => {
    const osi = ['2026-09-01', '2026-09-02', '2026-09-03'].map((d, i) => ({ d, value: 50 + i * 5 }));
    const band = osi.map((p) => ({ d: p.d, lo: (p.value as number) - 10, hi: (p.value as number) + 10 }));
    const checkIn = osi.map((p, i) => ({ d: p.d, value: 12 + i }));
    const html = renderToStaticMarkup(<StressCard stress={fullStress()} osi={osi} osiBand={band} checkIn={checkIn} range="30D" />);
    expect(html).toContain('2 of 5');
    expect(html).toContain('credible interval 48–74');
    expect(html).toContain('Hooper 28-point total, lower is better');
    expect(html).toContain('Credible interval');
    expect(html).toContain('Outside your range');
    expect(html).toContain('2.2 SD below your normal');
  });
});

describe('ResilienceCard', () => {
  it('is an empty state without curves', () => {
    expect(renderToStaticMarkup(<ResilienceCard />)).toContain('Not enough days yet');
  });

  it('shows the band word, both EWMAs and the heuristic label on the strain counter', () => {
    const load = ['2026-09-01', '2026-09-02'].map((d, i) => ({ d, value: 50 + i * 6 }));
    const recovery = ['2026-09-01', '2026-09-02'].map((d, i) => ({ d, value: 48 - i * 2 }));
    const html = renderToStaticMarkup(<ResilienceCard resilience={fullStress().resilience} load={load} recovery={recovery} />);
    expect(html).toContain('Adequate');
    expect(html).toContain('Balance gap');
    expect(html).toContain('Load is running 8.1 above recovery.');
    expect(html).toContain('not a validated measure');
  });
});

describe('EnergyCard — a prediction, never a battery', () => {
  const energy = (patch: Partial<EnergyContext> = {}): EnergyContext => ({
    now: 74,
    atWake: 88,
    forecast: [
      { hhmm: '07:00', value: 88, lo: 80, hi: 95 },
      { hhmm: '11:00', value: 79, lo: 70, hi: 88 },
      { hhmm: '15:00', value: 46, lo: 36, hi: 57 },
      { hhmm: '19:00', value: 61, lo: 50, hi: 72 },
      { hhmm: '22:00', value: 34, lo: 22, hi: 47 },
    ],
    trough: { hhmm: '15:00', value: 46 },
    bedtimeReadyAt: '22:30',
    caffeineActiveMg: 42,
    drivers: ['16 h awake', 'caffeine at 08:10'],
    confidence: 'medium',
    ...patch,
  });

  it('asks for sleep times instead of drawing a made-up curve', () => {
    const html = renderToStaticMarkup(<EnergyCard />);
    expect(html).toContain('No forecast yet');
    expect(html.toLowerCase()).not.toContain('battery');
  });

  it('draws a line with a confidence band, a now marker, the dip time and a hidden table', () => {
    const html = renderToStaticMarkup(<EnergyCard energy={energy()} nowHHMM="13:00" />);
    expect(html).toContain('<path');
    expect(html).toContain('fill-opacity="0.12"');
    expect(html).toContain('>Now<');
    expect(html).toContain('Dip 3:00 pm');
    expect(html).toContain('Afternoon dip around 3:00 pm (46 out of 100)');
    expect(html).toContain('Predicted energy out of 100');
    expect(html).toContain('Confidence range');
    expect(html).toContain('42 mg of caffeine');
    expect(html.toLowerCase()).not.toContain('battery');
  });

  it('captions the curve as a two-process prediction, not a measurement', () => {
    const html = renderToStaticMarkup(<EnergyCard energy={energy()} nowHHMM="13:00" />);
    expect(html).toContain('two-process sleep model');
    expect(html).toContain('not a measurement');
    expect(ENERGY_CAPTION).toContain('not a measurement');
  });

  it('drops the now marker when the clock is outside the forecast window', () => {
    const html = renderToStaticMarkup(<EnergyCard energy={energy()} nowHHMM="04:00" />);
    expect(html).not.toContain('>Now<');
    expect(html).toContain('<path');
  });
});

describe('ImpactCard', () => {
  const impact = (patch: Partial<ImpactContext> = {}): ImpactContext => ({
    effects: [
      {
        behaviour: 'alcohol',
        metric: 'sleep_efficiency',
        label: 'Alcohol → sleep efficiency',
        deltaMean: -4.2,
        lo95: -7.1,
        hi95: -1.3,
        nYes: 11,
        nNo: 46,
        shrunkToPrior: 0.35,
        qValue: 0.03,
        confound: 'those days also had later bedtimes',
      },
      {
        behaviour: 'late caffeine',
        metric: 'hrv',
        label: 'Late caffeine → HRV',
        deltaMean: 1.2,
        lo95: -3,
        hi95: 5.4,
        nYes: 8,
        nNo: 60,
        shrunkToPrior: 0,
        qValue: 0.4,
      },
    ],
    pending: ['long walks'],
    ...patch,
  });

  it('names what is still being counted when nothing is reportable', () => {
    const html = renderToStaticMarkup(<ImpactCard impact={{ effects: [], pending: ['alcohol'] }} />);
    expect(html).toContain('Not enough days yet');
    expect(html).toContain('Still counting days for: alcohol');
    expect(html).toContain('5 days with it and 5 without');
  });

  it('renders with no context at all', () => {
    expect(renderToStaticMarkup(<ImpactCard />)).toContain('Not enough days yet');
  });

  it('puts the caveat on the card, with intervals, counts and the confound', () => {
    const html = renderToStaticMarkup(<ImpactCard impact={impact()} />);
    expect(html).toContain('Association, not cause.');
    expect(html).toContain('95% CI −7.1 to −1.3');
    expect(html).toContain('11 days with · 46 without');
    expect(html).toContain('35% of this estimate comes from published averages');
    expect(html).toContain('those days also had later bedtimes');
    expect(IMPACT_CAVEAT).toContain('Association, not cause.');
  });

  it('says in words when an interval includes zero', () => {
    const html = renderToStaticMarkup(<ImpactCard impact={impact()} />);
    expect(html).toContain('the interval includes zero');
    expect(html).toContain('No clear signal');
  });

  // The measured null user: q 0.0424 on a +12 ms raw difference, reported as
  // −0.4 ms with an interval straddling zero. The badge used to be green.
  it('does not put a green "Consistent signal" on an interval that includes zero', () => {
    const html = renderToStaticMarkup(
      <ImpactCard
        impact={{
          effects: [
            {
              behaviour: 'alcohol',
              metric: 'hrv',
              label: 'on the 13 days you drank, next-day HRV averaged 0.4 ms lower (95% CI 7.3 lower to 6.6 higher)',
              deltaMean: -0.37,
              lo95: -7.31,
              hi95: 6.56,
              nYes: 13,
              nNo: 76,
              shrunkToPrior: 0.66,
              qValue: 0.0424,
            },
          ],
          pending: [],
        }}
      />,
    );
    expect(html).not.toContain('Consistent signal');
    expect(html).toContain('Mixed evidence');
    expect(html).toContain('the interval includes zero');
    expect(html).toContain('your own days went the other way (higher on those days)');
  });

  it('labels the relative thresholds as heuristics, but only when one is on screen', () => {
    const heuristic = renderToStaticMarkup(
      <ImpactCard
        impact={{
          effects: [{ ...impact().effects[0], behaviour: 'shortSleep', metric: 'readiness' }],
          pending: [],
        }}
      />,
    );
    // The renderer escapes the quoted behaviour names, so match the clause.
    const clause = 'heuristics with no published cut-off behind them';
    expect(IMPACT_HEURISTIC_NOTE).toContain(clause);
    expect(heuristic).toContain(clause);
    expect(heuristic).toContain('at least 30 minutes off your own median');
    expect(renderToStaticMarkup(<ImpactCard impact={impact()} />)).not.toContain(clause);
  });
});
