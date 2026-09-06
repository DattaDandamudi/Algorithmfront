/**
 * HydrationCard — caffeine quick-log and the water cup counter.
 *
 * Caffeine (§6.4): "+ coffee" only logs the clock time (`logCaffeine`); it
 * does not add a meal. A caution appears when the latest log is after the
 * profile cutoff (default 14:00, ≥8–10 h before bed) using the §7 #12 copy.
 * Tapping a time chip removes that entry (mis-taps happen).
 *
 * Water (§6.5): ~30–35 ml/kg + activity bumps → `hydrationTargetCups` from
 * the context; one cup ≈ 250 ml. Stored as `h2o` cups via patchDay.
 */
import { Coffee, Droplets, Minus, Plus } from 'lucide-react';
import type { CoachContext, DailyRecord, Profile } from '../../data/types';
import { caffeineCheck } from '../../engine/sleep';
import { formatClock } from '../../lib/dates';
import { fmt } from '../../lib/format';
import { Button, Chip, ProgressRing, SectionHeader } from '../../ui';
import { isAfterCutoff } from './logUtils';

export interface HydrationCardProps {
  ctx: CoachContext;
  todayRecord: DailyRecord | undefined;
  profile: Profile;
  nowHHMM: string;
  onCaffeine: () => void;
  onRemoveCaffeine: (time: string) => void;
  onWater: (cups: number) => void;
}

export default function HydrationCard({ ctx, todayRecord, profile, nowHHMM, onCaffeine, onRemoveCaffeine, onWater }: HydrationCardProps) {
  const caf = todayRecord?.caf ?? [];
  const check = caffeineCheck(caf, profile.bedTarget, profile.caffeineCutoff);
  const nowLate = isAfterCutoff(nowHHMM, profile.caffeineCutoff);
  const cups = ctx.nutrition.hydrationCups;
  const target = ctx.nutrition.hydrationTargetCups;

  return (
    <div className="hx-card p-4 space-y-4">
      <div className="space-y-2">
        <SectionHeader title="Caffeine" caption={`Cutoff ${formatClock(profile.caffeineCutoff)} · protects deep sleep`} />
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant={nowLate ? 'secondary' : 'primary'} size="md" icon={<Coffee aria-hidden />} onClick={onCaffeine}>
            + coffee · {formatClock(nowHHMM)}
          </Button>
          {caf.map((t, i) => (
            <Chip key={`${t}-${i}`} size="sm" onClick={() => onRemoveCaffeine(t)} aria-label={`Remove caffeine logged at ${formatClock(t)}`}>
              {formatClock(t)} ×
            </Chip>
          ))}
        </div>
        {check.afterCutoff ? (
          <p className="text-[13px] leading-5 text-hx-yellow" role="status">
            You logged caffeine at {formatClock(check.afterCutoff)} — within {check.hoursBeforeBed !== null ? fmt(check.hoursBeforeBed, 1) : '—'} h of bed. Cut off by {formatClock(profile.caffeineCutoff)} tomorrow to protect
            deep sleep.
          </p>
        ) : nowLate ? (
          <p className="text-[13px] leading-5 text-hx-text2">It’s past your {formatClock(profile.caffeineCutoff)} cutoff — a coffee now lands within {check.hoursBeforeBed !== null ? fmt(check.hoursBeforeBed, 1) : '~9'} h of bed.</p>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-hx-border pt-4">
        <div className="flex items-center gap-3 min-w-0">
          <ProgressRing value={cups} max={Math.max(1, target)} color="blue" size={56} label="Water">
            <Droplets className="w-4 h-4 text-hx-blue" aria-hidden />
          </ProgressRing>
          <div className="min-w-0">
            <div className="hx-label">Water</div>
            <div className="text-[17px] leading-6 font-semibold text-hx-text">
              {cups} <span className="text-[13px] font-medium text-hx-text2">/ {target} cups</span>
            </div>
            <div className="text-[12px] leading-4 text-hx-muted">1 cup ≈ 250 ml · target from {fmt(profile.weightLb > 0 ? Math.round((target * 250) / 100) * 100 : 0)} ml/day</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0" role="group" aria-label="Water cups">
          <button
            type="button"
            onClick={() => onWater(Math.max(0, cups - 1))}
            disabled={cups <= 0}
            aria-label="Remove a cup"
            className="w-11 h-11 inline-flex items-center justify-center rounded-xl bg-hx-card2 border border-hx-border text-hx-text hover:border-hx-neutral disabled:opacity-40"
          >
            <Minus className="w-5 h-5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => onWater(cups + 1)}
            aria-label="Add a cup"
            className="w-11 h-11 inline-flex items-center justify-center rounded-xl bg-hx-text text-hx-base hover:bg-white"
          >
            <Plus className="w-5 h-5" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
