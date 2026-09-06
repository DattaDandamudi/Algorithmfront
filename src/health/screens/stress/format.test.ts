import { describe, expect, it } from 'vitest';
import type { EnergyPoint, StressSignal } from '../../data/types';
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
  signalTone,
  signalValueText,
  signalsLine,
  strengthWord,
  stressBandWord,
  troughLine,
  unwrapMinutes,
  worseRunLine,
} from './format';

const signal = (patch: Partial<StressSignal> = {}): StressSignal => ({
  key: 'hrv',
  label: 'HRV',
  value: 48,
  z: -2.1,
  threshold: 1.5,
  deviating: true,
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
  it('signs the z-score and names the direction', () => {
    expect(formatZ(-2.14)).toBe('−2.1');
    expect(formatZ(1.85)).toBe('+1.9');
    expect(formatZ(0)).toBe('0.0');
    expect(formatZ(null)).toBe('—');
    expect(signalDirection(1.2)).toBe('above');
    expect(signalDirection(-1.2)).toBe('below');
    expect(signalDirection(0)).toBe('at');
    expect(signalDirection(null)).toBe('unknown');
  });

  it('puts the state in words, not only in the dot', () => {
    expect(signalStateText(signal())).toBe('Outside your range (below normal)');
    expect(signalStateText(signal({ deviating: false, z: 0.4 }))).toBe('Inside your range (above normal)');
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
    expect(strengthWord(0.01).label).toBe('Consistent signal');
    expect(strengthWord(0.12).label).toBe('Suggestive only');
    expect(strengthWord(0.6).label).toBe('No clear signal');
    expect(strengthWord(null)).toEqual({ label: 'Not yet testable', tone: 'neutral' });
    expect(strengthWord(0.01).label.toLowerCase()).not.toContain('confirm');
  });
});
