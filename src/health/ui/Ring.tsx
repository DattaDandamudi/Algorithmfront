/**
 * Ring — the hero dial (SPEC §1 "Readiness", 0–100; DESIGN.md "instrument").
 *
 * Drawn as a real gauge: a sunken well for the track (two concentric strokes,
 * shade then specular, so it reads as a groove milled into the surface), and
 * the arc in the band colour with a phosphor glow — the one `.hx-lume-glow` on a
 * screen. The arc sweeps in on mount (`.hx-ring-arc`) and its glow blooms a beat
 * later (`.hx-bloom`): the single orchestrated moment the design allows.
 *
 * Centre content (big number + verdict) is passed as children. `role="img"`
 * with "Readiness: 72 out of 100, on track" is unchanged.
 */
import type { CSSProperties, ReactNode } from 'react';
import type { Band } from '../data/types';
import { clamp } from '../lib/format';
import { bandColor, bandLabel } from './bands';

export interface RingProps {
  /** 0–100, or null when there is no signal. */
  value: number | null;
  band: Band;
  /** Outer diameter in px. Default 216 (hero). */
  size?: number;
  /** Stroke width in px. Default 14. */
  stroke?: number;
  /** Accessible name prefix, e.g. "Readiness". */
  label?: string;
  /** Phosphor glow on the arc. On by default; off for secondary rings. */
  glow?: boolean;
  children?: ReactNode;
  className?: string;
}

export default function Ring({ value, band, size = 216, stroke = 14, label = 'Score', glow = true, children, className = '' }: RingProps) {
  const has = value !== null && Number.isFinite(value);
  const frac = has ? clamp(value, 0, 100) / 100 : 0;
  const r = (size - stroke) / 2 - 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - frac);
  const color = has ? bandColor(band) : bandColor('neutral');
  const aria = has ? `${label}: ${Math.round(value)} out of 100, ${bandLabel(band).toLowerCase()}` : `${label}: no data yet`;
  const arcStyle = { '--hx-ring-circ': `${circ}`, color } as CSSProperties;
  const c = size / 2;

  return (
    <div className={`relative inline-block ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={aria} className="block overflow-visible">
        {/* The well: shade below, specular above, so the groove has a lip. */}
        <circle cx={c} cy={c} r={r} fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth={stroke + 2} />
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--hx-card)" strokeWidth={stroke} />
        <circle cx={c} cy={c + 1} r={r} fill="none" stroke="rgba(233,241,255,0.06)" strokeWidth={stroke} />
        {frac > 0 && (
          <circle
            cx={c}
            cy={c}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke - 4}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${c} ${c})`}
            className={`hx-ring-arc ${glow ? 'hx-lume-glow hx-bloom' : ''}`}
            style={arcStyle}
          />
        )}
      </svg>
      {children && <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">{children}</div>}
    </div>
  );
}
