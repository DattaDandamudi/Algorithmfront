import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Command } from 'cmdk';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowRight,
  Clock3,
  MapPin,
  Moon,
  Scale,
  Search,
  Store,
  TrendingUp,
  X,
} from 'lucide-react';
import { formatCents } from '../../lib/money';
import { currentDaypart } from '../../lib/time';
import { FoodImage } from '../../components/food/FoodImage';
import { getCatalog } from '../catalog/data/buildCatalog';
import { useCartStore } from '../cart/store';
import { useProfileStore } from '../profile/store';
import { logEvent } from '../recommendations/events';
import { getSearchIndex } from './searchIndex';
import { useSearch } from './useSearch';
import { useSearchStore } from './recentStore';
import { highlight } from './highlight';

const itemCls =
  'flex cursor-pointer items-center gap-3 rounded-control px-3 py-2.5 text-[14px] text-ink aria-selected:bg-blush';

export function CommandPalette() {
  const open = useSearchStore((s) => s.paletteOpen);
  const setOpen = useSearchStore((s) => s.setPaletteOpen);
  const recent = useSearchStore((s) => s.recent);
  const addRecent = useSearchStore((s) => s.addRecent);
  const removeRecent = useSearchStore((s) => s.removeRecent);
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const results = useSearch(query, 8);
  const cartCountValue = useCartStore((s) => s.items.length);
  const theme = useProfileStore((s) => s.theme);
  const setTheme = useProfileStore((s) => s.setTheme);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(!open);
      }
      if (e.key === 'Escape' && open) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const daypart = currentDaypart();
  const popular = useMemo(() => {
    const catalog = getCatalog();
    return [...catalog.items]
      .map((item) => ({
        item,
        score: item.popularity * (item.mealPeriods.includes(daypart) ? 1 : 0.3),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(({ item }) => ({
        item,
        restaurant: catalog.restaurantsById.get(item.restaurantId)!,
      }));
  }, [daypart]);

  const suggestions = useMemo(
    () => (query.trim() ? getSearchIndex().autoSuggest(query).slice(0, 3) : []),
    [query]
  );

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  const openItem = (itemId: string, restaurantId: string) => {
    if (query.trim()) addRecent(query);
    logEvent(itemId, restaurantId, 'search_click');
    go(`/restaurant/${restaurantId}`);
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[75] flex items-start justify-center px-4 pt-[12vh]">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-[#2B2119]/40"
            onClick={() => setOpen(false)}
          />
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="relative w-full max-w-xl overflow-hidden rounded-cell border border-hairline bg-surface shadow-cardHover"
          >
            <Command loop shouldFilter={false} label="Search TrueFare">
              <div className="flex items-center gap-2.5 border-b border-hairline px-4">
                <Search size={17} className="shrink-0 text-muted" aria-hidden="true" />
                <Command.Input
                  value={query}
                  onValueChange={setQuery}
                  placeholder="Search dishes, restaurants, cravings…"
                  className="h-14 w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-muted/60"
                />
                <kbd className="rounded-md border border-hairline px-1.5 py-0.5 text-[11px] text-muted">
                  esc
                </kbd>
              </div>
              <Command.List className="max-h-[46vh] overflow-y-auto p-2">
                <Command.Empty className="px-3 py-8 text-center text-[14px] text-muted">
                  No matches for “{query}”.
                  {results.suggestion && (
                    <button
                      onClick={() => setQuery(results.suggestion!)}
                      className="ml-1.5 font-medium text-terracotta"
                    >
                      Did you mean {results.suggestion}?
                    </button>
                  )}
                </Command.Empty>

                {!query.trim() && recent.length > 0 && (
                  <Command.Group
                    heading={<GroupHeading icon={<Clock3 size={12} />} text="Recent" />}
                  >
                    {recent.map((r) => (
                      <Command.Item
                        key={`recent-${r}`}
                        value={`recent-${r}`}
                        onSelect={() => setQuery(r)}
                        className={itemCls}
                      >
                        <span className="flex-1">{r}</span>
                        <button
                          aria-label={`Remove ${r} from recent searches`}
                          onClick={(e) => {
                            e.stopPropagation();
                            removeRecent(r);
                          }}
                          className="rounded-pill p-1 text-muted hover:text-ink"
                        >
                          <X size={13} />
                        </button>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}

                {!query.trim() && (
                  <Command.Group
                    heading={
                      <GroupHeading icon={<TrendingUp size={12} />} text="Popular right now" />
                    }
                  >
                    {popular.map(({ item, restaurant }) => (
                      <Command.Item
                        key={item.id}
                        value={item.id}
                        onSelect={() => openItem(item.id, restaurant.id)}
                        className={itemCls}
                      >
                        <FoodImage
                          glyph={item.glyph}
                          seed={item.id}
                          className="h-9 w-9 shrink-0 rounded-[10px]"
                          still
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{item.name}</span>
                          <span className="block truncate text-[12px] text-muted">
                            {restaurant.name}
                          </span>
                        </span>
                        <span className="tabular text-[12px] text-muted">
                          from {formatCents(Math.min(...Object.values(item.platformPrices)))}
                        </span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}

                {query.trim() && suggestions.length > 0 && (
                  <Command.Group heading={<GroupHeading text="Suggestions" />}>
                    {suggestions.map((s) => (
                      <Command.Item
                        key={`sugg-${s.suggestion}`}
                        value={`sugg-${s.suggestion}`}
                        onSelect={() => setQuery(s.suggestion)}
                        className={itemCls}
                      >
                        <Search size={14} className="text-muted" aria-hidden="true" />
                        {s.suggestion}
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}

                {results.items.length > 0 && (
                  <Command.Group heading={<GroupHeading text="Dishes" />}>
                    {results.items.map(({ item, restaurant, terms }) => (
                      <Command.Item
                        key={item.id}
                        value={item.id}
                        onSelect={() => openItem(item.id, restaurant.id)}
                        className={itemCls}
                      >
                        <FoodImage
                          glyph={item.glyph}
                          seed={item.id}
                          className="h-9 w-9 shrink-0 rounded-[10px]"
                          still
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">
                            {highlight(item.name, terms)}
                          </span>
                          <span className="block truncate text-[12px] text-muted">
                            {restaurant.name} · {restaurant.cuisine}
                          </span>
                        </span>
                        <span className="tabular text-[12px] text-muted">
                          from {formatCents(Math.min(...Object.values(item.platformPrices)))}
                        </span>
                      </Command.Item>
                    ))}
                    <Command.Item
                      value="see-all"
                      onSelect={() => {
                        addRecent(query);
                        go(`/search?q=${encodeURIComponent(query)}`);
                      }}
                      className={itemCls}
                    >
                      <ArrowRight size={14} className="text-terracotta" aria-hidden="true" />
                      <span className="font-medium text-terracotta">
                        See all results for “{query}”
                      </span>
                    </Command.Item>
                  </Command.Group>
                )}

                {results.restaurants.length > 0 && (
                  <Command.Group heading={<GroupHeading text="Restaurants" />}>
                    {results.restaurants.map((r) => (
                      <Command.Item
                        key={r.id}
                        value={r.id}
                        onSelect={() => go(`/restaurant/${r.id}`)}
                        className={itemCls}
                      >
                        <Store size={15} className="text-muted" aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">
                            {highlight(r.name, results.items.length ? [] : [query])}
                          </span>
                          <span className="block truncate text-[12px] text-muted">
                            {r.cuisine} · {r.tagline}
                          </span>
                        </span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}

                <Command.Group heading={<GroupHeading text="Actions" />}>
                  {cartCountValue > 0 && (
                    <Command.Item value="action-compare" onSelect={() => go('/compare')} className={itemCls}>
                      <Scale size={15} className="text-muted" aria-hidden="true" />
                      Compare my cart across platforms
                    </Command.Item>
                  )}
                  <Command.Item value="action-city" onSelect={() => go('/profile')} className={itemCls}>
                    <MapPin size={15} className="text-muted" aria-hidden="true" />
                    Change city & memberships
                  </Command.Item>
                  <Command.Item
                    value="action-theme"
                    onSelect={() => {
                      setTheme(theme === 'dark' ? 'light' : 'dark');
                      setOpen(false);
                    }}
                    className={itemCls}
                  >
                    <Moon size={15} className="text-muted" aria-hidden="true" />
                    Toggle dark mode
                  </Command.Item>
                </Command.Group>
              </Command.List>
            </Command>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}

function GroupHeading({ icon, text }: { icon?: React.ReactNode; text: string }) {
  return (
    <span className="mb-1 mt-2 flex items-center gap-1.5 px-3 text-[11px] font-semibold uppercase tracking-label text-muted">
      {icon}
      {text}
    </span>
  );
}
