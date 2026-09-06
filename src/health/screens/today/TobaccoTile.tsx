/**
 * Tobacco tile — SPEC §1 #7 / §6.6: today's count, the smoke-free streak,
 * a 7-day mini column strip and two quick actions.
 *
 * Integration notes: a smoke-free day needs an explicit `tob: 0` (the streak
 * engine skips days without a value), and the demo data leaves today's `tob`
 * undefined — so when nothing is logged the tile says "Not logged" and offers
 * "Smoke-free today" (`adjustTobacco(d, 0)` writes the 0). "+1" is the §2
 * two-tap quick-log. Tapping the count opens the Log screen's tobacco section.
 */
import { Cigarette, Plus } from 'lucide-react';
import type { TobaccoStats } from '../../engine';
import { formatDateShort, weekdayOf, weekdayShort } from '../../lib/dates';
import { fmt } from '../../lib/format';
import { Button, SectionHeader } from '../../ui';

const BAR_MAX_PX = 32;

export interface TobaccoTileProps {
  stats: TobaccoStats;
  /** Today's logged count, null when nothing has been logged yet. */
  today: number | null;
  onPlusOne: () => void;
  onSmokeFree: () => void;
  onOpenLog: () => void;
}

function MiniBars({ trend }: { trend: TobaccoStats['trend7'] }) {
  const max = Math.max(1, ...trend.map((p) => p.count ?? 0));
  const summary = trend.map((p) => `${formatDateShort(p.d)}: ${p.count === null ? 'not logged' : p.count}`).join(', ');
  return (
    <div className="flex items-end gap-1.5 h-12" role="img" aria-label={`Tobacco, last 7 days — ${summary}`}>
      {trend.map((p) => {
        const h = p.count === null ? 4 : Math.max(4, Math.round((p.count / max) * BAR_MAX_PX));
        const cls = p.count === null ? 'border border-dashed border-hx-border bg-transparent' : p.count === 0 ? 'bg-hx-green' : 'bg-hx-yellow';
        return (
          <div key={p.d} className="flex flex-col items-center gap-1 w-6">
            <span className={`w-3 rounded-t-[3px] ${cls}`} style={{ height: h }} aria-hidden />
            <span className="text-[10px] leading-3 text-hx-muted" aria-hidden>
              {weekdayShort(weekdayOf(p.d)).charAt(0)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function TobaccoTile({ stats, today, onPlusOne, onSmokeFree, onOpenLog }: TobaccoTileProps) {
  const logged = today !== null;
  const streak = stats.streakDays;

  return (
    <section className="px-4 pb-5 flex flex-col gap-3" aria-label="Tobacco">
      <SectionHeader title="Tobacco" caption={stats.avg7 !== null ? `7-day average ${fmt(stats.avg7, 1)} / day` : 'Log each day — smoke-free days need a 0'} />
      <div className="hx-card p-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <button type="button" onClick={onOpenLog} className="text-left flex-1 min-w-0 rounded-xl -m-1 p-1 min-h-[44px] hover:bg-hx-card2 transition-colors" aria-label="Open tobacco log">
            <div className="flex items-baseline gap-1.5">
              <span className={`text-[28px] leading-8 font-semibold tracking-tight ${logged ? 'text-hx-text' : 'text-hx-muted'}`}>{logged ? fmt(today) : '—'}</span>
              <span className="text-[13px] font-medium text-hx-text2">{logged ? 'today' : 'not logged today'}</span>
            </div>
            <div className={`mt-0.5 text-[13px] leading-4 font-medium ${streak > 0 ? 'text-hx-green' : 'text-hx-text2'}`}>
              {streak > 0 ? `${streak}-day smoke-free streak` : 'No smoke-free streak yet'}
            </div>
          </button>
          <MiniBars trend={stats.trend7} />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="md" icon={<Plus aria-hidden />} onClick={onPlusOne} aria-label="Log one more">
            +1
          </Button>
          {!logged && (
            <Button variant="secondary" size="md" icon={<Cigarette aria-hidden />} onClick={onSmokeFree} className="flex-1">
              Smoke-free today
            </Button>
          )}
          {logged && today === 0 && <span className="text-[13px] text-hx-green font-medium px-1">Smoke-free so far today</span>}
        </div>
      </div>
    </section>
  );
}
