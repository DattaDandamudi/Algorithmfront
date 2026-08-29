import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Info } from 'lucide-react';
import { springs } from '../../design/motion';
import { formatCents } from '../../lib/money';
import { currentDaypart } from '../../lib/time';
import { AnimatedPrice } from '../../components/ui/AnimatedPrice';
import { BentoCell } from '../../components/ui/BentoCell';
import { platformColors, platformAccentVar } from '../../design/tokens';
import { ALL_PLATFORMS } from '../catalog/types';
import { getCatalog } from '../catalog/data/buildCatalog';
import { computeQuote } from '../pricing/engine';
import { FEE_RULES_V1, resolveMetro } from '../pricing/rules/v1';
import { useProfileStore } from '../profile/store';

/** Curated demo carts the hero cycles through — priced live by the engine. */
const SAMPLE_CARTS = [
  {
    label: 'Smash-burger night',
    restaurantId: 'patty-theory',
    itemIds: ['patty-theory:the-proof', 'patty-theory:crinkle-fries', 'patty-theory:malted-chocolate-shake'],
  },
  {
    label: 'Sushi for two',
    restaurantId: 'kaiyo-sushi',
    itemIds: ['kaiyo-sushi:chirashi-kaiyo', 'kaiyo-sushi:salmon-belly-nigiri-pair', 'kaiyo-sushi:miso-soup-with-wakame'],
  },
  {
    label: 'Taco Tuesday, any day',
    restaurantId: 'la-milpa',
    itemIds: ['la-milpa:tacos-al-pastor', 'la-milpa:carnitas-tacos', 'la-milpa:quesadilla-de-flor'],
  },
] as const;

export function BentoHero() {
  const metroId = useProfileStore((s) => s.metroId);
  const [idx, setIdx] = useState(0);

  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % SAMPLE_CARTS.length), 5000);
    return () => clearInterval(t);
  }, [paused]);

  const sample = SAMPLE_CARTS[idx];

  const quotes = useMemo(() => {
    const catalog = getCatalog();
    const restaurant = catalog.restaurantsById.get(sample.restaurantId);
    if (!restaurant) return [];
    const lines = sample.itemIds
      .map((id) => catalog.itemsById.get(id))
      .filter((i): i is NonNullable<typeof i> => i != null)
      .map((item) => ({ item, qty: 1 }));
    if (!lines.length) return [];
    const metro = resolveMetro(metroId);
    return ALL_PLATFORMS.map((p) =>
      computeQuote(
        FEE_RULES_V1,
        { restaurant, lines, metro, memberships: [], tipPercent: 15, daypart: currentDaypart() },
        p
      )
    ).filter((q) => q.status === 'ok');
  }, [sample, metroId]);

  const cheapest = quotes.length
    ? quotes.reduce((a, b) => (a.total_cents <= b.total_cents ? a : b))
    : null;
  const priciest = quotes.length
    ? quotes.reduce((a, b) => (a.total_cents >= b.total_cents ? a : b))
    : null;
  const spread = cheapest && priciest ? priciest.total_cents - cheapest.total_cents : 0;
  const maxTotal = priciest?.total_cents ?? 1;

  return (
    <section aria-label="How TrueFare works" className="grid grid-cols-1 gap-5 lg:grid-cols-12">
      {/* Live comparison teaser — the hero cell */}
      <BentoCell
        className="lg:col-span-8"
        label="One cart · every checkout, after taxes"
        interactive={false}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <AnimatePresence mode="wait">
            <motion.h2
              key={sample.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={springs.standard}
              className="font-display text-[26px] font-semibold text-ink sm:text-[30px]"
            >
              {sample.label}
            </motion.h2>
          </AnimatePresence>
          {spread > 0 && (
            <span className="text-[13px] text-muted">
              same cart, <span className="tabular font-semibold text-savings">{formatCents(spread)}</span> apart
            </span>
          )}
        </div>
        <div className="mt-5 space-y-3">
          {quotes.map((q) => {
            const c = platformColors[q.platform];
            const isWinner = cheapest?.platform === q.platform;
            return (
              <div key={q.platform} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-[13px] font-semibold text-ink">
                  {c.label}
                </span>
                <div className="h-7 flex-1 overflow-hidden rounded-pill bg-ink/[0.06]">
                  <motion.div
                    initial={false}
                    animate={{ width: `${(q.total_cents / maxTotal) * 100}%` }}
                    transition={{ type: 'spring', stiffness: 140, damping: 22 }}
                    className="flex h-full items-center justify-end rounded-pill pr-3"
                    style={{
                      backgroundColor: isWinner
                        ? 'rgb(var(--tf-savings))'
                        : platformAccentVar(q.platform, 0.33),
                    }}
                  >
                    <span
                      className="tabular whitespace-nowrap text-[12px] font-bold"
                      style={{
                        color: isWinner ? 'rgb(var(--tf-ground))' : 'rgb(var(--tf-ink))',
                      }}
                    >
                      {formatCents(q.total_cents)}
                    </span>
                  </motion.div>
                </div>
                {isWinner && (
                  <span className="shrink-0 rounded-pill bg-pistachio px-2 py-0.5 text-[11px] font-bold uppercase tracking-label text-savings">
                    best
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-5 flex items-center justify-between">
          <div
            className="flex gap-1.5"
            role="group"
            aria-label="Sample carts"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
          >
            {SAMPLE_CARTS.map((_, i) => (
              <button
                key={i}
                onClick={() => setIdx(i)}
                className="rounded-pill p-1"
                aria-label={`Show sample cart ${i + 1}`}
              >
                <span
                  className={`block h-1.5 rounded-pill transition-all ${i === idx ? 'w-5 bg-terracotta' : 'w-1.5 bg-ink/20'}`}
                />
              </button>
            ))}
          </div>
          <Link
            to={`/restaurant/${sample.restaurantId}`}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-terracotta transition-colors hover:text-terracotta-press"
          >
            Build this cart <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </BentoCell>

      {/* Savings counter */}
      <BentoCell className="flex flex-col justify-between lg:col-span-4" label="Why compare">
        <p className="font-display text-[22px] font-semibold leading-snug text-ink">
          The same cart is{' '}
          <em className="italic text-terracotta">rarely</em> the same price.
        </p>
        <div className="mt-4">
          <AnimatedPrice
            cents={spread}
            className="text-[44px] font-semibold text-savings"
          />
          <p className="mt-1 text-[13px] text-muted">
            spread on this cart right now — fees, taxes and markups included
          </p>
        </div>
      </BentoCell>

      {/* Platform fact tiles */}
      {ALL_PLATFORMS.map((p) => {
        const rules = FEE_RULES_V1.platforms[p];
        const c = platformColors[p];
        return (
          <BentoCell key={p} className="lg:col-span-3" interactive={false}>
            <div className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: platformAccentVar(p) }}
              />
              <span className="text-[14px] font-semibold text-ink">{c.label}</span>
            </div>
            <p className="tabular mt-2.5 text-[13px] leading-relaxed text-muted">
              {rules.serviceFee.bps / 100}% service fee
              {p === 'grubhub' && ' · fees waived over $50'}
              {p === 'ubereats' && ' · surges at dinner'}
              {p === 'doordash' && ' · flat delivery per store'}
              {p === 'postmates' && ' · runs on Uber Eats'}
            </p>
          </BentoCell>
        );
      })}

      {/* Transparency strip */}
      <BentoCell className="lg:col-span-12" interactive={false}>
        <div className="flex flex-wrap items-center gap-3 text-[13px] text-muted">
          <Info size={15} className="shrink-0 text-saffron" aria-hidden="true" />
          <span>
            <span className="font-semibold text-ink">How estimates work:</span> totals are
            computed from each platform's researched fee formulas, menu markups, your city's
            taxes and regulatory fees (rules {FEE_RULES_V1.version}) — labeled estimated,
            never passed off as live quotes. Live-quote providers plug into the same seam.
          </span>
        </div>
      </BentoCell>
    </section>
  );
}
