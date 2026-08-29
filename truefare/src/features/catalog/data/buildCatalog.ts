import { psychRound } from '../../../lib/money';
import type { Catalog, CorePlatform, MenuItem, Restaurant } from '../types';
import { MENU_SEED } from './menu.seed';
import { GODAVARI_SEED } from './godavari.seed';
import { RESTAURANT_SEED } from './restaurants.seed';

/** The full item seed: base catalog plus modular extensions. */
const ALL_MENU_SEEDS = [...MENU_SEED, ...GODAVARI_SEED];

const CORE_PLATFORMS: CorePlatform[] = ['doordash', 'ubereats', 'grubhub'];

/**
 * Materialize the catalog: every item gets a per-platform price VECTOR
 * (the one schema decision that must be right on day one). App price =
 * psychRound(in-store price × (1 + restaurant markup)). Deterministic —
 * no randomness here, so the catalog is stable across sessions.
 */
let cached: Catalog | null = null;

/** Lazy singleton — stable references for hooks and the search index. */
export function getCatalog(): Catalog {
  if (!cached) cached = buildCatalog();
  return cached;
}

export function buildCatalog(): Catalog {
  const restaurantsById = new Map<string, Restaurant>(
    RESTAURANT_SEED.map((r) => [r.id, r])
  );

  const items: MenuItem[] = ALL_MENU_SEEDS.map((seed) => {
    const restaurant = restaurantsById.get(seed.restaurantId);
    if (!restaurant) {
      throw new Error(`Menu item ${seed.id} references unknown restaurant`);
    }
    const platformPrices = {} as Record<CorePlatform, number>;
    for (const platform of CORE_PLATFORMS) {
      const markup = restaurant.markupBps[platform];
      platformPrices[platform] = psychRound(
        Math.round(seed.basePriceCents * (1 + markup / 10_000))
      );
    }
    return { ...seed, platformPrices };
  });

  const itemsById = new Map(items.map((i) => [i.id, i]));
  const itemsByRestaurant = new Map<string, MenuItem[]>();
  for (const item of items) {
    const list = itemsByRestaurant.get(item.restaurantId) ?? [];
    list.push(item);
    itemsByRestaurant.set(item.restaurantId, list);
  }

  return {
    restaurants: RESTAURANT_SEED,
    items,
    itemsById,
    restaurantsById,
    itemsByRestaurant,
  };
}
