/**
 * Ring — hero SVG ring gauge (SPEC §1 "Readiness", 0–100).
 *
 * Track in var(--hx-border), arc in the band colour (neutral when null),
 * rounded caps, animated by `.hx-ring-arc` (health.css) which sweeps
 * stroke-dashoffset from --hx-ring-circ to the value. Centre content
 * (big number + verdict) is passed as children.
 */
import type { CSSProperties, ReactNode } from 'react';
import type { Band } from '../data/types';
import { clamp } from '../lib/format';
import { bandColor, bandLabel } from './bands';

export interface RingProps {
  /** 0–100, or null when there is no signal. */
  value: number | null;
  band: Band;
  /** Outer diameter in px. Default 220 (hero). */
  size?: number;
  /** Stroke width in px. Default 14. */
  stroke?: number;
  /** Accessible name prefix, e.g. "Readiness". */
  label?: string;
  children?: ReactNode;
  className?: string;
}

export default function Ring({
  value,
  band,
  size = 220,
  stroke = 14,
  label = 'Score',
  children,
  className = '',
}: RingProps) {
  const has = value !== null && Number.isFinite(value);
  const frac = has ? clamp(value, 0, 100) / 100 : 0;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - frac);
  const color = has ? bandColor(band) : bandColor('neutral');
  const aria = has
    ? `${label}: ${Math.round(value)} out of 100, ${bandLabel(band).toLowerCase()}`
    : `${label}: no data yet`;
  // --hx-ring-circ feeds the keyframe start (full offset = empty ring).
  const arcStyle = { '--hx-ring-circ': `${circ}` } as CSSProperties;

  return (
    <div className={`relative inline-block ${className}`} style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={aria}
        className="block"
      >
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--hx-border)" strokeWidth={stroke} />
        {frac > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            className="hx-ring-arc"
            style={arcStyle}
          />
        )}
      </svg>
      {children && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
          {children}
        </div>
      )}
    </div>
  );
}
