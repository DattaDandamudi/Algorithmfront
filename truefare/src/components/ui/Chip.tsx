import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import clsx from 'clsx';
import { springs } from '../../design/motion';

interface ChipProps {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  className?: string;
  tone?: 'neutral' | 'sage' | 'saffron' | 'terracotta';
}

const TONE = {
  neutral: 'bg-blush text-ink',
  sage: 'bg-pistachio text-ink',
  saffron: 'bg-saffron/20 text-ink',
  terracotta: 'bg-terracotta/12 text-terracotta',
};

export function Chip({ children, active, onClick, className, tone = 'neutral' }: ChipProps) {
  const base = clsx(
    'inline-flex items-center gap-1 rounded-pill px-3 py-1.5 text-[13px] font-medium',
    active ? 'bg-ink text-ground' : TONE[tone],
    className
  );
  if (!onClick) return <span className={base}>{children}</span>;
  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      transition={springs.snappy}
      onClick={onClick}
      className={clsx(base, 'cursor-pointer transition-colors')}
    >
      {children}
    </motion.button>
  );
}
