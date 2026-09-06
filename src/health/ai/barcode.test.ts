import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BARCODE_CONFIDENCE_COMPLETE,
  BARCODE_CONFIDENCE_PARTIAL,
  lookupBarcode,
  normaliseBarcode,
  offProductUrl,
  productDisplayName,
  productToEstimate,
} from './barcode';

const OATS = {
  product_name: 'Rolled Oats',
  brands: 'Quaker, PepsiCo',
  serving_size: '40g',
  serving_quantity: 40,
  nutriments: { 'energy-kcal_100g': 375, proteins_100g: 11, fat_100g: 8, carbohydrates_100g: 60, fiber_100g: 9 },
};

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('normaliseBarcode', () => {
  it('accepts 8–14 digits and strips spaces/hyphens', () => {
    expect(normaliseBarcode('5000159484695')).toBe('5000159484695');
    expect(normaliseBarcode('500 0159-484695')).toBe('5000159484695');
    expect(normaliseBarcode('12345678')).toBe('12345678');
  });
  it('rejects letters, short and long codes', () => {
    expect(normaliseBarcode('abc')).toBeNull();
    expect(normaliseBarcode('1234567')).toBeNull();
    expect(normaliseBarcode('123456789012345')).toBeNull();
    expect(normaliseBarcode('')).toBeNull();
  });
});

describe('offProductUrl', () => {
  it('targets the v2 product endpoint with only the fields we use', () => {
    const url = offProductUrl('5000159484695');
    expect(url.startsWith('https://world.openfoodfacts.org/api/v2/product/5000159484695.json?fields=')).toBe(true);
    expect(url).toContain('product_name,brands,nutriments,serving_size,serving_quantity');
  });
});

describe('productToEstimate', () => {
  it('scales per-100 g nutriments to the label serving and marks a complete label 0.85', () => {
    const est = productToEstimate(OATS, '5000159484695');
    expect(est).not.toBeNull();
    const it = est!.items[0];
    expect(it.name).toBe('Quaker Rolled Oats');
    expect(it.grams).toBe(40);
    expect(it.kcal).toBe(150);
    expect(it.protein_g).toBe(4.4);
    expect(it.fat_g).toBe(3.2);
    expect(it.carbs_g).toBe(24);
    expect(it.fiber_g).toBe(3.6);
    expect(it.confidence).toBe(BARCODE_CONFIDENCE_COMPLETE);
    expect(it.assumptions).toContain('Open Food Facts');
    expect(it.assumptions).toContain('Quaker Rolled Oats');
    expect(it.assumptions).toContain('40 g');
    expect(est!.clarify).toBeNull();
    expect(est!.source).toBe('local');
  });

  it('assumes 100 g when no serving is listed and says so', () => {
    const est = productToEstimate({ ...OATS, serving_quantity: undefined, serving_size: undefined }, '1');
    const it = est!.items[0];
    expect(it.grams).toBe(100);
    expect(it.kcal).toBe(375);
    expect(it.assumptions).toContain('100 g assumed');
  });

  it('accepts numeric strings for serving_quantity and nutriments', () => {
    const est = productToEstimate(
      { product_name: 'Bar', serving_quantity: '50', nutriments: { 'energy-kcal_100g': '400', proteins_100g: '20', fat_100g: '10', carbohydrates_100g: '50' } },
      '2',
    );
    const it = est!.items[0];
    expect(it.grams).toBe(50);
    expect(it.kcal).toBe(200);
    expect(it.protein_g).toBe(10);
    expect(it.fiber_g).toBe(0);
    expect(it.confidence).toBe(BARCODE_CONFIDENCE_COMPLETE);
    expect(it.assumptions).toContain('fiber not listed');
  });

  it('drops to 0.5 and names the gap when a core value is missing', () => {
    const est = productToEstimate({ product_name: 'Mystery', nutriments: { 'energy-kcal_100g': 100, proteins_100g: 5 } }, '3');
    const it = est!.items[0];
    expect(it.confidence).toBe(BARCODE_CONFIDENCE_PARTIAL);
    expect(it.fat_g).toBe(0);
    expect(it.carbs_g).toBe(0);
    expect(it.assumptions).toContain('fat, carbs not on the label');
  });

  it('derives kcal from kJ when only energy_100g is present', () => {
    const est = productToEstimate({ product_name: 'Juice', nutriments: { energy_100g: 1000, proteins_100g: 1, fat_100g: 0, carbohydrates_100g: 10 } }, '4');
    expect(est!.items[0].kcal).toBe(239);
    expect(est!.items[0].confidence).toBe(BARCODE_CONFIDENCE_COMPLETE);
  });

  it('returns null when the entry has no nutrition facts at all', () => {
    expect(productToEstimate({ product_name: 'Empty' }, '5')).toBeNull();
    expect(productToEstimate({ product_name: 'Empty', nutriments: { salt_100g: 1 } }, '5')).toBeNull();
  });

  it('never returns negative macros', () => {
    const est = productToEstimate({ product_name: 'Odd', nutriments: { 'energy-kcal_100g': -5, proteins_100g: -1, fat_100g: 0, carbohydrates_100g: 0 } }, '6');
    expect(est!.items[0].kcal).toBe(0);
    expect(est!.items[0].protein_g).toBe(0);
  });
});

describe('productDisplayName', () => {
  it('prefixes the first brand unless the name already contains it', () => {
    expect(productDisplayName({ product_name: 'Rolled Oats', brands: 'Quaker, PepsiCo' }, '1')).toBe('Quaker Rolled Oats');
    expect(productDisplayName({ product_name: 'Quaker Oats', brands: 'Quaker' }, '1')).toBe('Quaker Oats');
    expect(productDisplayName({}, '123')).toBe('Barcode 123');
  });
});

describe('lookupBarcode', () => {
  it('fetches the product and maps it', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ status: 1, product: OATS }));
    vi.stubGlobal('fetch', fetchMock);
    const est = await lookupBarcode('5000159484695');
    expect(est?.items[0].name).toBe('Quaker Rolled Oats');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(offProductUrl('5000159484695'));
    expect((init.headers as Record<string, string>).Accept).toBe('application/json');
  });

  it('resolves null on 404 and on status 0 (product not found)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ status: 0, status_verbose: 'product not found' }, 404)));
    expect(await lookupBarcode('12345678')).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ status: 0, status_verbose: 'product not found' }, 200)));
    expect(await lookupBarcode('12345678')).toBeNull();
  });

  it('resolves null for a listed product with no nutrition facts', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ status: 1, product: { product_name: 'Water' } })));
    expect(await lookupBarcode('12345678')).toBeNull();
  });

  it('rejects a malformed code without calling the network', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(lookupBarcode('12ab')).rejects.toThrow(/8–14 digit/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('turns a network failure into a readable error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(lookupBarcode('12345678')).rejects.toThrow(/Could not reach Open Food Facts/);
  });

  it('reports non-OK statuses and unreadable bodies', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({}, 503)));
    await expect(lookupBarcode('12345678')).rejects.toThrow(/HTTP 503/);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad'); } })));
    await expect(lookupBarcode('12345678')).rejects.toThrow(/unreadable/);
  });

  it('passes the abort signal through and re-throws an abort untouched', async () => {
    const ac = new AbortController();
    const abortErr = new DOMException('aborted', 'AbortError');
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.signal).toBe(ac.signal);
      throw abortErr;
    }));
    await expect(lookupBarcode('12345678', ac.signal)).rejects.toBe(abortErr);
  });
});
