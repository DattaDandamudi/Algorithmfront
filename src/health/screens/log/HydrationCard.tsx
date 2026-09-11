/**
 * Caffeine and water — two RAISED tiles in the Log bento (they are controls,
 * not readings): caffeine spans both columns because its cutoff warning is a
 * sentence, water is a 1×1 (one number, one control) paired with the bedtime
 * tile so neither is left alone in a row.
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
    <div className="hx-raised h-full p-4 flex flex-col gap-3">
      <SectionHeader as="h3" title="Caffeine" caption={`Cutoff ${formatClock(profile.caffeineCutoff)}, to protect deep sleep`} />
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant={late ? 'secondary' : 'primary'} size="md" icon={<Coffee aria-hidden />} onClick={log}>
          + coffee
        </Button>
        <label className="flex items-center gap-1.5">
          <span className="hx-label">at</span>
          <input type="time" value={at} onChange={(e) => setPicked(normaliseTime(e.target.value, at))} className="h-11 px-2 font-semibold w-[136px]" aria-label="Time of the coffee" />
        </label>
        {picked && (
          <button type="button" onClick={() => setPicked(null)} className="h-11 px-3 text-[13px] font-medium text-hx-text2 hover:text-hx-text rounded-ctl">
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
        <p className="text-[13px] leading-[18px] text-hx-yellow" role="status">
          {lateCaption}
        </p>
      ) : pickHint ? (
        <p className="text-[13px] leading-[18px] text-hx-text2">{pickHint}</p>
      ) : null}
    </div>
  );
}

export interface WaterTileProps {
  ctx: CoachContext;
  onWater: (cups: number) => void;
}

export function WaterTile({ ctx, onWater }: WaterTileProps) {
  const cups = ctx.nutrition.hydrationCups;
  const target = ctx.nutrition.hydrationTargetCups;

  return (
    <div className="hx-raised h-full p-4 flex flex-col gap-3">
      <SectionHeader as="h3" title="Water" />
      <div className="flex items-center gap-3 min-w-0">
        <ProgressRing value={cups} max={Math.max(1, target)} color="blue" size={44} stroke={5} label="Water">
          <Droplets className="w-4 h-4 text-hx-blue" aria-hidden />
        </ProgressRing>
        <div className="min-w-0">
          <div className="hx-display text-[28px] leading-8 font-semibold text-hx-text">{cups}</div>
          <div className="text-[13px] leading-[18px] text-hx-text2">of {target} cups</div>
        </div>
      </div>
      <div className="flex items-center gap-2" role="group" aria-label="Water cups">
        <Button variant="secondary" size="md" className="w-11 !px-0 !rounded-ctl" aria-label="Remove a cup" icon={<Minus aria-hidden />} disabled={cups <= 0} onClick={() => onWater(Math.max(0, cups - 1))} />
        <Button size="md" className="w-11 !px-0" aria-label="Add a cup" icon={<Plus aria-hidden />} onClick={() => onWater(cups + 1)} />
      </div>
      <p className="mt-auto text-[13px] leading-[18px] text-hx-muted">
        1 cup ≈ {ML_PER_CUP} ml, about {fmt(target * ML_PER_CUP)} ml a day for your weight
      </p>
    </div>
  );
}
