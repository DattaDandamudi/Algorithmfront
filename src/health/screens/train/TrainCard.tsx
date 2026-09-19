/**
 * The Train tab's small page furniture (DESIGN.md "Layout grammar"). No
 * surfaces: a section is bounded by its running head above and space or the
 * next ink rule below, never by a border.
 *
 *  - `TrainCard` — a section: the running head (`SectionHeader`; `rule` draws
 *    the ink rule, off by default so each view spends its three rules on
 *    purpose), the content 16 px beneath, and an optional "What this means"
 *    line set as a hedge. `empty` replaces the content with an `<EmptyState>`.
 *  - `Stat` — a box-score cell: `.hx-label`, the figure in `.hx-fig-sm` (or
 *    `.hx-fig` with `size="lg"`) with its unit in `.hx-unit`, and a band line
 *    beneath that always carries a word (a tone square joins it when a tone is
 *    passed, because no state on this tab is carried by colour alone). Place
 *    cells straight inside `.hx-score-grid`; `StatGrid` does that and turns a
 *    trailing odd cell into a full-width row so the grid never ends on a lone
 *    cell beside an empty one.
 *  - `Note` — an evidence footnote (`LOAD_NOTES`, `PROGRESSION_NOTES`,
 *    `VOLUME_ADVISORY_NOTE`) in `.hx-cap`: 13 px Literata at the second ink
 *    density, never muted.
 */
import type { ReactNode } from 'react';
import { SectionHeader, bandText, type Tone } from '../../ui';

export interface TrainCardProps {
  title: string;
  caption?: string;
  action?: ReactNode;
  /** One line under the content explaining how to read it. */
  meaning?: ReactNode;
  /** Replaces the content entirely (an <EmptyState>). */
  empty?: ReactNode;
  /** Draw the full-bleed ink rule above the running head. Default false. */
  rule?: boolean;
  /** Heading level. Default h2. */
  as?: 'h2' | 'h3';
  /** Extra classes on the section (the screen owns the space above it). */
  className?: string;
  children?: ReactNode;
}

export function TrainCard({ title, caption, action, meaning, empty, rule = false, as = 'h2', className = '', children }: TrainCardProps) {
  return (
    <section aria-label={title} className={`flex flex-col ${className}`}>
      <SectionHeader as={as} rule={rule} title={title} caption={caption} action={action} />
      {empty ?? (
        <div className="mt-4 flex flex-col">
          {children}
          {meaning && (
            <p className="hx-hedge mt-3">
              <span>What this means: </span>
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
  /** `sm` sets the figure in .hx-fig-sm (28 px), `lg` in .hx-fig (40 px). */
  size?: 'sm' | 'lg';
  className?: string;
}

export function Stat({ label, value, unit, sub, tone, size = 'sm', className = '' }: StatProps) {
  return (
    <div className={`hx-cell ${className}`}>
      <span className="hx-label">{label}</span>
      <span className={`${size === 'lg' ? 'hx-fig' : 'hx-fig-sm'} text-hx-text mt-1`}>
        {value}
        {unit && <span className="hx-unit">{unit}</span>}
      </span>
      {sub !== undefined && sub !== null && sub !== '' && (
        <span className={`mt-1 ${tone ? `hx-label ${bandText(tone)}` : 'hx-cap'}`}>
          {tone && tone !== 'neutral' && <span className="hx-tone mr-1.5" aria-hidden />}
          {sub}
        </span>
      )}
    </div>
  );
}

/**
 * A box score from a list of stats. Two-up cells with the column rule and the
 * row hairlines `.hx-score-grid` draws; an odd last stat becomes a full-width
 * `.hx-row` (label left, figure flush right) under its own hairline.
 */
export function StatGrid({ stats, size = 'sm', className = '' }: { stats: StatProps[]; size?: 'sm' | 'lg'; className?: string }) {
  const even = stats.length % 2 === 0;
  const cells = even ? stats : stats.slice(0, -1);
  const tail = even ? null : stats[stats.length - 1];
  return (
    <div className={`hx-score-grid ${className}`}>
      {cells.map((s) => (
        <Stat key={s.label} size={size} {...s} />
      ))}
      {tail && (
        <div className={`hx-row ${cells.length > 0 ? 'border-t border-hx-border' : ''}`}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="hx-label">{tail.label}</span>
            <span className={`${size === 'lg' ? 'hx-fig' : 'hx-fig-sm'} text-hx-text text-right shrink-0`}>
              {tail.value}
              {tail.unit && <span className="hx-unit">{tail.unit}</span>}
            </span>
          </div>
          {tail.sub !== undefined && tail.sub !== null && tail.sub !== '' && (
            <span className={`mt-1 ${tail.tone ? `hx-label ${bandText(tail.tone)}` : 'hx-cap'}`}>
              {tail.tone && tail.tone !== 'neutral' && <span className="hx-tone mr-1.5" aria-hidden />}
              {tail.sub}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** An evidence footnote in `.hx-cap` (13 px Literata, second ink density). */
export function Note({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`hx-cap ${className}`}>{children}</p>;
}
