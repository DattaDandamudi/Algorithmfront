/**
 * barcode.ts — packaged-food lookup by barcode (SPEC §2 "Barcode (secondary)").
 *
 * Data source: the public Open Food Facts API (v2), a crowd-sourced database
 * of packaged foods. No API key, no account. The user's browser calls it
 * directly:
 *
 *   GET https://world.openfoodfacts.org/api/v2/product/<code>.json?fields=…
 *
 * PRIVACY: this is the only third-party endpoint the app talks to apart from
 * the user's own AI provider (their Anthropic key or proxy, ai/client.ts).
 * It is called only when the user scans or types a barcode, and the request
 * carries the barcode digits and nothing else — no profile, no logs, no
 * identifiers.
 *
 * Mapping: OFF nutriments are per 100 g (`*_100g`). We scale them to the
 * label's serving (`serving_quantity`, grams) when present, else to 100 g,
 * and say so in `assumptions` so the user edits the grams to what they ate.
 *
 * Confidence (§1g) is about the PORTION, not the label: the macros come off a
 * printed label and are as good as data gets, but what the user actually ate is
 * a guess whenever the pack does not state a serving. So 0.75 with a label
 * serving, 0.6 when all we have is per-100 g and 100 g is an invented portion —
 * both Med, both prompting the user to check the grams. An incomplete label
 * (a missing core value, shown as 0) caps it at 0.5 on top of that.
 *
 * `FoodEstimate.source` is 'barcode' so the Log screen can caption the sheet
 * ("label data from Open Food Facts — check the serving").
 */
import type { FoodEstimate, FoodEstimateItem } from '../data/types';
import { round } from '../lib/format';

export const OFF_PRODUCT_ENDPOINT = 'https://world.openfoodfacts.org/api/v2/product/';
export const OFF_FIELDS = 'product_name,brands,nutriments,serving_size,serving_quantity';

/** Confidence when the pack states a serving size we can scale to. */
export const BARCODE_CONFIDENCE_SERVING = 0.75;
/** Confidence when only per-100 g data exists and 100 g is an assumed portion. */
export const BARCODE_CONFIDENCE_PER100 = 0.6;
/** Ceiling when one or more core values are missing from the label (shown as 0). */
export const BARCODE_CONFIDENCE_INCOMPLETE = 0.5;
/** Grams assumed when the label lists no serving size. */
export const DEFAULT_SERVING_G = 100;
/** kJ → kcal (OFF's `energy_100g` is always kJ; `energy-kcal_100g` is kcal). */
const KJ_PER_KCAL = 4.184;

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

/**
 * Digits only, 8–14 long (EAN-8, UPC-E expanded, UPC-A 12, EAN-13, GTIN-14).
 * Spaces and hyphens from a typed code are dropped. Null when it cannot be
 * a retail barcode.
 */
export function normaliseBarcode(input: string): string | null {
  const digits = (input ?? '').replace(/[\s-]/g, '');
  return /^\d{8,14}$/.test(digits) ? digits : null;
}

export function offProductUrl(code: string): string {
  return `${OFF_PRODUCT_ENDPOINT}${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`;
}

// ---------------------------------------------------------------------------
// Response shape (only the fields we request)
// ---------------------------------------------------------------------------

export interface OffProduct {
  product_name?: unknown;
  brands?: unknown;
  nutriments?: unknown;
  serving_size?: unknown;
  serving_quantity?: unknown;
}

export interface OffResponse {
  status?: unknown;
  status_verbose?: unknown;
  product?: unknown;
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** "Brand Product" — brands is a comma list on OFF; the first is the maker. */
export function productDisplayName(product: OffProduct, code: string): string {
  const name = str(product.product_name);
  const brand = str(product.brands).split(',')[0]?.trim() ?? '';
  if (name && brand && !name.toLowerCase().includes(brand.toLowerCase())) return `${brand} ${name}`;
  return name || brand || `Barcode ${code}`;
}

/**
 * Pure mapping of an OFF product to a one-item estimate. Null when the entry
 * carries no nutrition facts at all (listed, but nothing to log) — the UI
 * treats that like "not found" and points at the text bar.
 */
export function productToEstimate(product: OffProduct, code: string): FoodEstimate | null {
  const n = (product.nutriments && typeof product.nutriments === 'object' ? product.nutriments : {}) as Record<string, unknown>;
  let kcal100 = num(n['energy-kcal_100g']);
  const kj100 = num(n['energy-kj_100g']) ?? num(n.energy_100g);
  const p100 = num(n.proteins_100g);
  const f100 = num(n.fat_100g);
  const c100 = num(n.carbohydrates_100g);
  const fi100 = num(n.fiber_100g);

  const notes: string[] = [];
  if (kcal100 === null && kj100 !== null) kcal100 = kj100 / KJ_PER_KCAL;
  if (kcal100 === null && p100 === null && f100 === null && c100 === null) return null;

  const complete = kcal100 !== null && p100 !== null && f100 !== null && c100 !== null;
  const missing = (['kcal', 'protein', 'fat', 'carbs'] as const).filter((_, i) => [kcal100, p100, f100, c100][i] === null);
  if (missing.length) notes.push(`${missing.join(', ')} not on the label (shown as 0)`);
  if (fi100 === null) notes.push('fiber not listed');

  const servingG = num(product.serving_quantity);
  const hasServing = servingG !== null && servingG > 0;
  const grams = hasServing ? round(servingG) : DEFAULT_SERVING_G;
  const servingLabel = str(product.serving_size);
  const k = grams / 100;
  const name = productDisplayName(product, code);

  const serving = hasServing
    ? `label serving ${servingLabel && servingLabel !== `${grams}g` && servingLabel !== `${grams} g` ? `${servingLabel} (${grams} g)` : `${grams} g`}`
    : `no serving listed — ${DEFAULT_SERVING_G} g assumed`;
  const assumptions = [`Open Food Facts · ${name}`, `${serving}; edit grams to what you ate`, ...notes].join('; ');
  const confidence = Math.min(
    hasServing ? BARCODE_CONFIDENCE_SERVING : BARCODE_CONFIDENCE_PER100,
    complete ? 1 : BARCODE_CONFIDENCE_INCOMPLETE,
  );

  const item: FoodEstimateItem = {
    name,
    grams,
    kcal: Math.max(0, round((kcal100 ?? 0) * k)),
    protein_g: Math.max(0, round((p100 ?? 0) * k, 1)),
    fat_g: Math.max(0, round((f100 ?? 0) * k, 1)),
    carbs_g: Math.max(0, round((c100 ?? 0) * k, 1)),
    fiber_g: Math.max(0, round((fi100 ?? 0) * k, 1)),
    confidence,
    assumptions,
    tags: [],
  };
  return { items: [item], clarify: null, source: 'barcode' };
}

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

const isAbort = (e: unknown): boolean => e instanceof Error && e.name === 'AbortError';

/**
 * Look a barcode up on Open Food Facts. Resolves to null when the code is
 * unknown (HTTP 404 / status 0) or the entry has no nutrition facts; rejects
 * with a readable Error on a bad code, a network failure or a non-OK status.
 * An abort (via `signal`) rejects with the original AbortError so callers
 * can ignore it.
 */
export async function lookupBarcode(code: string, signal?: AbortSignal): Promise<FoodEstimate | null> {
  const digits = normaliseBarcode(code);
  if (!digits) throw new Error('Enter the 8–14 digit number printed under the bars.');

  let res: Response;
  try {
    res = await fetch(offProductUrl(digits), { signal, headers: { Accept: 'application/json' } });
  } catch (e) {
    if (isAbort(e)) throw e;
    throw new Error('Could not reach Open Food Facts — check your connection and try again.');
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Open Food Facts returned HTTP ${res.status} — try again in a moment.`);

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new Error('Open Food Facts returned an unreadable response.');
  }
  const r = (body && typeof body === 'object' ? body : {}) as OffResponse;
  if (r.status === 0 || !r.product || typeof r.product !== 'object') return null;
  return productToEstimate(r.product as OffProduct, digits);
}
