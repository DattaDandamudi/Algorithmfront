import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { Clock, MapPin } from 'lucide-react';
import { springs } from '../../../design/motion';
import { platformColors, platformAccentVar } from '../../../design/tokens';
import { FoodImage } from '../../../components/food/FoodImage';
import { RatingStars } from '../../../components/ui/RatingStars';
import type { Restaurant } from '../types';

export function RestaurantCard({ restaurant }: { restaurant: Restaurant }) {
  return (
    <motion.div whileHover={{ y: -5 }} transition={springs.standard} className="group h-full">
      <Link
        to={`/restaurant/${restaurant.id}`}
        className="flex h-full flex-col overflow-hidden rounded-cell border border-hairline bg-surface shadow-card transition-shadow duration-300 hover:shadow-cardHover"
      >
        <motion.div layoutId={`resto-img-${restaurant.id}`} className="relative">
          <FoodImage
            glyph={restaurant.glyph}
            seed={restaurant.id}
            className="aspect-[4/3] w-full"
            still
          />
          <span className="absolute left-3 top-3 rounded-pill bg-surface/90 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-label text-muted backdrop-blur-sm">
            {restaurant.cuisine}
          </span>
        </motion.div>
        <div className="flex flex-1 flex-col gap-1.5 p-4">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="font-display text-[19px] font-semibold leading-tight text-ink">
              {restaurant.name}
            </h3>
            <RatingStars rating={restaurant.rating} />
          </div>
          <p className="text-[13px] italic text-muted">{restaurant.tagline}</p>
          <div className="mt-auto flex items-center justify-between pt-2">
            <div className="flex items-center gap-3 text-[12px] text-muted">
              <span className="inline-flex items-center gap-1">
                <Clock size={12} aria-hidden="true" />
                <span className="tabular">{restaurant.baseEtaMinutes}–{restaurant.baseEtaMinutes + 10} min</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <MapPin size={12} aria-hidden="true" />
                <span className="tabular">{restaurant.distanceMiles.toFixed(1)} mi</span>
              </span>
            </div>
            <div className="flex items-center gap-1" aria-label="Available on">
              {restaurant.platforms.map((p) => (
                <span
                  key={p}
                  title={platformColors[p].label}
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: platformAccentVar(p) }}
                />
              ))}
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
