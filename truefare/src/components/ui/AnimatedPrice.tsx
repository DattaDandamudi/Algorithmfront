import { motion } from 'motion/react';
import clsx from 'clsx';
import { formatCents } from '../../lib/money';

/**
 * Per-digit odometer: each digit column rolls vertically on change
 * (the "expensive fintech" price ticker). Requires tabular-nums so
 * columns never shift horizontally.
 */

function Digit({ d }: { d: number }) {
  return (
    <span className="relative inline-block h-[1em] w-[1ch] overflow-hidden">
      <motion.span
        initial={false}
        animate={{ y: `${-d}em` }}
        transition={{ type: 'spring', stiffness: 180, damping: 24 }}
        className="absolute left-0 top-0 block"
      >
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className="block h-[1em] leading-none">
            {i}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

export function AnimatedPrice({
  cents,
  className,
}: {
  cents: number;
  className?: string;
}) {
  const text = formatCents(cents);
  return (
    <span
      className={clsx('tabular inline-flex items-baseline leading-none', className)}
      aria-label={text}
    >
      {text.split('').map((ch, i) =>
        /\d/.test(ch) ? (
          <Digit key={`${text.length}-${i}`} d={Number(ch)} />
        ) : (
          <span key={`${text.length}-${i}`} className="inline-block leading-none">
            {ch}
          </span>
        )
      )}
    </span>
  );
}
