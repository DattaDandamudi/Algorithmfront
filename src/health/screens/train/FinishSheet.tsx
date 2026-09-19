/**
 * Finish sheet — the one place a draft becomes a `Workout`.
 *
 * A plate with the running head "Finish session": the duration as a large
 * stepper, session RPE as a grid of tags, then the session as a box score
 * (working sets, volume), any records as a note in green, each lift's
 * estimated max as a ledger, and the note as an underline field. It shows
 * what the session actually was: duration, session RPE (Foster's 1–10 — the
 * number `sessionLoad` turns into training load), working-set count and
 * volume, how each lift's estimated max moved, and any PR the session sets.
 * The PRs are computed against a *provisional* copy of the session appended
 * to history, using the same `detectPRs` the rest of the app uses, so the
 * note here and the badge in History are the same finding — and a first-ever
 * session shows none, because a baseline is not a PR.
 *
 * The duration stepper is seeded from the draft's own clock but is editable:
 * a phone that slept through the last three sets should not be the thing that
 * decides what goes into the load model.
 */
import { useEffect, useMemo, useState } from 'react';
import type { Exercise, Workout } from '../../data/types';
import { detectPRs } from '../../engine';
import { fmt } from '../../lib/format';
import { Button, Chip, Sheet, Stepper } from '../../ui';
import { Note, Stat } from './TrainCard';
import { draftToWorkout, type WorkoutDraft } from './draft';
import {
  SRPE_CHOICES,
  countWorkingSets,
  e1rmDeltas,
  formatLoad,
  loadParts,
  sessionVolumeKg,
  volumeParts,
  type Units,
} from './trainUtils';

export interface FinishSheetProps {
  open: boolean;
  onClose: () => void;
  draft: WorkoutDraft;
  units: Units;
  custom: readonly Exercise[];
  history: readonly Workout[];
  today: string;
  /** Duration the draft's clock has counted, in minutes — the seed value. */
  durationMin: number;
  onSave: (done: { durationMin: number; srpe?: number; note?: string }) => void;
}

const MAX_DURATION_MIN = 480;

export default function FinishSheet({
  open,
  onClose,
  draft,
  units,
  custom,
  history,
  today,
  durationMin,
  onSave,
}: FinishSheetProps) {
  const [duration, setDuration] = useState(durationMin);
  const [srpe, setSrpe] = useState<number | null>(draft.srpe ?? null);
  const [note, setNote] = useState(draft.note ?? '');

  // Re-seed each time the sheet opens; a stale duration from an earlier open
  // would silently under-report the session.
  useEffect(() => {
    if (!open) return;
    setDuration(durationMin);
    setSrpe(draft.srpe ?? null);
    setNote(draft.note ?? '');
  }, [open, durationMin, draft.srpe, draft.note]);

  const summary = useMemo(() => {
    if (!open) return null;
    const provisional = draftToWorkout(draft, { durationMin: duration, ...(srpe !== null ? { srpe } : {}) });
    // History minus this session (an edit re-saves an id that already exists),
    // so the "previous best" is genuinely previous.
    const prior = history.filter((w) => w.id !== draft.id);
    return {
      volumeKg: sessionVolumeKg(provisional.exercises),
      sets: countWorkingSets(provisional.exercises),
      deltas: e1rmDeltas(provisional, prior, today, custom).filter((d) => d.bestKg !== null),
      prs: detectPRs([...prior, provisional], today, { custom, days: 1 }),
    };
  }, [open, draft, duration, srpe, history, today, custom]);

  const volume = summary ? volumeParts(summary.volumeKg, units) : null;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Finish session"
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" fullWidth onClick={onClose}>
            Keep logging
          </Button>
          <Button
            fullWidth
            onClick={() =>
              onSave({
                durationMin: duration,
                ...(srpe !== null ? { srpe } : {}),
                ...(note.trim() ? { note: note.trim() } : {}),
              })
            }
          >
            Save session
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-col">
          <p className="hx-label">Duration</p>
          <Stepper
            className="w-full mt-2"
            label="Duration in minutes"
            value={duration}
            onChange={setDuration}
            step={5}
            min={0}
            max={MAX_DURATION_MIN}
            unit="min"
            size="lg"
          />
        </div>

        <div className="flex flex-col">
          <p className="hx-label">Session RPE</p>
          <p className="hx-cap mt-1">How hard the whole session felt, 1 (nothing) to 10 (maximal).</p>
          {/*
            Two rows of five rather than one scrolling row. Ten tags cannot fit
            across 390 px: they measured 33.2 px wide, under the 44 px touch
            floor, and "10" sat outside the scroll viewport — so the maximal
            effort, the one a user most wants after a brutal session, was the
            option they had to go looking for. The grid gives every tag 66 px
            and puts all ten on screen.
          */}
          <div role="group" aria-label="Session RPE" className="mt-3 grid grid-cols-5 gap-1.5">
            {SRPE_CHOICES.map((v) => (
              <Chip
                key={v}
                size="sm"
                active={srpe === v}
                pressed={srpe === v}
                onClick={() => setSrpe(srpe === v ? null : v)}
                aria-label={`Session RPE ${v}`}
                className="w-full px-0"
              >
                {v}
              </Chip>
            ))}
          </div>
          {srpe === null && (
            <Note className="mt-2">
              Skipping this is fine: the load model falls back to a typical strength-session effort and says so.
            </Note>
          )}
        </div>

        {summary && volume && draft.kind === 'strength' && (
          <div className="hx-score-grid">
            <Stat label="Working sets" value={fmt(summary.sets, 0)} />
            <Stat label="Volume" value={volume.value} unit={volume.unit} />
          </div>
        )}

        {summary && summary.prs.length > 0 && (
          <div className="hx-note border-hx-green flex flex-col">
            <p className="hx-label text-hx-green">
              <span className="hx-tone mr-1.5" aria-hidden />
              {summary.prs.length} personal record{summary.prs.length === 1 ? '' : 's'}
            </p>
            <ul className="mt-1 flex flex-col gap-0.5">
              {summary.prs.map((pr) => (
                <li key={`${pr.exerciseId}-${pr.kind}`} className="hx-body">
                  {pr.name}, {pr.kind === 'reps' ? `${fmt(pr.value, 0)} reps` : formatLoad(pr.value, units)}
                  {pr.kind === 'e1rm' ? ' est. max' : ''}
                </li>
              ))}
            </ul>
          </div>
        )}

        {summary && summary.deltas.length > 0 && (
          <div className="flex flex-col">
            <p className="hx-label">Estimated max</p>
            <ul className="hx-ledger mt-1">
              {summary.deltas.map((d) => {
                const best = loadParts(d.bestKg, units);
                return (
                  <li key={d.exerciseId} className="hx-row flex-row items-center justify-between gap-3">
                    <span className="hx-body min-w-0 truncate">{d.name}</span>
                    <span className="flex items-baseline gap-3 shrink-0">
                      <span className="hx-fig-sm text-hx-text">
                        {best.value}
                        <span className="hx-unit">{best.unit}</span>
                      </span>
                      <span className="hx-cap w-20 text-right">
                        {d.deltaKg === null
                          ? 'first time'
                          : d.deltaKg === 0
                            ? 'no change'
                            : `${d.deltaKg > 0 ? '+' : '−'}${formatLoad(Math.abs(d.deltaKg), units)}`}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
            <Note className="mt-2">
              Estimated max is a formula (Brzycki / Epley / Wathan by rep range, blended with the RPE table when RPE was
              logged), not a tested single.
            </Note>
          </div>
        )}

        <label className="flex flex-col gap-1">
          <span className="hx-label">Note (optional)</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="w-full py-2"
            placeholder="Left shoulder cranky on the last set…"
          />
        </label>
      </div>
    </Sheet>
  );
}
