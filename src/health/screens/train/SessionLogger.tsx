/**
 * Train ▸ Log — the set-by-set logger for a live strength session, set as the
 * mid-workout page (DESIGN.md "Train"): the session as a running head with
 * the clock as its dateline, the rest timer as a `.hx-fig` figure over a 2 px
 * rule, then one running head per exercise (`h3`, no rule) with the ghost
 * "last: …" as its dateline, and each set as a box score, a column rule
 * between weight and reps and `.hx-fig-sm` figures in the steppers, because
 * this is the screen read from arm's length. RPE is a row of tags. Nothing
 * here has a ground, a border or a radius except the keys and tags you press.
 *
 * The whole session lives in the draft (`./draft.ts`, persisted to
 * `hx:wk:draft`), so every edit here is a new draft object handed back through
 * `onChange`; nothing reaches the store until the finish sheet saves. That is
 * what makes closing the app mid-set safe, and it is why an abandoned session
 * never turns up in History or in the load series.
 *
 * Loads are kilograms in the draft and `settings.training.units` on screen —
 * `toDisplayLoad` / `toKgLoad` are the only crossing points, and the weight
 * stepper steps by the smallest increment that equipment actually comes in
 * (5 lb / 2.5 kg on a bar), so a suggestion is always a load you can load.
 *
 * Sheets are siblings, never nested: `sheet` holds at most one of
 * 'picker' | 'finish', both rendered at this level, so opening one always
 * closes the other and focus returns to the control that opened it.
 *
 * Every per-exercise control names its exercise ("Add set to Bench Press"),
 * because a session with six lifts renders six identical "Add set" buttons and
 * a screen-reader user must be able to tell them apart.
 */
import { useMemo, useState } from 'react';
import type { Exercise, SetEntry, Workout, WorkoutExercise } from '../../data/types';
import { useNow } from '../../data/store';
import { exerciseById } from '../../engine';
import { fmt } from '../../lib/format';
import { Button, Chip, SectionHeader, Stepper } from '../../ui';
import ExercisePicker from './ExercisePicker';
import FinishSheet from './FinishSheet';
import RestTimer from './RestTimer';
import { draftDurationMin, type WorkoutDraft } from './draft';
import {
  RPE_CHOICES,
  formatDuration,
  formatVolume,
  ghostText,
  lastPerformed,
  loadStepDisplay,
  sessionLabel,
  sessionVolumeKg,
  setRpe,
  toDisplayLoad,
  toKgLoad,
  withoutKeys,
  type Units,
} from './trainUtils';

/** Superset tags cycled by the tag button. */
const SUPERSET_TAGS = ['A', 'B', 'C'] as const;

export interface SessionLoggerProps {
  draft: WorkoutDraft;
  units: Units;
  custom: readonly Exercise[];
  /** Saved sessions, for the ghost line. The draft itself is excluded by id. */
  history: readonly Workout[];
  today: string;
  restTimerSec: number;
  onChange: (next: WorkoutDraft) => void;
  onSave: (done: { durationMin: number; srpe?: number; note?: string }) => void;
  onDiscard: () => void;
}

export default function SessionLogger({
  draft,
  units,
  custom,
  history,
  today,
  restTimerSec,
  onChange,
  onSave,
  onDiscard,
}: SessionLoggerProps) {
  const [sheet, setSheet] = useState<'picker' | 'finish' | null>(null);
  // A minute clock for the elapsed readout; the duration itself is derived
  // from the draft's timestamp, so a backgrounded app loses nothing.
  const now = useNow(30_000);
  const elapsed = draftDurationMin(draft, now.getTime());
  const volumeKg = sessionVolumeKg(draft.exercises);

  const patch = (next: Partial<WorkoutDraft>) => onChange({ ...draft, ...next });

  const setExercises = (exercises: WorkoutExercise[]) => patch({ exercises });

  const updateExercise = (index: number, fn: (we: WorkoutExercise) => WorkoutExercise) => {
    const next = draft.exercises.map((we, i) => (i === index ? fn(we) : we));
    setExercises(next);
  };

  /**
   * Replace one exercise, optionally starting the rest timer in the SAME
   * update. Two separate calls would both derive from this render's `draft`
   * and the second would silently drop the first — which is exactly how a
   * just-logged set disappears.
   */
  const putExercise = (index: number, next: WorkoutExercise, rest = false) => {
    const exercises = draft.exercises.map((we, i) => (i === index ? next : we));
    onChange(
      rest
        ? { ...draft, exercises, restEndsAt: Date.now() + restTimerSec * 1000, restSec: restTimerSec }
        : { ...draft, exercises },
    );
  };

  const addExercise = (e: Exercise) => {
    setSheet(null);
    if (draft.exercises.some((we) => we.exerciseId === e.id)) return;
    setExercises([...draft.exercises, { exerciseId: e.id, sets: [] }]);
  };

  const removeExercise = (index: number) => setExercises(draft.exercises.filter((_, i) => i !== index));

  const cycleSuperset = (index: number) =>
    updateExercise(index, (we) => {
      const at = we.superset ? SUPERSET_TAGS.indexOf(we.superset as (typeof SUPERSET_TAGS)[number]) : -1;
      const nextTag = at < 0 ? SUPERSET_TAGS[0] : at + 1 < SUPERSET_TAGS.length ? SUPERSET_TAGS[at + 1] : undefined;
      const rest = withoutKeys(we, ['superset']);
      return nextTag ? { ...rest, superset: nextTag } : rest;
    });

  const startRest = (seconds: number) => patch({ restEndsAt: Date.now() + seconds * 1000, restSec: seconds });
  const stopRest = () => {
    onChange(withoutKeys(draft, ['restEndsAt', 'restSec']));
  };

  const finish = (done: { durationMin: number; srpe?: number; note?: string }) => {
    setSheet(null);
    onSave(done);
  };

  const inSession = useMemo(() => draft.exercises.map((we) => we.exerciseId), [draft.exercises]);

  const clockLine = `Started ${draft.start}, ${formatDuration(elapsed)}${volumeKg > 0 ? `, ${formatVolume(volumeKg, units)}` : ''}`;

  return (
    <div className="flex flex-col">
      <section aria-label="Live session" className="mt-6 flex flex-col">
        <SectionHeader as="h2" rule={false} title={draft.title ?? (draft.session ? `${sessionLabel(draft.session)} session` : 'Strength session')} caption={clockLine} />
        <div className="mt-4">
          <RestTimer
            endsAt={draft.restEndsAt}
            totalSec={draft.restSec}
            defaultSec={restTimerSec}
            onStart={startRest}
            onStop={stopRest}
          />
        </div>
      </section>

      {draft.exercises.length === 0 && (
        <p className="hx-body text-hx-text2 mt-8">Nothing logged yet. Add the first exercise, by name or by the shorthand you actually use.</p>
      )}

      <ul className="flex flex-col">
        {draft.exercises.map((we, i) => (
          <ExerciseBlock
            key={`${we.exerciseId}-${i}`}
            we={we}
            units={units}
            custom={custom}
            last={lastPerformed(history, we.exerciseId, { excludeId: draft.id, onOrBefore: today })}
            onChange={(next, rest) => putExercise(i, next, rest)}
            onRemove={() => removeExercise(i)}
            onSuperset={() => cycleSuperset(i)}
          />
        ))}
      </ul>

      <Button variant="secondary" fullWidth className="mt-8" onClick={() => setSheet('picker')}>
        Add exercise
      </Button>
      <Button size="lg" fullWidth className="mt-3" onClick={() => setSheet('finish')}>
        Finish
      </Button>
      <Button variant="ghost" size="sm" onClick={onDiscard} className="mt-3 self-start">
        Discard this session
      </Button>

      {/* Siblings, never nested — at most one is open. */}
      <ExercisePicker
        open={sheet === 'picker'}
        onClose={() => setSheet(null)}
        onPick={addExercise}
        custom={custom}
        inSession={inSession}
      />
      <FinishSheet
        open={sheet === 'finish'}
        onClose={() => setSheet(null)}
        draft={draft}
        units={units}
        custom={custom}
        history={history}
        today={today}
        durationMin={elapsed}
        onSave={finish}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// One exercise
// ---------------------------------------------------------------------------

interface ExerciseBlockProps {
  we: WorkoutExercise;
  units: Units;
  custom: readonly Exercise[];
  last: ReturnType<typeof lastPerformed>;
  /** `rest` asks the parent to start the rest timer in the same update. */
  onChange: (next: WorkoutExercise, rest?: boolean) => void;
  onRemove: () => void;
  onSuperset: () => void;
}

function ExerciseBlock({ we, units, custom, last, onChange, onRemove, onSuperset }: ExerciseBlockProps) {
  const exercise = exerciseById(we.exerciseId, custom);
  const name = exercise?.name ?? we.exerciseId;
  const step = loadStepDisplay(exercise?.equipment, units);
  const ghost = ghostText(last, units);

  const setSets = (sets: SetEntry[], rest = false) => onChange({ ...we, sets }, rest);

  const seed = (): SetEntry => {
    const prev = we.sets[we.sets.length - 1];
    // A new set copies the previous one but is never pre-marked as skipped.
    if (prev) return withoutKeys(prev, ['x']);
    if (last) return { w: last.loadKg, r: last.reps[0] ?? 8, ...(last.rpe !== undefined ? { rpe: last.rpe } : {}) };
    return { w: 0, r: 8 };
  };

  // Logging a set is when rest starts — one update, so neither change is lost.
  const addSet = () => setSets([...we.sets, seed()], true);

  const copyLast = () => {
    const prev = we.sets[we.sets.length - 1];
    if (!prev) return;
    setSets([...we.sets, { ...prev }], true);
  };

  const updateSet = (index: number, next: SetEntry) => setSets(we.sets.map((s, i) => (i === index ? next : s)));
  const removeSet = (index: number) => setSets(we.sets.filter((_, i) => i !== index));

  return (
    <li className="mt-10 flex flex-col">
      <SectionHeader as="h3" title={name} caption={ghost ?? undefined} />

      {we.sets.length > 0 && (
        <div className="mt-2 flex flex-col divide-y divide-hx-border">
          {we.sets.map((s, i) => (
            <SetRow
              key={i}
              index={i}
              set={s}
              units={units}
              step={step}
              name={name}
              onChange={(next) => updateSet(i, next)}
              onRemove={() => removeSet(i)}
            />
          ))}
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <Button variant="secondary" size="sm" onClick={addSet} aria-label={`Add set to ${name}`} className="flex-1">
          Add set
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={copyLast}
          disabled={we.sets.length === 0}
          aria-label={`Copy last set of ${name}`}
          className="flex-1"
        >
          Copy last set
        </Button>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <Chip
          size="sm"
          active={!!we.superset}
          pressed={!!we.superset}
          onClick={onSuperset}
          aria-label={we.superset ? `Superset ${we.superset}, change` : `Tag ${name} as a superset`}
        >
          {we.superset ? `Superset ${we.superset}` : 'Superset'}
        </Chip>
        <Button variant="ghost" size="sm" onClick={onRemove} aria-label={`Remove ${name} from this session`}>
          Remove
        </Button>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// One set
// ---------------------------------------------------------------------------

interface SetRowProps {
  index: number;
  set: SetEntry;
  units: Units;
  step: number;
  name: string;
  onChange: (next: SetEntry) => void;
  onRemove: () => void;
}

function SetRow({ index, set, units, step, name, onChange, onRemove }: SetRowProps) {
  const isWarmup = set.k === 'wu';
  const rpe = setRpe(set);

  const toggleWarmup = () => {
    const rest = withoutKeys(set, ['k']);
    onChange(isWarmup ? rest : { ...rest, k: 'wu' });
  };

  const pickRpe = (value: number) => {
    // RPE and RIR are two spellings of the same thing; picking one clears the other.
    const rest = withoutKeys(set, ['rir', 'rpe']);
    onChange(rpe === value ? rest : { ...rest, rpe: value });
  };

  return (
    <div className="py-3 flex flex-col">
      <div className="flex items-center justify-between gap-2">
        <span className="hx-ui text-hx-text">{isWarmup ? 'Warm-up' : `Set ${index + 1}`}</span>
        <span className="flex items-center gap-1">
          <Chip size="sm" active={isWarmup} pressed={isWarmup} onClick={toggleWarmup} aria-label={`Mark set ${index + 1} of ${name} as a warm-up`}>
            Warm-up
          </Chip>
          <Button variant="ghost" size="sm" onClick={onRemove} aria-label={`Delete set ${index + 1} of ${name}`}>
            Delete
          </Button>
        </span>
      </div>

      {/*
        The box score: weight and reps as two cells split by the column rule
        `.hx-score-grid` draws. Weight takes the wider column (11:9) and the
        cell padding is tightened so the field keeps room for "231.5" between
        its two 44 px keys; the unit is the column head rather than a suffix
        competing for the same pixels.
      */}
      <div className="hx-score-grid mt-1" style={{ gridTemplateColumns: 'minmax(0, 11fr) minmax(0, 9fr)' }}>
        <div className="hx-cell !py-1 !pr-2">
          <span className="hx-label">Weight, {units}</span>
          <Stepper
            className="w-full mt-1"
            label={`Weight, set ${index + 1} of ${name}`}
            value={toDisplayLoad(set.w, units)}
            onChange={(v) => onChange({ ...set, w: toKgLoad(v, units) })}
            step={step}
            min={0}
            dp={1}
          />
        </div>
        <div className="hx-cell !py-1 !pl-2">
          <span className="hx-label">Reps</span>
          <Stepper
            className="w-full mt-1"
            label={`Reps, set ${index + 1} of ${name}`}
            value={set.r}
            onChange={(v) => onChange({ ...set, r: Math.max(0, Math.round(v)) })}
            step={1}
            min={0}
            max={100}
          />
        </div>
      </div>

      {/*
        Two rows of five, the word "RPE" taking the first slot, rather than one
        scrolling row: nine 44 px tags cannot fit across 390 px, and the ones
        that would fall off the end are 9.5 and 10, the efforts a hard set is
        most likely to be. The grid puts every choice on screen.
      */}
      <div role="group" aria-label={`RPE, set ${index + 1} of ${name}`} className="mt-2 grid grid-cols-5 gap-1.5 items-center">
        <span className="hx-label">RPE</span>
        {RPE_CHOICES.map((v) => (
          <Chip key={v} size="sm" active={rpe === v} pressed={rpe === v} onClick={() => pickRpe(v)} aria-label={`RPE ${v}`} className="w-full px-0">
            {fmt(v, Number.isInteger(v) ? 0 : 1)}
          </Chip>
        ))}
      </div>
    </div>
  );
}
