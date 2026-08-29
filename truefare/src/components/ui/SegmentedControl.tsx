import { motion } from 'motion/react';
import clsx from 'clsx';
import { springs } from '../../design/motion';

interface Option<T extends string> {
  value: T;
  label: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  layoutId,
  ariaLabel,
}: {
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
  layoutId: string;
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-1 rounded-pill border border-hairline bg-surface p-1"
    >
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={clsx(
              'relative rounded-pill px-4 py-1.5 text-[13px] font-medium transition-colors',
              active ? 'text-ground' : 'text-muted hover:text-ink'
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                transition={springs.layout}
                className="absolute inset-0 rounded-pill bg-ink"
              />
            )}
            <span className="relative">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
