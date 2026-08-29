import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Plus } from 'lucide-react';
import { formatCents } from '../../lib/money';
import { springs, staggerParent, riseChild } from '../../design/motion';
import { FoodImage } from '../../components/food/FoodImage';
import type { MenuItem } from '../catalog/types';
import { useCatalog } from '../catalog/useCatalog';
import { useCartStore } from '../cart/store';
import { flyToCart } from '../cart/CartBar';
import { logEvent } from '../recommendations/events';
import { useSessionStore } from '../recommendations/sessionStore';
import type { FeedRowData } from '../recommendations/feed';

function FeedCard({ item }: { item: MenuItem }) {
  const catalog = useCatalog();
  const addToCart = useCartStore((s) => s.add);
  const markViewed = useSessionStore((s) => s.markViewed);
  const navigate = useNavigate();
  const restaurant = catalog.restaurantsById.get(item.restaurantId);
  if (!restaurant) return null;

  const open = () => {
    markViewed(item.id);
    logEvent(item.id, item.restaurantId, 'open');
    navigate(`/restaurant/${item.restaurantId}`);
  };

  return (
    <motion.div
      variants={riseChild}
      whileHover={{ y: -4 }}
      transition={springs.standard}
      className="relative w-[188px] shrink-0 snap-start"
    >
      {/* Two sibling buttons — never nested interactives. */}
      <button
        onClick={open}
        className="group block w-full overflow-hidden rounded-card border border-hairline bg-surface text-left shadow-card transition-shadow hover:shadow-cardHover"
      >
        <FoodImage glyph={item.glyph} seed={item.id} className="aspect-square w-full" still />
        <div className="p-3">
          <p className="truncate text-[14px] font-semibold text-ink">{item.name}</p>
          <p className="mt-0.5 truncate text-[12px] text-muted">{restaurant.name}</p>
          <p className="tabular mt-1.5 text-[12px] font-medium text-ink">
            from {formatCents(Math.min(...Object.values(item.platformPrices)))}
          </p>
        </div>
      </button>
      <motion.button
        whileTap={{ scale: 0.9 }}
        transition={springs.snappy}
        aria-label={`Add ${item.name} to cart`}
        onClick={(e) => {
          if (addToCart(item.restaurantId, item.id)) {
            flyToCart(e.currentTarget);
            logEvent(item.id, item.restaurantId, 'add_to_cart');
          }
        }}
        className="absolute right-2 top-[132px] flex h-8 w-8 items-center justify-center rounded-pill bg-terracotta text-[#FFF8EC] opacity-90 shadow-card transition-colors hover:bg-terracotta-hover"
      >
        <Plus size={15} />
      </motion.button>
    </motion.div>
  );
}

export function FeedRow({ row }: { row: FeedRowData }) {
  return (
    <section aria-label={row.title}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">{row.title}</h2>
          {row.subtitle && <p className="mt-0.5 text-[13px] text-muted">{row.subtitle}</p>}
        </div>
      </div>
      <motion.div
        variants={staggerParent}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.2 }}
        className="no-scrollbar -mx-4 flex snap-x gap-3.5 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6"
      >
        {row.items.map((item) => (
          <FeedCard key={item.id} item={item} />
        ))}
      </motion.div>
    </section>
  );
}
