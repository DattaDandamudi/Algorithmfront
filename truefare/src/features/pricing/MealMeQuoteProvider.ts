import { ALL_PLATFORMS, type Platform } from '../catalog/types';
import { ProviderNotConfiguredError, type QuoteProvider } from './QuoteProvider';
import type { ProviderQuote, QuoteRequest } from './types';

/**
 * Typed stub proving the real-data swap seam. MealMe's Create Order call
 * with `place_order: false` returns a `final_quote` with exactly the fee
 * fields TrueFare renders; `mapFinalQuote` shows the full mapping, and
 * the class throws until an API key + backend proxy exist. Activating
 * real quotes is: implement `fetchFinalQuote`, register this provider —
 * zero UI changes.
 */

/** Shape of MealMe's documented final_quote (docs.mealme.ai/docs/create-order). */
export interface MealMeFinalQuote {
  subtotal: number;
  delivery_fee_cents: number;
  service_fee_cents: number;
  small_order_fee_cents: number;
  sales_tax_cents: number;
  total_without_tips: number;
  total_with_tip: number;
  quote_expected_time_of_arrival?: string;
}

export function mapFinalQuote(
  platform: Platform,
  q: MealMeFinalQuote,
  tipCents: number,
  etaMinutes: { min: number; max: number }
): ProviderQuote {
  return {
    platform,
    status: 'ok',
    subtotal_cents: q.subtotal,
    delivery_fee_cents: q.delivery_fee_cents,
    service_fee_cents: q.service_fee_cents,
    small_order_fee_cents: q.small_order_fee_cents,
    regulatory_fees_cents: 0, // MealMe folds regulatory fees into service/delivery
    discount_cents: 0,
    sales_tax_cents: q.sales_tax_cents,
    tip_cents: tipCents,
    total_cents: q.total_with_tip,
    lines: [
      { id: 'subtotal', label: 'Subtotal', amountCents: q.subtotal, kind: 'subtotal', taxable: true },
      { id: 'delivery', label: 'Delivery fee', amountCents: q.delivery_fee_cents, kind: 'fee', taxable: false },
      { id: 'service', label: 'Service fee', amountCents: q.service_fee_cents, kind: 'fee', taxable: false },
      ...(q.small_order_fee_cents > 0
        ? [{ id: 'small-order', label: 'Small order fee', amountCents: q.small_order_fee_cents, kind: 'fee' as const, taxable: false }]
        : []),
      { id: 'tax', label: 'Sales tax', amountCents: q.sales_tax_cents, kind: 'tax', taxable: false },
      { id: 'tip', label: 'Tip', amountCents: tipCents, kind: 'tip', taxable: false },
    ],
    etaMinutes,
    membershipApplied: null,
    membershipSavingsCents: 0,
    meta: {
      estimated: true,
      rulesVersion: 'mealme-live',
      generatedAt: new Date().toISOString(),
      seedKey: 'live',
    },
  };
}

export class MealMeQuoteProvider implements QuoteProvider {
  readonly id = 'mealme' as const;

  constructor(private apiKey?: string) {}

  async quotePlatform(_req: QuoteRequest, platform: Platform): Promise<ProviderQuote> {
    if (!this.apiKey) {
      throw new ProviderNotConfiguredError(
        this.id,
        'set a MealMe API key (Id-Token header) behind a backend proxy, then implement fetchFinalQuote()'
      );
    }
    // Real implementation: POST /order with place_order=false via your
    // backend proxy, then `return mapFinalQuote(platform, res.final_quote, …)`.
    throw new ProviderNotConfiguredError(this.id, `fetchFinalQuote not implemented (${platform})`);
  }

  getQuotes(req: QuoteRequest): Promise<ProviderQuote[]> {
    return Promise.all(ALL_PLATFORMS.map((p) => this.quotePlatform(req, p)));
  }
}
