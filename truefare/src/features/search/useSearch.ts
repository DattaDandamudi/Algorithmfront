import { useMemo } from 'react';
import { getCatalog } from '../catalog/data/buildCatalog';
import type { MenuItem, Restaurant } from '../catalog/types';
import { BASE_SEARCH_OPTIONS, getSearchIndex } from './searchIndex';

export interface ItemHit {
  item: MenuItem;
  restaurant: Restaurant;
  terms: string[];
  /** A tag that matched when the name didn't — "matched: spicy". */
  matchedTag?: string;
}

export interface SearchResults {
  query: string;
  items: ItemHit[];
  restaurants: Restaurant[];
  suggestion: string | null;
  usedFuzzyFallback: boolean;
}

const EMPTY: SearchResults = {
  query: '',
  items: [],
  restaurants: [],
  suggestion: null,
  usedFuzzyFallback: false,
};

/**
 * Synchronous local search with the researched fallback chain:
 * strict AND → looser OR + wider fuzz → "did you mean" suggestion.
 */
export function searchCatalog(query: string, itemCap = 30): SearchResults {
  const q = query.trim();
  if (!q) return EMPTY;
  const index = getSearchIndex();
  const catalog = getCatalog();

  let hits = index.search(q);
  let usedFuzzyFallback = false;
  if (hits.length === 0) {
    hits = index.search(q, { ...BASE_SEARCH_OPTIONS, combineWith: 'OR', fuzzy: 0.35 });
    usedFuzzyFallback = true;
  }

  const suggestion =
    hits.length === 0 ? (index.autoSuggest(q)[0]?.suggestion ?? null) : null;

  const items: ItemHit[] = [];
  const restaurants: Restaurant[] = [];
  for (const hit of hits) {
    if (hit.type === 'restaurant') {
      const r = catalog.restaurantsById.get(hit.id as string);
      if (r && restaurants.length < 6) restaurants.push(r);
      continue;
    }
    if (items.length >= itemCap) continue;
    const item = catalog.itemsById.get(hit.id as string);
    const restaurant = item ? catalog.restaurantsById.get(item.restaurantId) : undefined;
    if (!item || !restaurant) continue;
    const matchedFields = new Set(Object.values(hit.match).flat());
    let matchedTag: string | undefined;
    if (!matchedFields.has('name') && matchedFields.has('tags')) {
      const terms = Object.keys(hit.match);
      matchedTag = item.tags.find((t) => terms.some((term) => t.includes(term)));
    }
    items.push({ item, restaurant, terms: hit.terms, matchedTag });
  }

  return { query: q, items, restaurants, suggestion, usedFuzzyFallback };
}

export function useSearch(query: string, itemCap = 30): SearchResults {
  return useMemo(() => searchCatalog(query, itemCap), [query, itemCap]);
}
