/**
 * Weekly hard sets per muscle — 15 muscles × 12 weeks.
 *
 * Two rules are built into this component rather than left to its callers,
 * because both are promises the app makes about volume:
 *
 * 1. **The status word is always on screen.** Every row ends in the current
 *    week's set count *and* its band in words ("12 · productive"), the legend
 *    spells the four bands out, and the visually-hidden table names the band of
 *    **every** cell — all twelve weeks, not just the last one. Nothing here is
 *    knowable from colour alone.
 *
 *    The `title` on each cell is a hover, and a phone has no hover, so it is a
 *    bonus rather than the mechanism: the hidden table is what a screen reader
 *    reads (the grid is one `role="img"`, so per-cell attributes inside it are
 *    never announced), and `CELL_PATTERN` is what a sighted reader who cannot
 *    separate the bands by hue gets — yellow "below MEV" against green
 *    "productive" is exactly the deuteranopia pair, so the two carry different
 *    fills and the legend swatches carry the same fills back.
 * 2. **A landmark is advisory, never a cap.** `VOLUME_ADVISORY_NOTE` is
 *    rendered by the grid itself, so any screen that reuses it (Trends does)
 *    gets the note with it. `high` reads "more than most people need to grow";
 *    there is deliberately no "too much" band and nothing here subtracts a set
 *    because a line was crossed.
 *
 * Exported from `screens/train/index.ts` for the Trends screen (plan §2c).
 */
import type { CSSProperties } from 'react';
import type { ISODate, MuscleVolume } from '../../data/types';
import { VOLUME_ADVISORY_NOTE } from '../../engine';
import { formatDateShort } from '../../lib/dates';
import { fmt } from '../../lib/format';
import { bandColor, bandText } from '../../ui';
import { HiddenTable } from '../../ui/charts';
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

/**
 * A second, non-colour channel for the band: hatch direction. Four fills that
 * differ in *pattern*, not only in hue, so the grid survives being read in
 * greyscale or by a red-green colour-blind reader. Black at low alpha reads on
 * every band colour and in either theme.
 */
const CELL_PATTERN: Record<MuscleVolume['status'], string | undefined> = {
  'below-mev': 'repeating-linear-gradient(45deg, rgba(0,0,0,0.42) 0 2px, rgba(0,0,0,0) 2px 5px)',
  building: 'repeating-linear-gradient(90deg, rgba(0,0,0,0.34) 0 1px, rgba(0,0,0,0) 1px 4px)',
  productive: undefined, // solid — the band you want to be in is the plain one
  high: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.34) 0 1px, rgba(0,0,0,0) 1px 4px)',
};

/** Fill for one band: its colour, plus the pattern that survives without colour. */
export function volumeCellStyle(status: MuscleVolume['status']): CSSProperties {
  const image = CELL_PATTERN[status];
  return { backgroundColor: bandColor(volumeStatusTone(status)), ...(image ? { backgroundImage: image } : {}) };
}

/** "12 sets — productive" / "0 sets — below MEV": one cell of the hidden table. */
export function volumeCellText(v: MuscleVolume): string {
  return `${fmt(v.sets, v.sets % 1 === 0 ? 0 : 1)} sets — ${volumeStatusWord(v.status)}`;
}

export default function MuscleVolumeGrid({
  weeks,
  ariaLabel = 'Weekly sets per muscle, last 12 weeks',
  showNote = true,
}: MuscleVolumeGridProps) {
  const latest = weeks.length ? weeks[weeks.length - 1] : null;
  const muscles = latest?.muscles ?? [];

  if (muscles.length === 0) {
    return <Note>No sets logged yet — the grid fills in as soon as a session is saved.</Note>;
  }

  const columns = `62px repeat(${weeks.length}, minmax(0, 1fr)) 74px`;

  return (
    <div className="flex flex-col gap-3">
      <div role="img" aria-label={ariaLabel} className="flex flex-col gap-1">
        {muscles.map((current, row) => (
          <div key={current.muscle} className="grid items-center gap-[2px]" style={{ gridTemplateColumns: columns }}>
            <span className="text-[10px] leading-3 text-hx-text2 truncate pr-1">{muscleLabel(current.muscle)}</span>
            {weeks.map((week) => {
              const m = week.muscles[row];
              const cell = m ?? current;
              const filled = cell.sets > 0;
              return (
                <span
                  key={week.weekStart}
                  title={`${muscleLabel(cell.muscle)}, week of ${formatDateShort(week.weekStart)}: ${fmt(cell.sets, cell.sets % 1 === 0 ? 0 : 1)} sets — ${volumeStatusPhrase(cell.status)}`}
                  className={`block h-4 rounded-[3px] ${filled ? '' : 'border border-hx-border'}`}
                  style={filled ? volumeCellStyle(cell.status) : undefined}
                />
              );
            })}
            <span className={`text-[10px] leading-3 text-right truncate ${bandText(volumeStatusTone(current.status))}`}>
              {fmt(current.sets, current.sets % 1 === 0 ? 0 : 1)} · {volumeStatusWord(current.status)}
            </span>
          </div>
        ))}
      </div>

      <ul className="flex flex-wrap gap-x-3 gap-y-1">
        {LEGEND.map((status) => (
          <li key={status} className="flex items-center gap-1.5 text-[10px] leading-3 text-hx-text2">
            <span className="w-2.5 h-2.5 rounded-[2px] shrink-0" style={volumeCellStyle(status)} aria-hidden />
            {volumeStatusWord(status)}
          </li>
        ))}
      </ul>

      <HiddenTable
        caption={ariaLabel}
        head={['Muscle', ...weeks.map((w) => `Week of ${formatDateShort(w.weekStart)}`), 'This week']}
        rows={muscles.map((current, row) => [
          muscleLabel(current.muscle),
          // Every week's band, not only this one's: a bare set count leaves the
          // other eleven columns knowable from colour alone.
          ...weeks.map((w) => volumeCellText(w.muscles[row] ?? current)),
          `${fmt(current.sets, current.sets % 1 === 0 ? 0 : 1)} sets — ${volumeStatusPhrase(current.status)} (MEV ${fmt(current.mev, 0)}, MAV ${fmt(current.mav, 0)}, MRV ${fmt(current.mrv, 0)})`,
        ])}
      />

      {showNote && <Note>{VOLUME_ADVISORY_NOTE}</Note>}
    </div>
  );
}
