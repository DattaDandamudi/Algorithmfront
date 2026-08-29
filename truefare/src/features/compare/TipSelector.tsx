import { useState } from 'react';
import { motion } from 'motion/react';
import clsx from 'clsx';
import { springs } from '../../design/motion';

const TIERS = [0, 10, 15, 18, 20];

export function TipSelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (pct: number) => void;
}) {
  const isCustom = !TIERS.includes(value);
  const [customOpen, setCustomOpen] = useState(isCustom);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="label-caps">Tip</span>
      <div className="flex items-center gap-1 rounded-pill border border-hairline bg-surface p-1">
        {TIERS.map((t) => {
          const active = !customOpen && value === t;
          return (
            <button
              key={t}
              onClick={() => {
                setCustomOpen(false);
                onChange(t);
              }}
              aria-pressed={active}
              className={clsx(
                'relative rounded-pill px-3 py-1.5 text-[13px] font-medium transition-colors',
                active ? 'text-ground' : 'text-muted hover:text-ink'
              )}
            >
              {active && (
                <motion.span
                  layoutId="tip-pill"
                  transition={springs.layout}
                  className="absolute inset-0 rounded-pill bg-ink"
                />
              )}
              <span className="relative tabular">{t}%</span>
            </button>
          );
        })}
        <button
          onClick={() => setCustomOpen(true)}
          aria-pressed={customOpen}
          className={clsx(
            'relative rounded-pill px-3 py-1.5 text-[13px] font-medium transition-colors',
            customOpen ? 'text-ground' : 'text-muted hover:text-ink'
          )}
        >
          {customOpen && (
            <motion.span
              layoutId="tip-pill"
              transition={springs.layout}
              className="absolute inset-0 rounded-pill bg-ink"
            />
          )}
          <span className="relative">Other</span>
        </button>
      </div>
      {customOpen && (
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={0}
            max={50}
            value={value}
            autoFocus
            onChange={(e) =>
              onChange(Math.max(0, Math.min(50, Number(e.target.value) || 0)))
            }
            aria-label="Custom tip percent"
            className="tabular h-9 w-16 rounded-control border border-hairline bg-surface px-2 text-center text-[13px] text-ink outline-none focus:border-terracotta"
          />
          <span className="text-[13px] text-muted">%</span>
        </div>
      )}
    </div>
  );
}
