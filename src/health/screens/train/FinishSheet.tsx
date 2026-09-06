/**
 * Finish sheet — the one place a draft becomes a `Workout`.
 *
 * It shows what the session actually was: duration, session RPE (Foster's
 * 1–10 — the number `sessionLoad` turns into training load), working-set
 * count and volume, how each lift's estimated max moved, and any PR the
 * session sets. The PRs are computed against a *provisional* copy of the
 * session appended to history, using the same `detectPRs` the rest of the app
 * uses, so the badge here and the badge in History are the same finding — and
 * a first-ever session shows none, because a baseline is not a PR.
 *
 * The duration stepper is seeded from the draft's own clock but is editable:
 * a phone that slept through the last three sets should not be the thing that
 * decides what goes into the load model.
 */
import { useEffect, useMemo, useState } from 'react';
import { Trophy } from 'lucide-react';
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
  formatVolume,
  sessionVolumeKg,
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
      <div className="flex flex-col gap-5">
        <div>
          <p className="text-[12px] leading-4 text-hx-muted mb-1.5">Duration</p>
          <Stepper
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

        <div>
          <p className="text-[12px] leading-4 text-hx-muted mb-1.5">
            Session RPE — how hard the whole session felt, 1 (nothing) to 10 (maximal)
          </p>
          <div role="group" aria-label="Session RPE" className="flex gap-1.5 overflow-x-auto hx-no-scrollbar -mx-1 px-1">
            {SRPE_CHOICES.map((v) => (
              <Chip
                key={v}
                size="sm"
                color="yellow"
                active={srpe === v}
                pressed={srpe === v}
                onClick={() => setSrpe(srpe === v ? null : v)}
                aria-label={`Session RPE ${v}`}
              >
                {v}
              </Chip>
            ))}
          </div>
          {srpe === null && (
            <Note>
              Skipping this is fine — the load model falls back to a typical strength-session effort and says so.
            </Note>
          )}
        </div>

        {summary && draft.kind === 'strength' && (
          <div className="flex gap-4 border-t border-hx-border pt-4">
            <Stat label="Working sets" value={fmt(summary.sets, 0)} className="flex-1" />
            <Stat label="Volume" value={formatVolume(summary.volumeKg, units)} className="flex-1" />
          </div>
        )}

        {summary && summary.prs.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-hx-border pt-4">
            <p className="text-[12px] leading-4 text-hx-muted">
              {summary.prs.length} personal record{summary.prs.length === 1 ? '' : 's'}
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {summary.prs.map((pr) => (
                <li
                  key={`${pr.exerciseId}-${pr.kind}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-hx-green/15 text-hx-green px-2.5 py-1 text-[12px] leading-4"
                >
                  <Trophy className="w-3.5 h-3.5 shrink-0" aria-hidden />
                  <span>
                    {pr.name} · {pr.kind === 'reps' ? `${fmt(pr.value, 0)} reps` : formatLoad(pr.value, units)}
                    {pr.kind === 'e1rm' ? ' est. max' : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {summary && summary.deltas.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-hx-border pt-4">
            <p className="text-[12px] leading-4 text-hx-muted">Estimated max</p>
            <ul className="flex flex-col gap-1">
              {summary.deltas.map((d) => (
                <li key={d.exerciseId} className="flex items-baseline gap-2 text-[13px] leading-5">
                  <span className="text-hx-text truncate">{d.name}</span>
                  <span className="ml-auto shrink-0 text-hx-text tabular-nums">{formatLoad(d.bestKg, units)}</span>
                  <span className="shrink-0 w-20 text-right tabular-nums text-hx-text2">
                    {d.deltaKg === null
                      ? 'first time'
                      : d.deltaKg === 0
                        ? 'no change'
                        : `${d.deltaKg > 0 ? '+' : '−'}${formatLoad(Math.abs(d.deltaKg), units)}`}
                  </span>
                </li>
              ))}
            </ul>
            <Note>
              Estimated max is a formula (Brzycki / Epley / Wathan by rep range, blended with the RPE table when RPE was
              logged), not a tested single.
            </Note>
          </div>
        )}

        <label className="flex flex-col gap-1.5 border-t border-hx-border pt-4">
          <span className="text-[12px] leading-4 text-hx-muted">Note (optional)</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="rounded-xl border border-hx-border bg-hx-card2 px-3 py-2 text-[14px] leading-5 text-hx-text placeholder:text-hx-muted outline-none focus-visible:border-hx-blue"
            placeholder="Left shoulder cranky on the last set…"
          />
        </label>
      </div>
    </Sheet>
  );
}
