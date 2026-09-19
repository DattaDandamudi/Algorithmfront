/**
 * Settings §4 — programs (SPEC §4, engine/exerciseDb.DEFAULT_PROGRAMS).
 *
 * The built-in 4-day upper/lower program ships in the engine, not in settings,
 * so it can be improved between releases without rewriting anyone's data. This
 * block lists the built-ins read-only as ledger rows, and "Make an editable
 * copy" writes a deep clone into `settings.training.programs`, which the Train
 * tab then prefers.
 *
 * A copy can be renamed, made active, edited set-by-set, and deleted. Both
 * overwriting an existing copy and deleting one are destructive, so both
 * confirm through the single Settings sheet (no nested sheets: the editor is an
 * inline disclosure, not a modal).
 */
import { useState, type ReactNode } from 'react';
import { useHealth } from '../../data/store';
import type { Program, ProgramExercise, SessionType } from '../../data/types';
import { DEFAULT_PROGRAMS, exerciseName } from '../../engine/exerciseDb';
import { Button, toast } from '../../ui';
import { NumberField, Note, SelectField, StateWord, SubHeading, TextField } from './fields';
import { useConfirm } from './useConfirm';
import { SESSION_OPTIONS, copyIdOf, programSummary } from './util';

function cloneProgram(p: Program): Program {
  const sessions: Program['sessions'] = {};
  for (const key of Object.keys(p.sessions) as SessionType[]) {
    const list = p.sessions[key];
    if (list) sessions[key] = list.map((e) => ({ ...e, reps: [e.reps[0], e.reps[1]] as [number, number] }));
  }
  return { id: copyIdOf(p.id), name: `${p.name} (my copy)`, sessions };
}

export default function ProgramList() {
  const { state, actions } = useHealth();
  const confirm = useConfirm();
  const training = state.settings.training;
  const custom = training.programs;
  const [openId, setOpenId] = useState<string | null>(null);

  const writePrograms = (programs: Program[], extra?: { activeProgramId?: string }) => actions.updateTraining({ programs, ...extra });

  const makeCopy = async (source: Program) => {
    const id = copyIdOf(source.id);
    const existing = custom.find((p) => p.id === id);
    if (existing) {
      const ok = await confirm({
        title: `Replace “${existing.name}”?`,
        body: 'Your edited copy is overwritten with the built-in program as it ships today. Sets, rep ranges and any exercise you removed come back. There is no undo.',
        confirmLabel: 'Replace copy',
        danger: true,
      });
      if (!ok) return;
    }
    const copy = cloneProgram(source);
    writePrograms([...custom.filter((p) => p.id !== id), copy], { activeProgramId: copy.id });
    setOpenId(copy.id);
    toast(existing ? 'Copy replaced' : 'Editable copy created');
  };

  const remove = async (p: Program) => {
    const ok = await confirm({
      title: `Delete “${p.name}”?`,
      body: 'Removes this program from Settings. Sessions you already logged against it keep their exercises; only the plan goes.',
      confirmLabel: 'Delete program',
      danger: true,
    });
    if (!ok) return;
    writePrograms(
      custom.filter((x) => x.id !== p.id),
      training.activeProgramId === p.id ? { activeProgramId: undefined } : undefined,
    );
    toast('Program deleted');
  };

  const patch = (id: string, next: Partial<Program>) => writePrograms(custom.map((p) => (p.id === id ? { ...p, ...next } : p)));

  const all = [...DEFAULT_PROGRAMS, ...custom];
  const activeId = training.activeProgramId ?? '';

  return (
    <>
      <SubHeading title="Programs" caption={`${custom.length} of yours`} />
      <SelectField
        label="Active program"
        value={all.some((p) => p.id === activeId) ? activeId : ''}
        options={[{ value: '', label: 'Built-in default (alternates A and B)' }, ...all.map((p) => ({ value: p.id, label: p.name }))]}
        onChange={(v) => actions.updateTraining({ activeProgramId: v || undefined })}
        hint="What the Train tab plans from. Nothing is locked: you can always log something else."
      />

      <ul className="hx-ledger m-0 p-0 list-none">
        {all.map((p) => {
          const mine = !p.builtIn;
          const open = openId === p.id;
          return (
            <li key={p.id} className="hx-row gap-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="hx-body truncate">{p.name}</p>
                  <p className="hx-cap">{programSummary(p)}</p>
                </div>
                <StateWord tone={mine ? 'blue' : 'neutral'} className="pt-0.5">
                  {mine ? 'Yours' : 'Built-in'}
                </StateWord>
              </div>
              <div className="flex flex-wrap gap-3">
                {p.builtIn ? (
                  <Button variant="secondary" size="sm" onClick={() => makeCopy(p)}>
                    {custom.some((c) => c.id === copyIdOf(p.id)) ? 'Replace my copy' : 'Make an editable copy'}
                  </Button>
                ) : (
                  <>
                    <Button variant="secondary" size="sm" aria-expanded={open} onClick={() => setOpenId(open ? null : p.id)}>
                      {open ? 'Done editing' : 'Edit'}
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => remove(p)}>
                      Delete
                    </Button>
                  </>
                )}
              </div>
              {mine && open && <ProgramEditor program={p} onChange={(next) => patch(p.id, next)} onConfirm={confirm} />}
            </li>
          );
        })}
      </ul>
      <Note>
        The built-in program lives in the app, so it improves with each release; a copy is yours and never changes underneath you. Add exercises to a session on the Train tab, where the picker and the
        exercise library live.
      </Note>
    </>
  );
}

// ---------------------------------------------------------------------------

function ProgramEditor({ program, onChange, onConfirm }: { program: Program; onChange: (next: Partial<Program>) => void; onConfirm: ReturnType<typeof useConfirm> }) {
  const { state } = useHealth();
  const customExercises = state.settings.training.customExercises;
  const sessionKeys = (Object.keys(program.sessions) as SessionType[]).filter((k) => (program.sessions[k]?.length ?? 0) > 0);

  const setExercise = (key: SessionType, idx: number, next: Partial<ProgramExercise>) => {
    const list = program.sessions[key] ?? [];
    onChange({ sessions: { ...program.sessions, [key]: list.map((e, i) => (i === idx ? { ...e, ...next } : e)) } });
  };

  const removeExercise = async (key: SessionType, idx: number) => {
    const list = program.sessions[key] ?? [];
    const name = exerciseName(list[idx].exerciseId, customExercises);
    const ok = await onConfirm({
      title: `Remove ${name}?`,
      body: `Takes it out of the ${SESSION_OPTIONS.find((o) => o.value === key)?.label.toLowerCase() ?? key} session in “${program.name}”. Past sessions keep it.`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    onChange({ sessions: { ...program.sessions, [key]: list.filter((_, i) => i !== idx) } });
    toast(`${name} removed`);
  };

  return (
    <div className="pt-3 flex flex-col gap-6">
      <TextField label="Program name" value={program.name} maxLength={60} onChange={(name) => onChange({ name })} />
      {sessionKeys.map((key) => (
        <div key={key}>
          <h4 className="hx-label">{SESSION_OPTIONS.find((o) => o.value === key)?.label ?? key}</h4>
          <ul className="hx-ledger m-0 p-0 list-none mt-1">
            {(program.sessions[key] ?? []).map((e, i) => {
              const name = exerciseName(e.exerciseId, customExercises);
              return (
                <li key={`${e.exerciseId}-${i}`} className="hx-row gap-2">
                  <div className="flex items-center justify-between gap-4">
                    <span className="hx-body truncate">{name}</span>
                    <Button variant="ghost" size="sm" aria-label={`Remove ${name} from ${key}`} onClick={() => removeExercise(key, i)} className="-my-3">
                      Remove
                    </Button>
                  </div>
                  <div className="grid grid-cols-4 gap-x-3">
                    <MiniField label="Sets">
                      <NumberField label={`${name} sets`} hideLabel value={e.sets} min={1} max={12} onCommit={(sets) => setExercise(key, i, { sets })} />
                    </MiniField>
                    <MiniField label="Reps">
                      <NumberField label={`${name} lowest reps`} hideLabel value={e.reps[0]} min={1} max={50} validate={(n) => (n > e.reps[1] ? `Not above ${e.reps[1]}.` : null)} onCommit={(lo) => setExercise(key, i, { reps: [lo, e.reps[1]] })} />
                    </MiniField>
                    <MiniField label="to">
                      <NumberField label={`${name} highest reps`} hideLabel value={e.reps[1]} min={1} max={50} validate={(n) => (n < e.reps[0] ? `Not below ${e.reps[0]}.` : null)} onCommit={(hi) => setExercise(key, i, { reps: [e.reps[0], hi] })} />
                    </MiniField>
                    <MiniField label="RPE">
                      <NumberField
                        label={`${name} target RPE`}
                        hideLabel
                        value={e.rpe ?? null}
                        min={5}
                        max={10}
                        step={0.5}
                        dp={1}
                        placeholder="Optional"
                        onCommit={(rpe) => setExercise(key, i, { rpe })}
                        onClear={() => setExercise(key, i, { rpe: undefined })}
                      />
                    </MiniField>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <Note>Adding an exercise happens on Train, where you can search the library and see what a session already covers.</Note>
    </div>
  );
}

function MiniField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <span className="hx-label block">{label}</span>
      {children}
    </div>
  );
}
