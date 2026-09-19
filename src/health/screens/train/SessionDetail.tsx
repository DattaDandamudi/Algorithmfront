/**
 * Session detail — the sheet History opens on a tap: a plate with the session
 * name as its running head, the date line as a caption, the session as a box
 * score (duration, session RPE, working sets, volume, load; distance and
 * heart rate for cardio), then each exercise with its sets as caption lines.
 *
 * "Edit" is a hand-off, not a nested sheet: it closes this one and drops the
 * session into the inline logger on the Log sub-view (the same pattern Log.tsx
 * uses for its barcode-to-estimate flow), so there is never a sheet inside a
 * sheet and focus returns cleanly to the row that opened this.
 *
 * Delete asks twice — the second tap is a different button with a different
 * label, not a native confirm() — because a mis-tap here silently changes the
 * volume grid and the load series.
 */
import { useEffect, useState } from 'react';
import type { Exercise, Workout } from '../../data/types';
import { exerciseById } from '../../engine';
import { formatDateLong } from '../../lib/dates';
import { fmt } from '../../lib/format';
import { Button, Sheet } from '../../ui';
import { StatGrid, type StatProps } from './TrainCard';
import {
  countWorkingSets,
  formatDistance,
  formatDuration,
  formatLoad,
  sessionTitle,
  sessionVolumeKg,
  setRpe,
  volumeParts,
  type Units,
} from './trainUtils';

export interface SessionDetailProps {
  open: boolean;
  workout: Workout | null;
  units: Units;
  custom: readonly Exercise[];
  onClose: () => void;
  onEdit: (w: Workout) => void;
  onDelete: (id: string) => void;
}

export default function SessionDetail({ open, workout, units, custom, onClose, onEdit, onDelete }: SessionDetailProps) {
  const [confirming, setConfirming] = useState(false);

  // A fresh sheet never opens already asking to delete something.
  useEffect(() => {
    if (!open) setConfirming(false);
  }, [open]);

  const volumeKg = workout ? sessionVolumeKg(workout.exercises) : 0;
  const sets = workout ? countWorkingSets(workout.exercises) : 0;
  const distance = workout?.cardio ? formatDistance(workout.cardio.distanceKm, units) : null;

  const stats: StatProps[] = [];
  if (workout) {
    stats.push({ label: 'Duration', value: formatDuration(workout.durationMin) });
    stats.push({
      label: 'Session RPE',
      value: workout.srpe === undefined ? '—' : fmt(workout.srpe, 0),
      sub: workout.srpe === undefined ? 'not logged' : undefined,
    });
    if (workout.kind === 'strength' && sets > 0) {
      const volume = volumeParts(volumeKg, units);
      stats.push({ label: 'Working sets', value: fmt(sets, 0) });
      stats.push({ label: 'Volume', value: volume.value, unit: volume.unit });
    }
    if (workout.cardio) {
      if (distance) stats.push({ label: 'Distance', value: distance });
      if (workout.cardio.avgHr !== undefined) stats.push({ label: 'Avg HR', value: fmt(workout.cardio.avgHr, 0), unit: 'bpm' });
      if (workout.cardio.maxHr !== undefined) stats.push({ label: 'Max HR', value: fmt(workout.cardio.maxHr, 0), unit: 'bpm' });
    }
    stats.push({ label: 'Load', value: workout.load === undefined ? '—' : fmt(Math.round(workout.load), 0) });
  }

  return (
    <Sheet
      open={open && workout !== null}
      onClose={onClose}
      title={workout ? sessionTitle(workout) : 'Session'}
      footer={
        workout ? (
          <div className="flex gap-2">
            {confirming ? (
              <>
                <Button variant="secondary" fullWidth onClick={() => setConfirming(false)}>
                  Keep it
                </Button>
                <Button variant="danger" fullWidth onClick={() => onDelete(workout.id)}>
                  Delete for good
                </Button>
              </>
            ) : (
              <>
                <Button variant="danger" onClick={() => setConfirming(true)}>
                  Delete
                </Button>
                <Button fullWidth onClick={() => onEdit(workout)}>
                  Edit session
                </Button>
              </>
            )}
          </div>
        ) : undefined
      }
    >
      {workout && (
        <div className="flex flex-col gap-6">
          <p className="hx-cap">
            {formatDateLong(workout.d)}, started {workout.start}
            {workout.source !== 'manual' ? `, imported from ${workout.source}` : ''}
          </p>

          <StatGrid stats={stats} />

          {(workout.exercises ?? []).length > 0 && (
            <ul className="flex flex-col gap-4 border-t border-hx-border pt-4">
              {(workout.exercises ?? []).map((we, i) => (
                <li key={`${we.exerciseId}-${i}`} className="flex flex-col">
                  <p className="flex items-baseline gap-2">
                    <span className="hx-ui text-hx-text min-w-0 truncate">{exerciseById(we.exerciseId, custom)?.name ?? we.exerciseId}</span>
                    {we.superset && <span className="hx-cap shrink-0">Superset {we.superset}</span>}
                  </p>
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {(we.sets ?? []).map((s, j) => {
                      const rpe = setRpe(s);
                      return (
                        <li key={j} className="hx-cap">
                          {s.k === 'wu' ? 'Warm-up' : `Set ${j + 1}`}, {s.w > 0 ? formatLoad(s.w, units) : 'BW'} ×{' '}
                          {fmt(s.r, 0)}
                          {rpe !== null ? ` @${fmt(rpe, Number.isInteger(rpe) ? 0 : 1)}` : ''}
                          {s.x ? ', skipped' : ''}
                        </li>
                      );
                    })}
                  </ul>
                  {we.note && <p className="hx-hedge mt-1">{we.note}</p>}
                </li>
              ))}
            </ul>
          )}

          {workout.note && <p className="hx-body text-hx-text2 border-t border-hx-border pt-4">{workout.note}</p>}
        </div>
      )}
    </Sheet>
  );
}
