import { useState } from 'react';
import { motion } from 'motion/react';
import { ChevronDown, Clock, ExternalLink, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import { springs } from '../../design/motion';
import { formatCents } from '../../lib/money';
import { AnimatedPrice } from '../../components/ui/AnimatedPrice';
import { PlatformBadge } from '../../components/ui/PlatformBadge';
import { Skeleton } from '../../components/ui/Skeleton';
import { platformColors } from '../../design/tokens';
import { FEE_RULES_V1 } from '../pricing/rules/v1';
import type { PlatformQuoteState } from '../pricing/useQuotes';
import { useProfileStore } from '../profile/store';
import { deepLinkFor } from './links';
import { FeeBreakdown } from './FeeBreakdown';

interface QuoteCardProps {
  state: PlatformQuoteState;
  restaurantName: string;
  winner: boolean;
  winnerLabel: string;
  deltaCents: number | null; // vs winner total; null while loading
  onCheckout?: () => void;
  onHandoff?: () => void;
  onRetry?: () => void;
}

function MembershipToggle({ state }: { state: PlatformQuoteState }) {
  const membership = FEE_RULES_V1.platforms[state.platform].membership;
  const memberships = useProfileStore((s) => s.memberships);
  const hasPrime = useProfileStore((s) => s.hasAmazonPrime);
  const toggleMembership = useProfileStore((s) => s.toggleMembership);
  const active =
    memberships.includes(membership.id) ||
    (membership.id === 'grubhub_plus' && hasPrime);
  const quote = state.quote;

  return (
    <div className="flex items-center justify-between gap-2">
      <button
        role="switch"
        aria-checked={active}
        onClick={() => toggleMembership(membership.id)}
        className="group inline-flex items-center gap-2"
      >
        <span
          className={clsx(
            'relative h-5 w-9 rounded-pill transition-colors',
            active ? 'bg-sage' : 'bg-ink/15'
          )}
        >
          <motion.span
            layout
            transition={springs.snappy}
            className={clsx(
              'absolute top-0.5 h-4 w-4 rounded-pill bg-surface shadow-card',
              active ? 'right-0.5' : 'left-0.5'
            )}
          />
        </span>
        <span className="text-[12px] font-medium text-muted group-hover:text-ink">
          with {membership.label}
        </span>
      </button>
      {quote && quote.membershipSavingsCents > 0 && (
        <span
          className={clsx(
            'inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[11px] font-semibold',
            active ? 'bg-pistachio text-savings' : 'bg-blush text-muted'
          )}
        >
          <Sparkles size={11} aria-hidden="true" />
          {active
            ? `saving ${formatCents(quote.membershipSavingsCents)}`
            : `would save ${formatCents(quote.membershipSavingsCents)}`}
        </span>
      )}
    </div>
  );
}

export function QuoteCard({
  state,
  restaurantName,
  winner,
  winnerLabel,
  deltaCents,
  onCheckout,
  onHandoff,
  onRetry,
}: QuoteCardProps) {
  const [open, setOpen] = useState(false);
  const { quote, isLoading } = state;
  const colors = platformColors[state.platform];

  if (state.isError && !quote) {
    return (
      <div className="rounded-cell border border-hairline bg-surface p-5 shadow-card">
        <PlatformBadge platform={state.platform} size="md" />
        <p className="mt-3 text-[13px] text-muted">
          Couldn't price this cart on {colors.label} just now.
        </p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-3 rounded-pill border border-hairline px-4 py-2 text-[13px] font-medium text-terracotta transition-colors hover:bg-blush"
          >
            Try again
          </button>
        )}
      </div>
    );
  }

  if (quote && quote.status === 'unavailable') {
    return (
      <div className="rounded-cell border border-dashed border-hairline bg-surface/50 p-5 opacity-60">
        <PlatformBadge platform={state.platform} size="md" />
        <p className="mt-3 text-[13px] text-muted">
          {restaurantName} isn't on {colors.label} right now.
        </p>
      </div>
    );
  }

  return (
    <motion.div
      layout
      transition={springs.layout}
      className="relative rounded-cell border border-hairline bg-surface p-5 shadow-card"
    >
      {winner && (
        <motion.div
          layoutId="best-ring"
          transition={springs.layout}
          className="pointer-events-none absolute -inset-px rounded-cell ring-2 ring-sage"
          style={{ boxShadow: '0 0 0 6px rgba(122,132,80,0.12)' }}
          aria-hidden="true"
        />
      )}

      <div className="flex items-start justify-between gap-2">
        <PlatformBadge platform={state.platform} size="md" />
        {winner && (
          <span className="rounded-pill bg-savings px-2.5 py-1 text-[11px] font-bold uppercase tracking-label text-ground">
            {winnerLabel}
          </span>
        )}
      </div>

      {isLoading || !quote ? (
        <div className="mt-4 space-y-3">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-full rounded-pill" />
        </div>
      ) : (
        <>
          <div className="mt-3 flex items-end justify-between gap-2">
            <div>
              <AnimatedPrice
                cents={quote.total_cents}
                className="text-[32px] font-semibold text-ink"
              />
              <p className="mt-1 text-[12px] text-muted">total after taxes & tip</p>
            </div>
            <div className="text-right">
              <span className="inline-flex items-center gap-1 text-[13px] font-medium text-ink">
                <Clock size={13} aria-hidden="true" />
                <span className="tabular">
                  {quote.etaMinutes.min}–{quote.etaMinutes.max} min
                </span>
              </span>
              {deltaCents != null && deltaCents > 0 && (
                <p className="tabular mt-1 text-[12px] font-medium text-muted">
                  {formatCents(deltaCents, { sign: true })} vs best
                </p>
              )}
            </div>
          </div>

          <div className="mt-3 border-t border-hairline pt-3">
            <MembershipToggle state={state} />
          </div>

          <button
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="mt-3 flex w-full items-center justify-between text-[13px] font-medium text-muted transition-colors hover:text-ink"
          >
            Fees, taxes & tip
            <motion.span animate={{ rotate: open ? 180 : 0 }} transition={springs.snappy}>
              <ChevronDown size={15} />
            </motion.span>
          </button>
          <div className="mt-2">
            <FeeBreakdown quote={quote} open={open} />
          </div>

          <div className="mt-4 flex flex-col gap-2">
            {onCheckout && (
              <motion.button
                whileTap={{ scale: 0.97 }}
                transition={springs.snappy}
                onClick={onCheckout}
                className="w-full rounded-pill bg-terracotta py-2.5 text-sm font-semibold text-[#FFF8EC] transition-colors hover:bg-terracotta-hover"
              >
                Checkout with {colors.label}
              </motion.button>
            )}
            <a
              href={deepLinkFor(state.platform, restaurantName)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onHandoff}
              className={clsx(
                'inline-flex w-full items-center justify-center gap-1.5 rounded-pill py-2.5 text-sm font-medium transition-colors',
                onCheckout
                  ? 'border border-hairline text-muted hover:text-ink'
                  : 'bg-ink text-ground hover:bg-terracotta'
              )}
            >
              Open on {colors.label}
              <ExternalLink size={13} aria-hidden="true" />
            </a>
          </div>
        </>
      )}
    </motion.div>
  );
}