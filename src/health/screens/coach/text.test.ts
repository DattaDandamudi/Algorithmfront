import { describe, expect, it } from 'vitest';
import { DEFAULT_AI } from '../../data/defaults';
import { modelPillLabel, splitBold, stripDanglingBold } from './text';

describe('splitBold', () => {
  it('returns [] for empty text', () => {
    expect(splitBold('')).toEqual([]);
  });

  it('renders a single trailing bold action', () => {
    expect(splitBold('HRV 42 ms is 8 below baseline. **Keep today light.**')).toEqual([
      { text: 'HRV 42 ms is 8 below baseline. ', bold: false },
      { text: 'Keep today light.', bold: true },
    ]);
  });

  it('handles bold in the middle and multiple spans', () => {
    expect(splitBold('a **b** c **d**')).toEqual([
      { text: 'a ', bold: false },
      { text: 'b', bold: true },
      { text: ' c ', bold: false },
      { text: 'd', bold: true },
    ]);
  });

  it('leaves unmatched or empty markers literal', () => {
    expect(splitBold('2 ** 3 = 8')).toEqual([{ text: '2 ** 3 = 8', bold: false }]);
    expect(splitBold('**** nothing')).toEqual([{ text: '**** nothing', bold: false }]);
    expect(splitBold('open **never closes')).toEqual([{ text: 'open **never closes', bold: false }]);
  });

  it('never treats other markdown as markup', () => {
    expect(splitBold('<b>x</b> _y_ # z')).toEqual([{ text: '<b>x</b> _y_ # z', bold: false }]);
  });
});

describe('stripDanglingBold', () => {
  it('drops a lone opening marker while streaming', () => {
    expect(stripDanglingBold('Eat now. **Lead with pro')).toBe('Eat now. Lead with pro');
  });
  it('keeps balanced markers', () => {
    expect(stripDanglingBold('Eat now. **Lead.**')).toBe('Eat now. **Lead.**');
  });
  it('is a no-op on plain text', () => {
    expect(stripDanglingBold('plain')).toBe('plain');
    expect(stripDanglingBold('')).toBe('');
  });
});

describe('modelPillLabel', () => {
  it('shortens known models', () => {
    expect(modelPillLabel({ ...DEFAULT_AI, model: 'claude-opus-5' })).toBe('Claude · Opus 5');
    expect(modelPillLabel({ ...DEFAULT_AI, model: 'claude-sonnet-5' })).toBe('Claude · Sonnet 5');
  });
  it('falls back to the default model when unset and to the raw id when unknown', () => {
    expect(modelPillLabel({ ...DEFAULT_AI, model: '' })).toBe('Claude · Opus 5');
    expect(modelPillLabel({ ...DEFAULT_AI, model: 'claude-custom-x' })).toBe('Claude · claude-custom-x');
  });
});
