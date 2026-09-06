/**
 * Chip — pill button (training verdict, coach quick prompts, filters).
 *
 * sm = 36 px, md = 44 px tall. `active` toggles a 15 % tone wash and sets
 * aria-pressed so toggles read correctly. Colour is a semantic Tone.
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { Tone } from './bands';

export interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'color'> {
  children: ReactNode;
  active?: boolean;
  color?: Tone;
  icon?: ReactNode;
  size?: 'sm' | 'md';
}

const ACTIVE: Record<Tone, string> = {
  neutral: 'bg-hx-neutral/15 text-hx-text border-hx-neutral/40',
  green: 'bg-hx-green/15 text-hx-green border-hx-green/40',
  yellow: 'bg-hx-yellow/15 text-hx-yellow border-hx-yellow/40',
  red: 'bg-hx-red/15 text-hx-red border-hx-red/40',
  blue: 'bg-hx-blue/15 text-hx-blue border-hx-blue/40',
};

const IDLE = 'bg-hx-card2 text-hx-text2 border-hx-border hover:text-hx-text hover:border-hx-neutral';

export default function Chip({ children, active, color = 'neutral', icon, size = 'md', className = '', type = 'button', ...rest }: ChipProps) {
  const h = size === 'sm' ? 'h-9 px-3 text-[13px] gap-1.5' : 'h-11 px-4 text-[14px] gap-2';
  return (
    <button
      type={type}
      aria-pressed={active === undefined ? undefined : active}
      className={`inline-flex items-center justify-center rounded-full border font-medium whitespace-nowrap select-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${h} ${
        active ? ACTIVE[color] : IDLE
      } ${className}`}
      {...rest}
    >
      {icon && <span className="inline-flex shrink-0 [&>svg]:w-4 [&>svg]:h-4">{icon}</span>}
      <span className="truncate">{children}</span>
    </button>
  );
}
