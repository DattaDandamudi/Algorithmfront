/**
 * Train ▸ Today — the match programme (DESIGN.md "Train"): the planned
 * session as a fixture list under the running head "Today's session" with the
 * date as its dateline; the session name in `.hx-head`, "Planned, 6 exercises"
 * in `.hx-cap`, then one row per exercise divided by hairlines: the name in
 * `.hx-ui`, the prescription with its load in `.hx-fig-sm`, the plan word as a
 * tag in its tone with a tone square, the engine's reason in `.hx-cap` and the
 * ghost "last: …" as a hedge. Start is the ink key, the other three kinds
 * outline keys. Fitness, fatigue and form follow as a box score, PRs and the
 * sessions logged today as ledgers. A rest day is two paragraphs and the
 * recovery ledger with 2 px progress rules.
 *
 * Every number here comes from `ctx.training` (plan §2a): the exercise list,
 * the suggested loads and the reason attached to each are `suggestProgression`
 * output, so the tab, the Today tile and the coach's "what should I lift
 * today?" answer are literally the same list. Nothing is recomputed locally.
 *
 * Two hedges are structural rather than decorative. The load block leads on
 * absolute acute load and week-on-week change with the acute:chronic ratio
 * below it (see `LoadGauge`), and no volume landmark appears anywhere on this
 * view — a landmark never decides what to lift, only fatigue does
 * (`strength.suggestProgression` does not even take the landmarks as an
 * argument).
 *
 * A third one is the evidence footnote under the plan. The constants that can
 * turn "progress 82.5 kg × 4" into "hold 80 kg × 4" or "reduce 75 kg × 3" —
 * `MUSCLE_READY_MIN_PCT` over the 60-hour recovery half-life, `REDUCE_PCT_RED`,
 * the back-off and deload steps — have no published source, so their labels
 * (`PROGRESSION_NOTES`, `LOAD_NOTES.muscleRecovery`) are rendered **here, on a
 * training day, with the prescription they changed**, not only on the rest-day
 * block where nothing is being prescribed.
 */
import type { PlannedExercise, TrainingContext, WorkoutKind } from '../../data/types';
import { LOAD_NOTES, PROGRESSION_NOTES } from '../../engine';
import { formatDateLong } from '../../lib/dates';
import { fmt } from '../../lib/format';
import { Button, EmptyState, ProgressRule, SectionHeader, bandBorder, bandText } from '../../ui';
import LoadGauge from './LoadGauge';
import { Note } from './TrainCard';
import type { TrainModel } from './useTrainModel';
import {
  formatDuration,
  formatVolume,
  ghostText,
  loadParts,
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

/** Muscles shown in the rest-day ledger — the least recovered first. */
const RECOVERY_ROWS = 3;

const PR_KIND_WORD = { weight: 'heaviest set', reps: 'most reps', e1rm: 'best estimated max' } as const;

export default function TodayView({ model, onStart, onLogKind, onOpenSession }: TodayViewProps) {
  const { training, units, today } = model;
  const isRest = training.todaySession === 'rest';
  const planned = training.plannedExercises;
  const title = sessionLabel(training.todaySession);
  // A session day the active program cannot fill: there is no plan to list, so
  // the empty state takes its place under the running head.
  const noPlan = planned.length === 0 && !isRest;
  const prs = training.prs7d;
  const logged = training.todayWorkouts;

  return (
    <div className="flex flex-col">
      {noPlan ? (
        <section className="mt-6 flex flex-col" aria-label={title}>
          <SectionHeader as="h2" rule={false} title={title} caption={formatDateLong(today)} />
          <EmptyState
            className="mt-4"
            title="No session planned for today"
            hint="Your split has a session today but the active program has no exercises for it. Start an empty session and add lifts as you go, or edit the program in Settings, under Training."
            action={{ label: 'Start empty session', onClick: onStart }}
          />
        </section>
      ) : (
        <section className="mt-6 flex flex-col" aria-label={title}>
          <SectionHeader as="h2" rule={false} title="Today’s session" caption={formatDateLong(today)} />
          <p className="hx-head text-hx-text mt-4">{isRest ? 'Rest day' : title}</p>
          <p className="hx-cap mt-1">{isRest ? 'Nothing planned' : `Planned, ${planned.length} exercise${planned.length === 1 ? '' : 's'}`}</p>

          {isRest ? (
            <RestDay training={training} />
          ) : (
            <>
              <ul className="mt-4 flex flex-col border-t border-hx-border divide-y divide-hx-border">
                {planned.map((pe) => (
                  <PlannedRow key={pe.exerciseId} pe={pe} units={units} />
                ))}
              </ul>
              <div className="mt-4 flex flex-col gap-2">
                <Note>{PROGRESSION_NOTES.steps}</Note>
                <Note>{PROGRESSION_NOTES.increments}</Note>
                <Note>{LOAD_NOTES.muscleRecovery}</Note>
              </div>
            </>
          )}

          <Button size="lg" fullWidth className="mt-6" onClick={onStart}>
            {isRest ? 'Start a session anyway' : `Start ${title.toLowerCase()}`}
          </Button>
        </section>
      )}

      <section aria-label="Log another kind of session" className="mt-3 grid grid-cols-3 gap-2">
        <Button variant="secondary" aria-label="Log cardio" onClick={() => onLogKind('cardio')}>
          Cardio
        </Button>
        <Button variant="secondary" aria-label="Log mobility" onClick={() => onLogKind('mobility')}>
          Mobility
        </Button>
        <Button variant="secondary" aria-label="Log sport" onClick={() => onLogKind('sport')}>
          Sport
        </Button>
      </section>

      <section aria-label="Fitness, fatigue and form" className="mt-10 flex flex-col">
        <SectionHeader
          title="Fitness, fatigue and form"
          caption={training.load.source === 'none' ? 'No load logged yet' : `From your ${training.load.source} sessions`}
        />
        <div className="mt-4">
          <LoadGauge
            load={training.load}
            meaning="Fitness is the slow-building side of training, fatigue the fast-fading side, and form is what is left over today."
          />
        </div>
      </section>

      {prs.length > 0 && (
        <section aria-label="PRs this week" className="mt-10 flex flex-col">
          <SectionHeader title="PRs this week" caption={`${prs.length} in the last 7 days`} />
          <ul className="hx-ledger mt-1">
            {prs.slice(0, 5).map((pr) => {
              const load = pr.kind === 'reps' ? null : loadParts(pr.value, units);
              return (
                <li key={`${pr.exerciseId}-${pr.kind}-${pr.d}`} className="hx-row flex-row items-center justify-between gap-3">
                  <span className="min-w-0 flex flex-col">
                    <span className="hx-body truncate">{pr.name}</span>
                    <span className="hx-cap">{PR_KIND_WORD[pr.kind]}</span>
                  </span>
                  <span className="hx-fig-sm text-hx-text shrink-0">
                    {load ? load.value : fmt(pr.value, 0)}
                    <span className="hx-unit">{load ? load.unit : 'reps'}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {logged.length > 0 && (
        <section aria-label="Logged today" className="mt-10 flex flex-col">
          <SectionHeader as="h2" rule={false} title="Logged today" caption={`${logged.length} session${logged.length === 1 ? '' : 's'}`} />
          <ul className="mt-1 flex flex-col divide-y divide-hx-border">
            {logged.map((w) => (
              <li key={w.id}>
                <button type="button" onClick={() => onOpenSession(w.id)} className="hx-row hx-press flex-row items-center justify-between gap-3 text-left">
                  <span className="min-w-0 flex flex-col">
                    <span className="hx-ui text-hx-text truncate">{sessionTitle(w)}</span>
                    <span className="hx-cap">
                      {formatDuration(w.durationMin)}
                      {w.kind === 'strength' ? `, ${formatVolume(sessionVolumeKg(w.exercises), units)}` : ''}
                    </span>
                  </span>
                  <span className="hx-ui text-hx-text shrink-0">Open</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function PlannedRow({ pe, units }: { pe: PlannedExercise; units: Units }) {
  const ghost = ghostText(pe.last, units);
  const tone = modeTone(pe.mode);
  const load = pe.loadKg === null ? null : loadParts(pe.loadKg, units);
  return (
    <li className="py-4 flex flex-col gap-1">
      <div className="flex items-center justify-between gap-3">
        <span className="hx-ui text-hx-text min-w-0 truncate">{pe.name}</span>
        <span className={`hx-tag hx-label shrink-0 ${tone === 'neutral' ? '' : `${bandBorder(tone)} ${bandText(tone)}`}`}>
          {tone !== 'neutral' && <span className="hx-tone" aria-hidden />}
          {modeWord(pe.mode)}
        </span>
      </div>
      <div className="flex items-baseline gap-3">
        <span className="hx-ui text-hx-text2">{setsRepsText(pe.sets, pe.reps)}</span>
        {load ? (
          <span className="hx-fig-sm text-hx-text">
            {load.value}
            <span className="hx-unit">{load.unit}</span>
          </span>
        ) : (
          <span className="hx-cap">pick a working weight</span>
        )}
      </div>
      <p className="hx-cap">{pe.reason}</p>
      {ghost && <p className="hx-hedge">{ghost}</p>}
    </li>
  );
}

/**
 * Rest day: what the day is for, and which muscles are still catching up.
 * The percentages are the 48–72 h MPS-window model in `load.muscleReadiness`
 * — a modelled recovery curve, not a measurement, which the note says. Each
 * muscle is a ledger row with a 2 px progress rule.
 */
function RestDay({ training }: { training: TrainingContext }) {
  const sore = [...training.muscleReadiness]
    .filter((m) => m.hoursSince !== null)
    .sort((a, b) => a.pct - b.pct)
    .slice(0, RECOVERY_ROWS);

  return (
    <div className="mt-4 flex flex-col gap-4">
      <p className="hx-body">Rest day. This is when the last few sessions actually land.</p>
      <p className="hx-body text-hx-text2">
        Active recovery that does not add fatigue: an easy walk, 10 minutes of mobility on whatever is stiff, or a
        conversational-pace ride. Log any of them below if you want them in your load.
      </p>

      {sore.length > 0 && (
        <div className="mt-2 flex flex-col">
          <SectionHeader as="h3" title="Still recovering" caption="Least recovered first" />
          <ul className="hx-ledger mt-1">
            {sore.map((m) => {
              const pct = Math.max(0, Math.min(100, m.pct));
              const label = muscleLabel(m.muscle);
              return (
                <li key={m.muscle} className="hx-row">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="hx-body">{label}</span>
                    <span className="hx-fig text-hx-text shrink-0">{fmt(pct, 0)}%</span>
                  </div>
                  <ProgressRule className="mt-2" value={pct} max={100} label={`${label} recovery`} valueText={`${fmt(pct, 0)}% recovered`} />
                  <span className="hx-cap mt-1">{m.hoursSince === null ? 'rested' : `${fmt(Math.round(m.hoursSince), 0)} h since you trained it`}</span>
                </li>
              );
            })}
          </ul>
          <Note className="mt-3">{LOAD_NOTES.muscleRecovery}</Note>
        </div>
      )}

      {training.load.source === 'none' && <Note>Load logged: 0. Nothing to recover from yet; log a session and this fills in.</Note>}
    </div>
  );
}
