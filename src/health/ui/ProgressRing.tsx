/**
 * ProgressRing — a 32 px dial kept for the places a ring is still wanted
 * (hydration). A 1 px --hx-border track and a 2 px arc with butt caps in the
 * tone; value/max instead of a 0–100 band score. Elsewhere use the progress
 * rule (MacroBar, or a 2 px .hx-hair with an ink fill). Colour is a Tone name
 * or any CSS colour string, used only inside the SVG.
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
  /** Outer diameter in px. Default 32. */
  size?: number;
  /** Arc width in px. Default 2. The track is always 1 px. */
  stroke?: number;
  /** Accessible name, e.g. "Steps". */
  label?: string;
  children?: ReactNode;
  className?: string;
}

export default function ProgressRing({ value, max, color = 'blue', size = 32, stroke = 2, label = 'Progress', children, className = '' }: ProgressRingProps) {
  const has = value !== null && value !== undefined && Number.isFinite(value) && max > 0;
  const frac = has ? clamp(value / max, 0, 1) : 0;
  const c = size / 2;
  const r = c - stroke / 2 - 1;
  const circ = 2 * Math.PI * r;
  const strokeColor = (TONES as string[]).includes(color) ? bandColor(color as Tone) : color;
  const aria = has ? `${label}: ${Math.round(value)} of ${Math.round(max)}, ${Math.round(frac * 100)} percent` : `${label}: no data yet`;

  return (
    <div className={`relative inline-block ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={aria} className="block overflow-visible">
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--hx-border)" strokeWidth={1} />
        {frac > 0 && (
          <circle
            cx={c}
            cy={c}
            r={r}
            fill="none"
            stroke={strokeColor}
            strokeWidth={stroke}
            strokeLinecap="butt"
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
