/**
 * Shared chrome for the Train tab's cards, in the bento (DESIGN.md "Bento
 * rules"). A twin of the Trends screen's `TrendCard` rather than an import of
 * it, so the two tabs can evolve their chrome independently (ownership §2a).
 *
 * Two shapes, one component, and both span the grid:
 *  - **section** (default) — a display heading on the grid ground (`h2`), then
 *    the `.hx-card` surface. Use it when the heading introduces a group.
 *  - **tile** — one span-2 `.hx-card` with its heading inside (`h3`). Use it
 *    when the card is a single reading.
 *
 * Both end with the mandatory one-line "what this means" caption at the foot
 * of the card. When a card has nothing to draw it passes `empty` (an
 * `<EmptyState>`) and the card surface is skipped, so the dashed empty card is
 * never nested inside another surface.
 *
 * The surface is `overflow-hidden` for the same reason it is on Trends: the
 * charts' visually-hidden table twins are absolutely positioned and a <table>
 * never shrinks below its content width, so without it a wide hidden table
 * would push the document past the 390 px frame.
 *
 * `Stat` is the small label / number / unit block the gauges and the sheets
 * use — 22 px display numerals, secondary to a tile's 28 px. Null renders "—"
 * — never a placeholder number — and any tone is always accompanied by a word,
 * because no state on this tab may be carried by colour alone. `Note` is the
 * muted evidence footnote (`LOAD_NOTES`, `PROGRESSION_NOTES`).
 */
import type { ReactNode } from 'react';
import { SectionHeader, bandText, type Tone } from '../../ui';

export interface TrainCardProps {
  title: string;
  caption?: string;
  action?: ReactNode;
  /** One line under the content explaining how to read it. */
  meaning?: ReactNode;
  /** Replaces the card surface entirely (an <EmptyState>). */
  empty?: ReactNode;
  /** Put the heading inside the tile (h3) instead of on the ground (h2). */
  tile?: boolean;
  /** Extra classes on the card surface. */
  className?: string;
  children?: ReactNode;
}

export function TrainCard({ title, caption, action, meaning, empty, tile = false, className = '', children }: TrainCardProps) {
  const foot = meaning ? (
    <p className="text-[13px] leading-[18px] text-hx-text2 border-t border-hx-border/70 pt-3">
      <span className="text-hx-muted">What this means: </span>
      {meaning}
    </p>
  ) : null;

  const surface = `hx-card p-4 flex flex-col gap-4 overflow-hidden ${className}`;

  if (tile) {
    return (
      <section aria-label={title} className="hx-span-2 flex flex-col gap-3">
        {empty ? (
          <>
            <SectionHeader as="h3" title={title} caption={caption} action={action} />
            {empty}
          </>
        ) : (
          <div className={surface}>
            <SectionHeader as="h3" title={title} caption={caption} action={action} />
            {children}
            {foot}
          </div>
        )}
      </section>
    );
  }

  return (
    <section aria-label={title} className="hx-span-2 flex flex-col gap-3">
      <SectionHeader title={title} caption={caption} action={action} />
      {empty ?? (
        <div className={surface}>
          {children}
          {foot}
        </div>
      )}
    </section>
  );
}

export interface StatProps {
  label: string;
  value: string;
  unit?: string;
  /** Small line under the number; always a word, never only a colour. */
  sub?: ReactNode;
  tone?: Tone;
  className?: string;
}

export function Stat({ label, value, unit, sub, tone, className = '' }: StatProps) {
  return (
    <div className={`min-w-0 ${className}`}>
      <p className="hx-label">{label}</p>
      <p className="hx-display mt-1 text-[22px] leading-7 font-semibold text-hx-text">
        {value}
        {unit && <span className="text-[13px] font-normal text-hx-text2 ml-1">{unit}</span>}
      </p>
      {sub !== undefined && sub !== null && (
        <p className={`mt-0.5 text-[13px] leading-[18px] ${tone ? `font-medium ${bandText(tone)}` : 'text-hx-text2'}`}>{sub}</p>
      )}
    </div>
  );
}

/** A muted footnote — the evidence hedges (`LOAD_NOTES`, `VOLUME_ADVISORY_NOTE`). */
export function Note({ children }: { children: ReactNode }) {
  return <p className="text-[13px] leading-[18px] text-hx-muted">{children}</p>;
}
