import { useCallback, useRef } from 'react';
import type { ReactNode, MouseEvent } from 'react';
import { motion } from 'motion/react';
import clsx from 'clsx';
import { springs } from '../../design/motion';

interface BentoCellProps {
  children: ReactNode;
  className?: string;
  /** Uppercase kicker label rendered at the top of the cell. */
  label?: string;
  /** Lift + spotlight on hover (default true). */
  interactive?: boolean;
  onClick?: () => void;
}

/**
 * The app's bento building block: hairline border, one elevation step,
 * 28px radius, 24px padding, optional label slot, cursor spotlight, and
 * a translateY spring on hover. Never rearranges the grid.
 */
export function BentoCell({
  children,
  className,
  label,
  interactive = true,
  onClick,
}: BentoCellProps) {
  const ref = useRef<HTMLDivElement>(null);

  const onMouseMove = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--x', `${e.clientX - rect.left}px`);
    el.style.setProperty('--y', `${e.clientY - rect.top}px`);
  }, []);

  return (
    <motion.div
      ref={ref}
      onMouseMove={interactive ? onMouseMove : undefined}
      onClick={onClick}
      whileHover={interactive ? { y: -5, scale: 1.015 } : undefined}
      transition={springs.standard}
      className={clsx(
        'spotlight-cell rounded-cell border border-hairline bg-surface p-6 shadow-card',
        interactive && 'transition-shadow duration-300 hover:shadow-cardHover',
        onClick && 'cursor-pointer',
        className
      )}
    >
      {label && <div className="label-caps mb-3">{label}</div>}
      {children}
    </motion.div>
  );
}
