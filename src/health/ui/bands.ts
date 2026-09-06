/**
 * Band → colour helpers (SPEC §0: one semantic colour per state).
 *
 * Green = on-track / ≥67 %, Yellow = caution / 34–66 %, Red = off-track / <34 %,
 * Neutral = baseline / no signal. Blue is the informational/AI accent and is
 * accepted everywhere a Band is (`Tone`), so chips, bars and banners can use
 * it without a second type. Tailwind needs the full class string in source,
 * hence the lookup tables instead of template strings.
 */
import type { Band } from '../data/types';

export type Tone = Band | 'blue';

const CSS_VAR: Record<Tone, string> = {
  green: 'var(--hx-green)',
  yellow: 'var(--hx-yellow)',
  red: 'var(--hx-red)',
  neutral: 'var(--hx-neutral)',
  blue: 'var(--hx-blue)',
};

const TEXT: Record<Tone, string> = {
  green: 'text-hx-green',
  yellow: 'text-hx-yellow',
  red: 'text-hx-red',
  neutral: 'text-hx-neutral',
  blue: 'text-hx-blue',
};

const BG: Record<Tone, string> = {
  green: 'bg-hx-green',
  yellow: 'bg-hx-yellow',
  red: 'bg-hx-red',
  neutral: 'bg-hx-neutral',
  blue: 'bg-hx-blue',
};

/** ~10–15 % wash, for chips / banners / zones (never for text). */
const SOFT_BG: Record<Tone, string> = {
  green: 'bg-hx-green/15',
  yellow: 'bg-hx-yellow/15',
  red: 'bg-hx-red/15',
  neutral: 'bg-hx-neutral/15',
  blue: 'bg-hx-blue/15',
};

const BORDER: Record<Tone, string> = {
  green: 'border-hx-green',
  yellow: 'border-hx-yellow',
  red: 'border-hx-red',
  neutral: 'border-hx-neutral',
  blue: 'border-hx-blue',
};

const LABEL: Record<Tone, string> = {
  green: 'On track',
  yellow: 'Caution',
  red: 'Off track',
  neutral: 'No signal',
  blue: 'Info',
};

/** CSS colour string, e.g. `var(--hx-green)` — for SVG fills/strokes and inline styles. */
export function bandColor(band: Tone): string {
  return CSS_VAR[band] ?? CSS_VAR.neutral;
}

/** Tailwind text class, e.g. `text-hx-green`. */
export function bandText(band: Tone): string {
  return TEXT[band] ?? TEXT.neutral;
}

/** Tailwind solid background class, e.g. `bg-hx-green`. */
export function bandBg(band: Tone): string {
  return BG[band] ?? BG.neutral;
}

/** Tailwind 15 % wash background class, e.g. `bg-hx-green/15`. */
export function bandSoftBg(band: Tone): string {
  return SOFT_BG[band] ?? SOFT_BG.neutral;
}

/** Tailwind border-colour class, e.g. `border-hx-green` (left rails). */
export function bandBorder(band: Tone): string {
  return BORDER[band] ?? BORDER.neutral;
}

/** Human label for a band ("On track" / "Caution" / "Off track" / "No signal"). */
export function bandLabel(band: Tone): string {
  return LABEL[band] ?? LABEL.neutral;
}

/**
 * WHOOP recovery bands (SPEC §1): green ≥ 67, yellow 34–66, red < 34, neutral
 * when there is no score. Display-only helper — engines compute their own.
 */
export function bandFromScore(score: number | null | undefined): Band {
  if (score === null || score === undefined || Number.isNaN(score)) return 'neutral';
  if (score >= 67) return 'green';
  if (score >= 34) return 'yellow';
  return 'red';
}

/** Colour for a delta glyph: green when the direction is good, red when bad, neutral otherwise. */
export function deltaTone(good: boolean | null | undefined, delta: number | null | undefined): Tone {
  if (good === null || good === undefined || delta === null || delta === undefined) return 'neutral';
  if (delta === 0) return 'neutral';
  return good ? 'green' : 'red';
}
