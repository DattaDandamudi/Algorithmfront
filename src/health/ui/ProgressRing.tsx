/**
 * ProgressRing — small (48–64 px) ring for step goals, hydration, etc.
 *
 * Same construction as Ring (a sunken well, an arc in the tone) but value/max
 * instead of a 0–100 band score, and no glow: phosphor is reserved for the
 * hero dial. Colour is a Tone name or any CSS colour string (only used inside
 * the SVG, per the no-inline-hex rule).
 */
import type { CSSProperties, ReactNode } from 'react';
import { clamp } from '../lib/format';
import { bandColor, type Tone } from './bands';

const TONES: Tone[] = ['green', 'yellow', 'red', 'neutral', 'blue'];

export interface ProgressRingProps {
  value: number | null | undefined;
  max: number;
  /** Tone name ('green' | 'blue' | …) or a CSS colour string. Default 'blue'. */
  color?: Tone | string;
  /** Outer diameter in px. Default 56. */
  size?: number;
  /** Stroke width in px. Default 6. */
  stroke?: number;
  /** Accessible name, e.g. "Steps". */
  label?: string;
  children?: ReactNode;
  className?: string;
}

export default function ProgressRing({ value, max, color = 'blue', size = 56, stroke = 6, label = 'Progress', children, className = '' }: ProgressRingProps) {
  const has = value !== null && value !== undefined && Number.isFinite(value) && max > 0;
  const frac = has ? clamp(value / max, 0, 1) : 0;
  const r = (size - stroke) / 2 - 1;
  const circ = 2 * Math.PI * r;
  const strokeColor = (TONES as string[]).includes(color) ? bandColor(color as Tone) : color;
  const aria = has ? `${label}: ${Math.round(value)} of ${Math.round(max)}, ${Math.round(frac * 100)} percent` : `${label}: no data yet`;
  const c = size / 2;

  return (
    <div className={`relative inline-block ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={aria} className="block overflow-visible">
        <circle cx={c} cy={c} r={r} fill="none" stroke="rgba(0,0,0,0.5)" strokeWidth={stroke + 1.5} />
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--hx-card-2)" strokeWidth={stroke} />
        {frac > 0 && (
          <circle
            cx={c}
            cy={c}
            r={r}
            fill="none"
            stroke={strokeColor}
            strokeWidth={stroke - 2}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - frac)}
            transform={`rotate(-90 ${c} ${c})`}
            className="hx-ring-arc"
            style={{ '--hx-ring-circ': `${circ}` } as CSSProperties}
          />
        )}
      </svg>
      {children && <div className="absolute inset-0 flex items-center justify-center text-center leading-none">{children}</div>}
    </div>
  );
}
