/**
 * estimateDraft — pure state helpers for the editable estimate card (§2 / §9).
 *
 * Each row carries the item being edited plus a scaling reference (`base`)
 * that grams changes never mutate, so the quantity stepper always rescales
 * from a known density instead of from the current (possibly zeroed) item
 * (review R1-5: once grams hit 0 every macro was 0 forever). Rows get a
 * stable id at creation and travel with their own reference, so removing one
 * can never pair an editor with a neighbour's original (R1-16).
 *
 * `base` starts as the estimate and is rebased when the user types a macro
 * (a label value beats an estimate) or first sets grams on an item that
 * arrived at 0 g; a grams-only change leaves it alone. Portion chips are
 * relative to `estimatedGrams`, the weight the estimate arrived with.
 *
 * Low-confidence ranges (R1-11): §9 "Low confidence → editable ± range";
 * `macroRange` is ±25 % of the value, the residual error commonly cited for
 * Indian/Middle-Eastern text estimates.
 */
import type { FoodEstimateItem } from '../../data/types';
import { scaleItem } from '../../ai/foodLocal';
import { round, uid } from '../../lib/format';

export interface DraftRow {
  id: string;
  /** What will be saved. */
  item: FoodEstimateItem;
  /** Scaling reference (grams + macros); never changed by a grams step. */
  base: FoodEstimateItem;
  /** Grams the estimate arrived with — the "As estimated" portion. */
  estimatedGrams: number;
  /** True once the user has set or explicitly confirmed the grams. */
  gramsConfirmed: boolean;
}

export type MacroKey = 'kcal' | 'protein_g' | 'fat_g' | 'carbs_g' | 'fiber_g';
export const MACRO_KEYS: MacroKey[] = ['kcal', 'protein_g', 'fat_g', 'carbs_g', 'fiber_g'];

/** ± fraction shown on low-confidence macros. */
export const LOW_CONFIDENCE_RANGE = 0.25;
/** Grams step and the stepper floor — a food entry is never 0 g (R1-5). */
export const GRAM_STEP = 10;

const g0 = (n: number) => (Number.isFinite(n) ? Math.max(0, round(n)) : 0);

export function createDraft(items: FoodEstimateItem[], makeId: () => string = () => uid('est')): DraftRow[] {
  return items.map((item) => ({ id: makeId(), item, base: item, estimatedGrams: g0(item.grams), gramsConfirmed: false }));
}

export function draftItems(rows: DraftRow[]): FoodEstimateItem[] {
  return rows.map((r) => r.item);
}

export function removeRow(rows: DraftRow[], id: string): DraftRow[] {
  return rows.filter((r) => r.id !== id);
}

export function replaceRow(rows: DraftRow[], next: DraftRow): DraftRow[] {
  return rows.map((r) => (r.id === next.id ? next : r));
}

/**
 * Set grams and rescale the macros from `base`. Name, assumptions, tags and
 * confidence are kept from the current item (a renamed item stays renamed).
 * An item whose base is 0 g has no density to scale from: keep its macros,
 * take the grams and make that the base for later steps.
 */
export function setRowGrams(row: DraftRow, grams: number): DraftRow {
  const g = g0(grams);
  if (row.base.grams > 0) {
    const s = scaleItem(row.base, g);
    const item: FoodEstimateItem = { ...row.item, grams: g, kcal: s.kcal, protein_g: s.protein_g, fat_g: s.fat_g, carbs_g: s.carbs_g, fiber_g: s.fiber_g };
    return { ...row, item, gramsConfirmed: g > 0 };
  }
  const item: FoodEstimateItem = { ...row.item, grams: g };
  return { ...row, item, base: g > 0 ? item : row.base, gramsConfirmed: g > 0 };
}

/** Typed macro values: apply and rebase so a later grams step scales what the user typed. */
export function setRowMacros(row: DraftRow, patch: Partial<Record<MacroKey, number>>): DraftRow {
  const item: FoodEstimateItem = { ...row.item };
  for (const k of MACRO_KEYS) {
    const v = patch[k];
    if (typeof v === 'number' && Number.isFinite(v)) item[k] = Math.max(0, v);
  }
  return { ...row, item, base: item.grams > 0 ? item : row.base };
}

/** Non-numeric edits (name) never touch the scaling reference's numbers. */
export function setRowName(row: DraftRow, name: string): DraftRow {
  return { ...row, item: { ...row.item, name }, base: { ...row.base, name } };
}

/** Current grams relative to the estimate, 2 dp (drives the active portion chip). */
export function portionFactor(row: DraftRow): number {
  return row.estimatedGrams > 0 ? round(row.item.grams / row.estimatedGrams, 2) : 1;
}

/** ± range for a value at the low-confidence fraction, rounded like the field. */
export function macroRange(value: number, dp = 0): number {
  return Number.isFinite(value) ? round(Math.max(0, value) * LOW_CONFIDENCE_RANGE, dp) : 0;
}

/**
 * Why Save is blocked, or null. Grams 0 always blocks (R1-5); with
 * `requireGramsConfirm` (photo flow) every row must have had its grams set
 * or confirmed by the user.
 */
export function saveBlocker(rows: DraftRow[], requireGramsConfirm = false): string | null {
  if (rows.length === 0) return 'Nothing left to save.';
  const zero = rows.filter((r) => !(r.item.grams > 0));
  if (zero.length) return `Set the grams for ${zero.map((r) => r.item.name || 'the item').join(', ')}.`;
  if (requireGramsConfirm) {
    const pending = rows.filter((r) => !r.gramsConfirmed);
    if (pending.length) return pending.length === rows.length ? 'Confirm the grams — tap a portion or set the weight.' : `Confirm the grams for ${pending.map((r) => r.item.name || 'the item').join(', ')}.`;
  }
  return null;
}
