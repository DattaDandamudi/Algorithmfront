import { useQuery } from '@tanstack/react-query';
import { getCatalog } from './data/buildCatalog';
import type { Catalog } from './types';

/**
 * The catalog is bundled and built once (lazy singleton), but exposed
 * through TanStack Query so a future remote catalog (or MealMe menu
 * fetch) slots in behind the same hook with zero component changes.
 */
export function useCatalog(): Catalog {
  const { data } = useQuery({
    queryKey: ['catalog'],
    queryFn: () => getCatalog(),
    staleTime: Infinity,
    gcTime: Infinity,
  });
  return data ?? getCatalog();
}
