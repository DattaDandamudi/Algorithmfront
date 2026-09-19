/**
 * Shared chrome for every Trends figure (SPEC §3, DESIGN.md "Trends").
 *
 * A card became a figure: a running head (the metric) with a dateline of
 * true metadata flush right and a ghost verb in the action slot, then a
 * `<figure class="hx-figure">` holding the `.hx-fig` lead with its band word
 * and tone square, the rate sentence as `.hx-deck`, the chart, a source line
 * in `.hx-cap` and the engine's meaning sentence as the italic figcaption
 * ("What this means: …" keeps its lead). No ground, no border, no radius, no
 * shadow: the figure is bounded by its running head and the next one, 40 px
 * below it. `rule` draws the ink rule above the head and is passed only by
 * the first figure of each of the three groups (body; sleep and recovery;
 * training and stress), so the screen spends exactly three.
 *
 * When a card has nothing to draw it passes `empty` (an <EmptyState> with the
 * spec copy) in place of the figure.
 *
 * `Lead` is the 40 px figure with its unit inside, a band word beside it and
 * an optional caption line; `Readout` is a box-score cell for `.hx-score-grid`
 * (label, `.hx-fig`, a caption or a tone word); `Note` is a `.hx-note` with
 * the tone word first. `Word` is the tone word with its square on its own.
 */
import type { ReactNode } from 'react';
import { fmt } from '../../lib/format';
import { Delta, SectionHeader, bandBorder, bandLabel, bandText, type Tone } from '../../ui';

export interface TrendCardProps {
  title: string;
  /** The dateline: true metadata, flush right in .hx-hedge. */
  caption?: string;
  /** A ghost verb ("Ask the coach"). */
  action?: ReactNode;
  /** Draw the ink rule above the running head (three per screen, one per group). */
  rule?: boolean;
  /** The source line under the chart, in .hx-cap ("Kalman-smoothed, 90% band; 24 weigh-ins in 30 days"). */
  source?: ReactNode;
  /** The engine's meaning sentence: the figcaption, after "What this means:". */
  meaning?: ReactNode;
  /** Replaces the figure (an <EmptyState>). */
  empty?: ReactNode;
  /** Accepted for callers; every card is a figure now. */
  tile?: boolean;
  className?: string;
  children?: ReactNode;
}

export function TrendCard({ title, caption, action, rule = false, source, meaning, empty, className = '', children }: TrendCardProps) {
  return (
    <section aria-label={title} className={`mt-6 ${className}`}>
      <SectionHeader as="h2" rule={rule} title={title} caption={caption} action={action} />
      {empty ? (
        <div className="py-4">{empty}</div>
      ) : (
        <figure className="hx-figure">
          <div className="flex flex-col gap-4">{children}</div>
          {source && <p className="hx-cap mt-3">{source}</p>}
          {meaning && (
            <figcaption>
              <span>What this means: </span>
              {meaning}
            </figcaption>
          )}
        </figure>
      )}
    </section>
  );
}

const hasValue = (value: unknown): value is string | number =>
  value !== null && value !== undefined && value !== '' && !(typeof value === 'number' && Number.isNaN(value));

/** A state word with its tone square: colour is never the only carrier. Without a tone it is a plain label. */
export function Word({ word, tone, className = '' }: { word: ReactNode; tone?: Tone; className?: string }) {
  return (
    <span className={`hx-label inline-flex items-baseline gap-1.5 ${tone ? bandText(tone) : ''} ${className}`}>
      {tone && <span className="hx-tone self-center" aria-hidden />}
      <span>{word}</span>
    </span>
  );
}

export interface LeadProps {
  /** An optional label above the figure, when the running head does not already name it ("Acute load"). */
  label?: string;
  value: string | number | null | undefined;
  /** Decimal places when `value` is a number. Default 0. */
  dp?: number;
  /** The unit, set inside the figure as .hx-unit. */
  unit?: string;
  /** The band word beside the figure; with `tone` it carries a tone square. */
  word?: ReactNode;
  tone?: Tone;
  /** A line under the lead in .hx-cap (a delta, a range). */
  sub?: ReactNode;
  className?: string;
}

/** The figure's lead: `.hx-fig` with its unit, the band word beside it, a caption beneath. */
export function Lead({ label, value, dp = 0, unit, word, tone, sub, className = '' }: LeadProps) {
  const has = hasValue(value);
  const text = !has ? '—' : typeof value === 'number' ? fmt(value, dp) : value;
  return (
    <div className={`flex flex-col ${className}`}>
      {label && <span className="hx-label">{label}</span>}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className={`hx-fig ${has ? 'text-hx-text' : 'text-hx-text2'}`}>
          {text}
          {has && unit && <span className="hx-unit">{unit}</span>}
        </span>
        {word && <Word word={word} tone={tone} />}
      </div>
      {sub && <div className="hx-cap mt-1">{sub}</div>}
    </div>
  );
}

export interface ReadoutProps {
  label: string;
  value: string | number | null | undefined;
  /** Decimal places when `value` is a number. Default 0. */
  dp?: number;
  unit?: string;
  /** A line under the figure: a caption, or a state word when `tone` is given. */
  sub?: ReactNode;
  tone?: Tone;
  className?: string;
}

/** A box-score cell: label, `.hx-fig` with its unit, a caption or a tone word. Place inside `.hx-score-grid`. */
export function Readout({ label, value, dp = 0, unit, sub, tone, className = '' }: ReadoutProps) {
  const has = hasValue(value);
  const text = !has ? '—' : typeof value === 'number' ? fmt(value, dp) : value;
  return (
    <div className={`hx-cell ${className}`}>
      <span className="hx-label">{label}</span>
      <span className={`hx-fig mt-1 ${has ? 'text-hx-text' : 'text-hx-text2'}`}>
        {text}
        {has && unit && <span className="hx-unit">{unit}</span>}
      </span>
      {sub && (tone ? <Word word={sub} tone={tone} className="mt-1" /> : <span className="hx-cap mt-1">{sub}</span>)}
    </div>
  );
}

/** A note: a 2 px left rule in the tone, the tone word first, the message in reading text. */
export function Note({ tone = 'neutral', lead, children, className = '' }: { tone?: Tone; lead?: string; children: ReactNode; className?: string }) {
  const word = lead ?? (tone === 'neutral' || tone === 'blue' ? 'Note' : bandLabel(tone));
  return (
    <div className={`hx-note ${bandBorder(tone)} ${className}`}>
      <p className="hx-body">
        <Word word={word} tone={tone} /> <span>{children}</span>
      </p>
    </div>
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

/** ▲/▼ delta for a caption line, set in Archivo (agate is always Archivo); the glyph and figure never wrap apart from the caption. */
export function DeltaSub({ value, good, dp, unit, caption = 'vs 30-day avg' }: DeltaSubProps) {
  return (
    <span className="font-sans inline-flex flex-wrap items-baseline gap-x-1">
      <Delta value={value} good={good} dp={dp} unit={unit} caption="" className="whitespace-nowrap" />
      <span>{caption}</span>
    </span>
  );
}
