/**
 * Tobacco — SPEC §1 #7 / §6.6: today's count as a ledger row (the button
 * into Log's tobacco section), the smoke-free streak in words, a 7-day strip
 * of hairline cells filled by ink density, and two quick actions.
 *
 * Integration notes: a smoke-free day needs an explicit `tob: 0` (the streak
 * engine skips days without a value), and the demo data leaves today's `tob`
 * undefined — so when nothing is logged the row says "not logged" and offers
 * "Smoke-free today" (`adjustTobacco(d, 0)` writes the 0). "+1" is the §2
 * two-tap quick-log.
 */
import type { TobaccoStats } from '../../engine';
import { formatDateShort, weekdayOf, weekdayShort } from '../../lib/dates';
import { fmt } from '../../lib/format';
import { Button, SectionHeader } from '../../ui';
import { LEVEL_OPACITY } from '../../ui/charts';

export interface TobaccoTileProps {
  stats: TobaccoStats;
  /** Today's logged count, null when nothing has been logged yet. */
  today: number | null;
  onPlusOne: () => void;
  onSmokeFree: () => void;
  onOpenLog: () => void;
}

/** Bone at the heat-map densities: the fill of a cell is the count against the week's high. */
function density(count: number, max: number): number {
  const f = count / max;
  const level = f >= 0.85 ? 3 : f >= 0.5 ? 2 : f >= 0.25 ? 1 : 0;
  return LEVEL_OPACITY[level];
}

/** Seven hairline cells filled by ink density; a 2 px tick marks a logged smoke-free day; blank is not logged. */
function WeekStrip({ trend }: { trend: TobaccoStats['trend7'] }) {
  const max = Math.max(1, ...trend.map((p) => p.count ?? 0));
  const summary = trend.map((p) => `${formatDateShort(p.d)}: ${p.count === null ? 'not logged' : p.count}`).join(', ');
  return (
    <div className="mt-4" role="img" aria-label={`Tobacco, last 7 days: ${summary}`}>
      <div className="flex gap-1">
        {trend.map((p) => (
          <div key={p.d} className="flex-1 min-w-0 flex flex-col gap-1" title={`${formatDateShort(p.d)}: ${p.count === null ? 'not logged' : p.count}`}>
            <div className="relative h-5 border-b border-hx-border">
              {p.count === null ? null : p.count === 0 ? (
                <span className="absolute inset-x-0 bottom-0 h-0.5 bg-hx-text" aria-hidden />
              ) : (
                <span className="absolute inset-0" style={{ background: `rgba(237, 230, 216, ${density(p.count, max)})` }} aria-hidden />
              )}
            </div>
            <span className="hx-agate" aria-hidden>
              {weekdayShort(weekdayOf(p.d)).charAt(0)}
            </span>
          </div>
        ))}
      </div>
      <p className="hx-cap mt-1">Ink by count; a tick is a smoke-free day; blank is not logged.</p>
    </div>
  );
}

export default function TobaccoTile({ stats, today, onPlusOne, onSmokeFree, onOpenLog }: TobaccoTileProps) {
  const logged = today !== null;
  const streak = stats.streakDays;
  const streakLine = streak > 0 ? `${fmt(streak)}-day smoke-free streak` : 'No smoke-free streak yet';

  return (
    <section className="mt-10" aria-label="Tobacco">
      <SectionHeader as="h2" rule={false} title="Tobacco" caption={stats.avg7 !== null ? `7-day average ${fmt(stats.avg7, 1)} a day` : 'Smoke-free days need a 0'} />

      <div className="hx-ledger mt-4">
        <button type="button" onClick={onOpenLog} className="hx-row hx-press flex-row items-center justify-between gap-3 text-left" aria-label="Open tobacco log">
          <span className="min-w-0 flex flex-col">
            <span className="hx-body">Today</span>
            <span className={`hx-cap ${streak > 0 ? 'text-hx-green' : ''}`}>
              {streak > 0 && <span className="hx-tone mr-1.5" aria-hidden />}
              {streakLine}
            </span>
          </span>
          <span className={`hx-fig shrink-0 ${logged ? 'text-hx-text' : 'text-hx-muted'}`}>
            {logged ? fmt(today) : '—'}
            <span className="hx-unit">{logged ? 'today' : 'not logged'}</span>
          </span>
        </button>
      </div>

      <WeekStrip trend={stats.trend7} />

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button variant="secondary" size="md" onClick={onPlusOne} aria-label="Log one more">
          +1
        </Button>
        {!logged && (
          <Button variant="secondary" size="md" onClick={onSmokeFree}>
            Smoke-free today
          </Button>
        )}
        {logged && today === 0 && (
          <span className="hx-label text-hx-green">
            <span className="hx-tone mr-1.5" aria-hidden />
            Smoke-free so far today
          </span>
        )}
      </div>
    </section>
  );
}
