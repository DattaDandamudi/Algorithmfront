/**
 * Chip — a tag (training verdict, coach quick prompts, filters, toggles).
 *
 * 44 px, a 1 px rule in the tone (text2 when neutral), 4 px radius, .hx-label
 * inside, transparent. Idle chips carry the tone only as their rule; `active`
 * keeps the exact tone wash classes the hero tests pin (`bg-hx-red/15
 * text-hx-red border-hx-red/40`) and adds a tone square, so colour is never
 * the only carrier. Both sizes are 44 px tall; `sm` only tightens the padding.
 * `active` is purely visual; pass `pressed` on real toggles so aria-pressed is
 * announced only where it is true (review R6-11).
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { Tone } from './bands';

export interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'color'> {
  children: ReactNode;
  active?: boolean;
  /** Set on genuine toggles only — drives aria-pressed. */
  pressed?: boolean;
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

const IDLE: Record<Tone, string> = {
  neutral: 'text-hx-text2 border-hx-text2 hover:text-hx-text hover:border-hx-text',
  green: 'text-hx-text2 border-hx-green hover:text-hx-text',
  yellow: 'text-hx-text2 border-hx-yellow hover:text-hx-text',
  red: 'text-hx-text2 border-hx-red hover:text-hx-text',
  blue: 'text-hx-text2 border-hx-blue hover:text-hx-text',
};

export default function Chip({ children, active, pressed, color = 'neutral', icon, size = 'md', className = '', type = 'button', ...rest }: ChipProps) {
  const pad = size === 'sm' ? 'px-3' : 'px-4';
  return (
    <button
      type={type}
      aria-pressed={pressed === undefined ? undefined : pressed}
      className={`hx-tag hx-label hx-press disabled:opacity-50 disabled:cursor-not-allowed ${pad} ${active ? ACTIVE[color] : IDLE[color]} ${className}`}
      {...rest}
    >
      {active && <span className="hx-tone" aria-hidden />}
      {icon && <span className="inline-flex shrink-0 [&>svg]:w-4 [&>svg]:h-4">{icon}</span>}
      {/* No truncation: a chip sizes to its label; a scroll row or flex-wrap parent handles overflow. */}
      <span>{children}</span>
    </button>
  );
}
