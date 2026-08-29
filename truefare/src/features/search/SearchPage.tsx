import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { Search, X } from 'lucide-react';
import { pageEnter, staggerParent, riseChild } from '../../design/motion';
import { currentDaypart, DAYPART_LABEL } from '../../lib/time';
import { Chip } from '../../components/ui/Chip';
import { getCatalog } from '../catalog/data/buildCatalog';
import { useCatalog } from '../catalog/useCatalog';
import { RestaurantCard } from '../catalog/components/RestaurantCard';
import { MenuItemRow } from '../catalog/components/MenuItemRow';
import { useCartStore } from '../cart/store';
import { flyToCart } from '../cart/CartBar';
import { logEvent } from '../recommendations/events';
import type { MenuItem } from '../catalog/types';
import { useSearch } from './useSearch';
import { useSearchStore } from './recentStore';
import { highlight } from './highlight';

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const navigate = useNavigate();
  const catalog = useCatalog();
  const addToCart = useCartStore((s) => s.add);
  const recent = useSearchStore((s) => s.recent);
  const removeRecent = useSearchStore((s) => s.removeRecent);
  const addRecent = useSearchStore((s) => s.addRecent);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce only the URL sync — search itself is instant and local.
  useEffect(() => {
    const t = setTimeout(() => {
      const current = params.get('q') ?? '';
      if (query !== current) {
        setParams(query ? { q: query } : {}, { replace: true });
      }
    }, 150);
    return () => clearTimeout(t);
  }, [query, params, setParams]);

  const results = useSearch(query, 60);
  const daypart = currentDaypart();

  const popular = useMemo(() => {
    const c = getCatalog();
    return [...c.items]
      .map((item) => ({
        item,
        score: item.popularity * (item.mealPeriods.includes(daypart) ? 1 : 0.3),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
  }, [daypart]);

  const cuisines = useMemo(
    () => [...new Set(getCatalog().restaurants.map((r) => r.cuisine))],
    []
  );

  const onAdd = (item: MenuItem, fromEl: HTMLElement) => {
    if (addToCart(item.restaurantId, item.id)) {
      flyToCart(fromEl);
      logEvent(item.id, item.restaurantId, 'add_to_cart');
    }
  };

  const onOpen = (item: MenuItem) => {
    if (query.trim()) {
      addRecent(query);
      logEvent(item.id, item.restaurantId, 'search_click');
    }
    navigate(`/restaurant/${item.restaurantId}`);
  };

  const hasQuery = query.trim().length > 0;
  const noResults = hasQuery && results.items.length === 0 && results.restaurants.length === 0;

  return (
    <motion.div {...pageEnter}>
      <div className="mx-auto max-w-2xl py-4">
        <div className="relative">
          <Search
            size={19}
            className="absolute left-5 top-1/2 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tacos, ramen, something sweet…"
            aria-label="Search dishes and restaurants"
            className="h-14 w-full rounded-pill border border-hairline bg-surface pl-12 pr-12 text-[16px] text-ink shadow-card outline-none transition-colors placeholder:text-muted/60 focus:border-terracotta"
          />
          {hasQuery && (
            <button
              aria-label="Clear search"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="absolute right-4 top-1/2 -translate-y-1/2 rounded-pill p-1.5 text-muted transition-colors hover:bg-blush hover:text-ink"
            >
              <X size={16} />
            </button>
          )}
        </div>
        <p className="mt-2 text-center text-[12px] text-muted" aria-live="polite">
          {hasQuery
            ? `${results.items.length} dishes · ${results.restaurants.length} restaurants${results.usedFuzzyFallback && results.items.length > 0 ? ' · showing close matches' : ''}`
            : 'Instant — every keystroke searches the whole menu catalog'}
        </p>
      </div>

      {!hasQuery && (
        <div className="mx-auto max-w-3xl">
          {recent.length > 0 && (
            <section className="mb-8">
              <h2 className="label-caps mb-3">Recent</h2>
              <div className="flex flex-wrap gap-2">
                {recent.map((r) => (
                  <span key={r} className="inline-flex items-center">
                    <Chip onClick={() => setQuery(r)}>{r}</Chip>
                    <button
                      aria-label={`Remove ${r}`}
                      onClick={() => removeRecent(r)}
                      className="-ml-1.5 rounded-pill p-1 text-muted hover:text-ink"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            </section>
          )}

          <section className="mb-8">
            <h2 className="label-caps mb-3">Cuisines</h2>
            <div className="flex flex-wrap gap-2">
              {cuisines.map((c) => (
                <Chip key={c} tone="sage" onClick={() => setQuery(c.toLowerCase())}>
                  {c}
                </Chip>
              ))}
            </div>
          </section>

          <section>
            <h2 className="label-caps mb-3">Popular this {DAYPART_LABEL[daypart]}</h2>
            <motion.div
              variants={staggerParent}
              initial="hidden"
              animate="show"
              className="grid gap-3 md:grid-cols-2"
            >
              {popular.map(({ item }) => {
                const restaurant = catalog.restaurantsById.get(item.restaurantId)!;
                return (
                  <motion.div key={item.id} variants={riseChild}>
                    <MenuItemRow
                      item={item}
                      restaurant={restaurant}
                      onAdd={onAdd}
                      onOpen={onOpen}
                    />
                  </motion.div>
                );
              })}
            </motion.div>
          </section>
        </div>
      )}

      {noResults && (
        <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-10 text-center">
          <div className="blob blob-breathe h-20 w-20 bg-blush" />
          <p className="text-[15px] text-ink">
            No matches for <span className="font-semibold">“{results.query}”</span>.
          </p>
          {results.suggestion && (
            <button
              onClick={() => setQuery(results.suggestion!)}
              className="font-medium text-terracotta transition-colors hover:text-terracotta-press"
            >
              Did you mean “{results.suggestion}”?
            </button>
          )}
          <div className="mt-2 w-full text-left">
            <h2 className="label-caps mb-3 text-center">Popular instead</h2>
            <div className="space-y-3">
              {popular.slice(0, 3).map(({ item }) => {
                const restaurant = catalog.restaurantsById.get(item.restaurantId)!;
                return (
                  <MenuItemRow
                    key={item.id}
                    item={item}
                    restaurant={restaurant}
                    onAdd={onAdd}
                    onOpen={onOpen}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}

      {hasQuery && results.restaurants.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-2xl font-semibold">Restaurants</h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {results.restaurants.map((r) => (
              <RestaurantCard key={r.id} restaurant={r} />
            ))}
          </div>
        </section>
      )}

      {hasQuery && results.items.length > 0 && (
        <section>
          <h2 className="mb-3 text-2xl font-semibold">Dishes</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {results.items.map(({ item, restaurant, terms, matchedTag }) => (
              <div key={item.id} className="relative">
                <MenuItemRow item={item} restaurant={restaurant} onAdd={onAdd} onOpen={onOpen} />
                {matchedTag && (
                  <span className="absolute right-3 top-3 rounded-pill bg-saffron/20 px-2 py-0.5 text-[11px] font-medium text-ink">
                    matched: {highlight(matchedTag, terms)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </motion.div>
  );
}
