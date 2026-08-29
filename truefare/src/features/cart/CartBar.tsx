import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useAnimationControls } from 'motion/react';
import { ShoppingBag, Scale } from 'lucide-react';
import { springs } from '../../design/motion';
import { useCatalog } from '../catalog/useCatalog';
import { useCartStore, cartCount } from './store';

/** Fired by add-to-cart buttons; the dot flies from there to the cart. */
export interface FlyDetail {
  x: number;
  y: number;
}

export function flyToCart(fromEl: HTMLElement) {
  const rect = fromEl.getBoundingClientRect();
  window.dispatchEvent(
    new CustomEvent<FlyDetail>('tf:fly', {
      detail: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
    })
  );
}

interface Dot {
  id: number;
  from: FlyDetail;
  /** Captured once at spawn so mid-flight re-renders never retarget. */
  to: FlyDetail;
}

let dotId = 0;

/** The floating dots + the sticky cart bar with its "gulp". */
export function CartBar() {
  const items = useCartStore((s) => s.items);
  const restaurantId = useCartStore((s) => s.restaurantId);
  const catalog = useCatalog();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [dots, setDots] = useState<Dot[]>([]);
  const anchorRef = useRef<HTMLDivElement>(null);
  const gulp = useAnimationControls();

  useEffect(() => {
    const onFly = (e: Event) => {
      const detail = (e as CustomEvent<FlyDetail>).detail;
      // Double rAF: on a first-ever add the bar mounts in this same
      // commit — wait two frames so the anchor has a real position, then
      // freeze the target into the dot.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const el = anchorRef.current;
          const to = el
            ? (() => {
                const r = el.getBoundingClientRect();
                return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
              })()
            : { x: window.innerWidth / 2, y: window.innerHeight - 96 };
          setDots((d) => [...d, { id: ++dotId, from: detail, to }]);
        })
      );
    };
    window.addEventListener('tf:fly', onFly);
    return () => window.removeEventListener('tf:fly', onFly);
  }, []);

  const count = cartCount(items);
  const restaurant = restaurantId ? catalog.restaurantsById.get(restaurantId) : null;
  const hidden =
    count === 0 || pathname.startsWith('/compare') || pathname.startsWith('/checkout');

  return (
    <>
      {/* flying dots layer */}
      <div className="pointer-events-none fixed inset-0 z-[65]" aria-hidden="true">
        <AnimatePresence>
          {dots.map((dot) => {
            const t = dot.to;
            return (
              <motion.span
                key={dot.id}
                initial={{ x: dot.from.x - 8, y: dot.from.y - 8, scale: 1, opacity: 1 }}
                animate={{
                  x: [dot.from.x - 8, (dot.from.x + t.x) / 2 - 8, t.x - 8],
                  y: [dot.from.y - 8, Math.min(dot.from.y, t.y) - 90, t.y - 8],
                  scale: [1, 0.9, 0.35],
                  opacity: [1, 1, 0.9],
                }}
                transition={{ duration: 0.55, ease: 'easeInOut' }}
                onAnimationComplete={() => {
                  setDots((d) => d.filter((x) => x.id !== dot.id));
                  gulp.start({
                    scale: [1, 1.15, 1],
                    transition: { duration: 0.35, ease: 'easeOut' },
                  });
                }}
                className="absolute h-4 w-4 rounded-full bg-terracotta shadow-card"
              />
            );
          })}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {!hidden && (
          <motion.div
            initial={{ y: 96, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 96, opacity: 0 }}
            transition={springs.layout}
            className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-[64] px-4 md:bottom-6"
          >
            <div className="glass-bottom mx-auto flex max-w-2xl items-center justify-between gap-3 rounded-cell border border-hairline px-4 py-3 shadow-cardHover md:rounded-pill md:px-5">
              <motion.div animate={gulp} ref={anchorRef} className="relative">
                <span className="flex h-10 w-10 items-center justify-center rounded-pill bg-terracotta text-[#FFF8EC]">
                  <ShoppingBag size={18} />
                </span>
                <AnimatePresence mode="popLayout">
                  <motion.span
                    key={count}
                    initial={{ scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.4, opacity: 0 }}
                    transition={springs.snappy}
                    className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-pill bg-ink px-1 text-[11px] font-bold text-ground"
                  >
                    {count}
                  </motion.span>
                </AnimatePresence>
              </motion.div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">
                  {restaurant?.name}
                </p>
                <p className="text-[12px] text-muted">
                  {count} {count === 1 ? 'item' : 'items'} · ready to compare
                </p>
              </div>
              <motion.button
                whileTap={{ scale: 0.96 }}
                transition={springs.snappy}
                onClick={() => navigate('/compare')}
                className="flex items-center gap-2 rounded-pill bg-ink px-5 py-2.5 text-sm font-semibold text-ground transition-colors hover:bg-terracotta"
              >
                <Scale size={15} />
                Compare checkouts
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
