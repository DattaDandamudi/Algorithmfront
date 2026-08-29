import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { motion } from 'motion/react';
import clsx from 'clsx';
import { springs } from '../../design/motion';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps
  extends Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart'
  > {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

const VARIANT: Record<Variant, string> = {
  primary:
    'bg-terracotta text-[#FFF8EC] hover:bg-terracotta-hover active:bg-terracotta-press',
  secondary:
    'bg-blush text-ink hover:brightness-[0.97] active:brightness-95',
  ghost:
    'bg-transparent text-ink border border-hairline hover:bg-blush/60',
  danger: 'bg-terracotta-press text-[#FFF8EC] hover:brightness-110',
};

const SIZE: Record<Size, string> = {
  sm: 'h-8 px-3.5 text-[13px] gap-1.5',
  md: 'h-10 px-5 text-sm gap-2',
  lg: 'h-12 px-6 text-[15px] gap-2',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', className, children, disabled, ...rest },
  ref
) {
  return (
    <motion.button
      ref={ref}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      transition={springs.snappy}
      disabled={disabled}
      className={clsx(
        'inline-flex items-center justify-center rounded-pill font-medium transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANT[variant],
        SIZE[size],
        className
      )}
      {...rest}
    >
      {children}
    </motion.button>
  );
});
