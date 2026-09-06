/**
 * Weekly hard sets per muscle — 15 muscles × 12 weeks.
 *
 * Two rules are built into this component rather than left to its callers,
 * because both are promises the app makes about volume:
 *
 * 1. **The status word is always on screen.** Every row ends in the current
 *    week's set count *and* its band in words ("12 · productive"), every cell
 *    carries the same wording in its `title`, the legend spells the four bands
 *    out, and the visually-hidden table repeats all of it. Nothing here is
 *    knowable from colour alone.
 * 2. **A landmark is advisory, never a cap.** `VOLUME_ADVISORY_NOTE` is
 *    rendered by the grid itself, so any screen that reuses it (Trends does)
 *    gets the note with it. `high` reads "more than most people need to grow";
 *    there is deliberately no "too much" band and nothing here subtracts a set
 *    because a line was crossed.
 *
 * Exported from `screens/train/index.ts` for the Trends screen (plan §2c).
 */
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
              const tone = volumeStatusTone(cell.status);
              const filled = cell.sets > 0;
              return (
                <span
                  key={week.weekStart}
                  title={`${muscleLabel(cell.muscle)}, week of ${formatDateShort(week.weekStart)}: ${fmt(cell.sets, cell.sets % 1 === 0 ? 0 : 1)} sets — ${volumeStatusPhrase(cell.status)}`}
                  className={`block h-4 rounded-[3px] ${filled ? '' : 'border border-hx-border'}`}
                  style={filled ? { backgroundColor: bandColor(tone) } : undefined}
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
            <span
              className="w-2.5 h-2.5 rounded-[2px] shrink-0"
              style={{ backgroundColor: bandColor(volumeStatusTone(status)) }}
              aria-hidden
            />
            {volumeStatusWord(status)}
          </li>
        ))}
      </ul>

      <HiddenTable
        caption={ariaLabel}
        head={['Muscle', ...weeks.map((w) => `Week of ${formatDateShort(w.weekStart)}`), 'This week']}
        rows={muscles.map((current, row) => [
          muscleLabel(current.muscle),
          ...weeks.map((w) => {
            const m = w.muscles[row] ?? current;
            return `${fmt(m.sets, m.sets % 1 === 0 ? 0 : 1)} sets`;
          }),
          `${fmt(current.sets, current.sets % 1 === 0 ? 0 : 1)} sets — ${volumeStatusPhrase(current.status)} (MEV ${fmt(current.mev, 0)}, MAV ${fmt(current.mav, 0)}, MRV ${fmt(current.mrv, 0)})`,
        ])}
      />

      {showNote && <Note>{VOLUME_ADVISORY_NOTE}</Note>}
    </div>
  );
}
