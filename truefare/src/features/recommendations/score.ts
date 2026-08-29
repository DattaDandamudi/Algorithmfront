import { createRng } from '../../lib/rng';
import { daypartDistance, type MealPeriod } from '../../lib/time';
import type { Dietary, MenuItem, Restaurant } from '../catalog/types';
import {
  COLD_START_WEIGHTS,
  DAYPART_FIT,
  SCORE_WEIGHTS,
  SESSION_BOOSTS,
} from './constants';
import type { TasteProfile } from './profile';

export interface ScoreContext {
  daypart: MealPeriod;
  /** Cross-user trending scores (0–1) or the seeded editorial fallback. */
  trending: Map<string, number>;
  /** Tags of the last few items the user viewed this session. */
  sessionTags: Set<string>;
  cartCuisines: Set<string>;
  dietary: Dietary[];
}

/** Hard filter — dietary prefs exclude, never rank down. */
export function violatesDietary(item: MenuItem, dietary: Dietary[]): boolean {
  return dietary.some((d) => !item.dietary.includes(d));
}

export function daypartFitOf(item: MenuItem, daypart: MealPeriod): number {
  if (item.mealPeriods.includes(daypart)) return DAYPART_FIT.exact;
  const min = Math.min(...item.mealPeriods.map((p) => daypartDistance(p, daypart)));
  return min === 1 ? DAYPART_FIT.adjacent : DAYPART_FIT.other;
}

function qualityOf(restaurant: Restaurant): number {
  return Math.max(0, Math.min(1, (restaurant.rating - 3.5) / 1.5));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const v of a) if (b.has(v)) inter++;
  return inter / (a.size + b.size - inter);
}

/** The master content-based score (see constants for the blend). */
export function scoreItem(
  item: MenuItem,
  restaurant: Restaurant,
  profile: TasteProfile,
  ctx: ScoreContext
): number {
  const tagAffinity =
    item.tags.reduce((s, t) => s + (profile.tagAffinity.get(t) ?? 0), 0) /
    Math.max(1, item.tags.length);
  const cuisineAffinity = profile.cuisineAffinity.get(restaurant.cuisine) ?? 0;
  const daypartFit = daypartFitOf(item, ctx.daypart);
  const priceFit =
    profile.priceMedianCents == null
      ? 0.5
      : Math.exp(
          -((item.platformPrices.ubereats - profile.priceMedianCents) ** 2) /
            (2 * profile.priceSigmaCents ** 2)
        );
  const popularity =
    0.5 * item.popularity + 0.5 * (ctx.trending.get(item.id) ?? item.popularity);

  const base =
    SCORE_WEIGHTS.tagAffinity * tagAffinity +
    SCORE_WEIGHTS.cuisineAffinity * cuisineAffinity +
    SCORE_WEIGHTS.daypartFit * daypartFit +
    SCORE_WEIGHTS.priceFit * priceFit +
    SCORE_WEIGHTS.popularity * popularity +
    SCORE_WEIGHTS.quality * qualityOf(restaurant);

  const sessionBoost =
    SESSION_BOOSTS.viewedTagJaccard * jaccard(new Set(item.tags), ctx.sessionTags) +
    (ctx.cartCuisines.has(restaurant.cuisine) ? SESSION_BOOSTS.cartCuisine : 0);

  return base + sessionBoost;
}

export function coldStartScore(
  item: MenuItem,
  restaurant: Restaurant,
  ctx: ScoreContext
): number {
  return (
    COLD_START_WEIGHTS.popularity * item.popularity +
    COLD_START_WEIGHTS.daypartFit * daypartFitOf(item, ctx.daypart) +
    COLD_START_WEIGHTS.trending * (ctx.trending.get(item.id) ?? item.popularity) +
    COLD_START_WEIGHTS.quality * qualityOf(restaurant)
  );
}

/** Item-item similarity for "Because you viewed" (tags ∪ cuisine Jaccard). */
export function itemSimilarity(
  a: MenuItem,
  aCuisine: string,
  b: MenuItem,
  bCuisine: string
): number {
  return jaccard(new Set([...a.tags, aCuisine]), new Set([...b.tags, bCuisine]));
}

/**
 * Seeded editorial trending — the guest-mode stand-in for the cross-user
 * Supabase view. Rotates hourly so the row stays alive.
 */
export function seededTrending(
  itemIds: string[],
  popularityOf: (id: string) => number,
  hourStamp: number
): Map<string, number> {
  const map = new Map<string, number>();
  for (const id of itemIds) {
    const rng = createRng(`trend:${id}:${hourStamp}`);
    map.set(id, Math.min(1, 0.55 * popularityOf(id) + 0.45 * rng.next()));
  }
  return map;
}
