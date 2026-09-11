/**
 * Train ▸ History — a 14-day strip, the session list and the detail sheet,
 * laid out as two span-2 tiles in the view's bento (DESIGN.md): the strip is
 * an overview tile, the sessions are a list *inside* a tile rather than a run
 * of loose cards.
 *
 * The strip is display-only on purpose. Fourteen tappable cells inside 390 px
 * would each be ~25 px, well under the 44 px touch floor, so instead it is a
 * static overview with a letter per kind (S / C / M / P) and the whole thing
 * summarised for a screen reader; tapping happens in the list underneath,
 * where a row is a full-width target.
 *
 * PR badges come from `detectPRs` over the same 90-day window the Analysis
 * list uses and are matched to sessions **by date** — `PersonalRecord` carries
 * the day, not the session id. On a day with two strength sessions both rows
 * would carry the badge; that is the honest limit of the data rather than a
 * guess about which session it belonged to.
 */
import { useMemo, useState } from 'react';
import { History as HistoryIcon, Trophy } from 'lucide-react';
import type { ISODate, Workout, WorkoutKind } from '../../data/types';
import { detectPRs } from '../../engine';
import { formatDateShort, lastNDates, weekdayOf } from '../../lib/dates';
import { fmt } from '../../lib/format';
import { EmptyState, SectionHeader, SegmentedControl, bandSoftBg, bandText } from '../../ui';
import SessionDetail from './SessionDetail';
import { Note } from './TrainCard';
import type { TrainModel } from './useTrainModel';
import { PR_LIST_DAYS } from './useTrainModel';
import { formatDuration, formatVolume, kindLabel, sessionTitle, sessionVolumeKg, type Units } from './trainUtils';

/** Days in the strip. */
export const STRIP_DAYS = 14;

/** One letter per kind, so the strip never depends on colour alone. */
const KIND_LETTER: Record<WorkoutKind, string> = { strength: 'S', cardio: 'C', mobility: 'M', sport: 'P' };

const KIND_FILTERS: Array<{ value: WorkoutKind | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'strength', label: 'Lifts' },
  { value: 'cardio', label: 'Cardio' },
  { value: 'mobility', label: 'Mobility' },
  { value: 'sport', label: 'Sport' },
];

export interface HistoryViewProps {
  model: TrainModel;
  /** Deep-linked session to open on mount (`openTrain('history', id)`). */
  openId: string | null;
  onOpenChange: (id: string | null) => void;
  onEdit: (w: Workout) => void;
  onDelete: (id: string) => void;
}

export default function HistoryView({ model, openId, onOpenChange, onEdit, onDelete }: HistoryViewProps) {
  const { workouts, today, units, custom } = model;
  const [filter, setFilter] = useState<WorkoutKind | 'all'>('all');

  const newest = useMemo(() => [...workouts].reverse(), [workouts]);
  const shown = useMemo(() => (filter === 'all' ? newest : newest.filter((w) => w.kind === filter)), [newest, filter]);

  const prDays = useMemo(() => {
    const days = new Map<ISODate, number>();
    for (const pr of detectPRs(workouts, today, { custom, days: PR_LIST_DAYS })) {
      days.set(pr.d, (days.get(pr.d) ?? 0) + 1);
    }
    return days;
  }, [workouts, today, custom]);

  const strip = useMemo(() => {
    const byDay = new Map<ISODate, Workout[]>();
    for (const w of workouts) {
      const list = byDay.get(w.d);
      if (list) list.push(w);
      else byDay.set(w.d, [w]);
    }
    return lastNDates(today, STRIP_DAYS).map((d) => ({ d, sessions: byDay.get(d) ?? [] }));
  }, [workouts, today]);

  const open = openId ? workouts.find((w) => w.id === openId) ?? null : null;
  const active = strip.filter((s) => s.sessions.length > 0).length;

  return (
    <div className="hx-bento">
      <section aria-label="Last 14 days" className="hx-card hx-span-2 p-4 flex flex-col gap-3">
        <SectionHeader as="h3" title="Last 14 days" caption={`${active} of the last ${STRIP_DAYS} days had a session`} />
        <div className="flex gap-1" aria-hidden>
          {strip.map(({ d, sessions }) => (
            <div key={d} className="flex-1 min-w-0 flex flex-col items-center gap-1">
              <span className="text-[11px] leading-4 text-hx-muted">{WEEKDAY_INITIAL[weekdayOf(d)]}</span>
              <span
                className={`w-full h-8 rounded-ctl flex items-center justify-center text-[11px] leading-4 font-semibold ${
                  sessions.length ? `${bandSoftBg('green')} ${bandText('green')}` : 'bg-hx-card2/60 text-hx-muted'
                }`}
                title={`${formatDateShort(d)}: ${
                  sessions.length ? sessions.map((w) => sessionTitle(w)).join(', ') : 'no session'
                }`}
              >
                {sessions.length ? sessions.map((w) => KIND_LETTER[w.kind] ?? '–').join('') : '–'}
              </span>
            </div>
          ))}
        </div>
        <p className="sr-only">
          {strip
            .map(
              ({ d, sessions }) =>
                `${formatDateShort(d)}: ${sessions.length ? sessions.map((w) => sessionTitle(w)).join(', ') : 'no session'}`,
            )
            .join('. ')}
        </p>
        <Note>S strength, C cardio, M mobility, P sport.</Note>
      </section>

      <SegmentedControl<WorkoutKind | 'all'>
        options={KIND_FILTERS}
        value={filter}
        onChange={setFilter}
        size="sm"
        ariaLabel="Filter sessions by kind"
        className="hx-span-2"
      />

      {shown.length === 0 ? (
        <section className="hx-span-2">
          <EmptyState
            icon={<HistoryIcon />}
            title={workouts.length === 0 ? 'No sessions logged yet' : 'Nothing of that kind yet'}
            hint={
              workouts.length === 0
                ? 'Finish a session on the Today tab and it lands here with its duration, volume, session RPE and any PRs.'
                : 'Switch the filter, or log one of these and it will show up here.'
            }
          />
        </section>
      ) : (
        <section aria-label="Sessions" className="hx-card hx-span-2 p-4 flex flex-col gap-2">
          <SectionHeader as="h3" title="Sessions" caption={`${shown.length} session${shown.length === 1 ? '' : 's'}, newest first`} />
          <ul className="flex flex-col divide-y divide-hx-border/70 -my-1">
            {shown.map((w) => (
              <li key={w.id}>
                <SessionRow w={w} units={units} prs={prDays.get(w.d) ?? 0} onOpen={() => onOpenChange(w.id)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <SessionDetail
        open={open !== null}
        workout={open}
        units={units}
        custom={custom}
        onClose={() => onOpenChange(null)}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    </div>
  );
}

const WEEKDAY_INITIAL = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

function SessionRow({ w, units, prs, onOpen }: { w: Workout; units: Units; prs: number; onOpen: () => void }) {
  const volumeKg = sessionVolumeKg(w.exercises);
  const parts = [formatDateShort(w.d), kindLabel(w.kind), formatDuration(w.durationMin)];
  if (volumeKg > 0) parts.push(formatVolume(volumeKg, units));
  if (w.srpe !== undefined) parts.push(`RPE ${fmt(w.srpe, 0)}`);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="hx-press w-full min-h-11 rounded-ctl px-2 py-2.5 flex items-center gap-3 text-left hover:bg-hx-card2"
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-[15px] leading-[22px] font-medium text-hx-text truncate">{sessionTitle(w)}</span>
          {prs > 0 && (
            <span
              className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[13px] leading-4 ${bandSoftBg('green')} ${bandText('green')}`}
            >
              <Trophy className="w-3 h-3" aria-hidden />
              {prs} PR{prs === 1 ? '' : 's'}
            </span>
          )}
        </span>
        <span className="block text-[13px] leading-[18px] text-hx-muted truncate">{parts.join(', ')}</span>
      </span>
    </button>
  );
}
