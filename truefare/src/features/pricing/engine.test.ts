import { describe, expect, it } from 'vitest';
import { computeQuote } from './engine';
import { FEE_RULES_V1 } from './rules/v1';
import type { MetroRules, QuoteInput } from './types';
import type { MenuItem, Restaurant } from '../catalog/types';

/**
 * Golden suite anchored to the researched worked example: the same $30
 * in-store order priced on every platform (LA-style metro: 8.5% tax on
 * food only, 15% tip), which published 2025–26 studies put at roughly
 * +65–86% all-in vs in-store. Seeded delivery fees vary per merchant, so
 * totals assert against bands while every deterministic component
 * asserts exactly.
 */

const NOW = new Date('2026-08-29T15:30:00Z');

function mkRestaurant(over: Partial<Restaurant> = {}): Restaurant {
  return {
    id: 'test-resto',
    name: 'Test Resto',
    cuisine: 'Test',
    tagline: '',
    glyph: 'bowl',
    rating: 4.5,
    priceLevel: 2,
    distanceMiles: 3.0,
    baseEtaMinutes: 25,
    platforms: ['doordash', 'ubereats', 'grubhub', 'postmates'],
    markupBps: { doordash: 2000, ubereats: 2200, grubhub: 1800 },
    ...over,
  };
}

function mkItem(prices: { doordash: number; ubereats: number; grubhub: number }): MenuItem {
  return {
    id: 'test-item',
    restaurantId: 'test-resto',
    name: 'Test Item',
    description: '',
    glyph: 'bowl',
    basePriceCents: 3000,
    platformPrices: prices,
    tags: [],
    dietary: [],
    mealPeriods: ['dinner'],
    popularity: 0.5,
  };
}

/** The research example's metro: 8.5% on food only, no regulatory lines. */
const EXAMPLE_METRO: MetroRules = {
  id: 'custom',
  label: 'Example metro',
  taxRate: 0.085,
  feesTaxable: false,
  regulatory: {},
};

function mkInput(over: Partial<QuoteInput> = {}): QuoteInput {
  return {
    restaurant: mkRestaurant(),
    // $30 in-store with the researched per-platform markups (+20/+22/+18%)
    lines: [{ item: mkItem({ doordash: 3600, ubereats: 3660, grubhub: 3540 }), qty: 1 }],
    metro: EXAMPLE_METRO,
    memberships: [],
    tipPercent: 15,
    daypart: 'snack', // no surge — matches the example's normal-demand case
    ...over,
  };
}

const q = (input: QuoteInput, platform: Parameters<typeof computeQuote>[2]) =>
  computeQuote(FEE_RULES_V1, input, platform, NOW);

describe('research worked example ($30 in-store, 15% tip, 8.5% food-only tax)', () => {
  it('DoorDash: exact components, total within band of $52.85', () => {
    const quote = q(mkInput(), 'doordash');
    expect(quote.subtotal_cents).toBe(3600);
    expect(quote.service_fee_cents).toBe(540); // 15% of 36.00, inside min/cap
    expect(quote.sales_tax_cents).toBe(306); // 8.5% × subtotal only
    expect(quote.tip_cents).toBe(540);
    expect(quote.small_order_fee_cents).toBe(0);
    expect(quote.delivery_fee_cents).toBeGreaterThanOrEqual(199);
    expect(quote.delivery_fee_cents).toBeLessThanOrEqual(549);
    expect(Math.abs(quote.total_cents - 5285)).toBeLessThanOrEqual(300);
  });

  it('Uber Eats: exact components, total within band of $53.18', () => {
    const quote = q(mkInput(), 'ubereats');
    expect(quote.subtotal_cents).toBe(3660);
    expect(quote.service_fee_cents).toBe(549);
    expect(quote.sales_tax_cents).toBe(311);
    expect(quote.tip_cents).toBe(549);
    expect(Math.abs(quote.total_cents - 5318)).toBeLessThanOrEqual(500);
  });

  it('Grubhub: 8% service fee makes it structurally cheapest', () => {
    const quote = q(mkInput(), 'grubhub');
    expect(quote.subtotal_cents).toBe(3540);
    expect(quote.service_fee_cents).toBe(283); // 8% of 35.40
    expect(quote.sales_tax_cents).toBe(301);
    expect(Math.abs(quote.total_cents - 5054)).toBeLessThanOrEqual(350);
  });

  it('every platform lands in the published +55–95% all-in band', () => {
    for (const p of ['doordash', 'ubereats', 'grubhub', 'postmates'] as const) {
      const quote = q(mkInput(), p);
      const allIn = quote.total_cents / 3000;
      expect(allIn, `${p} all-in ×${allIn.toFixed(2)}`).toBeGreaterThan(1.55);
      expect(allIn, `${p} all-in ×${allIn.toFixed(2)}`).toBeLessThan(1.95);
    }
  });

  it('total always equals the sum of its lines', () => {
    for (const p of ['doordash', 'ubereats', 'grubhub', 'postmates'] as const) {
      const quote = q(mkInput(), p);
      const sum = quote.lines.reduce((s, l) => s + l.amountCents, 0);
      expect(quote.total_cents).toBe(sum);
    }
  });
});

describe('Postmates ≈ Uber Eats (shared backend, cosmetic delta only)', () => {
  it('same item prices, near-identical totals', () => {
    const ue = q(mkInput(), 'ubereats');
    const pm = q(mkInput(), 'postmates');
    expect(pm.subtotal_cents).toBe(ue.subtotal_cents);
    expect(pm.service_fee_cents).toBe(ue.service_fee_cents);
    expect(Math.abs(pm.total_cents - ue.total_cents)).toBeLessThanOrEqual(100);
  });
});

describe('Grubhub $50+ fee waiver (Feb 2026 step function)', () => {
  it('waives BOTH delivery and service fees at $50+, for everyone', () => {
    const big = mkInput({
      lines: [{ item: mkItem({ doordash: 5200, ubereats: 5200, grubhub: 5100 }), qty: 1 }],
    });
    const quote = q(big, 'grubhub');
    expect(quote.delivery_fee_cents).toBe(0);
    expect(quote.service_fee_cents).toBe(0);
  });

  it('charges normal fees just under the threshold', () => {
    const under = mkInput({
      lines: [{ item: mkItem({ doordash: 4900, ubereats: 4900, grubhub: 4900 }), qty: 1 }],
    });
    const quote = q(under, 'grubhub');
    expect(quote.delivery_fee_cents).toBeGreaterThan(0);
    expect(quote.service_fee_cents).toBe(392); // 8% of 49.00
  });

  it('flips the winner on large carts', () => {
    const big = mkInput({
      lines: [{ item: mkItem({ doordash: 5500, ubereats: 5500, grubhub: 5500 }), qty: 1 }],
    });
    const gh = q(big, 'grubhub').total_cents;
    const dd = q(big, 'doordash').total_cents;
    const ue = q(big, 'ubereats').total_cents;
    expect(gh).toBeLessThan(dd);
    expect(gh).toBeLessThan(ue);
  });
});

describe('metro tax rules', () => {
  it('Seattle taxes delivery/service/small-order/regulatory fees', () => {
    const input = mkInput({ metro: FEE_RULES_V1.metros.seattle });
    const quote = q(input, 'ubereats');
    const feesPortion =
      quote.delivery_fee_cents + quote.service_fee_cents + quote.small_order_fee_cents;
    const taxableReg = quote.lines
      .filter((l) => l.kind === 'regulatory' && l.taxable)
      .reduce((s, l) => s + l.amountCents, 0);
    expect(quote.sales_tax_cents).toBe(
      Math.round(0.1035 * (quote.subtotal_cents + feesPortion + taxableReg))
    );
    expect(quote.regulatory_fees_cents).toBeGreaterThanOrEqual(499); // Local Operating Fee
  });

  it('LA folds DoorDash CA driver benefits into the service fee (no line)', () => {
    const input = mkInput({ metro: FEE_RULES_V1.metros.la });
    const quote = q(input, 'doordash');
    // 15% + 1.5% CA bump = 16.5% of 36.00 = 594
    expect(quote.service_fee_cents).toBe(594);
    expect(quote.lines.filter((l) => l.kind === 'regulatory')).toHaveLength(0);
  });

  it('NYC adds regulatory lines and taxes fees', () => {
    const input = mkInput({ metro: FEE_RULES_V1.metros.nyc });
    const quote = q(input, 'doordash');
    expect(quote.regulatory_fees_cents).toBe(199);
    const feesPortion =
      quote.delivery_fee_cents + quote.service_fee_cents + quote.small_order_fee_cents + 199;
    expect(quote.sales_tax_cents).toBe(Math.round(0.08875 * (quote.subtotal_cents + feesPortion)));
  });
});

describe('memberships', () => {
  it('DashPass: $0 delivery + 5% service, and savings match the toggle', () => {
    const without = q(mkInput(), 'doordash');
    const withPass = q(mkInput({ memberships: ['dashpass'] }), 'doordash');
    expect(withPass.delivery_fee_cents).toBe(0);
    expect(withPass.service_fee_cents).toBe(180); // 5% of 36.00
    expect(withPass.membershipApplied).toBe('dashpass');
    expect(withPass.total_cents).toBeLessThan(without.total_cents);
    expect(without.membershipSavingsCents).toBe(without.total_cents - withPass.total_cents);
    expect(withPass.membershipSavingsCents).toBe(without.total_cents - withPass.total_cents);
  });

  it('Uber One: $0 delivery + 10% discount line (capped)', () => {
    const quote = q(mkInput({ memberships: ['uber_one'] }), 'ubereats');
    expect(quote.delivery_fee_cents).toBe(0);
    expect(quote.discount_cents).toBe(366); // 10% of 36.60
    expect(quote.lines.find((l) => l.kind === 'discount')?.amountCents).toBe(-366);
    // tax applies to the discounted subtotal
    expect(quote.sales_tax_cents).toBe(Math.round(0.085 * (3660 - 366)));
  });

  it('Grubhub+ reduces the service fee ~30%', () => {
    const without = q(mkInput(), 'grubhub');
    const withPlus = q(mkInput({ memberships: ['grubhub_plus'] }), 'grubhub');
    expect(withPlus.delivery_fee_cents).toBe(0);
    expect(withPlus.service_fee_cents).toBeLessThan(without.service_fee_cents);
  });

  it('memberships below the eligibility minimum do nothing', () => {
    const small = mkInput({
      lines: [{ item: mkItem({ doordash: 1100, ubereats: 1100, grubhub: 1100 }), qty: 1 }],
      memberships: ['dashpass'],
    });
    const quote = q(small, 'doordash');
    expect(quote.delivery_fee_cents).toBeGreaterThan(0); // $11 < $12 DashPass minimum
  });
});

describe('small orders, distance, determinism, availability', () => {
  it('small-order fees hit under each platform threshold', () => {
    const small = mkInput({
      lines: [{ item: mkItem({ doordash: 950, ubereats: 950, grubhub: 950 }), qty: 1 }],
    });
    expect(q(small, 'doordash').small_order_fee_cents).toBe(250);
    expect(q(small, 'ubereats').small_order_fee_cents).toBe(200);
    expect(q(small, 'grubhub').small_order_fee_cents).toBe(200);
  });

  it('DoorDash distance bump raises service pct past 5 miles', () => {
    const far = mkInput({ restaurant: mkRestaurant({ distanceMiles: 6.5 }) });
    const quote = q(far, 'doordash');
    expect(quote.service_fee_cents).toBe(612); // 17% of 36.00
  });

  it('Uber Eats long-range fee applies past 7 miles', () => {
    const near = q(mkInput(), 'ubereats');
    const far = q(mkInput({ restaurant: mkRestaurant({ distanceMiles: 8.5 }) }), 'ubereats');
    expect(far.delivery_fee_cents - near.delivery_fee_cents).toBe(299);
  });

  it('same inputs → identical quote; daypart re-rolls Uber surge', () => {
    const a = q(mkInput(), 'ubereats');
    const b = q(mkInput(), 'ubereats');
    expect(a.total_cents).toBe(b.total_cents);
    const dinner = q(mkInput({ daypart: 'dinner' }), 'ubereats');
    expect(dinner.delivery_fee_cents).toBeGreaterThanOrEqual(a.delivery_fee_cents);
  });

  it('platform the restaurant is not on → unavailable', () => {
    const input = mkInput({
      restaurant: mkRestaurant({ platforms: ['ubereats', 'grubhub'] }),
    });
    expect(q(input, 'doordash').status).toBe('unavailable');
  });
});
