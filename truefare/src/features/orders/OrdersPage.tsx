import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { ChevronRight } from 'lucide-react';
import { pageEnter, staggerParent, riseChild } from '../../design/motion';
import { formatCents } from '../../lib/money';
import { FoodImage } from '../../components/food/FoodImage';
import { PlatformBadge } from '../../components/ui/PlatformBadge';
import { Button } from '../../components/ui/Button';
import { platformColors, platformAccentVar } from '../../design/tokens';
import type { OrderRecord } from '../../lib/datastore/types';
import { ALL_PLATFORMS } from '../catalog/types';
import { useCatalog } from '../catalog/useCatalog';
import { useCartStore } from '../cart/store';
import { useOrders } from './useOrders';
import { orderProgressOf, useOrderProgress } from './useOrderProgress';

function ActiveOrderCard({ order }: { order: OrderRecord }) {
  const catalog = useCatalog();
  const progress = useOrderProgress(order);
  const restaurant = catalog.restaurantsById.get(order.restaurantId);
  if (!progress) return null;
  return (
    <Link
      to={`/orders/${order.id}`}
      className="flex items-center gap-4 rounded-cell border border-sage/40 bg-pistachio/40 p-4 shadow-card transition-shadow hover:shadow-cardHover"
    >
      {restaurant && (
        <FoodImage
          glyph={restaurant.glyph}
          seed={order.id}
          className="h-16 w-16 shrink-0 rounded-control"
          still
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="label-caps text-savings">
          {progress.delivered ? 'Delivered' : progress.stage.label}
        </p>
        <p className="truncate text-[15px] font-semibold text-ink">{restaurant?.name}</p>
        <div className="mt-1.5 h-1 overflow-hidden rounded-pill bg-ink/10">
          <motion.div
            initial={false}
            animate={{ width: `${Math.round(progress.progress * 100)}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="h-full rounded-pill bg-sage"
          />
        </div>
      </div>
      <div className="shrink-0 text-right">
        {!progress.delivered && (
          <p className="tabular text-[13px] font-semibold text-ink">
            ~{progress.remainingMinutes} min
          </p>
        )}
        <ChevronRight size={16} className="ml-auto mt-1 text-muted" aria-hidden="true" />
      </div>
    </Link>
  );
}

export default function OrdersPage() {
  const orders = useOrders();
  const catalog = useCatalog();
  const setCart = useCartStore((s) => s.setCart);
  const navigate = useNavigate();

  const now = Date.now();
  const active = orders.filter((o) => !orderProgressOf(o, now).delivered);
  const past = orders.filter((o) => orderProgressOf(o, now).delivered);

  const spendByPlatform = ALL_PLATFORMS.map((p) => ({
    platform: p,
    total: orders.filter((o) => o.platform === p).reduce((s, o) => s + o.totalCents, 0),
  })).filter((e) => e.total > 0);
  const maxSpend = Math.max(1, ...spendByPlatform.map((e) => e.total));

  const reorder = (order: OrderRecord) => {
    const valid = order.items.filter((i) => catalog.itemsById.has(i.itemId));
    if (!valid.length) return;
    setCart(order.restaurantId, valid);
    navigate('/compare');
  };

  if (orders.length === 0) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-5 text-center">
        <div className="blob blob-breathe h-24 w-24 bg-pistachio" />
        <div>
          <h1 className="text-3xl font-semibold">No orders yet</h1>
          <p className="mx-auto mt-2 max-w-sm text-muted">
            When you check out through TrueFare, live tracking and your savings
            history land here.
          </p>
        </div>
        <Link
          to="/"
          className="rounded-pill bg-terracotta px-6 py-3 text-sm font-semibold text-[#FFF8EC] transition-colors hover:bg-terracotta-hover"
        >
          Browse restaurants
        </Link>
      </div>
    );
  }

  return (
    <motion.div {...pageEnter}>
      <h1 className="py-4 text-4xl font-semibold">Orders</h1>

      {active.length > 0 && (
        <section className="mb-8 space-y-3" aria-label="Active orders">
          {active.map((o) => (
            <ActiveOrderCard key={o.id} order={o} />
          ))}
        </section>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <section aria-labelledby="past-orders">
          <h2 id="past-orders" className="text-2xl font-semibold">
            Past orders
          </h2>
          <motion.ul
            variants={staggerParent}
            initial="hidden"
            animate="show"
            className="mt-4 space-y-2"
          >
            {past.map((order) => {
              const restaurant = catalog.restaurantsById.get(order.restaurantId);
              return (
                <motion.li
                  key={order.id}
                  variants={riseChild}
                  className="flex items-center gap-4 rounded-card border border-hairline bg-surface p-4 shadow-card"
                >
                  {restaurant && (
                    <FoodImage
                      glyph={restaurant.glyph}
                      seed={order.id}
                      className="h-14 w-14 shrink-0 rounded-control"
                      still
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold text-ink">
                      {restaurant?.name}
                    </p>
                    <p className="mt-0.5 text-[12px] text-muted">
                      {new Date(order.placedAt).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                      })}{' '}
                      · {order.items.reduce((n, i) => n + i.qty, 0)} items ·{' '}
                      <PlatformBadge platform={order.platform} size="sm" compact />
                    </p>
                  </div>
                  <span className="tabular shrink-0 text-[15px] font-semibold text-ink">
                    {formatCents(order.totalCents)}
                  </span>
                  <Button size="sm" variant="secondary" onClick={() => reorder(order)}>
                    Reorder
                  </Button>
                </motion.li>
              );
            })}
            {past.length === 0 && (
              <p className="text-[14px] text-muted">Nothing delivered yet — watch the active order above.</p>
            )}
          </motion.ul>
        </section>

        {spendByPlatform.length > 0 && (
          <aside
            className="h-fit rounded-cell border border-hairline bg-surface p-6 shadow-card"
            aria-labelledby="spend-heading"
          >
            <h2 id="spend-heading" className="label-caps">
              Spend by platform
            </h2>
            <div className="mt-4 space-y-3">
              {spendByPlatform.map(({ platform, total }) => (
                <div key={platform}>
                  <div className="flex items-baseline justify-between text-[13px]">
                    <span className="font-medium text-ink">
                      {platformColors[platform].label}
                    </span>
                    <span className="tabular text-muted">{formatCents(total)}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-pill bg-ink/10">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(total / maxSpend) * 100}%` }}
                      transition={{ duration: 0.7, ease: 'easeOut' }}
                      className="h-full rounded-pill"
                      style={{ backgroundColor: platformAccentVar(platform) }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </aside>
        )}
      </div>
    </motion.div>
  );
}
