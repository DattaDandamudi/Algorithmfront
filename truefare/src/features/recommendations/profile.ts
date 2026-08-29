import type { TrackedEvent } from '../../lib/datastore/types';
import type { MealPeriod } from '../../lib/time';
import type { Catalog } from '../catalog/types';
import { DECAY_HALF_LIFE_DAYS, EVENT_WEIGHTS } from './constants';

/**
 * The taste vector: behavioral events folded into decayed affinity maps.
 * Pure function of (events, catalog, clock) — rebuilt on the fly, never
 * stored, so weight changes apply retroactively.
 */
export interface TasteProfile {
  /** Normalized to max=1 so score components stay comparable. */
  tagAffinity: Map<string, number>;
  cuisineAffinity: Map<string, number>;
  priceMedianCents: number | null;
  priceSigmaCents: number;
  daypartHist: Map<MealPeriod, number>;
  /** Per-item order history for the reorder row. */
  orderHistory: Map<string, { count: number; lastAt: number }>;
  orderedCuisines: Set<string>;
  eventCount: number;
}

export function buildProfile(
  events: TrackedEvent[],
  catalog: Catalog,
  now = Date.now()
): TasteProfile {
  const tagAffinity = new Map<string, number>();
  const cuisineAffinity = new Map<string, number>();
  const daypartHist = new Map<MealPeriod, number>();
  const orderHistory = new Map<string, { count: number; lastAt: number }>();
  const orderedCuisines = new Set<string>();
  const orderedPrices: number[] = [];

  for (const event of events) {
    const item = catalog.itemsById.get(event.itemId);
    if (!item) continue;
    const restaurant = catalog.restaurantsById.get(item.restaurantId);
    const ageDays = Math.max(0, (now - new Date(event.at).getTime()) / 86_400_000);
    const w = EVENT_WEIGHTS[event.type] * Math.pow(0.5, ageDays / DECAY_HALF_LIFE_DAYS);

    for (const tag of item.tags) {
      tagAffinity.set(tag, (tagAffinity.get(tag) ?? 0) + w / item.tags.length);
    }
    if (restaurant) {
      cuisineAffinity.set(
        restaurant.cuisine,
        (cuisineAffinity.get(restaurant.cuisine) ?? 0) + w
      );
    }
    for (const period of item.mealPeriods) {
      daypartHist.set(period, (daypartHist.get(period) ?? 0) + w);
    }
    if (event.type === 'order') {
      const at = new Date(event.at).getTime();
      const prev = orderHistory.get(item.id);
      orderHistory.set(item.id, {
        count: (prev?.count ?? 0) + 1,
        lastAt: Math.max(prev?.lastAt ?? 0, at),
      });
      orderedPrices.push(item.platformPrices.ubereats);
      if (restaurant) orderedCuisines.add(restaurant.cuisine);
    }
  }

  normalizeToMax(tagAffinity);
  normalizeToMax(cuisineAffinity);

  let priceMedianCents: number | null = null;
  let priceSigmaCents = 600;
  if (orderedPrices.length > 0) {
    const sorted = [...orderedPrices].sort((a, b) => a - b);
    priceMedianCents = sorted[Math.floor(sorted.length / 2)];
    if (sorted.length > 1) {
      const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length;
      const variance =
        sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / sorted.length;
      priceSigmaCents = Math.max(400, Math.sqrt(variance));
    }
  }

  return {
    tagAffinity,
    cuisineAffinity,
    priceMedianCents,
    priceSigmaCents,
    daypartHist,
    orderHistory,
    orderedCuisines,
    eventCount: events.length,
  };
}

function normalizeToMax(map: Map<string, number>): void {
  let max = 0;
  for (const v of map.values()) max = Math.max(max, v);
  if (max <= 0) return;
  for (const [k, v] of map) map.set(k, v / max);
}
