import type { EventType } from '../../lib/datastore/types';

/**
 * Every tunable number in the recommendation system lives here.
 * Adjusting the feed is a data change, not a code hunt.
 */

export const EVENT_WEIGHTS: Record<EventType, number> = {
  view: 1,
  open: 2,
  search_click: 2,
  compare_view: 3,
  add_to_cart: 4,
  handoff: 8,
  order: 10,
};

/** Recency decay half-life for behavioral signals, in days. */
export const DECAY_HALF_LIFE_DAYS = 14;

/** Master score component weights (sum 1.0 before session boosts). */
export const SCORE_WEIGHTS = {
  tagAffinity: 0.3,
  cuisineAffinity: 0.2,
  daypartFit: 0.15,
  priceFit: 0.1,
  popularity: 0.15,
  quality: 0.1,
} as const;

export const SESSION_BOOSTS = {
  viewedTagJaccard: 0.2,
  cartCuisine: 0.15,
} as const;

/** Cold-start blend, used until the profile has enough signal. */
export const COLD_START_WEIGHTS = {
  popularity: 0.4,
  daypartFit: 0.3,
  trending: 0.2,
  quality: 0.1,
} as const;

/** Below this many events the profile is considered cold. */
export const COLD_START_EVENT_THRESHOLD = 5;

export const DAYPART_FIT = { exact: 1.0, adjacent: 0.4, other: 0.05 } as const;

export const DIVERSITY = {
  maxConsecutiveSameCuisine: 2,
  maxPerCuisinePerTen: 3,
} as const;

export const FEED = {
  maxRows: 8,
  rowMinItems: 4,
  rowMaxItems: 12,
} as const;
