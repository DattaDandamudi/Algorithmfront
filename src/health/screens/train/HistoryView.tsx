/**
 * Train ▸ History — the 14-day strip, the session ledger and the detail sheet
 * (DESIGN.md "Train"): the strip is fourteen hairline cells filled by ink
 * density with the day letter beneath in agate; the sessions are a ledger
 * with the date and kind in a 56 px agate column, the name in `.hx-body`, the
 * load in `.hx-fig-sm` flush right.
 *
 * The strip is display-only on purpose. Fourteen tappable cells inside 390 px
 * would each be ~25 px, well under the 44 px touch floor, so instead it is a
 * static overview with a letter per kind (S / C / M / P) inside the filled
 * cells and the whole thing summarised for a screen reader; tapping happens
 * in the ledger underneath, where a row is a full-width target. A cell's ink
 * density is the day's training load against the strip's heaviest day (a day
 * whose sessions carry no load sits at the middle density), so the fortnight
 * reads as a rhythm and not as a row of ticks.
 *
 * PR marks come from `detectPRs` over the same 90-day window the Analysis
 * list uses and are matched to sessions **by date** — `PersonalRecord` carries
 * the day, not the session id. On a day with two strength sessions both rows
 * would carry the mark; that is the honest limit of the data rather than a
 * guess about which session it belonged to.
 */
import { useMemo, useState } from 'react';
import type { ISODate, Workout, WorkoutKind } from '../../data/types';
import { detectPRs } from '../../engine';
import { MONTH_SHORT, formatDateShort, lastNDates, parseISODate, weekdayOf } from '../../lib/dates';
import { fmt } from '../../lib/format';
import { EmptyState, SectionHeader, SegmentedControl } from '../../ui';
import SessionDetail from './SessionDetail';
import { Note } from './TrainCard';
import type { TrainModel } from './useTrainModel';
import { PR_LIST_DAYS } from './useTrainModel';
import { formatDuration, kindLabel, sessionTitle, sessionVolumeKg, volumeParts, type Units } from './trainUtils';

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

const WEEKDAY_INITIAL = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

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
    const days = lastNDates(today, STRIP_DAYS).map((d) => {
      const sessions = byDay.get(d) ?? [];
      const loads = sessions.map((w) => w.load).filter(isNum);
      return { d, sessions, load: loads.length ? loads.reduce((a, b) => a + b, 0) : null };
    });
    const max = Math.max(0, ...days.map((x) => x.load ?? 0));
    return days.map((x) => ({ ...x, level: densityLevel(x.sessions.length, x.load, max) }));
  }, [workouts, today]);

  const open = openId ? workouts.find((w) => w.id === openId) ?? null : null;
  const active = strip.filter((s) => s.sessions.length > 0).length;

  return (
    <div className="flex flex-col">
      <section aria-label="Last 14 days" className="mt-6 flex flex-col">
        <SectionHeader as="h2" rule={false} title="Last 14 days" caption={`${active} of ${STRIP_DAYS} days had a session`} />
        {/* `data-mark`: the fourteen cells are chart marks, so their hairline outlines are grid lines, not frames. */}
        <div className="mt-4 grid gap-x-0.5" style={{ gridTemplateColumns: `repeat(${STRIP_DAYS}, minmax(0, 1fr))` }} aria-hidden data-mark="">
          {strip.map(({ d, sessions, level }) => (
            <div key={d} className="min-w-0 flex flex-col items-center gap-1">
              <span
                className={`hx-agate w-full h-7 flex items-center justify-center ${level === null ? 'border border-hx-border' : STRIP_FILL[level]}`}
                title={`${formatDateShort(d)}: ${sessions.length ? sessions.map((w) => sessionTitle(w)).join(', ') : 'no session'}`}
              >
                {sessions.length ? sessions.map((w) => KIND_LETTER[w.kind] ?? '').join('') : ''}
              </span>
              <span className="hx-agate">{WEEKDAY_INITIAL[weekdayOf(d)]}</span>
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
        <Note className="mt-2">S strength, C cardio, M mobility, P sport; darker is a heavier day.</Note>
      </section>

      <section aria-label="Sessions" className="mt-10 flex flex-col">
        <SectionHeader title="Sessions" caption={`${shown.length} session${shown.length === 1 ? '' : 's'}, newest first`} />
        <SegmentedControl<WorkoutKind | 'all'>
          options={KIND_FILTERS}
          value={filter}
          onChange={setFilter}
          size="sm"
          ariaLabel="Filter sessions by kind"
          className="w-full mt-4"
        />

        {shown.length === 0 ? (
          <EmptyState
            className="mt-6"
            title={workouts.length === 0 ? 'No sessions logged yet' : 'Nothing of that kind yet'}
            hint={
              workouts.length === 0
                ? 'Finish a session on the Today tab and it lands here with its duration, volume, session RPE and any PRs.'
                : 'Switch the filter, or log one of these and it will show up here.'
            }
          />
        ) : (
          <ul className="mt-2 flex flex-col divide-y divide-hx-border">
            {shown.map((w) => (
              <li key={w.id}>
                <SessionRow w={w} units={units} prs={prDays.get(w.d) ?? 0} onOpen={() => onOpenChange(w.id)} />
              </li>
            ))}
          </ul>
        )}
      </section>

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

/**
 * Ink density for a strip cell: bone at 28 / 50 / 80 percent (the heat-map
 * steps) by the day's load against the fortnight's heaviest day; null (an
 * outlined cell) when nothing was logged; the middle step when the sessions
 * carry no load. The kind letter inside is bone on the lightest fill and
 * stock on the two darker ones, so it clears contrast at every step.
 */
type StripLevel = 1 | 2 | 3;
const STRIP_FILL: Record<StripLevel, string> = {
  1: 'bg-hx-text/[0.28] text-hx-text',
  2: 'bg-hx-text/50 text-hx-base',
  3: 'bg-hx-text/80 text-hx-base',
};
function densityLevel(sessions: number, load: number | null, max: number): StripLevel | null {
  if (sessions === 0) return null;
  if (load === null || max <= 0) return 2;
  const frac = load / max;
  return frac <= 1 / 3 ? 1 : frac <= 2 / 3 ? 2 : 3;
}

/** "6 Sep" — the date for the agate column, without the weekday. */
function dayMonth(d: ISODate): string {
  const dt = parseISODate(d);
  return `${dt.getDate()} ${MONTH_SHORT[dt.getMonth()]}`;
}

function SessionRow({ w, units, prs, onOpen }: { w: Workout; units: Units; prs: number; onOpen: () => void }) {
  const volumeKg = sessionVolumeKg(w.exercises);
  const parts = [formatDuration(w.durationMin)];
  if (w.srpe !== undefined) parts.push(`RPE ${fmt(w.srpe, 0)}`);
  if (w.cardio?.sport) parts.push(w.cardio.sport);
  const figure = w.kind === 'strength' && volumeKg > 0 ? volumeParts(volumeKg, units) : { value: fmt(Math.round(w.durationMin), 0), unit: 'min' };

  return (
    <button type="button" onClick={onOpen} className="hx-row hx-press flex-row items-center gap-3 text-left">
      <span className="hx-agate w-14 shrink-0 flex flex-col">
        <span>{dayMonth(w.d)}</span>
        <span>{kindLabel(w.kind)}</span>
      </span>
      <span className="min-w-0 flex-1 flex flex-col">
        <span className="hx-body truncate">{sessionTitle(w)}</span>
        <span className="hx-cap truncate">
          {parts.join(', ')}
          {prs > 0 && (
            <span className="hx-label text-hx-green ml-2">
              <span className="hx-tone mr-1" aria-hidden />
              {prs} PR{prs === 1 ? '' : 's'}
            </span>
          )}
        </span>
      </span>
      <span className="hx-fig-sm text-hx-text shrink-0">
        {figure.value}
        <span className="hx-unit">{figure.unit}</span>
      </span>
    </button>
  );
}
