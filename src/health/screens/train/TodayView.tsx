/**
 * Train ▸ Today — the planned session, the load gauge and one tap to start.
 *
 * Every number here comes from `ctx.training` (plan §2a): the exercise list,
 * the suggested loads and the reason attached to each are `suggestProgression`
 * output, so the tab, the Today tile and the coach's "what should I lift
 * today?" answer are literally the same list. Nothing is recomputed locally.
 *
 * Two hedges are structural rather than decorative. The load block leads on
 * absolute acute load and week-on-week change with the acute:chronic ratio
 * shaded below it (see `LoadGauge`), and no volume landmark appears anywhere
 * on this view — a landmark never decides what to lift, only fatigue does
 * (`strength.suggestProgression` does not even take the landmarks as an
 * argument).
 *
 * A third one is the evidence footnote under the plan. The constants that can
 * turn "progress 82.5 kg × 4" into "hold 80 kg × 4" or "reduce 75 kg × 3" —
 * `MUSCLE_READY_MIN_PCT` over the 60-hour recovery half-life, `REDUCE_PCT_RED`,
 * the back-off and deload steps — have no published source, so their labels
 * (`PROGRESSION_NOTES`, `LOAD_NOTES.muscleRecovery`) are rendered **here, on a
 * training day, with the prescription they changed**, not only on the rest-day
 * card where nothing is being prescribed.
 */
import { Bike, Dumbbell, HeartPulse, PersonStanding, Play, Trophy } from 'lucide-react';
import type { PlannedExercise, TrainingContext, WorkoutKind } from '../../data/types';
import { LOAD_NOTES, PROGRESSION_NOTES } from '../../engine';
import { formatDateLong } from '../../lib/dates';
import { fmt } from '../../lib/format';
import { Button, EmptyState, bandSoftBg, bandText } from '../../ui';
import LoadGauge from './LoadGauge';
import { Note, Stat, TrainCard } from './TrainCard';
import type { TrainModel } from './useTrainModel';
import {
  formatDuration,
  formatLoad,
  formatVolume,
  ghostText,
  modeTone,
  modeWord,
  muscleLabel,
  sessionLabel,
  sessionTitle,
  sessionVolumeKg,
  setsRepsText,
  type Units,
} from './trainUtils';

export interface TodayViewProps {
  model: TrainModel;
  onStart: () => void;
  onLogKind: (kind: WorkoutKind) => void;
  onOpenSession: (id: string) => void;
}

/** Muscles shown in the rest-day card — the least recovered first. */
const RECOVERY_ROWS = 3;

export default function TodayView({ model, onStart, onLogKind, onOpenSession }: TodayViewProps) {
  const { training, units, today } = model;
  const isRest = training.todaySession === 'rest';
  const planned = training.plannedExercises;

  return (
    <div className="flex flex-col gap-6">
      <TrainCard
        title={sessionLabel(training.todaySession)}
        caption={formatDateLong(today)}
        empty={
          planned.length === 0 && !isRest ? (
            <EmptyState
              icon={<Dumbbell />}
              title="No session planned for today"
              hint="Your split has a session today but the active program has no exercises for it. Start an empty session and add lifts as you go, or edit the program in Settings ▸ Training."
              action={{ label: 'Start empty session', onClick: onStart }}
            />
          ) : undefined
        }
      >
        {isRest ? (
          <RestDayCard training={training} />
        ) : (
          <>
            <ul className="flex flex-col divide-y divide-hx-border -my-1">
              {planned.map((pe) => (
                <PlannedRow key={pe.exerciseId} pe={pe} units={units} />
              ))}
            </ul>
            {planned.length > 0 && (
              <div className="flex flex-col gap-1.5 border-t border-hx-border pt-3">
                <Note>{PROGRESSION_NOTES.steps}</Note>
                <Note>{PROGRESSION_NOTES.increments}</Note>
                <Note>{LOAD_NOTES.muscleRecovery}</Note>
              </div>
            )}
          </>
        )}
      </TrainCard>

      <section aria-label="Start a session" className="flex flex-col gap-2">
        <Button icon={<Play aria-hidden />} size="lg" fullWidth onClick={onStart}>
          {isRest ? 'Start a session anyway' : `Start ${sessionLabel(training.todaySession).toLowerCase()}`}
        </Button>
        <div className="grid grid-cols-3 gap-2">
          <Button variant="secondary" size="sm" icon={<Bike aria-hidden />} aria-label="Log cardio" onClick={() => onLogKind('cardio')}>
            Cardio
          </Button>
          <Button variant="secondary" size="sm" icon={<PersonStanding aria-hidden />} aria-label="Log mobility" onClick={() => onLogKind('mobility')}>
            Mobility
          </Button>
          <Button variant="secondary" size="sm" icon={<HeartPulse aria-hidden />} aria-label="Log sport" onClick={() => onLogKind('sport')}>
            Sport
          </Button>
        </div>
      </section>

      <TrainCard
        title="Fitness, fatigue and form"
        caption={training.load.source === 'none' ? 'No load logged yet' : `From your ${training.load.source} sessions`}
        meaning="Fitness is the slow-building side of training, fatigue the fast-fading side, and form is what is left over today."
      >
        <LoadGauge load={training.load} />
      </TrainCard>

      {training.prs7d.length > 0 && (
        <TrainCard title="PRs this week" caption={`${training.prs7d.length} in the last 7 days`}>
          <ul className="flex flex-col gap-2">
            {training.prs7d.slice(0, 5).map((pr) => (
              <li key={`${pr.exerciseId}-${pr.kind}-${pr.d}`} className="flex items-center gap-2 text-[13px] leading-5">
                <Trophy className="w-4 h-4 shrink-0 text-hx-green" aria-hidden />
                <span className="text-hx-text truncate">{pr.name}</span>
                <span className="text-hx-text2 ml-auto shrink-0">
                  {pr.kind === 'reps' ? `${fmt(pr.value, 0)} reps` : formatLoad(pr.value, units)} · {pr.kind === 'e1rm' ? 'est. max' : pr.kind}
                </span>
              </li>
            ))}
          </ul>
        </TrainCard>
      )}

      {training.todayWorkouts.length > 0 && (
        <TrainCard title="Logged today" caption={`${training.todayWorkouts.length} session${training.todayWorkouts.length === 1 ? '' : 's'}`}>
          <ul className="flex flex-col gap-2">
            {training.todayWorkouts.map((w) => (
              <li key={w.id}>
                <button
                  type="button"
                  onClick={() => onOpenSession(w.id)}
                  className="w-full min-h-11 flex items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-hx-card2"
                >
                  <span className="text-[14px] leading-5 text-hx-text truncate">{sessionTitle(w)}</span>
                  <span className="text-[12px] leading-4 text-hx-text2 ml-auto shrink-0">
                    {formatDuration(w.durationMin)}
                    {w.kind === 'strength' ? ` · ${formatVolume(sessionVolumeKg(w.exercises), units)}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </TrainCard>
      )}
    </div>
  );
}

function PlannedRow({ pe, units }: { pe: PlannedExercise; units: Units }) {
  const ghost = ghostText(pe.last, units);
  const tone = modeTone(pe.mode);
  return (
    <li className="py-3 flex flex-col gap-1">
      <div className="flex items-baseline gap-2">
        <span className="text-[15px] leading-5 font-medium text-hx-text truncate">{pe.name}</span>
        <span
          className={`ml-auto shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] leading-4 font-medium ${bandSoftBg(tone)} ${bandText(tone)}`}
        >
          {modeWord(pe.mode)}
        </span>
      </div>
      <div className="flex items-baseline gap-2 text-[13px] leading-5">
        <span className="text-hx-text2">{setsRepsText(pe.sets, pe.reps)}</span>
        <span className="text-hx-text font-medium tabular-nums">
          {pe.loadKg === null ? 'pick a working weight' : formatLoad(pe.loadKg, units)}
        </span>
      </div>
      <p className="text-[12px] leading-4 text-hx-muted">{pe.reason}</p>
      {ghost && <p className="text-[11px] leading-4 text-hx-muted tabular-nums">{ghost}</p>}
    </li>
  );
}

/**
 * Rest day: what the day is for, and which muscles are still catching up.
 * The percentages are the 48–72 h MPS-window model in `load.muscleReadiness`
 * — a modelled recovery curve, not a measurement, which the note says.
 */
function RestDayCard({ training }: { training: TrainingContext }) {
  const sore = [...training.muscleReadiness]
    .filter((m) => m.hoursSince !== null)
    .sort((a, b) => a.pct - b.pct)
    .slice(0, RECOVERY_ROWS);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-[14px] leading-5 text-hx-text">Rest day. This is when the last few sessions actually land.</p>
        <p className="text-[13px] leading-5 text-hx-text2 mt-1">
          Active recovery that does not add fatigue: an easy walk, 10 minutes of mobility on whatever is stiff, or a
          conversational-pace ride. Log any of them below if you want them in your load.
        </p>
      </div>

      {sore.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-hx-border pt-3">
          <p className="text-[11px] leading-4 text-hx-muted">Still recovering</p>
          {sore.map((m) => (
            <div key={m.muscle} className="flex items-center gap-3">
              <span className="text-[13px] leading-5 text-hx-text w-24 shrink-0 truncate">{muscleLabel(m.muscle)}</span>
              <div className="flex-1 h-2 rounded-full bg-hx-card2 overflow-hidden" aria-hidden>
                <div className="h-full rounded-full bg-hx-neutral" style={{ width: `${Math.max(2, Math.min(100, m.pct))}%` }} />
              </div>
              <span className="text-[12px] leading-4 text-hx-text2 tabular-nums w-28 text-right shrink-0">
                {fmt(m.pct, 0)}% · {m.hoursSince === null ? 'rested' : `${fmt(Math.round(m.hoursSince), 0)} h ago`}
              </span>
            </div>
          ))}
          <Note>{LOAD_NOTES.muscleRecovery}</Note>
        </div>
      )}

      {training.load.source === 'none' && (
        <Stat label="Load logged" value="0" sub="Nothing to recover from yet — log a session and this fills in." />
      )}
    </div>
  );
}
