/**
 * Session detail — the sheet History opens on a tap.
 *
 * "Edit" is a hand-off, not a nested sheet: it closes this one and drops the
 * session into the inline logger on the Log sub-view (the same pattern Log.tsx
 * uses for its barcode → estimate flow), so there is never a sheet inside a
 * sheet and focus returns cleanly to the row that opened this.
 *
 * Delete asks twice — the second tap is a different button with a different
 * label, not a native confirm() — because a mis-tap here silently changes the
 * volume grid and the load series.
 */
import { useEffect, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import type { Exercise, Workout } from '../../data/types';
import { exerciseById } from '../../engine';
import { formatDateLong } from '../../lib/dates';
import { fmt } from '../../lib/format';
import { Button, Sheet } from '../../ui';
import { Stat } from './TrainCard';
import {
  countWorkingSets,
  formatDistance,
  formatDuration,
  formatLoad,
  formatVolume,
  sessionTitle,
  sessionVolumeKg,
  setRpe,
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
                <Button variant="danger" icon={<Trash2 aria-hidden />} onClick={() => setConfirming(true)}>
                  Delete
                </Button>
                <Button fullWidth icon={<Pencil aria-hidden />} onClick={() => onEdit(workout)}>
                  Edit session
                </Button>
              </>
            )}
          </div>
        ) : undefined
      }
    >
      {workout && (
        <div className="flex flex-col gap-5">
          <p className="text-[13px] leading-5 text-hx-text2">
            {formatDateLong(workout.d)} · started {workout.start}
            {workout.source !== 'manual' ? ` · imported from ${workout.source}` : ''}
          </p>

          <div className="flex gap-4">
            <Stat label="Duration" value={formatDuration(workout.durationMin)} className="flex-1" />
            <Stat
              label="Session RPE"
              value={workout.srpe === undefined ? '—' : fmt(workout.srpe, 0)}
              sub={workout.srpe === undefined ? 'not logged' : undefined}
              className="flex-1"
            />
            <Stat
              label="Load"
              value={workout.load === undefined ? '—' : fmt(Math.round(workout.load), 0)}
              className="flex-1"
            />
          </div>

          {workout.kind === 'strength' && sets > 0 && (
            <div className="flex gap-4 border-t border-hx-border pt-4">
              <Stat label="Working sets" value={fmt(sets, 0)} className="flex-1" />
              <Stat label="Volume" value={formatVolume(volumeKg, units)} className="flex-1" />
            </div>
          )}

          {workout.cardio && (distance || workout.cardio.avgHr || workout.cardio.maxHr) && (
            <div className="flex gap-4 border-t border-hx-border pt-4">
              {distance && <Stat label="Distance" value={distance} className="flex-1" />}
              {workout.cardio.avgHr !== undefined && (
                <Stat label="Avg HR" value={fmt(workout.cardio.avgHr, 0)} unit="bpm" className="flex-1" />
              )}
              {workout.cardio.maxHr !== undefined && (
                <Stat label="Max HR" value={fmt(workout.cardio.maxHr, 0)} unit="bpm" className="flex-1" />
              )}
            </div>
          )}

          {(workout.exercises ?? []).length > 0 && (
            <ul className="flex flex-col gap-3 border-t border-hx-border pt-4">
              {(workout.exercises ?? []).map((we, i) => (
                <li key={`${we.exerciseId}-${i}`}>
                  <div className="flex items-baseline gap-2">
                    <span className="text-[14px] leading-5 font-medium text-hx-text truncate">
                      {exerciseById(we.exerciseId, custom)?.name ?? we.exerciseId}
                    </span>
                    {we.superset && <span className="text-[11px] leading-4 text-hx-text2">Superset {we.superset}</span>}
                  </div>
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {(we.sets ?? []).map((s, j) => {
                      const rpe = setRpe(s);
                      return (
                        <li key={j} className="text-[13px] leading-5 text-hx-text2 tabular-nums">
                          {s.k === 'wu' ? 'Warm-up' : `Set ${j + 1}`} · {s.w > 0 ? formatLoad(s.w, units) : 'BW'} ×{' '}
                          {fmt(s.r, 0)}
                          {rpe !== null ? ` @${fmt(rpe, Number.isInteger(rpe) ? 0 : 1)}` : ''}
                          {s.x ? ' · skipped' : ''}
                        </li>
                      );
                    })}
                  </ul>
                  {we.note && <p className="text-[12px] leading-4 text-hx-muted mt-1">{we.note}</p>}
                </li>
              ))}
            </ul>
          )}

          {workout.note && (
            <p className="text-[13px] leading-5 text-hx-text2 border-t border-hx-border pt-4">{workout.note}</p>
          )}
        </div>
      )}
    </Sheet>
  );
}
