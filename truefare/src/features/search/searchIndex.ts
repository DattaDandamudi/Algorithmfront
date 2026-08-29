import MiniSearch from 'minisearch';
import { getCatalog } from '../catalog/data/buildCatalog';

export interface SearchDoc {
  id: string;
  type: 'item' | 'restaurant';
  name: string;
  tags: string;
  cuisine: string;
  description: string;
  restaurantName: string;
}

/**
 * Module-level MiniSearch singleton (outside React). Tokenized full-text
 * with prefix + fuzzy typo tolerance and field boosting — searches the
 * whole catalog in single-digit milliseconds, no debounce needed.
 */
let mini: MiniSearch<SearchDoc> | null = null;

export const BASE_SEARCH_OPTIONS = {
  boost: { name: 3, tags: 2, cuisine: 1.5 },
  prefix: true,
  fuzzy: 0.2,
  combineWith: 'AND',
} as const;

export function getSearchIndex(): MiniSearch<SearchDoc> {
  if (mini) return mini;
  const catalog = getCatalog();
  mini = new MiniSearch<SearchDoc>({
    fields: ['name', 'tags', 'cuisine', 'description', 'restaurantName'],
    storeFields: ['id', 'type'],
    searchOptions: BASE_SEARCH_OPTIONS,
  });
  const docs: SearchDoc[] = [
    ...catalog.items.map((item) => {
      const r = catalog.restaurantsById.get(item.restaurantId);
      return {
        id: item.id,
        type: 'item' as const,
        name: item.name,
        tags: [...item.tags, ...item.dietary].join(' '),
        cuisine: r?.cuisine ?? '',
        description: item.description,
        restaurantName: r?.name ?? '',
      };
    }),
    ...catalog.restaurants.map((r) => ({
      id: r.id,
      type: 'restaurant' as const,
      name: r.name,
      tags: r.tagline,
      cuisine: r.cuisine,
      description: r.tagline,
      restaurantName: r.name,
    })),
  ];
  mini.addAll(docs);
  return mini;
}
