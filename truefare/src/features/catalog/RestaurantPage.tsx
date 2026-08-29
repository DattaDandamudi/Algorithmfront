import { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowLeft, Clock, MapPin } from 'lucide-react';
import { staggerParent, riseChild, pageEnter } from '../../design/motion';
import { platformColors } from '../../design/tokens';
import { FoodImage } from '../../components/food/FoodImage';
import { RatingStars } from '../../components/ui/RatingStars';
import { Chip } from '../../components/ui/Chip';
import { useCatalog } from './useCatalog';
import { MenuItemRow } from './components/MenuItemRow';
import { useCartStore } from '../cart/store';
import { flyToCart } from '../cart/CartBar';
import { logEvent } from '../recommendations/events';
import { useSessionStore } from '../recommendations/sessionStore';
import type { MenuItem } from './types';

export default function RestaurantPage() {
  const { id } = useParams<{ id: string }>();
  const catalog = useCatalog();
  const addToCart = useCartStore((s) => s.add);

  const onAdd = (item: MenuItem, fromEl: HTMLElement) => {
    const added = addToCart(item.restaurantId, item.id);
    if (added) {
      flyToCart(fromEl);
      logEvent(item.id, item.restaurantId, 'add_to_cart');
    }
  };

  const markViewed = useSessionStore((s) => s.markViewed);
  const onOpen = (item: MenuItem) => {
    markViewed(item.id);
    logEvent(item.id, item.restaurantId, 'open');
  };
  const restaurant = id ? catalog.restaurantsById.get(id) : undefined;
  const items = useMemo(
    () => (id ? (catalog.itemsByRestaurant.get(id) ?? []) : []),
    [catalog, id]
  );

  const { featured, rest } = useMemo(() => {
    const sorted = [...items].sort((a, b) => b.popularity - a.popularity);
    return { featured: sorted.slice(0, 3), rest: sorted.slice(3) };
  }, [items]);

  if (!restaurant) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4">
        <div className="blob blob-breathe h-16 w-16 bg-blush" />
        <p className="text-muted">We couldn't find that restaurant.</p>
        <Link to="/" className="font-medium text-terracotta">
          Back to Discover
        </Link>
      </div>
    );
  }

  return (
    <motion.div {...pageEnter}>
      <Link
        to="/"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft size={15} aria-hidden="true" /> Discover
      </Link>

      <motion.div layoutId={`resto-img-${restaurant.id}`} className="relative">
        <FoodImage
          glyph={restaurant.glyph}
          seed={restaurant.id}
          className="aspect-[16/7] w-full rounded-cell sm:aspect-[21/7]"
          label={`${restaurant.name} — ${restaurant.cuisine}`}
        />
      </motion.div>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold sm:text-5xl">{restaurant.name}</h1>
          <p className="mt-2 font-display text-[17px] italic text-muted">
            {restaurant.tagline}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Chip>{restaurant.cuisine}</Chip>
          <Chip>{'$'.repeat(restaurant.priceLevel)}</Chip>
          <Chip tone="saffron">
            <RatingStars rating={restaurant.rating} />
          </Chip>
          <Chip tone="sage">
            <Clock size={13} aria-hidden="true" />
            <span className="tabular">
              {restaurant.baseEtaMinutes}–{restaurant.baseEtaMinutes + 10} min
            </span>
          </Chip>
          <Chip>
            <MapPin size={13} aria-hidden="true" />
            <span className="tabular">{restaurant.distanceMiles.toFixed(1)} mi</span>
          </Chip>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3 text-[13px] text-muted">
        <span>Delivered by</span>
        {restaurant.platforms.map((p) => (
          <span key={p} className="inline-flex items-center gap-1.5 font-medium text-ink">
            <span
              aria-hidden="true"
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: platformColors[p].accent }}
            />
            {platformColors[p].label}
          </span>
        ))}
      </div>

      <section className="mt-10" aria-labelledby="most-ordered">
        <h2 id="most-ordered" className="text-2xl font-semibold">
          Most ordered
        </h2>
        <motion.div
          variants={staggerParent}
          initial="hidden"
          animate="show"
          className="mt-4 grid gap-3 lg:grid-cols-2"
        >
          {featured.map((item) => (
            <motion.div key={item.id} variants={riseChild}>
              <MenuItemRow item={item} restaurant={restaurant} onAdd={onAdd} onOpen={onOpen} />
            </motion.div>
          ))}
        </motion.div>
      </section>

      <section className="mt-10" aria-labelledby="full-menu">
        <h2 id="full-menu" className="text-2xl font-semibold">
          The rest of the menu
        </h2>
        <motion.div
          variants={staggerParent}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.1 }}
          className="mt-4 grid gap-3 lg:grid-cols-2"
        >
          {rest.map((item) => (
            <motion.div key={item.id} variants={riseChild}>
              <MenuItemRow item={item} restaurant={restaurant} onAdd={onAdd} onOpen={onOpen} />
            </motion.div>
          ))}
        </motion.div>
      </section>
    </motion.div>
  );
}
