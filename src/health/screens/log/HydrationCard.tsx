/**
 * Caffeine and water — two sections of the Log page (DESIGN.md "Log": ledger
 * rows with rule-outlined keys), each opened by a running head with 40 px of
 * space above it rather than an ink rule.
 *
 * Caffeine (§6.4): "Log a coffee" only logs a clock time (`logCaffeine`); it
 * does not add a meal. The time field defaults to now and follows the clock
 * until the user picks one, so a coffee drunk at 15:30 can be logged at 17:00
 * with the right stamp (checklist S6.4-08) — the after-cutoff hint is computed
 * from the PICKED time (`caffeinePickHint`), never from an earlier log. Once
 * something is logged after the cutoff (default 14:00, ≥8–10 h before bed) the
 * §7 #12 caution measures EACH logged time against the bed target, and a time
 * past the target reads "after your bed target" rather than 23.5 h before it
 * (review R7-6; `hoursToBed` on the eating-day axis). The logged times are
 * tags; tapping one removes that entry (mis-taps happen).
 *
 * Water (§6.5): ~30–35 ml/kg + activity bumps → `hydrationTargetCups` from
 * the context; one cup ≈ 250 ml. The lg Stepper is the figure and the
 * control; a 2 px progress rule beneath it runs blue until the target and
 * green once it is met, with the state written at its end. Stored as `h2o`
 * cups via patchDay.
 */
import { useState } from 'react';
import type { CoachContext, DailyRecord, HHMM, Profile } from '../../data/types';
import { ML_PER_CUP } from '../../engine/nutrition';
import { formatClock } from '../../lib/dates';
import { fmt } from '../../lib/format';
import { Button, Chip, SectionHeader, Stepper } from '../../ui';
import { caffeineLateCaption, caffeinePickHint, normaliseTime } from './logUtils';
import ProgressRule from './ProgressRule';

export interface CaffeineCardProps {
  todayRecord: DailyRecord | undefined;
  profile: Profile;
  nowHHMM: HHMM;
  /** `time` is the user's pick, or null for "now" (the caller stamps the wall clock at the tap). */
  onCaffeine: (time: HHMM | null) => void;
  onRemoveCaffeine: (time: string) => void;
}

export function CaffeineCard({ todayRecord, profile, nowHHMM, onCaffeine, onRemoveCaffeine }: CaffeineCardProps) {
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

  return (
    <section className="flex flex-col" aria-label="Caffeine">
      <SectionHeader as="h2" rule={false} title="Caffeine" caption={`Cutoff ${formatClock(profile.caffeineCutoff)}, to protect deep sleep`} />
      <div className="mt-4 flex items-center gap-3 flex-wrap">
        {/* Past the cutoff the key drops to an outline: still allowed, no longer the thing to do. */}
        <Button variant={late ? 'secondary' : 'primary'} size="md" onClick={log}>
          Log a coffee
        </Button>
        <label className="flex items-baseline gap-2">
          <span className="hx-label">at</span>
          <input type="time" value={at} onChange={(e) => setPicked(normaliseTime(e.target.value, at))} className="hx-display w-[128px] px-0" aria-label="Time of the coffee" />
        </label>
        {picked && (
          <Button variant="ghost" size="sm" onClick={() => setPicked(null)}>
            Now
          </Button>
        )}
      </div>
      {caf.length > 0 && (
        <div className="mt-3 flex items-center gap-2 flex-wrap" role="group" aria-label="Caffeine logged today">
          {caf.map((t, i) => (
            <Chip key={`${t}-${i}`} size="sm" onClick={() => onRemoveCaffeine(t)} aria-label={`Remove caffeine logged at ${formatClock(t)}`}>
              {formatClock(t)} ×
            </Chip>
          ))}
        </div>
      )}
      {lateCaption ? (
        <p className="hx-cap text-hx-yellow mt-3" role="status">
          {lateCaption}
        </p>
      ) : pickHint ? (
        <p className="hx-cap mt-3">{pickHint}</p>
      ) : null}
    </section>
  );
}

export interface WaterTileProps {
  ctx: CoachContext;
  onWater: (cups: number) => void;
}

export function WaterTile({ ctx, onWater }: WaterTileProps) {
  const cups = ctx.nutrition.hydrationCups;
  const target = Math.max(1, ctx.nutrition.hydrationTargetCups);
  const met = cups >= target;
  const left = target - cups;

  return (
    <section className="flex flex-col" aria-label="Water">
      <SectionHeader as="h2" rule={false} title="Water" caption={`Target ${target} cups`} />
      <div className="mt-4 flex flex-col gap-3">
        <Stepper value={cups} onChange={(n) => onWater(Math.max(0, n))} step={1} min={0} max={40} unit={cups === 1 ? 'cup' : 'cups'} label="Water" size="lg" className="w-full" />
        <ProgressRule
          value={cups}
          max={target}
          tone={met ? 'green' : 'blue'}
          label="Water toward target"
          end={met ? 'Target met' : `${left} ${left === 1 ? 'cup' : 'cups'} left`}
          valueText={`${cups} of ${target} cups`}
        />
        <p className="hx-cap">
          1 cup ≈ {ML_PER_CUP} ml, about {fmt(target * ML_PER_CUP)} ml a day for your weight
        </p>
      </div>
    </section>
  );
}
