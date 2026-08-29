import { createRng } from '../../lib/rng';
import { getCatalog } from '../catalog/data/buildCatalog';
import { ALL_PLATFORMS, type Platform } from '../catalog/types';
import { computeQuote } from './engine';
import { FEE_RULES_V1, resolveMetro } from './rules/v1';
import type { QuoteProvider } from './QuoteProvider';
import type { ProviderQuote, QuoteInput, QuoteRequest } from './types';

function resolveInput(req: QuoteRequest): QuoteInput {
  const catalog = getCatalog();
  const restaurant = catalog.restaurantsById.get(req.restaurantId);
  if (!restaurant) throw new Error(`Unknown restaurant ${req.restaurantId}`);
  const lines = req.items.map(({ itemId, qty }) => {
    const item = catalog.itemsById.get(itemId);
    if (!item) throw new Error(`Unknown item ${itemId}`);
    return { item, qty };
  });
  const metro = resolveMetro(req.metroId);
  return {
    restaurant,
    lines,
    metro,
    memberships: req.memberships,
    tipPercent: req.tipPercent,
    daypart: req.daypart,
  };
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Runs the deterministic engine behind a seeded 450–900ms per-platform
 * stagger, so the Compare screen's cards resolve one by one the way live
 * network quotes would.
 */
export class SimulationQuoteProvider implements QuoteProvider {
  readonly id = 'simulation' as const;

  constructor(private opts: { instant?: boolean } = {}) {}

  async quotePlatform(req: QuoteRequest, platform: Platform): Promise<ProviderQuote> {
    const input = resolveInput(req);
    if (!this.opts.instant) {
      const latencyRng = createRng(
        `latency:${platform}:${req.restaurantId}:${req.items.length}:${req.daypart}`
      );
      await delay(latencyRng.range(450, 900));
    }
    return computeQuote(FEE_RULES_V1, input, platform);
  }

  getQuotes(req: QuoteRequest): Promise<ProviderQuote[]> {
    return Promise.all(ALL_PLATFORMS.map((p) => this.quotePlatform(req, p)));
  }
}

let active: QuoteProvider | null = null;

/**
 * Provider registry. Swap in a MealMeQuoteProvider here (behind an env
 * key) and every screen keeps working unchanged.
 */
export function getQuoteProvider(): QuoteProvider {
  if (!active) active = new SimulationQuoteProvider();
  return active;
}

export function setQuoteProvider(provider: QuoteProvider): void {
  active = provider;
}
