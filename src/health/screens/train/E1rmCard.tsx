/**
 * Estimated one-rep max for one exercise — the first section of Analysis
 * (DESIGN.md "Train"): the running head with the sessions in view as its
 * dateline, the exercise `<select>` as an underline field, the figure
 * (`E1rmChart`: a 1.5 px bone line, hollow session dots, PR dots filled and
 * labelled, the last value at the line end) with the EWMA hedge as its
 * caption, then "Trend now" and "Best estimate" as a two-up box score.
 *
 * e1RM itself is a formula, not a tested single: `setE1rm` picks Brzycki,
 * Epley or Wathan by rep range (LeSuer 1997), blends with the RPE table when
 * RPE was logged, and returns nothing above 15 reps so a 20-rep back-off set
 * cannot drag the trend. The note under the box score says so.
 */
import type { PersonalRecord } from '../../data/types';
import { E1RM_EWMA_ALPHA, type ExerciseHistory } from '../../engine';
import { formatDateShort } from '../../lib/dates';
import { fmt } from '../../lib/format';
import { EmptyState, Tile } from '../../ui';
import type { ChartRange } from '../../ui/charts';
import E1rmChart, { type E1rmChartPoint } from './E1rmChart';
import { Note, TrainCard } from './TrainCard';
import type { ExerciseOption } from './useTrainModel';
import { formatLoad, formatPct, toDisplayLoad, type Units } from './trainUtils';

export interface E1rmCardProps {
  options: ExerciseOption[];
  exerciseId: string | null;
  onPick: (id: string) => void;
  history: ExerciseHistory | null;
  /** PRs on this exercise inside the window — the chart's filled dots. */
  prs: PersonalRecord[];
  units: Units;
  range: ChartRange;
  className?: string;
}

const PR_WORD: Record<PersonalRecord['kind'], string> = { weight: 'heaviest set', reps: 'most reps', e1rm: 'est. max' };

export default function E1rmCard({ options, exerciseId, onPick, history, prs, units, range, className = '' }: E1rmCardProps) {
  if (options.length === 0 || !history) {
    return (
      <TrainCard
        title="Estimated 1RM"
        className={className}
        empty={
          <EmptyState
            className="mt-4"
            title="No lifts logged yet"
            hint="Log a couple of sessions with weight and reps and this draws your estimated max per exercise, with the trend and any PRs marked."
          />
        }
      />
    );
  }

  const points = history.points;
  const prByDay = new Map(prs.map((pr) => [pr.d, PR_WORD[pr.kind]]));
  const data: E1rmChartPoint[] = points.map((p) => {
    const pr = prByDay.get(p.d);
    return {
      d: p.d,
      best: p.best === null ? null : toDisplayLoad(p.best, units),
      trend: p.ewma === null ? null : toDisplayLoad(p.ewma, units),
      ...(pr ? { pr } : {}),
    };
  });

  const firstTrend = points.find((p) => p.ewma !== null)?.ewma ?? null;
  const lastTrend = [...points].reverse().find((p) => p.ewma !== null)?.ewma ?? null;
  const changePct =
    firstTrend !== null && lastTrend !== null && firstTrend > 0 ? ((lastTrend - firstTrend) / firstTrend) * 100 : null;
  const bestPoint = points.reduce<{ d: string; best: number } | null>(
    (acc, p) => (p.best !== null && (acc === null || p.best > acc.best) ? { d: p.d, best: p.best } : acc),
    null,
  );

  // Loads are whole numbers far more often than not; show a decimal only when
  // there is one, so "135 lb" never reads as "135.0 lb".
  const trendNow = lastTrend === null ? null : toDisplayLoad(lastTrend, units);
  const best = bestPoint === null ? null : toDisplayLoad(bestPoint.best, units);
  const loadDp = (v: number | null) => (v === null || Number.isInteger(v) ? 0 : 1);

  return (
    <TrainCard title="Estimated 1RM" caption={`${history.nSessions} session${history.nSessions === 1 ? '' : 's'} in view`} className={className}>
      <label className="flex flex-col gap-1">
        <span className="hx-label">Exercise</span>
        <select value={exerciseId ?? ''} onChange={(e) => onPick(e.target.value)} className="w-full">
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}, {o.sessions} session{o.sessions === 1 ? '' : 's'}
            </option>
          ))}
        </select>
      </label>

      <figure className="hx-figure">
        <E1rmChart
          ariaLabel={`${history.name} estimated one-rep max, per session`}
          points={data}
          unit={units}
          range={range}
          emptyText="No estimable sets yet; sets over 15 reps are excluded from the trend."
        />
        {prs.length > 0 && (
          <p className="hx-cap mt-2">
            {prs.length} PR{prs.length === 1 ? '' : 's'} marked:{' '}
            {prs
              .map((pr) => `${formatDateShort(pr.d)} ${pr.kind === 'reps' ? `${fmt(pr.value, 0)} reps` : formatLoad(pr.value, units)}`)
              .join(', ')}
            .
          </p>
        )}
        <figcaption>{`The line is an EWMA (α ${E1RM_EWMA_ALPHA}) of each session's best estimate, so one heavy single does not redraw the trend.`}</figcaption>
      </figure>

      <div className="hx-score-grid">
        <Tile
          label="Trend now"
          value={trendNow}
          dp={loadDp(trendNow)}
          unit={units}
          sub={changePct === null ? 'not enough sessions' : `${formatPct(changePct, 1)} across this window`}
          emptyHint="not enough sessions"
        />
        <Tile
          label="Best estimate"
          value={best}
          dp={loadDp(best)}
          unit={units}
          sub={bestPoint === null ? undefined : formatDateShort(bestPoint.d)}
          emptyHint="nothing estimable yet"
        />
      </div>

      <Note className="mt-4">
        Estimated max comes from Brzycki, Epley or Wathan depending on the rep range (LeSuer 1997) and is blended with
        the RPE table when RPE was logged. Sets above 15 reps are left out; no formula is reliable there.
      </Note>
    </TrainCard>
  );
}
