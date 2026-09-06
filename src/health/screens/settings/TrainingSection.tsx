/**
 * Settings §4 — Training (SPEC §4; engine/strength, engine/exerciseDb).
 *
 * Everything the Train tab reads that is not the split: display units, the
 * rest timer, the double-progression rule, the advisory volume table
 * (LandmarkTable), the user's own exercises, and programs (ProgramList).
 *
 * The progression fields are the ones `strength.suggestProgression` actually
 * uses: hit the top of the rep range on every set at or under the target RPE
 * and the load goes up by the step for that half of the body — upper and lower
 * are separate because one 2.5 % notch under-loads a squat.
 *
 * Units here are display-only (kg/lb): loads are stored in kilograms, so
 * switching never rewrites history.
 */
import { useState } from 'react';
import { Check, Plus, Trash2 } from 'lucide-react';
import { useHealth } from '../../data/store';
import type { Equipment, Exercise, MovementPattern, Muscle, TrainingSettings } from '../../data/types';
import { EXERCISES, MUSCLES } from '../../engine/exerciseDb';
import { Button, SegmentedControl, toast } from '../../ui';
import LandmarkTable from './LandmarkTable';
import ProgramList from './ProgramList';
import { Field, NumberField, Note, SelectField, SubHeading, TextField, Toggle } from './fields';
import { useConfirm } from './useConfirm';
import { EQUIPMENT_OPTIONS, PATTERN_OPTIONS, muscleLabel, restLabel, slugKey } from './util';

const UNIT_OPTIONS = [
  { value: 'lb' as const, label: 'lb' },
  { value: 'kg' as const, label: 'kg' },
];

/** Rest presets people actually use: isolation, compound, heavy compound. */
const REST_PRESETS = [60, 90, 120, 180];

const MUSCLE_OPTIONS = MUSCLES.map((m) => ({ value: m, label: muscleLabel(m) }));

interface ExerciseDraft {
  name: string;
  primary: Muscle;
  pattern: MovementPattern;
  equipment: Equipment;
  unilateral: boolean;
}

const EMPTY_DRAFT: ExerciseDraft = { name: '', primary: 'chest', pattern: 'push-h', equipment: 'barbell', unilateral: false };

export default function TrainingSection() {
  const { state, actions } = useHealth();
  const confirm = useConfirm();
  const t = state.settings.training;
  const p = t.progression;

  const setProgression = (patch: Partial<TrainingSettings['progression']>) => actions.updateTraining({ progression: { ...p, ...patch } });

  return (
    <>
      <Field label="Load units" hint="Display only — loads are stored in kilograms, so switching never rewrites a logged set.">
        <div>
          <SegmentedControl ariaLabel="Load units" options={UNIT_OPTIONS} value={t.units} onChange={(units) => actions.updateTraining({ units })} />
        </div>
      </Field>

      <Field label="Rest timer" hint={`Counts down between sets on the Train tab. Now: ${restLabel(t.restTimerSec)}.`}>
        <div className="flex flex-wrap gap-2">
          {REST_PRESETS.map((sec) => {
            const on = t.restTimerSec === sec;
            return (
              // Selected is a filled button AND a tick AND aria-pressed — never hue alone.
              <Button key={sec} variant={on ? 'primary' : 'secondary'} size="sm" aria-pressed={on} icon={on ? <Check aria-hidden /> : undefined} onClick={() => actions.updateTraining({ restTimerSec: sec })}>
                {restLabel(sec)}
              </Button>
            );
          })}
        </div>
      </Field>
      <NumberField label="Or a custom rest, in seconds" value={t.restTimerSec} min={0} max={900} step={15} unit="s" hint="0 turns the timer off." onCommit={(restTimerSec) => actions.updateTraining({ restTimerSec })} />

      <SubHeading>Progression</SubHeading>
      <Note>
        Double progression: when every set hits the top of the rep range at or under the target RPE, the next session adds the load step. Below the range, or above the RPE window, the load holds.
      </Note>
      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label="Target RPE from"
          value={p.targetRpe[0]}
          min={5}
          max={10}
          step={0.5}
          dp={1}
          validate={(n) => (n > p.targetRpe[1] ? `Not above ${p.targetRpe[1]}.` : null)}
          onCommit={(lo) => setProgression({ targetRpe: [lo, p.targetRpe[1]] })}
        />
        <NumberField
          label="Target RPE to"
          value={p.targetRpe[1]}
          min={5}
          max={10}
          step={0.5}
          dp={1}
          validate={(n) => (n < p.targetRpe[0] ? `Not below ${p.targetRpe[0]}.` : null)}
          onCommit={(hi) => setProgression({ targetRpe: [p.targetRpe[0], hi] })}
        />
        <NumberField label="Reps from" value={p.repRange[0]} min={1} max={50} validate={(n) => (n > p.repRange[1] ? `Not above ${p.repRange[1]}.` : null)} onCommit={(lo) => setProgression({ repRange: [lo, p.repRange[1]] })} />
        <NumberField label="Reps to" value={p.repRange[1]} min={1} max={50} validate={(n) => (n < p.repRange[0] ? `Not below ${p.repRange[0]}.` : null)} onCommit={(hi) => setProgression({ repRange: [p.repRange[0], hi] })} />
        <NumberField label="Upper-body step" value={p.loadStepPctUpper} min={0.5} max={20} step={0.5} dp={1} unit="%" onCommit={(loadStepPctUpper) => setProgression({ loadStepPctUpper })} />
        <NumberField label="Lower-body step" value={p.loadStepPctLower} min={0.5} max={20} step={0.5} dp={1} unit="%" onCommit={(loadStepPctLower) => setProgression({ loadStepPctLower })} />
      </div>
      <Note className="text-hx-muted">
        Two steps, not one: {p.loadStepPctUpper}% of a press is a plate change you can make, while a squat needs {p.loadStepPctLower}% before the bar feels different. Rounding to the smallest plate
        pair you own happens on the Train tab.
      </Note>

      <LandmarkTable />

      <CustomExercises training={t} onConfirm={confirm} />

      <ProgramList />
    </>
  );
}

// ---------------------------------------------------------------------------
// Custom exercises
// ---------------------------------------------------------------------------

function CustomExercises({ training, onConfirm }: { training: TrainingSettings; onConfirm: ReturnType<typeof useConfirm> }) {
  const { actions } = useHealth();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<ExerciseDraft>(EMPTY_DRAFT);
  const list = training.customExercises;

  const trimmed = draft.name.trim();
  const duplicate = trimmed !== '' && [...list, ...EXERCISES].some((e) => e.name.toLowerCase() === trimmed.toLowerCase());
  const canAdd = trimmed.length >= 2 && !duplicate;

  const add = () => {
    if (!canAdd) return;
    const exercise: Exercise = {
      id: slugKey(trimmed, [...list.map((e) => e.id), ...EXERCISES.map((e) => e.id)]),
      name: trimmed,
      muscles: { primary: [draft.primary], secondary: [] },
      pattern: draft.pattern,
      equipment: draft.equipment,
      custom: true,
      ...(draft.unilateral ? { unilateral: true as const } : {}),
    };
    actions.updateTraining({ customExercises: [...list, exercise] });
    setDraft(EMPTY_DRAFT);
    setAdding(false);
    toast(`${exercise.name} added`);
  };

  const remove = async (e: Exercise) => {
    const ok = await onConfirm({
      title: `Delete ${e.name}?`,
      body: 'It disappears from search and from any program that uses it. Sessions you already logged keep their sets, but the name shows as its id until you add it back.',
      confirmLabel: 'Delete exercise',
      danger: true,
    });
    if (!ok) return;
    actions.updateTraining({ customExercises: list.filter((x) => x.id !== e.id) });
    toast(`${e.name} deleted`);
  };

  return (
    <>
      <SubHeading>Your exercises</SubHeading>
      <Note className="text-hx-muted">
        {EXERCISES.length} exercises ship with the app, aliases and typos included. Add one when your gym has a machine the library doesn’t — it joins search and counts toward the muscle you name.
      </Note>
      {list.length > 0 && (
        <ul className="flex flex-col gap-2">
          {list.map((e) => (
            <li key={e.id} className="flex items-center gap-2 rounded-xl border border-hx-border bg-hx-card2/40 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] leading-5 text-hx-text truncate">{e.name}</span>
                <span className="block text-[12px] leading-4 text-hx-muted truncate">
                  {e.muscles.primary.map(muscleLabel).join(', ')} · {EQUIPMENT_OPTIONS.find((o) => o.value === e.equipment)?.label ?? e.equipment}
                  {e.unilateral ? ' · per side' : ''}
                </span>
              </span>
              <Button variant="ghost" size="sm" icon={<Trash2 aria-hidden />} aria-label={`Delete ${e.name}`} onClick={() => remove(e)} />
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className="flex flex-col gap-3 rounded-xl border border-hx-border bg-hx-card2/40 p-3">
          <TextField
            label="Name"
            value={draft.name}
            maxLength={48}
            placeholder="e.g. Pendulum Squat"
            onChange={(name) => setDraft((d) => ({ ...d, name }))}
            hint={duplicate ? 'That name is already in the library — search finds it already.' : 'What you would type when logging it.'}
          />
          <div className="grid grid-cols-2 gap-3">
            <SelectField<Muscle> label="Main muscle" value={draft.primary} options={MUSCLE_OPTIONS} onChange={(primary) => setDraft((d) => ({ ...d, primary }))} />
            <SelectField<Equipment> label="Equipment" value={draft.equipment} options={EQUIPMENT_OPTIONS} onChange={(equipment) => setDraft((d) => ({ ...d, equipment }))} />
          </div>
          <SelectField<MovementPattern> label="Pattern" value={draft.pattern} options={PATTERN_OPTIONS} onChange={(pattern) => setDraft((d) => ({ ...d, pattern }))} hint="Used to balance a session, not to score you." />
          <Toggle label="Loaded per side" checked={draft.unilateral} hint="One limb at a time — the logger then asks for the load on one side." onChange={(unilateral) => setDraft((d) => ({ ...d, unilateral }))} />
          <div className="flex gap-2">
            <Button
              variant="secondary"
              fullWidth
              onClick={() => {
                setAdding(false);
                setDraft(EMPTY_DRAFT);
              }}
            >
              Cancel
            </Button>
            <Button fullWidth disabled={!canAdd} onClick={add}>
              Add exercise
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" fullWidth icon={<Plus aria-hidden />} onClick={() => setAdding(true)}>
          Add an exercise
        </Button>
      )}
    </>
  );
}
