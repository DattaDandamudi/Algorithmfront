/**
 * Ring — the 44 px hairline dial (DESIGN.md "Data marks").
 *
 * A 1 px --hx-border track, two 1 px notches at 34 and 67 (the band cuts, so
 * the arc reads against real thresholds) and a 2.5 px arc in the band's token
 * with butt caps that draws in on mount (.hx-ring-arc). No well, no glow.
 * Calibrating (value null) draws the track only: no arc element exists, so no
 * band stroke appears in the markup. `role="img"` with "Readiness: 72 out of
 * 100, on track" is unchanged. The numeral lives beside the dial as type;
 * children are still centred over it for callers that have not moved theirs
 * out yet. `glow` is accepted and ignored.
 */
import type { CSSProperties, ReactNode } from 'react';
import type { Band } from '../data/types';
import { clamp } from '../lib/format';
import { bandColor, bandLabel } from './bands';

export interface RingProps {
  /** 0–100, or null when there is no signal. */
  value: number | null;
  band: Band;
  /** Outer diameter in px. Default 44. */
  size?: number;
  /** Arc width in px. Default 2.5. The track is always 1 px. */
  stroke?: number;
  /** Accessible name prefix, e.g. "Readiness". */
  label?: string;
  /** Kept for callers; there is no glow on black stock. */
  glow?: boolean;
  children?: ReactNode;
  className?: string;
}

/** The band cuts, as fractions of the dial. */
const NOTCHES = [0.34, 0.67];
const r2 = (n: number) => Math.round(n * 100) / 100;

export default function Ring(props: RingProps) {
  const { value, band, size = 44, stroke = 2.5, label = 'Score', children, className = '' } = props;
  const has = value !== null && Number.isFinite(value);
  const frac = has ? clamp(value, 0, 100) / 100 : 0;
  const c = size / 2;
  const r = c - stroke / 2 - 2;
  const circ = 2 * Math.PI * r;
  const color = bandColor(has ? band : 'neutral');
  const aria = has ? `${label}: ${Math.round(value)} out of 100, ${bandLabel(band).toLowerCase()}` : `${label}: no data yet`;

  return (
    <div className={`relative inline-block ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={aria} className="block overflow-visible">
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--hx-border)" strokeWidth={1} />
        {NOTCHES.map((p) => {
          const a = (p * 360 - 90) * (Math.PI / 180);
          const cos = Math.cos(a);
          const sin = Math.sin(a);
          return (
            <line
              key={p}
              x1={r2(c + (r - 2.5) * cos)}
              y1={r2(c + (r - 2.5) * sin)}
              x2={r2(c + (r + 2.5) * cos)}
              y2={r2(c + (r + 2.5) * sin)}
              stroke="var(--hx-text-2)"
              strokeWidth={1}
            />
          );
        })}
        {has && frac > 0 && (
          <circle
            cx={c}
            cy={c}
            r={r}
            fill="none"
            stroke={color}
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
      {children && <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>}
    </div>
  );
}
