import { motion } from 'motion/react';
import { Check } from 'lucide-react';
import clsx from 'clsx';
import { ORDER_STAGES, type OrderProgress } from './useOrderProgress';

/** Vertical delivery timeline with a filling connector and pulsing head. */
export function StatusTimeline({ progress }: { progress: OrderProgress }) {
  return (
    <ol className="relative space-y-0">
      {ORDER_STAGES.map((stage, i) => {
        const reached = i <= progress.stageIndex;
        const current = i === progress.stageIndex && !progress.delivered;
        const last = i === ORDER_STAGES.length - 1;
        return (
          <li key={stage.key} className="relative flex gap-4 pb-7 last:pb-0">
            {!last && (
              <span
                aria-hidden="true"
                className="absolute left-[11px] top-6 h-[calc(100%-12px)] w-0.5 bg-ink/10"
              >
                <motion.span
                  initial={false}
                  animate={{ scaleY: i < progress.stageIndex ? 1 : 0 }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                  className="block h-full w-full origin-top bg-sage"
                />
              </span>
            )}
            <span className="relative z-10 mt-0.5">
              {current ? (
                <motion.span
                  animate={{ scale: [1, 1.25, 1] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-terracotta"
                >
                  <span className="h-2 w-2 rounded-full bg-[#FFF8EC]" />
                </motion.span>
              ) : (
                <span
                  className={clsx(
                    'flex h-6 w-6 items-center justify-center rounded-full',
                    reached ? 'bg-sage text-[#FFF8EC]' : 'border-2 border-ink/15 bg-surface'
                  )}
                >
                  {reached && <Check size={13} strokeWidth={3} />}
                </span>
              )}
            </span>
            <div>
              <p
                className={clsx(
                  'text-[15px] font-medium leading-6',
                  reached ? 'text-ink' : 'text-muted'
                )}
              >
                {stage.label}
              </p>
              {current && stage.key === 'enroute' && (
                <p className="text-[13px] text-muted">
                  {progress.courier.name} is {progress.courier.vehicle},{' '}
                  {progress.remainingMinutes} min away
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
