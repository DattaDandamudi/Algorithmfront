import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { MapPin, Minus, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { pageEnter, springs } from '../../design/motion';
import { formatCents } from '../../lib/money';
import { currentDaypart } from '../../lib/time';
import { AnimatedPrice } from '../../components/ui/AnimatedPrice';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { platformColors } from '../../design/tokens';
import { ALL_PLATFORMS } from '../catalog/types';
import { useCatalog } from '../catalog/useCatalog';
import { FEE_RULES_V1 } from '../pricing/rules/v1';
import { useQuotes } from '../pricing/useQuotes';
import type { QuoteRequest } from '../pricing/types';
import { effectiveMemberships, useProfileStore } from '../profile/store';
import { useCartStore } from '../cart/store';
import { comparator, okQuotes, savingsSpread, winnerOf, type CompareSort } from './savings';
import { QuoteCard } from './QuoteCard';
import { ItemDiffTable } from './ItemDiffTable';
import { TipSelector } from './TipSelector';

const SORT_LABEL: Record<CompareSort, string> = {
  cheapest: 'Cheapest',
  fastest: 'Fastest',
  best: 'Best value',
};

function EmptyCompare() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-5 text-center">
      <div className="blob blob-breathe h-24 w-24 bg-blush" />
      <div>
        <h1 className="text-3xl font-semibold">Nothing to compare yet</h1>
        <p className="mx-auto mt-2 max-w-sm text-muted">
          Build a cart from any restaurant and TrueFare will price it on every
          delivery app — fees, taxes and all.
        </p>
      </div>
      <Link
        to="/"
        className="rounded-pill bg-terracotta px-6 py-3 text-sm font-semibold text-[#FFF8EC] transition-colors hover:bg-terracotta-hover"
      >
        Find something good
      </Link>
    </div>
  );
}

export default function ComparePage() {
  const catalog = useCatalog();
  const navigate = useNavigate();
  const cartItems = useCartStore((s) => s.items);
  const restaurantId = useCartStore((s) => s.restaurantId);
  const increment = useCartStore((s) => s.increment);
  const decrement = useCartStore((s) => s.decrement);
  const remove = useCartStore((s) => s.remove);
  const metroId = useProfileStore((s) => s.metroId);
  const rawMemberships = useProfileStore((s) => s.memberships);
  const hasAmazonPrime = useProfileStore((s) => s.hasAmazonPrime);
  const memberships = useMemo(
    () => effectiveMemberships({ memberships: rawMemberships, hasAmazonPrime }),
    [rawMemberships, hasAmazonPrime]
  );

  const [tipPercent, setTipPercent] = useState(15);
  const [sort, setSort] = useState<CompareSort>('cheapest');
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshedAt, setRefreshedAt] = useState(() => new Date());
  // refreshKey is a deliberate dependency: refreshing re-reads the clock.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const daypart = useMemo(() => currentDaypart(), [refreshKey]);

  const restaurant = restaurantId ? catalog.restaurantsById.get(restaurantId) : null;

  const req: QuoteRequest | null = useMemo(() => {
    if (!restaurant || cartItems.length === 0) return null;
    return {
      restaurantId: restaurant.id,
      items: cartItems,
      metroId,
      memberships,
      tipPercent,
      daypart,
    };
  }, [restaurant, cartItems, metroId, memberships, tipPercent, daypart]);

  const { states, allSettled } = useQuotes(req, refreshKey);

  const quotes = states.map((s) => s.quote);
  const cheapest = winnerOf(quotes, 'cheapest');
  const sortWinner = winnerOf(quotes, sort);
  const spread = savingsSpread(quotes);

  const ordered = useMemo(() => {
    if (!allSettled) {
      return ALL_PLATFORMS.map((p) => states.find((s) => s.platform === p)!);
    }
    const ok = okQuotes(quotes);
    const cmp = comparator(sort, ok);
    return [...states].sort((a, b) => {
      const qa = a.quote;
      const qb = b.quote;
      if (!qa || qa.status !== 'ok') return 1;
      if (!qb || qb.status !== 'ok') return -1;
      return cmp(qa, qb);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allSettled, sort, states.map((s) => s.quote?.total_cents).join(',')]);

  if (!restaurant || cartItems.length === 0) return <EmptyCompare />;

  const metro = FEE_RULES_V1.metros[metroId];

  const refresh = () => {
    setRefreshKey((k) => k + 1);
    setRefreshedAt(new Date());
  };

  return (
    <motion.div {...pageEnter}>
      <header className="flex flex-wrap items-end justify-between gap-4 py-4">
        <div>
          <p className="label-caps">Comparing your cart from</p>
          <h1 className="mt-1 text-4xl font-semibold">{restaurant.name}</h1>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
            <Link
              to="/profile"
              className="inline-flex items-center gap-1 font-medium text-ink transition-colors hover:text-terracotta"
            >
              <MapPin size={13} aria-hidden="true" />
              {metro.label}
            </Link>
            <span aria-hidden="true">·</span>
            <span>
              Estimated · refreshed{' '}
              {refreshedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} ·
              rules {FEE_RULES_V1.version}
            </span>
            <button
              onClick={refresh}
              className="inline-flex items-center gap-1 font-medium text-terracotta transition-colors hover:text-terracotta-press"
            >
              <RefreshCw size={12} aria-hidden="true" /> Refresh
            </button>
          </div>
        </div>
        <SegmentedControl
          ariaLabel="Sort platforms"
          layoutId="sort-pill"
          options={(['cheapest', 'fastest', 'best'] as const).map((v) => ({
            value: v,
            label: SORT_LABEL[v],
          }))}
          value={sort}
          onChange={setSort}
        />
      </header>

      <AnimatePresence>
        {allSettled && spread > 0 && cheapest && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={springs.standard}
            className="mb-5 flex flex-wrap items-center gap-2 rounded-cell border border-sage/30 bg-pistachio/50 px-5 py-3.5"
          >
            <span className="text-[14px] text-ink">
              Ordering via{' '}
              <span className="font-semibold">{platformColors[cheapest.platform].label}</span>{' '}
              saves you
            </span>
            <AnimatedPrice
              cents={spread}
              className="text-[20px] font-bold text-savings"
            />
            <span className="text-[14px] text-ink">on this exact cart.</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mb-6">
        <TipSelector value={tipPercent} onChange={setTipPercent} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {ordered.map((state) => (
          <QuoteCard
            key={state.platform}
            state={state}
            restaurantName={restaurant.name}
            winner={allSettled && sortWinner?.platform === state.platform}
            winnerLabel={SORT_LABEL[sort]}
            deltaCents={
              allSettled && cheapest && state.quote?.status === 'ok'
                ? state.quote.total_cents - cheapest.total_cents
                : null
            }
            onCheckout={
              state.quote?.status === 'ok'
                ? () => navigate(`/checkout/${state.platform}`)
                : undefined
            }
          />
        ))}
      </div>

      <section className="mt-10" aria-labelledby="cart-heading">
        <h2 id="cart-heading" className="text-2xl font-semibold">
          Your cart
        </h2>
        <div className="mt-4 space-y-2">
          {cartItems.map(({ itemId, qty }) => {
            const item = catalog.itemsById.get(itemId);
            if (!item) return null;
            return (
              <div
                key={itemId}
                className="flex items-center justify-between gap-3 rounded-card border border-hairline bg-surface px-4 py-3 shadow-card"
              >
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium text-ink">{item.name}</p>
                  <p className="tabular text-[12px] text-muted">
                    from {formatCents(Math.min(...Object.values(item.platformPrices)))} on
                    the apps · {formatCents(item.basePriceCents)} in-store
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 rounded-pill border border-hairline p-1">
                    <button
                      aria-label={`Remove one ${item.name}`}
                      onClick={() => decrement(itemId)}
                      className="flex h-7 w-7 items-center justify-center rounded-pill text-muted transition-colors hover:bg-blush hover:text-ink"
                    >
                      <Minus size={14} />
                    </button>
                    <span className="tabular w-6 text-center text-[14px] font-semibold">
                      {qty}
                    </span>
                    <button
                      aria-label={`Add one ${item.name}`}
                      onClick={() => increment(itemId)}
                      className="flex h-7 w-7 items-center justify-center rounded-pill text-muted transition-colors hover:bg-blush hover:text-ink"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                  <button
                    aria-label={`Remove ${item.name}`}
                    onClick={() => remove(itemId)}
                    className="flex h-8 w-8 items-center justify-center rounded-pill text-muted transition-colors hover:bg-blush hover:text-terracotta"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <Link
          to={`/restaurant/${restaurant.id}`}
          className="mt-3 inline-block text-sm font-medium text-terracotta transition-colors hover:text-terracotta-press"
        >
          + Add more from {restaurant.name}
        </Link>
      </section>

      <section className="mt-10" aria-labelledby="diff-heading">
        <h2 id="diff-heading" className="text-2xl font-semibold">
          Item-by-item
        </h2>
        <p className="mb-4 mt-1 text-[13px] text-muted">
          The same dishes, four menus. Cheapest cell per row highlighted.
        </p>
        <ItemDiffTable catalog={catalog} restaurant={restaurant} items={cartItems} />
      </section>

      {metro.note && <p className="mt-6 text-[12px] italic text-muted">{metro.note}</p>}
    </motion.div>
  );
}
