/**
 * Train — the sixth tab: log a session, see what to do today, and analyse
 * what has happened (plan §2a). Set as the match programme (DESIGN.md
 * "Train"): the masthead "Train" with the day's status as its dateline, the
 * Today / Log / History / Analysis switch as four words on a hairline, the
 * sub-view, and the medical line as the colophon under a final hairline.
 * Nothing is sticky; the masthead scrolls away with the page.
 *
 * This file owns two pieces of state and nothing else: which sub-view is
 * showing, and the live session draft. Everything numeric comes from
 * `useTrainModel` (the CoachContext) and `useAnalysisModel`; the four views
 * under `./train` are presentational.
 *
 * ## The draft is the safety net
 * A session in progress lives in `hx:wk:draft`, not in the store. It is read
 * once in the `useState` initialiser — so a reload lands straight back in the
 * logger with every set intact — and written back on every change. It becomes
 * a `Workout` exactly once, when the finish sheet saves, which is why an
 * abandoned session never appears in History, in the volume grid or in the
 * load series.
 *
 * ## Sheets are siblings
 * The picker and finish sheets belong to the logger, the detail sheet to
 * History, and only one sub-view renders at a time. "Edit" on a saved session
 * is a hand-off, not a stack: the detail sheet closes, the session becomes a
 * draft, and the inline logger opens on the Log sub-view.
 *
 * Deep links (`openTrain('analysis')`, `openTrain('history', id)`) are
 * consumed once, guarded by a nonce so a StrictMode double-invoke is a no-op.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Workout, WorkoutKind } from '../data/types';
import { useHealth } from '../data/store';
import { detectPRs } from '../engine';
import { nowHHMM } from '../lib/dates';
import { Button, EmptyState, SegmentedControl, toast } from '../ui';
import { useNav, type TrainView } from '../nav';
import AnalysisView from './train/AnalysisView';
import CardioForm from './train/CardioForm';
import HistoryView from './train/HistoryView';
import SessionLogger from './train/SessionLogger';
import TodayView from './train/TodayView';
import {
  clearDraft,
  draftEndTime,
  draftFromWorkout,
  draftToWorkout,
  newDraft,
  readDraft,
  writeDraft,
  type WorkoutDraft,
} from './train/draft';
import { kindLabel, sessionLabel } from './train/trainUtils';
import { useTrainModel } from './train/useTrainModel';

const VIEWS: Array<{ value: TrainView; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'log', label: 'Log' },
  { value: 'history', label: 'History' },
  { value: 'analysis', label: 'Analysis' },
];

export default function Train() {
  const { trainTarget, consumeTrainTarget } = useNav();
  const { actions } = useHealth();
  const model = useTrainModel();

  // Read once, on the first render: a reload lands back in the live session.
  const [draft, setDraft] = useState<WorkoutDraft | null>(readDraft);
  const [view, setView] = useState<TrainView>(() => (draft ? 'log' : 'today'));
  const [detailId, setDetailId] = useState<string | null>(null);
  const handledNonce = useRef<number | null>(null);

  // Persist every change. `writeDraft` swallows storage failures on purpose —
  // a full localStorage must not interrupt someone mid-set.
  useEffect(() => {
    writeDraft(draft);
  }, [draft]);

  // "Clear all data" and a replace-import wipe storage while this tab stays
  // mounted behind Settings. Without dropping the draft, the effect above would
  // write the live session straight back into the storage just erased, and
  // finishing it would file a workout into the data the user deleted.
  const generation = useHealth().state.generation;
  const seenGeneration = useRef(generation);
  useEffect(() => {
    if (seenGeneration.current === generation) return;
    seenGeneration.current = generation;
    setDraft(null);
    setDetailId(null);
    setView('today');
  }, [generation]);

  // A sub-view change is a page turn: back to the top, so Start at the foot of
  // a long Today view opens the logger at its head. Not on mount, where the
  // page is read from the top anyway. Set on the scrolling elements directly
  // rather than window.scrollTo so a non-visual DOM stays quiet.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [view]);

  // Deep link from Today / Trends / Coach.
  useEffect(() => {
    if (!trainTarget || handledNonce.current === trainTarget.nonce) return;
    handledNonce.current = trainTarget.nonce;
    const { view: target, workoutId } = trainTarget;
    consumeTrainTarget();
    setView(target);
    setDetailId(workoutId ?? null);
  }, [trainTarget, consumeTrainTarget]);

  const startSession = (kind: WorkoutKind) => {
    if (draft) {
      setView('log');
      return;
    }
    const session = model.training.todaySession;
    const isStrength = kind === 'strength';
    setDraft(
      newDraft({
        d: model.today,
        start: nowHHMM(new Date(model.nowMs)),
        kind,
        nowMs: Date.now(),
        ...(isStrength && session !== 'rest' ? { session } : {}),
        ...(isStrength && model.settings.training?.activeProgramId
          ? { programId: model.settings.training.activeProgramId }
          : {}),
        ...(isStrength
          ? { exercises: model.training.plannedExercises.map((pe) => ({ exerciseId: pe.exerciseId, sets: [] })) }
          : {}),
      }),
    );
    setView('log');
  };

  const discard = () => {
    setDraft(null);
    clearDraft();
    setView('today');
    toast('Session discarded');
  };

  const save = (done: { durationMin: number; srpe?: number; note?: string }) => {
    if (!draft) return;
    const next = done.note === undefined ? draft : { ...draft, note: done.note };
    const w = draftToWorkout(next, done);
    if (draft.editing) {
      // Explicit undefined for the optional blocks so removing every set (or
      // clearing a note) actually removes it — the store compacts undefined away.
      actions.updateWorkout(w.id, {
        ...w,
        exercises: w.exercises,
        cardio: w.cardio,
        srpe: w.srpe,
        note: w.note,
        title: w.title,
        session: w.session,
      });
    } else {
      actions.addWorkout(w);
    }
    // Stamps the load so history never shifts when the load model is retuned.
    actions.finishWorkout(w.id, {
      durationMin: w.durationMin,
      ...(w.srpe !== undefined ? { srpe: w.srpe } : {}),
      end: draftEndTime(next, w.durationMin),
    });

    const prs = detectPRs([...model.workouts.filter((x) => x.id !== w.id), w], model.today, {
      custom: model.custom,
      days: 1,
    });
    setDraft(null);
    clearDraft();
    setDetailId(w.id);
    setView('history');
    toast(prs.length > 0 ? `Session saved, ${prs.length} PR${prs.length === 1 ? '' : 's'}` : 'Session saved');
  };

  const editSession = (w: Workout) => {
    setDetailId(null);
    setDraft(draftFromWorkout(w, Date.now()));
    setView('log');
  };

  const deleteSession = (id: string) => {
    actions.removeWorkout(id);
    setDetailId(null);
    toast('Session deleted');
  };

  const openSession = (id: string | null) => {
    setDetailId(id);
    if (id) setView('history');
  };

  /** The dateline beside the masthead: what today is, or what is running. */
  const status = useMemo(() => {
    if (draft) return `${kindLabel(draft.kind)} in progress`;
    const n = model.training.todayWorkouts.length;
    if (n > 0) return `${n} logged today`;
    return model.training.todaySession === 'rest' ? 'Rest day' : `${sessionLabel(model.training.todaySession)} today`;
  }, [draft, model.training]);

  return (
    <div className="px-5 flex flex-col">
      <header className="pt-8 flex items-baseline justify-between gap-4">
        <h1 className="hx-masthead text-hx-text shrink-0">Train</h1>
        <p className="hx-hedge min-w-0 flex-1 text-right">{status}</p>
      </header>
      {/* md = 44 px words, the touch-target floor; w-full stretches the hairline under the whole row. */}
      <SegmentedControl<TrainView> options={VIEWS} value={view} onChange={setView} size="md" ariaLabel="Train view" className="w-full mt-4" />

      <section aria-label={VIEWS.find((v) => v.value === view)?.label ?? 'Train'} className="flex flex-col">
        {view === 'today' && (
          <TodayView
            model={model}
            onStart={() => startSession('strength')}
            onLogKind={startSession}
            onOpenSession={openSession}
          />
        )}

        {view === 'log' &&
          (draft === null ? (
            <StartPrompt model={model} onStart={startSession} />
          ) : draft.kind === 'strength' ? (
            <SessionLogger
              draft={draft}
              units={model.units}
              custom={model.custom}
              history={model.workouts}
              today={model.today}
              restTimerSec={model.restTimerSec}
              onChange={setDraft}
              onSave={save}
              onDiscard={discard}
            />
          ) : (
            <CardioForm draft={draft} units={model.units} onChange={setDraft} onSave={save} onDiscard={discard} />
          ))}

        {view === 'history' && (
          <HistoryView
            model={model}
            openId={detailId}
            onOpenChange={setDetailId}
            onEdit={editSession}
            onDelete={deleteSession}
          />
        )}

        {view === 'analysis' && <AnalysisView model={model} onStart={startSession} />}
      </section>

      {/* The colophon: the medical line, verbatim, under a final hairline. */}
      <div className="hx-hair mt-10" aria-hidden />
      <footer className="pt-3 pb-6">
        <p className="hx-hedge">Wellness information only, not medical advice.</p>
      </footer>
    </div>
  );
}

/** The Log sub-view with no session running: four ways to start one. */
function StartPrompt({ model, onStart }: { model: ReturnType<typeof useTrainModel>; onStart: (k: WorkoutKind) => void }) {
  const session = model.training.todaySession;
  return (
    <div className="flex flex-col">
      <EmptyState
        className="mt-6"
        title="No session in progress"
        hint={
          session === 'rest'
            ? 'Today is a rest day on your split. Start anything below if you want it logged anyway; nothing here is locked to the plan.'
            : `Start ${sessionLabel(session).toLowerCase()} and the planned exercises come with it, ready for sets.`
        }
        action={{ label: `Start ${session === 'rest' ? 'a session' : sessionLabel(session).toLowerCase()}`, onClick: () => onStart('strength') }}
      />
      <section aria-label="Log another kind of session" className="mt-6 grid grid-cols-3 gap-2">
        <Button variant="secondary" aria-label="Log cardio" onClick={() => onStart('cardio')}>
          Cardio
        </Button>
        <Button variant="secondary" aria-label="Log mobility" onClick={() => onStart('mobility')}>
          Mobility
        </Button>
        <Button variant="secondary" aria-label="Log sport" onClick={() => onStart('sport')}>
          Sport
        </Button>
      </section>
    </div>
  );
}
