import { AnimatePresence, motion } from 'motion/react';
import clsx from 'clsx';
import { formatCents } from '../../lib/money';
import type { ProviderQuote } from '../pricing/types';

/**
 * The expandable line-item breakdown — rendered exactly like the checkout
 * screen it estimates: subtotal → discount → delivery → service → small
 * order → regulatory → tax → tip.
 */
export function FeeBreakdown({ quote, open }: { quote: ProviderQuote; open: boolean }) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className="overflow-hidden"
        >
          <dl className="space-y-1.5 border-t border-hairline pt-3 text-[13px]">
            {quote.lines.map((line) => (
              <div key={line.id}>
                <div className="flex items-baseline justify-between gap-3">
                  <dt
                    className={clsx(
                      line.kind === 'subtotal' ? 'font-medium text-ink' : 'text-muted',
                      line.kind === 'discount' && 'text-savings'
                    )}
                  >
                    {line.label}
                  </dt>
                  <dd
                    className={clsx(
                      'tabular',
                      line.kind === 'discount' ? 'font-medium text-savings' : 'text-ink'
                    )}
                  >
                    {formatCents(line.amountCents)}
                  </dd>
                </div>
                {line.note && (
                  <p className="text-[11px] leading-tight text-muted/80">{line.note}</p>
                )}
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-3 border-t border-hairline pt-2">
              <dt className="font-semibold text-ink">Total after taxes</dt>
              <dd className="tabular font-semibold text-ink">
                {formatCents(quote.total_cents)}
              </dd>
            </div>
          </dl>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
