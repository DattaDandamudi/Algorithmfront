import { useEffect } from 'react';
import { motion } from 'motion/react';
import { createPortal } from 'react-dom';
import { AnimatedPrice } from '../../components/ui/AnimatedPrice';
import { platformColors } from '../../design/tokens';
import type { Platform } from '../catalog/types';

const PARTICLES = [
  { x: -70, y: -50, c: '#C4502F' },
  { x: 70, y: -60, c: '#7A8450' },
  { x: -90, y: 10, c: '#E8A33D' },
  { x: 90, y: 0, c: '#C4502F' },
  { x: -40, y: -90, c: '#E8A33D' },
  { x: 45, y: -95, c: '#7A8450' },
];

/** The app's one celebration: check draws in, six palette petals burst. */
export function Celebration({
  platform,
  totalCents,
  onDone,
}: {
  platform: Platform;
  totalCents: number;
  onDone: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDone, 2000);
    return () => clearTimeout(t);
  }, [onDone]);

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-[#2B2119]/45 p-4"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
        className="relative flex flex-col items-center rounded-cell border border-hairline bg-surface px-10 py-9 text-center shadow-cardHover"
      >
        <div className="relative">
          {PARTICLES.map((p, i) => (
            <motion.span
              key={i}
              initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
              animate={{ x: p.x, y: p.y, scale: 1, opacity: 0 }}
              transition={{ duration: 0.9, delay: 0.35, ease: 'easeOut' }}
              className="absolute left-1/2 top-1/2 h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: p.c }}
              aria-hidden="true"
            />
          ))}
          <svg viewBox="0 0 64 64" className="h-20 w-20">
            <motion.circle
              cx="32"
              cy="32"
              r="28"
              fill="none"
              stroke="#7A8450"
              strokeWidth="4"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.45, ease: 'easeOut' }}
            />
            <motion.path
              d="M20 33 L28 41 L44 24"
              fill="none"
              stroke="#7A8450"
              strokeWidth="4.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.4, delay: 0.35, ease: 'easeOut' }}
            />
          </svg>
        </div>
        <h2 className="mt-4 font-display text-2xl font-semibold">
          Order placed with {platformColors[platform].label}
        </h2>
        <AnimatedPrice cents={totalCents} className="mt-2 text-[28px] font-semibold text-ink" />
        <p className="mt-1 text-[13px] text-muted">Taking you to live tracking…</p>
      </motion.div>
    </motion.div>,
    document.body
  );
}
