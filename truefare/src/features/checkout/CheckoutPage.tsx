import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, CreditCard, Loader2, ShieldCheck, TriangleAlert } from 'lucide-react';
import clsx from 'clsx';
import { pageEnter, springs } from '../../design/motion';
import { formatCents } from '../../lib/money';
import { currentDaypart } from '../../lib/time';
import { PlatformBadge } from '../../components/ui/PlatformBadge';
import { Skeleton } from '../../components/ui/Skeleton';
import { platformColors } from '../../design/tokens';
import { ALL_PLATFORMS, type Platform } from '../catalog/types';
import { useCatalog } from '../catalog/useCatalog';
import { useCartStore } from '../cart/store';
import { effectiveMemberships, useProfileStore } from '../profile/store';
import { useQuotes } from '../pricing/useQuotes';
import type { QuoteRequest } from '../pricing/types';
import { FeeBreakdown } from '../compare/FeeBreakdown';
import { getOrderProvider } from './OrderProvider';
import { useCheckoutStore } from './store';
import {
  brandOf,
  formatCardNumber,
  formatExpiry,
  luhnValid,
  maskCard,
  validCvc,
  validExpiry,
} from './payment';
import { Celebration } from './Celebration';

const inputCls =
  'h-11 w-full rounded-control border border-hairline bg-surface px-3.5 text-[14px] text-ink outline-none transition-colors placeholder:text-muted/60 focus:border-terracotta';

export default function CheckoutPage() {
  const { platform: platformParam } = useParams<{ platform: string }>();
  const platform = ALL_PLATFORMS.includes(platformParam as Platform)
    ? (platformParam as Platform)
    : null;
  const location = useLocation();
  const expectedTotal = (location.state as { expectedTotal?: number } | null)?.expectedTotal;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const catalog = useCatalog();
  const cartItems = useCartStore((s) => s.items);
  const restaurantId = useCartStore((s) => s.restaurantId);
  const clearCart = useCartStore((s) => s.clear);
  const metroId = useProfileStore((s) => s.metroId);
  const rawMemberships = useProfileStore((s) => s.memberships);
  const hasAmazonPrime = useProfileStore((s) => s.hasAmazonPrime);
  const memberships = useMemo(
    () => effectiveMemberships({ memberships: rawMemberships, hasAmazonPrime }),
    [rawMemberships, hasAmazonPrime]
  );

  const savedAddress = useCheckoutStore((s) => s.address);
  const savedPayment = useCheckoutStore((s) => s.payment);
  const setAddress = useCheckoutStore((s) => s.setAddress);
  const setPayment = useCheckoutStore((s) => s.setPayment);

  const [label, setLabel] = useState(savedAddress?.label ?? 'Home');
  const [line1, setLine1] = useState(savedAddress?.line1 ?? '');
  const [city, setCity] = useState(savedAddress?.city ?? '');
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [editingCard, setEditingCard] = useState(savedPayment == null);
  const [placing, setPlacing] = useState(false);
  const [placed, setPlaced] = useState<{ id: string; total: number } | null>(null);

  const restaurant = restaurantId ? catalog.restaurantsById.get(restaurantId) : null;
  const daypart = useMemo(() => currentDaypart(), []);

  // Price-lock: re-quote on entry; the frozen quote is what gets placed.
  const req: QuoteRequest | null = useMemo(() => {
    if (!restaurant || cartItems.length === 0 || !platform) return null;
    return {
      restaurantId: restaurant.id,
      items: cartItems,
      metroId,
      memberships,
      tipPercent: 15,
      daypart,
    };
  }, [restaurant, cartItems, metroId, memberships, platform, daypart]);

  const { states } = useQuotes(req);
  const quote = states.find((s) => s.platform === platform)?.quote;
  const priceMoved =
    expectedTotal != null && quote != null && quote.total_cents !== expectedTotal;

  // Once placed, the cart is cleared — the celebration must render before
  // the empty-cart guard or it unmounts and the redirect never fires.
  if (placed && platform) {
    return (
      <Celebration
        platform={platform}
        totalCents={placed.total}
        onDone={() => navigate(`/orders/${placed.id}`, { replace: true })}
      />
    );
  }

  if (!platform || !restaurant || cartItems.length === 0) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
        <div className="blob blob-breathe h-16 w-16 bg-blush" />
        <p className="text-muted">Nothing to check out — build a cart first.</p>
        <Link to="/" className="font-medium text-terracotta">
          Back to Discover
        </Link>
      </div>
    );
  }

  const colors = platformColors[platform];
  const addressValid = line1.trim().length > 3 && city.trim().length > 1;
  const cardValid = editingCard
    ? luhnValid(cardNumber) && validExpiry(expiry) && validCvc(cvc)
    : savedPayment != null;
  const canPlace = addressValid && cardValid && quote?.status === 'ok' && !placing;

  const placeOrder = async () => {
    if (!canPlace || !quote) return;
    setPlacing(true);
    const address = { label, line1: line1.trim(), city: city.trim() };
    setAddress(address);
    if (editingCard) {
      setPayment({ masked: maskCard(cardNumber), brand: brandOf(cardNumber) });
    }
    const order = await getOrderProvider().placeOrder({
      restaurantId: restaurant.id,
      platform,
      items: cartItems,
      quote,
      metroId,
      address,
    });
    await queryClient.invalidateQueries({ queryKey: ['orders'] });
    clearCart();
    setPlaced({ id: order.id, total: order.totalCents });
  };

  return (
    <motion.div {...pageEnter}>
      <Link
        to="/compare"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft size={15} aria-hidden="true" /> Back to compare
      </Link>

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-4xl font-semibold">Checkout</h1>
        <PlatformBadge platform={platform} size="lg" />
      </div>

      <AnimatePresence>
        {priceMoved && quote && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-4 flex items-center gap-3 rounded-card border border-saffron/40 bg-saffron/15 px-4 py-3 text-[13px]"
          >
            <TriangleAlert size={16} className="shrink-0 text-saffron" aria-hidden="true" />
            <span>
              This quote moved since you compared:{' '}
              <s className="tabular text-muted">{formatCents(expectedTotal!)}</s>{' '}
              <span className="tabular font-semibold">{formatCents(quote.total_cents)}</span>.
              Prices refresh with the time of day.
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_420px]">
        {/* forms */}
        <div className="space-y-6">
          <section className="rounded-cell border border-hairline bg-surface p-6 shadow-card">
            <h2 className="font-display text-xl font-semibold">Delivery address</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-[120px_1fr]">
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Label"
                aria-label="Address label"
                className={inputCls}
              />
              <input
                value={line1}
                onChange={(e) => setLine1(e.target.value)}
                placeholder="Street address"
                aria-label="Street address"
                className={inputCls}
              />
            </div>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="City"
              aria-label="City"
              className={clsx(inputCls, 'mt-3')}
            />
          </section>

          <section className="rounded-cell border border-hairline bg-surface p-6 shadow-card">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-xl font-semibold">Payment</h2>
              <span className="inline-flex items-center gap-1.5 rounded-pill bg-pistachio px-3 py-1 text-[11px] font-semibold uppercase tracking-label text-savings">
                <ShieldCheck size={12} aria-hidden="true" />
                Demo — no real charge
              </span>
            </div>

            {!editingCard && savedPayment ? (
              <div className="mt-4 flex items-center justify-between rounded-card border border-hairline px-4 py-3">
                <span className="inline-flex items-center gap-2.5 text-[14px] font-medium text-ink">
                  <CreditCard size={16} className="text-muted" aria-hidden="true" />
                  {savedPayment.brand} {savedPayment.masked}
                </span>
                <button
                  onClick={() => setEditingCard(true)}
                  className="text-[13px] font-medium text-terracotta hover:text-terracotta-press"
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <div className="relative">
                  <input
                    value={cardNumber}
                    onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                    inputMode="numeric"
                    placeholder="4242 4242 4242 4242"
                    aria-label="Card number"
                    className={clsx(inputCls, 'tabular pr-20')}
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[12px] font-medium text-muted">
                    {cardNumber ? brandOf(cardNumber) : ''}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    value={expiry}
                    onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                    inputMode="numeric"
                    placeholder="MM/YY"
                    aria-label="Expiry"
                    className={clsx(inputCls, 'tabular')}
                  />
                  <input
                    value={cvc}
                    onChange={(e) => setCvc(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    inputMode="numeric"
                    placeholder="CVC"
                    aria-label="CVC"
                    className={clsx(inputCls, 'tabular')}
                  />
                </div>
                {cardNumber.length > 0 && !luhnValid(cardNumber) && (
                  <p className="text-[12px] text-terracotta">
                    That card number doesn't check out — try the demo card 4242 4242 4242 4242.
                  </p>
                )}
              </div>
            )}
          </section>

          <motion.button
            whileTap={canPlace ? { scale: 0.98 } : undefined}
            transition={springs.snappy}
            disabled={!canPlace}
            onClick={placeOrder}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-pill bg-terracotta text-[16px] font-semibold text-[#FFF8EC] transition-colors hover:bg-terracotta-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            <AnimatePresence mode="wait" initial={false}>
              {placing ? (
                <motion.span
                  key="placing"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="inline-flex items-center gap-2"
                >
                  <Loader2 size={18} className="animate-spin" aria-hidden="true" />
                  Placing your order…
                </motion.span>
              ) : (
                <motion.span
                  key="idle"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="tabular"
                >
                  {quote?.status === 'ok'
                    ? `Place order · ${formatCents(quote.total_cents)}`
                    : 'Getting your final quote…'}
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
          <p className="text-center text-[12px] text-muted">
            Estimated total on {colors.label} · rules {quote?.meta.rulesVersion ?? '—'} · no
            real order is placed
          </p>
        </div>

        {/* order summary */}
        <aside className="h-fit rounded-cell border border-hairline bg-surface p-6 shadow-card">
          <h2 className="font-display text-xl font-semibold">{restaurant.name}</h2>
          <ul className="mt-3 space-y-2 border-b border-hairline pb-3">
            {cartItems.map(({ itemId, qty }) => {
              const item = catalog.itemsById.get(itemId);
              return item ? (
                <li key={itemId} className="flex justify-between gap-3 text-[13px]">
                  <span className="text-ink">
                    {item.name} {qty > 1 && <span className="text-muted">×{qty}</span>}
                  </span>
                </li>
              ) : null;
            })}
          </ul>
          <div className="mt-3">
            {quote?.status === 'ok' ? (
              <FeeBreakdown quote={quote} open />
            ) : (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-5/6" />
              </div>
            )}
          </div>
          {quote?.status === 'ok' && (
            <p className="mt-3 text-[12px] text-muted">
              Arrives in {quote.etaMinutes.min}–{quote.etaMinutes.max} min
            </p>
          )}
        </aside>
      </div>
    </motion.div>
  );
}
