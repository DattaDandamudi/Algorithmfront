/**
 * Train — the sixth tab (workout logging and analysis).
 *
 * This is the Phase 0 shell: the four sub-views exist and are reachable (by
 * pointer, by keyboard and through `nav.openTrain(view, workoutId)`), but each
 * one only states what will live there. Phase 2a replaces every empty state
 * with the real thing — planned session and load gauge (Today), the set-by-set
 * `SessionLogger` (Log), the session list and detail sheet (History), and the
 * e1RM / volume / load charts (Analysis) — and adds the `screens/train/*`
 * model hooks that read the store.
 *
 * Deliberately dependency-free for now: no engine and no store imports, so the
 * tab renders (and the shell keeps compiling) while the engine modules are
 * still being written. Nothing here reads or writes workout data.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CalendarDays, ClipboardList, History, LineChart } from 'lucide-react';
import { useNav, type TrainView } from '../nav';
import { EmptyState, SegmentedControl } from '../ui';

const VIEWS: Array<{ value: TrainView; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'log', label: 'Log' },
  { value: 'history', label: 'History' },
  { value: 'analysis', label: 'Analysis' },
];

interface ViewCopy {
  /** Heading of the empty state — also the accessible name of the panel. */
  title: string;
  hint: string;
  icon: ReactNode;
}

/** One honest line per view: what it will show, not what it can do today. */
const COPY: Record<TrainView, ViewCopy> = {
  today: {
    title: "Today's session",
    icon: <CalendarDays />,
    hint: 'Your planned session with per-exercise targets and the reason for each, the fitness / fatigue / form gauge, and one tap to start lifting or log cardio, mobility or sport.',
  },
  log: {
    title: 'Log a workout',
    icon: <ClipboardList />,
    hint: 'Set-by-set logging — weight and reps steppers, RPE chips, copy-last-set, a rest timer and ghost text from last time — plus short forms for cardio, mobility and sport sessions.',
  },
  history: {
    title: 'Session history',
    icon: <History />,
    hint: 'Every finished session, newest first, with its duration, volume, session RPE and any PRs. Tap one to see the sets, or to pick the session back up and edit it.',
  },
  analysis: {
    title: 'Strength and load analysis',
    icon: <LineChart />,
    hint: 'Estimated 1RM per exercise with PR markers, weekly sets per muscle against your volume landmarks, and the training-load curves behind the readiness verdict.',
  },
};

export default function Train() {
  const { trainTarget, consumeTrainTarget } = useNav();
  const [view, setView] = useState<TrainView>('today');
  /** A deep link may name a session; History opens its detail once Phase 2a lands. */
  const [pendingWorkoutId, setPendingWorkoutId] = useState<string | null>(null);
  const handledNonce = useRef<number | null>(null);

  // Deep link from Today / Trends / Coach (`openTrain('analysis')`, `openTrain('history', id)`).
  // The nonce guard makes a double-invoked effect (StrictMode) a no-op, exactly as on Coach.
  useEffect(() => {
    if (!trainTarget || handledNonce.current === trainTarget.nonce) return;
    handledNonce.current = trainTarget.nonce;
    const { view: target, workoutId } = trainTarget;
    consumeTrainTarget();
    setView(target);
    setPendingWorkoutId(workoutId ?? null);
  }, [trainTarget, consumeTrainTarget]);

  const copy = COPY[view];

  return (
    <div className="flex flex-col">
      <header className="sticky top-0 z-20 bg-hx-base/95 backdrop-blur px-4 pt-4 pb-3 flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-[17px] leading-6 font-semibold text-hx-text">Train</h1>
          <p className="text-[12px] leading-4 text-hx-muted">Not logging yet</p>
        </div>
        <SegmentedControl<TrainView> options={VIEWS} value={view} onChange={setView} size="sm" ariaLabel="Train view" className="self-start" />
      </header>

      <section className="px-4 pt-2 pb-6 flex flex-col gap-3" aria-label={copy.title}>
        <EmptyState icon={copy.icon} title={copy.title} hint={copy.hint} />

        {view === 'history' && pendingWorkoutId && (
          <p className="text-[12px] leading-4 text-hx-muted text-center">Session {pendingWorkoutId} will open here once history lands.</p>
        )}

        <p className="text-[12px] leading-5 text-hx-muted">
          Workout logging is still being built. Nothing on this tab reads or writes data yet, so your existing log is untouched.
        </p>
      </section>

      <footer className="px-4 pb-2 text-center">
        <p className="text-[11px] leading-4 text-hx-muted">Wellness information only — not medical advice.</p>
      </footer>
    </div>
  );
}
