/**
 * Train ▸ Today — the planned session as the screen's hero, the load gauge and
 * one tap to start.
 *
 * The view is one `.hx-bento` (DESIGN.md): the session is a span-2 hero with
 * its own call to action inside it, the other three kinds sit under it as a
 * span-2 row of controls, the load gauge contributes two 1×1 complications and
 * a span-2 tile, and the two lists (PRs, logged today) are span-2 tiles.
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
import { Bike, Dumbbell, HeartPulse, Moon, PersonStanding, Play, Trophy } from 'lucide-react';
import type { PlannedExercise, TrainingContext, WorkoutKind } from '../../data/types';
import { LOAD_NOTES, PROGRESSION_NOTES } from '../../engine';
import { formatDateLong } from '../../lib/dates';
import { fmt } from '../../lib/format';
import { Button, EmptyState, SectionHeader, bandSoftBg, bandText } from '../../ui';
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
  const title = sessionLabel(training.todaySession);
  // A session day the active program cannot fill: there is no plan to be the
  // hero, so the empty state takes its place on the ground.
  const noPlan = planned.length === 0 && !isRest;

  return (
    <div className="hx-bento">
      {noPlan ? (
        <section className="hx-span-2 flex flex-col gap-3" aria-label={title}>
          <SectionHeader title={title} caption={formatDateLong(today)} />
          <EmptyState
            icon={<Dumbbell />}
            title="No session planned for today"
            hint="Your split has a session today but the active program has no exercises for it. Start an empty session and add lifts as you go, or edit the program in Settings ▸ Training."
            action={{ label: 'Start empty session', onClick: onStart }}
          />
        </section>
      ) : (
        <section className="hx-card hx-span-2 p-5 flex flex-col gap-4" aria-label={title}>
          <div className="flex flex-col gap-3">
            <SectionHeader as="h3" title="Today’s session" caption={formatDateLong(today)} />
            <div className="min-w-0 flex items-start gap-2.5">
              {isRest ? (
                <Moon className="w-5 h-5 mt-1 shrink-0 text-hx-neutral" aria-hidden />
              ) : (
                <Dumbbell className="w-5 h-5 mt-1 shrink-0 text-hx-blue" aria-hidden />
              )}
              <div className="min-w-0">
                <p className="hx-display text-[22px] leading-7 font-semibold text-hx-text truncate">{isRest ? 'Rest day' : title}</p>
                <p className="text-[13px] leading-[18px] text-hx-muted">
                  {isRest ? 'Nothing planned' : `Planned, ${planned.length} exercise${planned.length === 1 ? '' : 's'}`}
                </p>
              </div>
            </div>
          </div>

          {isRest ? (
            <RestDayCard training={training} />
          ) : (
            <>
              <ul className="flex flex-col divide-y divide-hx-border/70 -my-1">
                {planned.map((pe) => (
                  <PlannedRow key={pe.exerciseId} pe={pe} units={units} />
                ))}
              </ul>
              <div className="flex flex-col gap-2 border-t border-hx-border pt-3">
                <Note>{PROGRESSION_NOTES.steps}</Note>
                <Note>{PROGRESSION_NOTES.increments}</Note>
                <Note>{LOAD_NOTES.muscleRecovery}</Note>
              </div>
            </>
          )}

          <Button icon={<Play aria-hidden />} size="lg" fullWidth onClick={onStart}>
            {isRest ? 'Start a session anyway' : `Start ${title.toLowerCase()}`}
          </Button>
        </section>
      )}

      <section aria-label="Log another kind of session" className="hx-span-2 grid grid-cols-3 gap-2">
        <Button variant="secondary" size="sm" icon={<Bike aria-hidden />} aria-label="Log cardio" onClick={() => onLogKind('cardio')}>
          Cardio
        </Button>
        <Button variant="secondary" size="sm" icon={<PersonStanding aria-hidden />} aria-label="Log mobility" onClick={() => onLogKind('mobility')}>
          Mobility
        </Button>
        <Button variant="secondary" size="sm" icon={<HeartPulse aria-hidden />} aria-label="Log sport" onClick={() => onLogKind('sport')}>
          Sport
        </Button>
      </section>

      <SectionHeader
        className="hx-span-2"
        title="Fitness, fatigue and form"
        caption={training.load.source === 'none' ? 'No load logged yet' : `From your ${training.load.source} sessions`}
      />
      <LoadGauge
        load={training.load}
        meaning="Fitness is the slow-building side of training, fatigue the fast-fading side, and form is what is left over today."
      />

      {training.prs7d.length > 0 && (
        <TrainCard tile title="PRs this week" caption={`${training.prs7d.length} in the last 7 days`}>
          <ul className="flex flex-col gap-2.5">
            {training.prs7d.slice(0, 5).map((pr) => (
              <li key={`${pr.exerciseId}-${pr.kind}-${pr.d}`} className="flex items-center gap-2 text-[15px] leading-[22px]">
                <Trophy className="w-4 h-4 shrink-0 text-hx-green" aria-hidden />
                <span className="text-hx-text truncate">{pr.name}</span>
                <span className="ml-auto shrink-0 text-[13px] leading-[18px] text-hx-text2">
                  {pr.kind === 'reps' ? `${fmt(pr.value, 0)} reps` : formatLoad(pr.value, units)}, {pr.kind === 'e1rm' ? 'est. max' : pr.kind}
                </span>
              </li>
            ))}
          </ul>
        </TrainCard>
      )}

      {training.todayWorkouts.length > 0 && (
        <TrainCard tile title="Logged today" caption={`${training.todayWorkouts.length} session${training.todayWorkouts.length === 1 ? '' : 's'}`}>
          <ul className="flex flex-col">
            {training.todayWorkouts.map((w) => (
              <li key={w.id}>
                <button
                  type="button"
                  onClick={() => onOpenSession(w.id)}
                  className="hx-press w-full min-h-11 flex items-center gap-3 rounded-ctl px-2 py-2 text-left hover:bg-hx-card2"
                >
                  <span className="text-[15px] leading-[22px] text-hx-text truncate">{sessionTitle(w)}</span>
                  <span className="text-[13px] leading-[18px] text-hx-text2 ml-auto shrink-0">
                    {formatDuration(w.durationMin)}
                    {w.kind === 'strength' ? `, ${formatVolume(sessionVolumeKg(w.exercises), units)}` : ''}
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
        <span className="text-[15px] leading-[22px] font-medium text-hx-text truncate">{pe.name}</span>
        <span
          className={`ml-auto shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-[13px] leading-[18px] font-medium ${bandSoftBg(tone)} ${bandText(tone)}`}
        >
          {modeWord(pe.mode)}
        </span>
      </div>
      <div className="flex items-baseline gap-2 text-[15px] leading-[22px]">
        <span className="text-hx-text2">{setsRepsText(pe.sets, pe.reps)}</span>
        {pe.loadKg === null ? (
          <span className="text-hx-text2">pick a working weight</span>
        ) : (
          <span className="hx-display font-semibold text-hx-text">{formatLoad(pe.loadKg, units)}</span>
        )}
      </div>
      <p className="text-[13px] leading-[18px] text-hx-text2">{pe.reason}</p>
      {ghost && <p className="text-[13px] leading-[18px] text-hx-muted">{ghost}</p>}
    </li>
  );
}

/**
 * Rest day: what the day is for, and which muscles are still catching up.
 * The percentages are the 48–72 h MPS-window model in `load.muscleReadiness`
 * — a modelled recovery curve, not a measurement, which the note says. Each
 * bar sits in a `.hx-well`, because a gauge track is a sunken surface.
 */
function RestDayCard({ training }: { training: TrainingContext }) {
  const sore = [...training.muscleReadiness]
    .filter((m) => m.hoursSince !== null)
    .sort((a, b) => a.pct - b.pct)
    .slice(0, RECOVERY_ROWS);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <p className="text-[15px] leading-[22px] text-hx-text">Rest day. This is when the last few sessions actually land.</p>
        <p className="text-[15px] leading-[22px] text-hx-text2">
          Active recovery that does not add fatigue: an easy walk, 10 minutes of mobility on whatever is stiff, or a
          conversational-pace ride. Log any of them below if you want them in your load.
        </p>
      </div>

      {sore.length > 0 && (
        <div className="flex flex-col gap-2.5 border-t border-hx-border pt-3">
          <p className="hx-label">Still recovering</p>
          {sore.map((m) => (
            <div key={m.muscle} className="flex items-center gap-3">
              <span className="text-[13px] leading-[18px] text-hx-text w-20 shrink-0 truncate">{muscleLabel(m.muscle)}</span>
              <div className="hx-well flex-1 h-2 overflow-hidden" aria-hidden>
                <div className="h-full rounded-full bg-hx-neutral" style={{ width: `${Math.max(2, Math.min(100, m.pct))}%` }} />
              </div>
              <span className="text-[13px] leading-[18px] text-hx-text2 w-[104px] text-right shrink-0">
                {fmt(m.pct, 0)}%, {m.hoursSince === null ? 'rested' : `${fmt(Math.round(m.hoursSince), 0)} h ago`}
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
