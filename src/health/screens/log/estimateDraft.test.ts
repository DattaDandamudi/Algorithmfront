import { describe, expect, it } from 'vitest';
import type { FoodEstimateItem } from '../../data/types';
import {
  GRAM_STEP,
  LOW_CONFIDENCE_RANGE,
  createDraft,
  draftItems,
  macroRange,
  portionFactor,
  removeRow,
  replaceRow,
  saveBlocker,
  setRowGrams,
  setRowMacros,
  setRowName,
} from './estimateDraft';

const item = (over: Partial<FoodEstimateItem> = {}): FoodEstimateItem => ({
  name: 'chicken tikka',
  grams: 200,
  kcal: 330,
  protein_g: 50,
  fat_g: 12,
  carbs_g: 6,
  fiber_g: 1,
  confidence: 0.9,
  assumptions: '200 g as stated',
  tags: ['poultry'],
  ...over,
});

const seq = () => {
  let n = 0;
  return () => `id${++n}`;
};

describe('createDraft / ids (R1-16)', () => {
  it('gives every row a distinct stable id and its own base', () => {
    const rows = createDraft([item(), item({ name: 'roti', grams: 40, kcal: 120 })]);
    expect(new Set(rows.map((r) => r.id)).size).toBe(2);
    expect(rows[0].base).toBe(rows[0].item);
    expect(rows[1].estimatedGrams).toBe(40);
    expect(rows.every((r) => r.gramsConfirmed === false)).toBe(true);
  });

  it('removing a row keeps the remaining rows paired with their own originals', () => {
    const rows = createDraft([item({ name: 'biryani', grams: 350, kcal: 700 }), item({ name: 'roti', grams: 40, kcal: 120 })], seq());
    const after = removeRow(rows, 'id1');
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe('id2');
    expect(after[0].item.name).toBe('roti');
    expect(after[0].base.grams).toBe(40);
    expect(after[0].estimatedGrams).toBe(40);
    // portion chips for the roti are still relative to 40 g, not the biryani's 350 g
    expect(setRowGrams(after[0], after[0].estimatedGrams * 0.75).item.grams).toBe(30);
  });

  it('replaceRow swaps by id and draftItems strips the wrapper', () => {
    const rows = createDraft([item(), item({ name: 'roti' })], seq());
    const next = replaceRow(rows, setRowName(rows[1], 'naan'));
    expect(draftItems(next).map((i) => i.name)).toEqual(['chicken tikka', 'naan']);
    expect(next[0]).toBe(rows[0]);
  });
});

describe('setRowGrams (R1-5)', () => {
  it('scales macros proportionally from the base', () => {
    const [row] = createDraft([item()]);
    const r = setRowGrams(row, 300);
    expect(r.item).toMatchObject({ grams: 300, kcal: 495, protein_g: 75, fat_g: 18, carbs_g: 9, fiber_g: 1.5 });
    expect(r.base).toBe(row.base);
    expect(r.gramsConfirmed).toBe(true);
  });

  it('recovers after a 0 g step — the old bug locked every macro at 0', () => {
    const [row] = createDraft([item({ grams: 10, kcal: 30, protein_g: 5, fat_g: 1, carbs_g: 0, fiber_g: 0 })]);
    const zero = setRowGrams(row, 0);
    expect(zero.item).toMatchObject({ grams: 0, kcal: 0, protein_g: 0 });
    expect(zero.gramsConfirmed).toBe(false);
    const back = setRowGrams(zero, 10);
    expect(back.item).toMatchObject({ grams: 10, kcal: 30, protein_g: 5, fat_g: 1 });
    const more = setRowGrams(zero, 20);
    expect(more.item).toMatchObject({ grams: 20, kcal: 60, protein_g: 10 });
  });

  it('keeps a renamed name and the confidence/assumptions across a rescale', () => {
    const [row] = createDraft([item()]);
    const renamed = setRowName(row, 'tikka (half)');
    const scaled = setRowGrams(renamed, 100);
    expect(scaled.item.name).toBe('tikka (half)');
    expect(scaled.item.kcal).toBe(165);
    expect(scaled.item.confidence).toBe(0.9);
    expect(scaled.item.assumptions).toBe('200 g as stated');
    expect(scaled.item.tags).toEqual(['poultry']);
  });

  it('an item that arrived at 0 g takes the grams, keeps its macros and becomes the new base', () => {
    const [row] = createDraft([item({ grams: 0, kcal: 150, protein_g: 10 })]);
    const set = setRowGrams(row, 100);
    expect(set.item).toMatchObject({ grams: 100, kcal: 150, protein_g: 10 });
    expect(set.base.grams).toBe(100);
    expect(setRowGrams(set, 200).item).toMatchObject({ grams: 200, kcal: 300, protein_g: 20 });
  });

  it('clamps negatives and rounds', () => {
    const [row] = createDraft([item()]);
    expect(setRowGrams(row, -5).item.grams).toBe(0);
    expect(setRowGrams(row, 204.6).item.grams).toBe(205);
  });
});

describe('setRowMacros', () => {
  it('applies typed values and rebases so a later grams step scales the typed value', () => {
    const [row] = createDraft([item()]);
    const typed = setRowMacros(row, { kcal: 400 });
    expect(typed.item.kcal).toBe(400);
    expect(typed.base.kcal).toBe(400);
    expect(typed.base.grams).toBe(200);
    expect(setRowGrams(typed, 100).item.kcal).toBe(200);
  });

  it('ignores NaN and clamps negatives; does not rebase at 0 g', () => {
    const [row] = createDraft([item({ grams: 0 })]);
    const r = setRowMacros(row, { protein_g: -3, fat_g: NaN });
    expect(r.item.protein_g).toBe(0);
    expect(r.item.fat_g).toBe(12);
    expect(r.base).toBe(row.base);
  });
});

describe('portionFactor / macroRange (R1-11)', () => {
  it('portion factor is relative to the estimated grams', () => {
    const [row] = createDraft([item()]);
    expect(portionFactor(row)).toBe(1);
    expect(portionFactor(setRowGrams(row, 150))).toBe(0.75);
    expect(portionFactor(setRowGrams(row, 280))).toBe(1.4);
    expect(portionFactor(createDraft([item({ grams: 0 })])[0])).toBe(1);
  });

  it('macroRange is ±25 % rounded like the field', () => {
    expect(LOW_CONFIDENCE_RANGE).toBe(0.25);
    expect(macroRange(330)).toBe(83);
    expect(macroRange(50, 1)).toBe(12.5);
    expect(macroRange(0)).toBe(0);
    expect(macroRange(NaN)).toBe(0);
    expect(macroRange(-4)).toBe(0);
  });
});

describe('saveBlocker (R1-5 / photo confirm)', () => {
  it('blocks on an empty draft and on any 0 g row, naming it', () => {
    expect(saveBlocker([])).toMatch(/Nothing left/);
    const rows = createDraft([item(), item({ name: 'roti', grams: 0 })]);
    expect(saveBlocker(rows)).toBe('Set the grams for roti.');
    expect(saveBlocker(replaceRow(rows, setRowGrams(rows[1], GRAM_STEP)))).toBeNull();
  });

  it('with requireGramsConfirm every row must be confirmed', () => {
    const rows = createDraft([item(), item({ name: 'roti', grams: 40 })]);
    expect(saveBlocker(rows, true)).toMatch(/Confirm the grams — tap a portion/);
    const one = replaceRow(rows, setRowGrams(rows[0], rows[0].estimatedGrams));
    expect(saveBlocker(one, true)).toBe('Confirm the grams for roti.');
    const both = replaceRow(one, setRowGrams(one[1], 50));
    expect(saveBlocker(both, true)).toBeNull();
    expect(saveBlocker(rows, false)).toBeNull();
  });
});
