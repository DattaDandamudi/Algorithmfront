/**
 * HydrationCard — caffeine quick-log and the water cup counter.
 *
 * Caffeine (§6.4): "+ coffee" only logs a clock time (`logCaffeine`); it
 * does not add a meal. The time input defaults to now and follows the clock
 * until the user picks one, so a coffee drunk at 15:30 can be logged at 17:00
 * with the right stamp (checklist S6.4-08) — the after-cutoff hint is computed
 * from the PICKED time (`caffeinePickHint`), never from an earlier log. Once
 * something is logged after the cutoff (default 14:00, ≥8–10 h before bed) the
 * §7 #12 caution measures EACH logged time against the bed target, and a time
 * past the target reads "after your bed target" rather than 23.5 h before it
 * (review R7-6; `hoursToBed` on the eating-day axis). Tapping a time chip
 * removes that entry (mis-taps happen).
 *
 * Water (§6.5): ~30–35 ml/kg + activity bumps → `hydrationTargetCups` from
 * the context; one cup ≈ 250 ml. Stored as `h2o` cups via patchDay.
 */
import { useState } from 'react';
import { Coffee, Droplets, Minus, Plus } from 'lucide-react';
import type { CoachContext, DailyRecord, HHMM, Profile } from '../../data/types';
import { ML_PER_CUP } from '../../engine/nutrition';
import { formatClock } from '../../lib/dates';
import { fmt } from '../../lib/format';
import { Button, Chip, ProgressRing, SectionHeader } from '../../ui';
import { caffeineLateCaption, caffeinePickHint, normaliseTime } from './logUtils';

export interface HydrationCardProps {
  ctx: CoachContext;
  todayRecord: DailyRecord | undefined;
  profile: Profile;
  nowHHMM: HHMM;
  /** `time` is the user's pick, or null for "now" (the caller stamps the wall clock at the tap). */
  onCaffeine: (time: HHMM | null) => void;
  onRemoveCaffeine: (time: string) => void;
  onWater: (cups: number) => void;
}

export default function HydrationCard({ ctx, todayRecord, profile, nowHHMM, onCaffeine, onRemoveCaffeine, onWater }: HydrationCardProps) {
  const caf = todayRecord?.caf ?? [];
  const lateCaption = caffeineLateCaption(caf, profile.bedTarget, profile.caffeineCutoff);
  // null = follow the clock; a pick sticks until logged or cleared.
  const [picked, setPicked] = useState<HHMM | null>(null);
  const at = picked ?? nowHHMM;
  const pickHint = caffeinePickHint(at, profile.bedTarget, profile.caffeineCutoff);
  const late = pickHint !== null;
  const log = () => {
    onCaffeine(picked);
    setPicked(null);
  };
  const cups = ctx.nutrition.hydrationCups;
  const target = ctx.nutrition.hydrationTargetCups;

  return (
    <div className="hx-card p-4 space-y-4">
      <div className="space-y-2">
        <SectionHeader title="Caffeine" caption={`Cutoff ${formatClock(profile.caffeineCutoff)} · protects deep sleep`} />
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant={late ? 'secondary' : 'primary'} size="md" icon={<Coffee aria-hidden />} onClick={log}>
            + coffee
          </Button>
          <label className="flex items-center gap-1.5">
            <span className="hx-label">at</span>
            <input
              type="time"
              value={at}
              onChange={(e) => setPicked(normaliseTime(e.target.value, at))}
              className="h-11 px-2 text-[15px] font-semibold w-[136px]"
              aria-label="Time of the coffee"
            />
          </label>
          {picked && (
            <button type="button" onClick={() => setPicked(null)} className="h-11 px-2 text-[13px] font-medium text-hx-text2 hover:text-hx-text rounded-xl">
              now
            </button>
          )}
        </div>
        {caf.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Caffeine logged today">
            {caf.map((t, i) => (
              <Chip key={`${t}-${i}`} size="sm" onClick={() => onRemoveCaffeine(t)} aria-label={`Remove caffeine logged at ${formatClock(t)}`}>
                {formatClock(t)} ×
              </Chip>
            ))}
          </div>
        )}
        {lateCaption ? (
          <p className="text-[13px] leading-5 text-hx-yellow" role="status">
            {lateCaption}
          </p>
        ) : pickHint ? (
          <p className="text-[13px] leading-5 text-hx-text2">{pickHint}</p>
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
            <div className="text-[12px] leading-4 text-hx-muted">1 cup ≈ {ML_PER_CUP} ml · ≈ {fmt(target * ML_PER_CUP)} ml/day for your weight</div>
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
