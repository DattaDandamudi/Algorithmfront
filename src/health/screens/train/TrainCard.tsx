/**
 * Shared chrome for the Train tab's cards: a `.hx-label` section header, the
 * `.hx-card` surface, and an optional "what this means" line at the foot.
 * A twin of the Trends screen's `TrendCard` rather than an import of it, so
 * the two tabs can evolve their chrome independently (ownership rule §2a).
 *
 * The surface is `overflow-hidden` for the same reason it is on Trends: the
 * charts' visually-hidden table twins are absolutely positioned and a <table>
 * never shrinks below its content width, so without it a wide hidden table
 * would push the document past the 390 px frame.
 *
 * `Stat` is the small label / number / unit block the gauges use. Null renders
 * "—" — never a placeholder number — and any tone is always accompanied by a
 * word, because no state on this tab may be carried by colour alone.
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
  children?: ReactNode;
}

export function TrainCard({ title, caption, action, meaning, empty, children }: TrainCardProps) {
  return (
    <section aria-label={title} className="flex flex-col gap-3">
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
      <p className="text-[11px] leading-4 text-hx-muted">{label}</p>
      <p className="text-[22px] leading-7 font-semibold text-hx-text tabular-nums">
        {value}
        {unit && <span className="text-[13px] font-normal text-hx-text2 ml-1">{unit}</span>}
      </p>
      {sub !== undefined && sub !== null && (
        <p className={`text-[12px] leading-4 ${tone ? bandText(tone) : 'text-hx-text2'}`}>{sub}</p>
      )}
    </div>
  );
}

/** A muted footnote — the evidence hedges (`LOAD_NOTES`, `VOLUME_ADVISORY_NOTE`). */
export function Note({ children }: { children: ReactNode }) {
  return <p className="text-[11px] leading-4 text-hx-muted">{children}</p>;
}
