import { describe, expect, it } from 'vitest';
import type { BaselineDelta, CoachContext } from '../../data/types';
import { BASELINE_READINGS } from '../../engine';
import { macroTones } from './MacroSection';
import { baselineCaption, dayCompleteDelta, hrvTileDelta, hrvTileLabel, stepsGoalLabel } from './MetricTiles';

const bd = (patch: Partial<BaselineDelta> = {}): BaselineDelta => ({ today: null, baseline: null, delta: null, pct: null, n: 0, good: null, ...patch });

const nutrition = (patch: Partial<CoachContext['nutrition']> = {}): CoachContext['nutrition'] => ({
  totals: { kc: 900, p: 87, f: 35, c: 100, fi: 10 },
  targets: { kc: 1950, p: 180, f: 65, c: 100, fi: 30, fatFloor: 60, carbsRange: [70, 100] },
  remaining: { kc: 1050, p: 93, f: 30, c: 0, fi: 20 },
  mealsLogged: 2,
  mealsLeft: 2,
  proteinPerMealNeeded: 47,
  lastMealTime: '12:30',
  fatBelowFloor: true,
  lateEating: false,
  hydrationCups: 4,
  hydrationTargetCups: 10,
  caffeineAfterCutoff: null,
  minPerMeal: 31,
  maxPerMeal: 43,
  ...patch,
});

describe('macroTones (R1-13: tone follows state, not a fixed hue)', () => {
  it('protein is green only while on pace (per-meal need ≤ the 0.55 g/kg ceiling) or hit', () => {
    expect(macroTones(nutrition({ proteinPerMealNeeded: 47 }), '12:00', 172).protein).toBe('neutral');
    expect(macroTones(nutrition({ proteinPerMealNeeded: 40 }), '12:00', 172).protein).toBe('green');
    expect(macroTones(nutrition({ proteinPerMealNeeded: null, remaining: { kc: 0, p: -5, f: 0, c: 0, fi: 0 } }), '22:00', 172).protein).toBe('green');
    expect(macroTones(nutrition({ proteinPerMealNeeded: null, mealsLeft: 0 }), '22:00', 172).protein).toBe('neutral');
  });

  it('falls back to the reference weight for the ceiling on contexts without maxPerMeal', () => {
    const legacy = nutrition({ proteinPerMealNeeded: 45 });
    delete (legacy as Partial<CoachContext['nutrition']>).maxPerMeal;
    expect(macroTones(legacy, '12:00', 172).protein).toBe('neutral'); // 172 lb → 78 kg → 43 g ceiling
    expect(macroTones(legacy, '12:00', 200).protein).toBe('green'); // 200 lb → 91 kg → 50 g ceiling
  });

  it('carbs stay blue (a range, not a pass/fail)', () => {
    expect(macroTones(nutrition(), '12:00', 172).carbs).toBe('blue');
  });

  it('fat: yellow below the floor, red when late and still below, green once met', () => {
    expect(macroTones(nutrition(), '12:00', 172).fat).toBe('yellow');
    expect(macroTones(nutrition(), '20:00', 172).fat).toBe('red');
    expect(macroTones(nutrition({ mealsLeft: 0 }), '12:00', 172).fat).toBe('red');
    expect(macroTones(nutrition({ totals: { kc: 900, p: 87, f: 60, c: 100, fi: 10 } }), '21:00', 172).fat).toBe('green');
  });

  it('fiber is neutral until the target is hit, then green', () => {
    expect(macroTones(nutrition(), '12:00', 172).fiber).toBe('neutral');
    expect(macroTones(nutrition({ totals: { kc: 900, p: 87, f: 35, c: 100, fi: 30 } }), '12:00', 172).fiber).toBe('green');
  });
});

describe('hrvTileLabel (R1-9: neutral "Calibrating" until the 21-reading baseline)', () => {
  const hrv = (patch: Partial<CoachContext['hrv']> = {}): CoachContext['hrv'] => ({
    today: 57, baseline7: 58, lnMean7: Math.log(58), swcLower: 52, swcUpper: 64, band: 'balanced', cv7: 6, delta: bd({ today: 57, baseline: 58, delta: -1, n: 25 }), ...patch,
  });

  it('says Calibrating with the day count while the baseline is forming, even if the engine has a provisional band', () => {
    expect(hrvTileLabel(hrv({ baselineEstablished: false, daysOfData: 12 }))).toEqual({ text: 'Calibrating · 12/21 days', band: 'neutral' });
    expect(hrvTileLabel(hrv({ band: 'low', baselineEstablished: false, daysOfData: 20 })).band).toBe('neutral');
    expect(hrvTileLabel(hrv({ band: 'insufficient', baselineEstablished: true, daysOfData: 30 }))).toEqual({ text: 'Calibrating · 21/21 days', band: 'neutral' });
  });

  it('shows the coloured Garmin-style band only once established', () => {
    expect(hrvTileLabel(hrv({ baselineEstablished: true, daysOfData: 25 }))).toEqual({ text: 'Balanced', band: 'green' });
    expect(hrvTileLabel(hrv({ band: 'low', baselineEstablished: true, daysOfData: 25 }))).toEqual({ text: 'Low', band: 'red' });
    expect(hrvTileLabel(hrv({ band: 'unbalanced', baselineEstablished: true, daysOfData: 25 })).band).toBe('yellow');
  });

  it('falls back to the reading count against BASELINE_READINGS on legacy contexts', () => {
    expect(BASELINE_READINGS).toBe(21);
    expect(hrvTileLabel(hrv()).text).toBe('Balanced'); // delta.n 25
    expect(hrvTileLabel(hrv({ delta: bd({ n: 10 }) })).text).toBe('Calibrating · 10/21 days');
  });
});

describe('baselineCaption (R1-4: "30-day avg" instead of a misleading intraday arrow)', () => {
  it('formats the mean per day, and returns null with no history', () => {
    expect(baselineCaption(bd({ baseline: 176.4, n: 20 }), 'g')).toBe('30-day avg 176 g/day');
    expect(baselineCaption(bd({ baseline: 1930.2, n: 28 }), 'kcal')).toBe('30-day avg 1,930 kcal/day');
    expect(baselineCaption(bd(), 'g')).toBeNull();
    expect(baselineCaption(bd({ baseline: 100, n: 0 }), 'g')).toBeNull();
  });

  it('R7-4: a unit-less metric (steps) reads "30-day avg 8,048/day"', () => {
    expect(baselineCaption(bd({ baseline: 8047.67, n: 30 }))).toBe('30-day avg 8,048/day');
  });
});

describe('dayCompleteDelta (R1-4 / R7-4: the ▲/▼ only once the day is essentially complete)', () => {
  const steps = bd({ today: 4412, baseline: 8047.67, delta: -3635.67, n: 30, good: false });
  it('is hidden before DAY_COMPLETE_HOUR and shown after', () => {
    expect(dayCompleteDelta(steps, false)).toBeUndefined();
    expect(dayCompleteDelta(steps, true)).toEqual({ value: -3635.67, good: false, unit: undefined });
    expect(dayCompleteDelta(bd({ today: 100, baseline: 90, delta: 10, n: 5, good: null }), true, 'g')).toEqual({ value: 10, good: null, unit: 'g' });
    expect(dayCompleteDelta(bd(), true)).toBeUndefined();
  });
});

describe('stepsGoalLabel (R7-11: exact targets unless both are whole thousands)', () => {
  it('matches the Trends goalBandLabel', () => {
    expect(stepsGoalLabel(8000, 10000)).toBe('Goal 8–10k');
    expect(stepsGoalLabel(7500, 10000)).toBe('Goal 7,500–10,000');
    expect(stepsGoalLabel(8500, 10000)).toBe('Goal 8,500–10,000');
  });
});

describe('hrvTileDelta (R7-8: one user-facing HRV baseline — the 28-day reference)', () => {
  const hrv = (patch: Partial<CoachContext['hrv']> = {}): CoachContext['hrv'] => ({
    today: 57, baseline7: 59.4, lnMean7: Math.log(59.4), swcLower: 52, swcUpper: 64, band: 'balanced', cv7: 6, delta: bd({ today: 57, baseline: 59.47, delta: -2.47, n: 30, good: false }), ...patch,
  });
  it('is today − baseline28, captioned "vs 28-day baseline", good when HRV is up', () => {
    expect(hrvTileDelta(hrv({ baseline28: 59.7 }))).toEqual({ value: -2.7, good: false, unit: 'ms', caption: 'vs 28-day baseline' });
    expect(hrvTileDelta(hrv({ today: 62, baseline28: 59.7 }))).toMatchObject({ value: 2.3, good: true });
    expect(hrvTileDelta(hrv({ today: 59.7, baseline28: 59.7 }))).toMatchObject({ value: 0, good: null });
  });
  it('falls back to the 30-day arithmetic delta, explicitly captioned, while the reference is forming', () => {
    expect(hrvTileDelta(hrv({ baseline28: null }))).toEqual({ value: -2.47, good: false, unit: 'ms', caption: 'vs 30-day avg' });
    expect(hrvTileDelta(hrv())).toMatchObject({ caption: 'vs 30-day avg' });
  });
});
