/**
 * Estimated one-rep max for one exercise, with its EWMA trend and PR markers.
 *
 * The x axis is **one slot per session**, not one per calendar day. Sessions
 * containing a given lift are 2–4 days apart, so a daily axis over 90 days
 * puts the points ~3.7 px apart — under the chart's dot-density floor, where
 * dots are dropped and isolated values (a line with gaps either side) draw
 * nothing at all. Per-session spacing keeps every session visible and the
 * hidden table carries the real dates, which is where the exact chronology
 * belongs anyway.
 *
 * e1RM itself is a formula, not a tested single: `setE1rm` picks Brzycki,
 * Epley or Wathan by rep range (LeSuer 1997), blends with the RPE table when
 * RPE was logged, and returns nothing above 15 reps so a 20-rep back-off set
 * cannot drag the trend. The caption says so.
 */
import type { PersonalRecord } from '../../data/types';
import { E1RM_EWMA_ALPHA, type ExerciseHistory } from '../../engine';
import { formatDateShort } from '../../lib/dates';
import { fmt } from '../../lib/format';
import { EmptyState } from '../../ui';
import { TimeSeriesChart, type ChartRange } from '../../ui/charts';
import { Note, Stat, TrainCard } from './TrainCard';
import type { ExerciseOption } from './useTrainModel';
import { formatLoad, formatPct, toDisplayLoad, type Units } from './trainUtils';

export interface E1rmCardProps {
  options: ExerciseOption[];
  exerciseId: string | null;
  onPick: (id: string) => void;
  history: ExerciseHistory | null;
  /** PRs on this exercise inside the window — the chart's ▼ markers. */
  prs: PersonalRecord[];
  units: Units;
  range: ChartRange;
}

export default function E1rmCard({ options, exerciseId, onPick, history, prs, units, range }: E1rmCardProps) {
  if (options.length === 0 || !history) {
    return (
      <TrainCard
        title="Estimated 1RM"
        empty={
          <EmptyState
            title="No lifts logged yet"
            hint="Log a couple of sessions with weight and reps and this draws your estimated max per exercise, with the trend and any PRs marked."
          />
        }
      />
    );
  }

  const points = history.points;
  const data = points.map((p) => ({ d: p.d, value: p.best === null ? null : toDisplayLoad(p.best, units) }));
  const line = points.map((p) => ({ d: p.d, value: p.ewma === null ? null : toDisplayLoad(p.ewma, units) }));
  const annotations = prs.map((pr) => ({ d: pr.d, label: `PR · ${pr.kind === 'e1rm' ? 'est. max' : pr.kind}` }));

  const firstTrend = points.find((p) => p.ewma !== null)?.ewma ?? null;
  const lastTrend = [...points].reverse().find((p) => p.ewma !== null)?.ewma ?? null;
  const changePct =
    firstTrend !== null && lastTrend !== null && firstTrend > 0 ? ((lastTrend - firstTrend) / firstTrend) * 100 : null;
  const bestPoint = points.reduce<{ d: string; best: number } | null>(
    (acc, p) => (p.best !== null && (acc === null || p.best > acc.best) ? { d: p.d, best: p.best } : acc),
    null,
  );

  return (
    <TrainCard
      title="Estimated 1RM"
      caption={`${history.nSessions} session${history.nSessions === 1 ? '' : 's'} in view`}
      meaning={`The line is an EWMA (α ${E1RM_EWMA_ALPHA}) of each session's best estimate, so one heavy single does not redraw the trend.`}
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-[12px] leading-4 text-hx-muted">Exercise</span>
        <select
          value={exerciseId ?? ''}
          onChange={(e) => onPick(e.target.value)}
          className="h-11 rounded-xl border border-hx-border bg-hx-card2 px-3 text-[15px] leading-5 text-hx-text outline-none focus-visible:border-hx-blue"
        >
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name} · {o.sessions} session{o.sessions === 1 ? '' : 's'}
            </option>
          ))}
        </select>
      </label>

      <TimeSeriesChart
        ariaLabel={`${history.name} estimated one-rep max, per session`}
        range={range}
        data={data}
        line={line}
        annotations={annotations}
        unit={units}
        label="Session best"
        lineLabel="Trend"
        emptyText="No estimable sets yet — sets over 15 reps are excluded from the trend."
      />

      <div className="flex gap-4">
        <Stat
          label="Trend now"
          value={lastTrend === null ? '—' : formatLoad(lastTrend, units)}
          sub={changePct === null ? 'not enough sessions' : `${formatPct(changePct, 1)} across this window`}
          className="flex-1"
        />
        <Stat
          label="Best estimate"
          value={bestPoint === null ? '—' : formatLoad(bestPoint.best, units)}
          sub={bestPoint === null ? undefined : formatDateShort(bestPoint.d)}
          className="flex-1"
        />
      </div>

      {prs.length > 0 && (
        <Note>
          {prs.length} PR{prs.length === 1 ? '' : 's'} marked:{' '}
          {prs
            .map((pr) => `${formatDateShort(pr.d)} ${pr.kind === 'reps' ? `${fmt(pr.value, 0)} reps` : formatLoad(pr.value, units)}`)
            .join(', ')}
          .
        </Note>
      )}
      <Note>
        Estimated max comes from Brzycki, Epley or Wathan depending on the rep range (LeSuer 1997) and is blended with
        the RPE table when RPE was logged. Sets above 15 reps are left out — no formula is reliable there.
      </Note>
    </TrainCard>
  );
}
