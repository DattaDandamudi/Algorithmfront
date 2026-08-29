import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowLeft, ChevronDown, MapPin, ReceiptText } from 'lucide-react';
import { pageEnter, springs } from '../../design/motion';
import { FoodImage } from '../../components/food/FoodImage';
import { PlatformBadge } from '../../components/ui/PlatformBadge';
import { Button } from '../../components/ui/Button';
import { platformColors } from '../../design/tokens';
import { useCatalog } from '../catalog/useCatalog';
import { useCartStore } from '../cart/store';
import { FeeBreakdown } from '../compare/FeeBreakdown';
import { useOrder } from './useOrders';
import { useOrderProgress } from './useOrderProgress';
import { StatusTimeline } from './StatusTimeline';

export default function OrderTrackingPage() {
  const { id } = useParams<{ id: string }>();
  const order = useOrder(id);
  const progress = useOrderProgress(order);
  const catalog = useCatalog();
  const setCart = useCartStore((s) => s.setCart);
  const navigate = useNavigate();
  const [receiptOpen, setReceiptOpen] = useState(false);

  if (!order || !progress) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
        <div className="blob blob-breathe h-16 w-16 bg-blush" />
        <p className="text-muted">We couldn't find that order.</p>
        <Link to="/orders" className="font-medium text-terracotta">
          All orders
        </Link>
      </div>
    );
  }

  const restaurant = catalog.restaurantsById.get(order.restaurantId);
  const reorder = () => {
    const valid = order.items.filter((i) => catalog.itemsById.has(i.itemId));
    if (!valid.length) return;
    setCart(order.restaurantId, valid);
    navigate('/compare');
  };

  return (
    <motion.div {...pageEnter} className="mx-auto max-w-3xl">
      <Link
        to="/orders"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft size={15} aria-hidden="true" /> All orders
      </Link>

      <div className="overflow-hidden rounded-cell border border-hairline bg-surface shadow-card">
        <div className="relative">
          {restaurant && (
            <FoodImage
              glyph={restaurant.glyph}
              seed={`track-${order.id}`}
              className="h-40 w-full"
              still
            />
          )}
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-[#2B2119]/55 to-transparent p-5">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-label text-[#FFF8EC]/80">
                {progress.delivered ? 'Delivered' : `Arriving in ~${progress.remainingMinutes} min`}
              </p>
              <h1 className="font-display text-2xl font-semibold text-[#FFF8EC]">
                {restaurant?.name ?? order.restaurantId}
              </h1>
            </div>
            <span className="rounded-pill bg-surface/90 px-3 py-1.5 backdrop-blur-sm">
              <PlatformBadge platform={order.platform} size="sm" />
            </span>
          </div>
        </div>

        <div className="p-6">
          {/* overall progress bar */}
          <div className="mb-6 h-1.5 overflow-hidden rounded-pill bg-ink/10">
            <motion.div
              initial={false}
              animate={{ width: `${Math.round(progress.progress * 100)}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              className="h-full rounded-pill bg-sage"
            />
          </div>

          <StatusTimeline progress={progress} />

          <div className="mt-6 flex items-start gap-2.5 rounded-card bg-blush/60 px-4 py-3 text-[13px] text-ink">
            <MapPin size={15} className="mt-0.5 shrink-0 text-terracotta" aria-hidden="true" />
            <span>
              <span className="font-semibold">{order.address.label}</span> ·{' '}
              {order.address.line1}, {order.address.city}
            </span>
          </div>

          <button
            onClick={() => setReceiptOpen((o) => !o)}
            aria-expanded={receiptOpen}
            className="mt-5 flex w-full items-center justify-between text-[14px] font-medium text-muted transition-colors hover:text-ink"
          >
            <span className="inline-flex items-center gap-2">
              <ReceiptText size={15} aria-hidden="true" />
              Receipt · {order.items.length} {order.items.length === 1 ? 'item' : 'items'} on{' '}
              {platformColors[order.platform].label}
            </span>
            <motion.span animate={{ rotate: receiptOpen ? 180 : 0 }} transition={springs.snappy}>
              <ChevronDown size={15} />
            </motion.span>
          </button>
          <div className="mt-2">
            {receiptOpen && (
              <ul className="mb-2 space-y-1 text-[13px] text-muted">
                {order.items.map(({ itemId, qty }) => {
                  const item = catalog.itemsById.get(itemId);
                  return (
                    <li key={itemId}>
                      {qty} × {item?.name ?? itemId}
                    </li>
                  );
                })}
              </ul>
            )}
            <FeeBreakdown quote={order.quote} open={receiptOpen} />
          </div>

          {progress.delivered && (
            <div className="mt-6 flex justify-end">
              <Button onClick={reorder}>Order this again</Button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
