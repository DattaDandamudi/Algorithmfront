import type { MealPeriod } from '../../lib/time';

export type Platform = 'doordash' | 'ubereats' | 'grubhub' | 'postmates';
/** Postmates runs on the Uber Eats backend — its item prices resolve to ubereats. */
export type CorePlatform = Exclude<Platform, 'postmates'>;

export const ALL_PLATFORMS: Platform[] = ['doordash', 'ubereats', 'grubhub', 'postmates'];

export type Dietary = 'vegetarian' | 'vegan' | 'gluten-free' | 'halal' | 'dairy-free';

/** Keys into the hand-drawn food illustration set (components/food/FoodGlyphs). */
export type GlyphKey =
  | 'bowl'
  | 'burger'
  | 'pizza'
  | 'sushi'
  | 'ramen'
  | 'taco'
  | 'burrito'
  | 'coffee'
  | 'pancakes'
  | 'croissant'
  | 'sandwich'
  | 'salad'
  | 'curry'
  | 'drumstick'
  | 'wings'
  | 'icecream'
  | 'cake'
  | 'dumpling'
  | 'noodles'
  | 'skewer'
  | 'toast'
  | 'soup'
  | 'fries'
  | 'donut'
  | 'fish'
  | 'wrap'
  | 'cookie'
  | 'pie'
  | 'boba'
  | 'egg';

export type MetroId = 'nyc' | 'la' | 'sf' | 'seattle' | 'chicago' | 'austin' | 'denver';

export type MembershipId = 'dashpass' | 'uber_one' | 'grubhub_plus';

export interface Restaurant {
  id: string;
  name: string;
  cuisine: string;
  tagline: string;
  glyph: GlyphKey;
  rating: number; // 3.6–4.9
  priceLevel: 1 | 2 | 3;
  distanceMiles: number; // 0.6–9.5; drives delivery / long-range fees
  baseEtaMinutes: number; // 18–35
  platforms: Platform[]; // most carry all 4; a few miss one
  /** Per-restaurant menu markup vs in-store, in basis points per platform. */
  markupBps: Record<CorePlatform, number>;
}

export interface MenuItem {
  id: string;
  restaurantId: string;
  name: string;
  description: string;
  glyph: GlyphKey;
  /** "In-store" reference price. */
  basePriceCents: number;
  /** Materialized by buildCatalog: psychRound(base × (1 + markup)). */
  platformPrices: Record<CorePlatform, number>;
  tags: string[];
  dietary: Dietary[];
  mealPeriods: MealPeriod[];
  popularity: number; // 0–1 seed
}

export interface Catalog {
  restaurants: Restaurant[];
  items: MenuItem[];
  itemsById: Map<string, MenuItem>;
  restaurantsById: Map<string, Restaurant>;
  itemsByRestaurant: Map<string, MenuItem[]>;
}

export interface CartItem {
  itemId: string;
  qty: number;
}

export interface Cart {
  restaurantId: string;
  items: CartItem[];
}

/** Resolve the platform whose price vector an item uses. */
export function corePlatformOf(platform: Platform): CorePlatform {
  return platform === 'postmates' ? 'ubereats' : platform;
}
