/**
 * Shared chrome for every Trends card (SPEC §3): a `.hx-label` section header
 * with an optional action, the `.hx-card` surface, and the mandatory one-line
 * "what this means" caption at the foot of the card. When a card has nothing
 * to draw it passes `empty` (an <EmptyState> with the spec copy) and the card
 * surface is skipped so the dashed empty card is not nested inside another.
 *
 * The card surface is `overflow-hidden`: the charts' visually-hidden table
 * twins (`HiddenTable`, `.sr-only`) are absolutely positioned and a <table>
 * never shrinks below its content width, so a 5-column band table would
 * otherwise extend the document's scrollable width past the 390 px frame.
 *
 * `Readout` is the small label / number / unit block used in readout rows —
 * 22 px tabular numerals (tile numbers are 28–32 px; these are secondary),
 * null → "—" (never a placeholder number), state text coloured by tone only.
 */
import type { ReactNode } from 'react';
import { fmt } from '../../lib/format';
import { Delta, SectionHeader, bandBg, bandText, type Tone } from '../../ui';

export interface TrendCardProps {
  title: string;
  caption?: string;
  action?: ReactNode;
  /** One line under the chart explaining how to read the card. */
  meaning?: ReactNode;
  /** Replaces the card surface (an <EmptyState>). */
  empty?: ReactNode;
  children?: ReactNode;
}

export function TrendCard({ title, caption, action, meaning, empty, children }: TrendCardProps) {
  return (
    <section aria-label={title} className="px-4 pb-5 flex flex-col gap-3">
      <SectionHeader title={title} caption={caption} action={action} />
      {empty ?? (
        <div className="hx-card p-4 flex flex-col gap-4 overflow-hidden">
          {children}
          {meaning && (
            <p className="text-[12px] leading-4 text-hx-text2 border-t border-hx-border pt-3">
              <span className="text-hx-muted">What this means · </span>
              {meaning}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

export interface ReadoutProps {
  label: string;
  value: string | number | null | undefined;
  /** Decimal places when `value` is a number. Default 0. */
  dp?: number;
  unit?: string;
  /** Small line under the number; coloured by `tone` when given (state text only). */
  sub?: ReactNode;
  tone?: Tone;
  className?: string;
}

export function Readout({ label, value, dp = 0, unit, sub, tone, className = '' }: ReadoutProps) {
  const has = value !== null && value !== undefined && value !== '' && !(typeof value === 'number' && Number.isNaN(value));
  const text = !has ? '—' : typeof value === 'number' ? fmt(value, dp) : value;
  return (
    <div className={`min-w-0 flex flex-col ${className}`}>
      <span className="hx-label truncate">{label}</span>
      <div className="mt-1 flex items-baseline gap-1 min-w-0">
        <span className={`text-[22px] leading-7 font-semibold tracking-tight truncate ${has ? 'text-hx-text' : 'text-hx-muted'}`}>{text}</span>
        {has && unit && <span className="text-[12px] font-medium text-hx-text2 shrink-0">{unit}</span>}
      </div>
      {sub && <div className={`mt-0.5 text-[12px] leading-4 ${tone ? `font-medium ${bandText(tone)}` : 'text-hx-text2'}`}>{sub}</div>}
    </div>
  );
}

/** A short status line with a tone dot — band state, gate status, baseline note. */
export function Note({ tone = 'neutral', children, className = '' }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <p className={`flex items-start gap-2 text-[13px] leading-5 text-hx-text2 ${className}`}>
      <span className={`mt-[7px] w-1.5 h-1.5 rounded-full shrink-0 ${bandBg(tone)}`} aria-hidden />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

export interface DeltaSubProps {
  value: number | null | undefined;
  good: boolean | null | undefined;
  dp?: number;
  unit?: string;
  /** Default "vs 30-day avg". */
  caption?: string;
}

/**
 * ▲/▼ delta for a narrow (3-column) readout: the glyph + number never wrap
 * apart, and the caption drops to its own muted line instead of splitting.
 */
export function DeltaSub({ value, good, dp, unit, caption = 'vs 30-day avg' }: DeltaSubProps) {
  return (
    <span className="flex flex-col">
      <Delta value={value} good={good} dp={dp} unit={unit} caption="" className="whitespace-nowrap" />
      <span className="text-hx-muted">{caption}</span>
    </span>
  );
}
