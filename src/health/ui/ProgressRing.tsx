/**
 * ProgressRing — small (48–64 px) ring for step goals, hydration, etc.
 *
 * Same drawing rules as Ring (track in --hx-border, round caps, animated arc)
 * but value/max instead of a 0–100 band score. Colour is a Tone name or any
 * CSS colour string (only used inside the SVG, per the no-inline-hex rule).
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

export default function ProgressRing({
  value,
  max,
  color = 'blue',
  size = 56,
  stroke = 6,
  label = 'Progress',
  children,
  className = '',
}: ProgressRingProps) {
  const has = value !== null && value !== undefined && Number.isFinite(value) && max > 0;
  const frac = has ? clamp(value / max, 0, 1) : 0;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const strokeColor = (TONES as string[]).includes(color) ? bandColor(color as Tone) : color;
  const aria = has
    ? `${label}: ${Math.round(value)} of ${Math.round(max)}, ${Math.round(frac * 100)} percent`
    : `${label}: no data yet`;

  return (
    <div className={`relative inline-block ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={aria} className="block">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--hx-border)" strokeWidth={stroke} />
        {frac > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={strokeColor}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - frac)}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            className="hx-ring-arc"
            style={{ '--hx-ring-circ': `${circ}` } as CSSProperties}
          />
        )}
      </svg>
      {children && (
        <div className="absolute inset-0 flex items-center justify-center text-center leading-none">{children}</div>
      )}
    </div>
  );
}
