/**
 * Weekly hard sets per muscle — 15 muscles × 12 weeks as a heat map
 * (DESIGN.md "Data marks"): a grid of cells filled by ink density (bone at
 * 12 / 28 / 50 / 80 percent for the four bands, an outlined cell for a week
 * with no sets), the muscle in agate at the left, the current week's set
 * count and band word in the row's right margin with a tone square, and the
 * legend written as words.
 *
 * Two rules are built into this component rather than left to its callers,
 * because both are promises the app makes about volume:
 *
 * 1. **The status word is always on screen.** Every row ends in the current
 *    week's set count *and* its band in words ("12 sets, productive"), the legend
 *    spells the four bands out, and the visually-hidden table names the band of
 *    **every** cell — all twelve weeks, not just the last one. Nothing here is
 *    knowable from density alone.
 *
 *    The `title` on each cell is a hover, and a phone has no hover, so it is a
 *    bonus rather than the mechanism: the hidden table is what a screen reader
 *    reads (the grid is one `role="img"`, so per-cell attributes inside it are
 *    never announced), and `HATCH` is the texture channel: the three non-solid
 *    bands carry a faint hatch tiled from a tiny inline SVG (never a CSS
 *    colour-stop image), at one slant or its mirror, so the grid still
 *    separates the bands in print or under forced colours.
 * 2. **A landmark is advisory, never a cap.** `VOLUME_ADVISORY_NOTE` is
 *    rendered by the grid itself, so any screen that reuses it (Trends does)
 *    gets the note with it. `high` reads "more than most people need to grow";
 *    there is deliberately no "too much" band and nothing here subtracts a set
 *    because a line was crossed.
 *
 * The grid container carries `data-mark`: its cells are chart marks, so a
 * hairline around an empty week is a grid line, not a frame around a reading.
 *
 * Exported from `screens/train/index.ts` for the Trends screen (plan §2c).
 */
import { Fragment, type CSSProperties } from 'react';
import type { ISODate, MuscleVolume } from '../../data/types';
import { VOLUME_ADVISORY_NOTE } from '../../engine';
import { formatDateShort } from '../../lib/dates';
import { fmt } from '../../lib/format';
import { bandText } from '../../ui';
import { HiddenTable, LEVEL_OPACITY, TOKEN } from '../../ui/charts';
import { Note } from './TrainCard';
import { muscleLabel, volumeStatusPhrase, volumeStatusTone, volumeStatusWord } from './trainUtils';

/** One column: the Monday the week starts on, and all 15 muscles for it. */
export interface VolumeGridWeek {
  weekStart: ISODate;
  muscles: MuscleVolume[];
}

export interface MuscleVolumeGridProps {
  /** Oldest week first; the last column is the current week. */
  weeks: VolumeGridWeek[];
  /** Accessible name for the grid and its hidden table. */
  ariaLabel?: string;
  /** Set false when the caller already prints the advisory note. */
  showNote?: boolean;
}

/** The four bands, in the order the legend lists them. */
const LEGEND: Array<MuscleVolume['status']> = ['below-mev', 'building', 'productive', 'high'];

/** Ink density per band: bone at 12 / 28 / 50 / 80 percent, never a colour ramp. */
const DENSITY: Record<MuscleVolume['status'], number> = {
  'below-mev': LEVEL_OPACITY[0],
  building: LEVEL_OPACITY[1],
  productive: LEVEL_OPACITY[2],
  high: LEVEL_OPACITY[3],
};

/**
 * The texture channel: a faint stock-coloured hatch tiled from a `pitch` px
 * SVG tile with one 1 px diagonal, at one slant or its mirror (never
 * horizontal or vertical, which read as rules), so the bands differ in
 * *pattern* as well as density. The productive band is the plain one.
 */
interface Hatch {
  /** Tile size in px, which is the distance between lines along an edge. */
  pitch: number;
  /** '\\' runs top-left to bottom-right; '/' is its mirror. */
  slant: '\\' | '/';
}
const HATCH: Record<MuscleVolume['status'], Hatch | null> = {
  'below-mev': { pitch: 6, slant: '\\' },
  building: { pitch: 6, slant: '/' },
  productive: null,
  high: { pitch: 4, slant: '\\' },
};

/** The stock (`--hx-base`) at half strength: the hatch cuts into the bone fill without adding a colour. A literal, because a data URI cannot read a CSS variable. */
const HATCH_INK = '#100E0B';
const HATCH_ALPHA = 0.5;

/** Percent-encode for `url("data:…")`: encodeURIComponent leaves ' ( ) alone and they would end the URL early. */
const encode = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** One tile: a single diagonal plus the two corner stubs that keep the line continuous across tiles. */
function hatchTile({ pitch: p, slant }: Hatch): string {
  const d = slant === '\\' ? `M0 0L${p} ${p} M${p - 1} -1L${p + 1} 1 M-1 ${p - 1}L1 ${p + 1}` : `M0 ${p}L${p} 0 M-1 1L1 -1 M${p - 1} ${p + 1}L${p + 1} ${p - 1}`;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${p}' height='${p}'><path d='${d}' stroke='${HATCH_INK}' stroke-opacity='${HATCH_ALPHA}' stroke-width='1' fill='none'/></svg>`;
  return `url("data:image/svg+xml,${encode(svg)}")`;
}

/** The same hatch drawn across a `size` px legend swatch. */
function hatchSwatchPath({ pitch: p, slant }: Hatch, size: number): string {
  const lines: string[] = [];
  for (let k = -size; k <= size; k += p) lines.push(slant === '\\' ? `M${k} 0L${k + size} ${size}` : `M${k} ${size}L${k + size} 0`);
  return lines.join(' ');
}

const CELL_TEXTURE = Object.fromEntries(
  LEGEND.map((status) => {
    const hatch = HATCH[status];
    return [status, hatch ? hatchTile(hatch) : undefined];
  }),
) as Record<MuscleVolume['status'], string | undefined>;

/** Fill for one band: bone at the band's density, plus the hatch that survives without it. */
export function volumeCellStyle(status: MuscleVolume['status']): CSSProperties {
  const image = CELL_TEXTURE[status];
  return { backgroundColor: 'var(--hx-text)', opacity: DENSITY[status], ...(image ? { backgroundImage: image } : {}) };
}

/** "12 sets — productive" / "0 sets — below MEV": one cell of the hidden table. */
export function volumeCellText(v: MuscleVolume): string {
  return `${fmt(v.sets, v.sets % 1 === 0 ? 0 : 1)} sets — ${volumeStatusWord(v.status)}`;
}

const SWATCH = 8;

export default function MuscleVolumeGrid({
  weeks,
  ariaLabel = 'Weekly sets per muscle, last 12 weeks',
  showNote = true,
}: MuscleVolumeGridProps) {
  const latest = weeks.length ? weeks[weeks.length - 1] : null;
  const muscles = latest?.muscles ?? [];

  if (muscles.length === 0) {
    return <Note>No sets logged yet; the grid fills in as soon as a session is saved.</Note>;
  }

  // Neither the muscle nor the band word may be truncated away (the word is the
  // non-density channel), so both side columns take exactly the width they need
  // and the cells — which can shrink to nothing without losing meaning — absorb
  // the difference.
  const columns = `max-content repeat(${weeks.length}, minmax(0, 1fr)) max-content`;

  return (
    <div className="flex flex-col">
      {/*
        One grid for all 15 rows, not one grid per row: the summary column is
        sized to its widest label, and a per-row grid would give every row its
        own track widths — a heat map whose columns do not line up.
      */}
      <div role="img" aria-label={ariaLabel} data-mark="" className="grid items-center" style={{ gridTemplateColumns: columns, columnGap: 2, rowGap: 2 }}>
        {muscles.map((current, row) => (
          <Fragment key={current.muscle}>
            <span className="hx-agate whitespace-nowrap pr-1">{muscleLabel(current.muscle)}</span>
            {weeks.map((week) => {
              const m = week.muscles[row];
              const cell = m ?? current;
              const filled = cell.sets > 0;
              return (
                <span
                  key={week.weekStart}
                  title={`${muscleLabel(cell.muscle)}, week of ${formatDateShort(week.weekStart)}: ${fmt(cell.sets, cell.sets % 1 === 0 ? 0 : 1)} sets — ${volumeStatusPhrase(cell.status)}`}
                  className={`block h-5 ${filled ? '' : 'border border-hx-border'}`}
                  style={filled ? volumeCellStyle(cell.status) : undefined}
                />
              );
            })}
            <span className="hx-agate whitespace-nowrap pl-2 flex items-center justify-end gap-1.5">
              <span className={`hx-tone ${bandText(volumeStatusTone(current.status))}`} aria-hidden />
              {fmt(current.sets, current.sets % 1 === 0 ? 0 : 1)} sets, {volumeStatusWord(current.status)}
            </span>
          </Fragment>
        ))}
      </div>

      {/* The legend written as words, each led by an SVG swatch at the band's density with its hatch. */}
      <ul className="hx-agate mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {LEGEND.map((status) => {
          const hatch = HATCH[status];
          return (
            <li key={status} className="flex items-center gap-1.5">
              <svg width={SWATCH} height={SWATCH} viewBox={`0 0 ${SWATCH} ${SWATCH}`} className="block shrink-0" style={{ opacity: DENSITY[status] }} aria-hidden>
                <rect width={SWATCH} height={SWATCH} fill={TOKEN.text} />
                {hatch && <path d={hatchSwatchPath(hatch, SWATCH)} stroke={HATCH_INK} strokeOpacity={HATCH_ALPHA} strokeWidth={1} fill="none" />}
              </svg>
              {volumeStatusWord(status)}
            </li>
          );
        })}
      </ul>

      <HiddenTable
        caption={ariaLabel}
        head={['Muscle', ...weeks.map((w) => `Week of ${formatDateShort(w.weekStart)}`), 'This week']}
        rows={muscles.map((current, row) => [
          muscleLabel(current.muscle),
          // Every week's band, not only this one's: a bare set count leaves the
          // other eleven columns knowable from density alone.
          ...weeks.map((w) => volumeCellText(w.muscles[row] ?? current)),
          `${fmt(current.sets, current.sets % 1 === 0 ? 0 : 1)} sets — ${volumeStatusPhrase(current.status)} (MEV ${fmt(current.mev, 0)}, MAV ${fmt(current.mav, 0)}, MRV ${fmt(current.mrv, 0)})`,
        ])}
      />

      {showNote && <Note className="mt-3">{VOLUME_ADVISORY_NOTE}</Note>}
    </div>
  );
}
