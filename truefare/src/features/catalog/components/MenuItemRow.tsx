import { motion } from 'motion/react';
import { Plus, Leaf } from 'lucide-react';
import { springs } from '../../../design/motion';
import { FoodImage } from '../../../components/food/FoodImage';
import { PriceVectorChips } from './PriceVectorChips';
import type { MenuItem, Restaurant } from '../types';

interface MenuItemRowProps {
  item: MenuItem;
  restaurant: Restaurant;
  onAdd?: (item: MenuItem, fromEl: HTMLElement) => void;
  onOpen?: (item: MenuItem) => void;
}

export function MenuItemRow({ item, restaurant, onAdd, onOpen }: MenuItemRowProps) {
  const plantBased = item.dietary.includes('vegan') || item.dietary.includes('vegetarian');
  return (
    <div className="group flex gap-4 rounded-card border border-hairline bg-surface p-4 shadow-card transition-shadow hover:shadow-cardHover">
      {/* The open action is a real button — keyboard and AT reachable. */}
      <button
        onClick={() => onOpen?.(item)}
        disabled={!onOpen}
        className="min-w-0 flex-1 text-left"
      >
        <span className="flex items-center gap-1.5">
          <h4 className="truncate text-[15px] font-semibold text-ink">{item.name}</h4>
          {plantBased && (
            <Leaf
              size={13}
              className="shrink-0 text-sage"
              aria-label={item.dietary.includes('vegan') ? 'Vegan' : 'Vegetarian'}
            />
          )}
        </span>
        <span className="mt-1 line-clamp-2 block text-[13px] leading-snug text-muted">
          {item.description}
        </span>
        <span className="mt-2.5 block">
          <PriceVectorChips item={item} restaurant={restaurant} />
        </span>
      </button>
      <div className="relative shrink-0 self-center">
        <FoodImage
          glyph={item.glyph}
          seed={item.id}
          className="h-[84px] w-[84px] rounded-control"
          still
        />
        {onAdd && (
          <motion.button
            whileTap={{ scale: 0.9 }}
            transition={springs.snappy}
            aria-label={`Add ${item.name} to cart`}
            onClick={(e) => {
              e.stopPropagation();
              onAdd(item, e.currentTarget);
            }}
            className="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-pill bg-terracotta text-[#FFF8EC] shadow-card transition-colors hover:bg-terracotta-hover"
          >
            <Plus size={16} />
          </motion.button>
        )}
      </div>
    </div>
  );
}
