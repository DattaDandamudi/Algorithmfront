import { describe, expect, it } from 'vitest';
import type { BehaviourEffect, DailyRecord, EnergyPoint, StressSignal } from '../../data/types';
import { isConsistentEffect, rawDifference } from '../../engine/impact';
import { gaussianSeries, mergeRecords } from '../../engine/simFixtures';
import { overnightStrainIndex } from '../../engine/stress';
import { addDays } from '../../lib/dates';
import {
  balanceBand,
  balanceLine,
  calibratingLine,
  checkInWord,
  ciBar,
  ciText,
  daysLine,
  effectValueText,
  energyGeometry,
  formatZ,
  hooperBandWord,
  hooperTotal,
  hooperTotalText,
  orderedCheckInItems,
  resilienceBandWord,
  shrinkageLine,
  signalDirection,
  signalStateText,
  signalThresholdText,
  signalZText,
  strengthCaveat,
  signalTone,
  signalValueText,
  signalsLine,
  strengthWord,
  stressBandWord,
  troughLine,
  unwrapMinutes,
  worseRunLine,
} from './format';

/**
 * `z` is the engine's, i.e. on the STRAIN axis: positive = more strain, so this
 * default is an HRV that FELL 2.1 SD (which is why it is deviating).
 */
const signal = (patch: Partial<StressSignal> = {}): StressSignal => ({
  key: 'hrv',
  label: 'HRV',
  value: 48,
  z: 2.1,
  threshold: 1.5,
  deviating: true,
  ...patch,
});

const effect = (patch: Partial<BehaviourEffect> = {}): BehaviourEffect => ({
  behaviour: 'alcohol',
  metric: 'sleepHrs',
  label: 'Alcohol → sleep',
  deltaMean: -4.2,
  lo95: -7.1,
  hi95: -1.3,
  nYes: 11,
  nNo: 46,
  shrunkToPrior: 0,
  qValue: 0.03,
  ...patch,
});

describe('band → word (never a bare colour)', () => {
  it('gives every stress band a word and a tone, and null a "not enough" word', () => {
    expect(stressBandWord('none')).toEqual({ label: 'Typical night', tone: 'green' });
    expect(stressBandWord('minor').tone).toBe('yellow');
    expect(stressBandWord('major').tone).toBe('red');
    expect(stressBandWord(null)).toEqual({ label: 'Not enough nights yet', tone: 'neutral' });
    expect(stressBandWord(undefined).label).toBe('Not enough nights yet');
  });

  it('maps the Hooper band and the resilience band to words', () => {
    expect(hooperBandWord('green').label).toBe('Feeling good');
    expect(hooperBandWord('neutral').label).toBe('No check-ins yet');
    expect(hooperBandWord(undefined).tone).toBe('neutral');
    expect(resilienceBandWord('limited')).toEqual({ label: 'Limited', tone: 'red' });
    expect(resilienceBandWord('adequate').tone).toBe('yellow');
    expect(resilienceBandWord('exceptional').tone).toBe('green');
    expect(resilienceBandWord(null)).toEqual({ label: 'Still learning', tone: 'neutral' });
  });
});

describe('signalsLine — the count leads, and reads correctly at the edges', () => {
  it('names the count out of the available signals', () => {
    expect(signalsLine(2, 5)).toBe('2 of 5 overnight signals outside your range');
  });

  it('says "all inside" rather than "0 of 5 outside"', () => {
    expect(signalsLine(0, 5)).toBe('All 5 overnight signals inside your range');
  });

  it('never claims signals it does not have', () => {
    expect(signalsLine(0, 0)).toBe('No overnight signals yet');
    expect(signalsLine(3, 0)).toBe('No overnight signals yet');
    expect(signalsLine(9, 5)).toBe('5 of 5 overnight signals outside your range');
  });
});

describe('signal formatting is readable without colour', () => {
  it('signs a z where the axis is already named', () => {
    expect(formatZ(-2.14)).toBe('−2.1');
    expect(formatZ(1.85)).toBe('+1.9');
    expect(formatZ(0)).toBe('0.0');
    expect(formatZ(null)).toBe('—');
  });

  // The engine publishes `z` on the STRAIN axis (positive = more strain), and
  // HRV and blood oxygen FALL under strain, so their z arrives sign-flipped
  // relative to the reading. Everything the user reads is about the reading.
  it('names the direction of the READING, not of the strain axis', () => {
    // A night HRV fell: strain z +4.3 → the reading is BELOW normal.
    expect(signalDirection(signal({ key: 'hrv', value: 40, z: 4.3 }))).toBe('below');
    // A night HRV rose: strain z −2.3 → the reading is ABOVE normal.
    expect(signalDirection(signal({ key: 'hrv', value: 74, z: -2.3, deviating: false }))).toBe('above');
    // Blood oxygen, the other sign = −1 signal, in both directions.
    expect(signalDirection(signal({ key: 'spo', value: 93, z: 5.4 }))).toBe('below');
    expect(signalDirection(signal({ key: 'spo', value: 99, z: -1.7, deviating: false }))).toBe('above');
    // …and a signal that rises with strain is unchanged.
    expect(signalDirection(signal({ key: 'rhr', value: 62, z: 1.9 }))).toBe('above');
    expect(signalDirection(signal({ key: 'rhr', value: 48, z: -1.9, deviating: false }))).toBe('below');
    expect(signalDirection(signal({ key: 'debt', value: 90, z: 2.2 }))).toBe('above');
    expect(signalDirection(signal({ z: 0 }))).toBe('at');
    expect(signalDirection(signal({ z: null }))).toBe('unknown');
  });

  it('says how far the reading sat from normal, in the reading’s own direction', () => {
    expect(signalZText(signal({ key: 'hrv', value: 40, z: 4.3 }))).toBe('4.3 SD below your normal');
    expect(signalZText(signal({ key: 'hrv', value: 74, z: -2.3 }))).toBe('2.3 SD above your normal');
    expect(signalZText(signal({ key: 'spo', value: 93, z: 5.4 }))).toBe('5.4 SD below your normal');
    expect(signalZText(signal({ key: 'rhr', value: 62, z: 1.9 }))).toBe('1.9 SD above your normal');
    expect(signalZText(signal({ z: 0 }))).toBe('at your normal');
    expect(signalZText(signal({ z: null }))).toBe('—');
  });

  // The engine's rule is `zStrain >= threshold`: one-sided. "±1.3" claims an
  // interval that does not exist, and it claimed it hardest on the rows where
  // the direction was already inverted.
  it('describes the flag threshold one-sidedly, in the direction that flags', () => {
    expect(signalThresholdText(signal({ key: 'hrv', threshold: 1.2816 }))).toBe('flags from 1.3 SD below');
    expect(signalThresholdText(signal({ key: 'spo', threshold: 1.2816 }))).toBe('flags from 1.3 SD below');
    expect(signalThresholdText(signal({ key: 'rhr', threshold: 1.2816 }))).toBe('flags from 1.3 SD above');
    expect(signalThresholdText(signal({ key: 'debt', threshold: 1.5 }))).toBe('flags from 1.5 SD above');
    for (const key of ['hrv', 'rhr', 'rr', 'skt', 'spo', 'debt'] as const) {
      expect(signalThresholdText(signal({ key, threshold: 1.2816 }))).not.toContain('±');
    }
    expect(signalThresholdText(signal({ threshold: Number.NaN }))).toBe('');
  });

  it('puts the state in words, not only in the dot', () => {
    expect(signalStateText(signal())).toBe('Outside your range');
    expect(signalStateText(signal({ deviating: false, z: 0.4 }))).toBe('Inside your range');
    expect(signalStateText(signal({ z: null }))).toBe('No reading');
    expect(signalTone(signal())).toBe('yellow');
    expect(signalTone(signal({ deviating: false }))).toBe('green');
    expect(signalTone(signal({ z: null }))).toBe('neutral');
  });

  it('formats the reading with its unit, one decimal for skin temperature', () => {
    expect(signalValueText(signal())).toBe('48 ms');
    expect(signalValueText(signal({ key: 'skt', value: 33.42 }))).toBe('33.4 °C');
    expect(signalValueText(signal({ value: null }))).toBe('—');
  });
});

describe('check-in helpers', () => {
  it('keeps the canonical order whatever settings hand over, and drops unasked items', () => {
    expect(orderedCheckInItems(['qo', 'qs'])).toEqual(['qs', 'qo']);
    expect(orderedCheckInItems([])).toEqual([]);
    expect(orderedCheckInItems(undefined)).toEqual([]);
  });

  it('words every step of every scale', () => {
    expect(checkInWord('qf', 1)).toBe('Very fresh');
    expect(checkInWord('qf', 7)).toBe('Very tired');
    expect(checkInWord('qt', 4)).toBe('Average');
    expect(checkInWord('qo', null)).toBe('');
    expect(checkInWord('qs', 99)).toBe('Very restless');
  });

  it('totals only when every asked item is answered', () => {
    expect(hooperTotal({ qs: 3, qf: 4, qt: 2, qo: 5 })).toBe(14);
    expect(hooperTotal({ qs: 3, qf: 4 })).toBeNull();
    expect(hooperTotal({ qs: 3, qf: 4 }, ['qs', 'qf'])).toBe(7);
    expect(hooperTotal({}, [])).toBeNull();
    expect(hooperTotalText(14)).toBe('14 of 28');
    expect(hooperTotalText(null)).toBe('—');
  });

  it('only warns about a worse run once the three-day rule is met', () => {
    expect(worseRunLine(2)).toBe('');
    expect(worseRunLine(null)).toBe('');
    expect(worseRunLine(3)).toContain('3 days in a row');
    expect(calibratingLine(9)).toBe('Still learning your normal (9 of 14 nights).');
    expect(calibratingLine(null)).toContain('0 of 14');
  });
});

describe('balance band — the gap between the two curves', () => {
  it('shades between load and recovery on days that have both', () => {
    const load = [
      { d: '2026-09-01', value: 60 },
      { d: '2026-09-02', value: 40 },
      { d: '2026-09-03', value: 55 },
    ];
    const recovery = [
      { d: '2026-09-01', value: 50 },
      { d: '2026-09-02', value: 70 },
      { d: '2026-09-03', value: null },
    ];
    expect(balanceBand(load, recovery)).toEqual([
      { d: '2026-09-01', lo: 50, hi: 60 },
      { d: '2026-09-02', lo: 40, hi: 70 },
    ]);
  });

  it('is empty without both curves', () => {
    expect(balanceBand(undefined, [{ d: '2026-09-01', value: 1 }])).toEqual([]);
    expect(balanceBand([{ d: '2026-09-01', value: 1 }], [])).toEqual([]);
  });

  it('says which side is running ahead, in words', () => {
    expect(balanceLine(12.4, 1)).toBe('Load is running 12.4 above recovery.');
    expect(balanceLine(-12.4, 1)).toBe('Recovery is running 12.4 above load.');
    expect(balanceLine(0)).toBe('Load and recovery are in step.');
    expect(balanceLine(null)).toBe('Balance needs both curves.');
  });
});

describe('energy curve geometry', () => {
  const layout = { width: 326, height: 176, padLeft: 30, padRight: 14, padTop: 18, padBottom: 22 };
  const pt = (hhmm: string, value: number, spread = 8): EnergyPoint => ({
    hhmm,
    value,
    lo: value - spread,
    hi: value + spread,
  });

  it('unwraps clock minutes so an overnight forecast keeps increasing', () => {
    expect(unwrapMinutes([{ hhmm: '22:00' }, { hhmm: '23:00' }, { hhmm: '00:30' }, { hhmm: '01:00' }])).toEqual([1320, 1380, 1470, 1500]);
  });

  it('needs two finite points before it draws anything', () => {
    expect(energyGeometry([], layout)).toBeNull();
    expect(energyGeometry([pt('07:00', 80)], layout)).toBeNull();
  });

  it('spans the plot from the first point to the last', () => {
    const geo = energyGeometry([pt('07:00', 80), pt('12:00', 70), pt('22:00', 40)], layout);
    expect(geo).not.toBeNull();
    const g = geo!;
    expect(g.xs[0]).toBeCloseTo(30, 5);
    expect(g.xs[g.xs.length - 1]).toBeCloseTo(326 - 14, 5);
    // Midday sits 5 h into a 15 h window.
    expect(g.xs[1]).toBeCloseTo(30 + (5 / 15) * (326 - 44), 5);
    expect(g.linePath.startsWith('M30 ')).toBe(true);
    expect(g.bandPath.endsWith('Z')).toBe(true);
  });

  it('keeps the y domain inside 0–100 and puts high energy above low energy', () => {
    const g = energyGeometry([pt('07:00', 92), pt('15:00', 38)], layout)!;
    expect(g.domain[0]).toBeGreaterThanOrEqual(0);
    expect(g.domain[1]).toBeLessThanOrEqual(100);
    expect(g.y(90)).toBeLessThan(g.y(40));
    expect(g.yTicks.length).toBe(5);
  });

  it('places a clock time on the axis and refuses one outside the window', () => {
    const g = energyGeometry([pt('07:00', 80), pt('19:00', 55)], layout)!;
    expect(g.xAt('13:00')).toBeCloseTo(30 + 0.5 * (326 - 44), 5);
    expect(g.xAt('07:00')).toBeCloseTo(30, 5);
    expect(g.xAt('21:00')).toBeNull();
    expect(g.xAt('06:00')).toBeNull();
    expect(g.xAt(null)).toBeNull();
  });

  it('labels the axis every three hours inside the window', () => {
    const g = energyGeometry([pt('07:00', 80), pt('16:00', 50)], layout)!;
    expect(g.xTicks.map((t) => t.label)).toEqual(['9:00 am', '12:00 pm', '3:00 pm']);
  });

  it('describes the trough with its clock time, never as a battery level', () => {
    expect(troughLine({ hhmm: '15:00', value: 42 })).toBe('Afternoon dip around 3:00 pm (42 out of 100)');
    expect(troughLine(null)).toBe('');
  });
});

describe('impact CI bars', () => {
  it('centres zero and scales each bar to its own interval', () => {
    const bar = ciBar(-4.2, -7.1, -1.3)!;
    expect(bar.zeroPct).toBe(50);
    expect(bar.crossesZero).toBe(false);
    expect(bar.loPct).toBeLessThan(50);
    expect(bar.hiPct).toBeLessThan(50);
    expect(bar.pointPct).toBeGreaterThan(bar.loPct);
    expect(bar.pointPct).toBeLessThan(bar.hiPct);
    expect(bar.domain[0]).toBeCloseTo(-7.1 * 1.15, 6);
  });

  it('flags an interval that spans zero', () => {
    expect(ciBar(1.2, -3, 5.4)!.crossesZero).toBe(true);
    expect(ciBar(0, 0, 0)!.crossesZero).toBe(true);
  });

  it('never returns geometry for non-finite numbers', () => {
    expect(ciBar(NaN, -1, 1)).toBeNull();
    expect(ciBar(1, Number.POSITIVE_INFINITY, 2)).toBeNull();
  });

  it('spells the numbers out beside the bar', () => {
    expect(effectValueText({ deltaMean: 14.3 }, 'min', 0)).toBe('+14 min');
    expect(effectValueText({ deltaMean: -4.25 }, '%')).toBe('−4.3 %');
    expect(effectValueText({ deltaMean: NaN })).toBe('—');
    expect(ciText(-7.1, -1.3)).toBe('95% CI −7.1 to −1.3');
    expect(ciText(null, 2)).toBe('—');
    expect(daysLine(1, 46)).toBe('1 day with · 46 without');
    expect(daysLine(null, null)).toBe('0 days with · 0 without');
  });

  it('says how much of the estimate is borrowed, and never says "confirmed"', () => {
    expect(shrinkageLine(0.35)).toBe('35% of this estimate comes from published averages, not your data.');
    expect(shrinkageLine(0)).toBe('');
    expect(shrinkageLine(null)).toBe('');
    expect(strengthWord(effect({ qValue: 0.01 })).label).toBe('Consistent signal');
    expect(strengthWord(effect({ qValue: 0.12 })).label).toBe('Suggestive only');
    expect(strengthWord(effect({ qValue: 0.6 })).label).toBe('No clear signal');
    expect(strengthWord(null)).toEqual({ label: 'Not yet testable', tone: 'neutral' });
    expect(strengthWord(effect({ qValue: Number.NaN })).label).toBe('Not yet testable');
    expect(strengthWord(effect({ qValue: 0.01 })).label.toLowerCase()).not.toContain('confirm');
  });

  // The q is computed on the UNSHRUNK difference (deliberately — a prior must
  // not manufacture significance) while the number, the direction and the
  // interval on the row are the shrunk posterior. The badge is the one place
  // those two get put side by side, so it has to hold both.
  it('never calls an effect "consistent" over an interval that includes zero', () => {
    const spansZero = effect({ qValue: 0.0424, deltaMean: -0.37, lo95: -7.31, hi95: 6.56, shrunkToPrior: 0 });
    expect(strengthWord(spansZero)).toEqual({ label: 'Mixed evidence', tone: 'yellow' });
    expect(strengthCaveat(spansZero)).toContain('the interval includes zero');
    // …and the clean case still gets its green badge.
    const clean = effect({ qValue: 0.0424, deltaMean: -4.2, lo95: -7.1, hi95: -1.3, shrunkToPrior: 0 });
    expect(strengthWord(clean)).toEqual({ label: 'Consistent signal', tone: 'green' });
    expect(strengthCaveat(clean)).toBe('');
  });

  it('never calls it "consistent" when shrinkage flipped the sign of the estimate', () => {
    // alcohol → HRV carries a −7 ms prior. Raw days ran +12 ms; the posterior
    // is −6.4 with an interval clear of zero, so only the sign check catches it.
    const flipped = effect({
      behaviour: 'alcohol',
      metric: 'hrv',
      qValue: 0.0424,
      deltaMean: -6.4,
      lo95: -8.4,
      hi95: -4.4,
      shrunkToPrior: 0.97,
    });
    expect(rawDifference(flipped)).toBeGreaterThan(0);
    expect(isConsistentEffect(flipped)).toBe(false);
    expect(strengthWord(flipped)).toEqual({ label: 'Mixed evidence', tone: 'yellow' });
    expect(strengthCaveat(flipped)).toContain('your own days went the other way (higher on those days)');
  });
});

// ---------------------------------------------------------------------------
// The two rows an adversarial review measured, end to end from the engine
// ---------------------------------------------------------------------------

/** The row SignalDots renders, as one string. */
const signalRow = (s: StressSignal): string =>
  `${signalStateText(s)} · ${signalZText(s)}${signalThresholdText(s) ? ` · ${signalThresholdText(s)}` : ''}`;

describe('overnight signal rows, from the engine', () => {
  const END = '2026-09-06';
  const prev = addDays(END, -1);

  /** 60 nights of HRV ~ N(60, 6) and SpO₂ ~ N(97, 0.8), then one measured night. */
  const rowsFor = (today: Partial<DailyRecord>) => {
    const hrv = gaussianSeries({ seed: 5, days: 60, end: prev, mean: 60, sd: 6, dp: 1 }).map((p) => ({ d: p.d, hrv: p.v }));
    const spo = gaussianSeries({ seed: 105, days: 60, end: prev, mean: 97, sd: 0.8, dp: 1 }).map((p) => ({ d: p.d, spo: p.v }));
    const recs = [...mergeRecords(hrv, spo), { d: END, ...today }];
    const s = overnightStrainIndex(recs, END);
    return Object.fromEntries(s.signals.map((x) => [x.key, x]));
  };

  it('reads a fallen HRV and a fallen blood oxygen as BELOW the personal normal', () => {
    const rows = rowsFor({ hrv: 40, spo: 93 });
    // HRV 40 ms against a 60 ms normal, blood oxygen 93 % against 97 %.
    expect(signalValueText(rows.hrv)).toBe('40 ms');
    expect(signalRow(rows.hrv)).toBe('Outside your range · 4.7 SD below your normal · flags from 1.3 SD below');
    expect(signalValueText(rows.spo)).toBe('93 %');
    expect(signalRow(rows.spo)).toBe('Outside your range · 5.3 SD below your normal · flags from 1.3 SD below');
    for (const key of ['hrv', 'spo'] as const) {
      expect(signalRow(rows[key])).not.toContain('above');
      expect(signalRow(rows[key])).not.toContain('±');
    }
  });

  it('reads a risen HRV as ABOVE normal, and does not claim a symmetric threshold', () => {
    const rows = rowsFor({ hrv: 74, spo: 98.5 });
    // A night 2.3 SD ABOVE normal is inside the range: the rule is one-sided,
    // so a high HRV can never flag, and the copy must not imply it could.
    expect(rows.hrv.deviating).toBe(false);
    expect(signalRow(rows.hrv)).toBe('Inside your range · 2.3 SD above your normal · flags from 1.3 SD below');
    expect(signalRow(rows.spo)).toBe('Inside your range · 2.2 SD above your normal · flags from 1.3 SD below');
  });

  it('says nothing about direction when there is no reading', () => {
    const rows = rowsFor({ hrv: 40 });
    expect(signalRow(rows.rhr)).toBe('No reading · — · flags from 1.3 SD above');
  });
});
