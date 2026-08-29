import type { Platform } from '../catalog/types';
import type { ProviderQuote, QuoteRequest } from './types';

/**
 * The swap seam. The UI only ever consumes ProviderQuote through this
 * interface — a live aggregator (MealMe) or a browser-extension adapter
 * drops in with zero component changes.
 */
export interface QuoteProvider {
  readonly id: 'simulation' | 'mealme';
  /** One promise per platform so the Compare screen can stream cards in. */
  quotePlatform(req: QuoteRequest, platform: Platform): Promise<ProviderQuote>;
  getQuotes(req: QuoteRequest): Promise<ProviderQuote[]>;
}

export class ProviderNotConfiguredError extends Error {
  constructor(providerId: string, detail: string) {
    super(`Quote provider "${providerId}" is not configured: ${detail}`);
    this.name = 'ProviderNotConfiguredError';
  }
}
