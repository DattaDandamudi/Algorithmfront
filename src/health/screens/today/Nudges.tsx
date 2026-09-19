/**
 * Today nudges — the behaviour-change strips from SPEC §2 and §6.4/§6.5.
 *
 * - WeighInPrompt: §2 "prompts once each morning". A 56 px ledger row under
 *   the check-in row: label, "Not yet today", the verb "Log weight" flush
 *   right, and a 44 px dismiss. Shown before noon while today has no scale
 *   weight and `settings.lastWeighPromptDate !== today`; dismissing stamps the
 *   date so it appears at most once a day.
 * - NudgeStrip: the §6.4 bedtime countdown (60 min before the target to 90
 *   after, with the achievable hours in the past-bedtime state), the caffeine
 *   cutoff nudge, and the late-eating cutoff in its final hour, under the
 *   running head "Tonight". All render as `Banner kind="info"` notes.
 *
 * The last-meal note states the gap the engine actually used, not a constant:
 * the cutoff is window-relative (the final fifth of the habitual wake period),
 * so the gap is 20 % of that window and reads "3 h 12 min" for a 16 h day and
 * "2 h" for a 10 h one. See `lastMealGapMin`.
 */
import { X } from 'lucide-react';
import type { BedtimeCountdown, LateEatingCheck } from '../../engine';
import type { HHMM } from '../../data/types';
import { formatClock } from '../../lib/dates';
import { fmt } from '../../lib/format';
import { Banner, SectionHeader } from '../../ui';

/** Only surface the last-meal nudge inside this many minutes of the cutoff. */
const LATE_MEAL_NUDGE_WINDOW_MIN = 60;

/**
 * The engine's fixed-clock fallback (`lateEatingCheck` without a wake window):
 * bed target − 3 h. Only used to describe that branch — with a window the gap
 * is read off the window itself.
 */
const FALLBACK_GAP_MIN = 3 * 60;

/**
 * How long the gap between the suggested last meal and sleep onset actually
 * is. The cutoff is the start of the final fifth of the *habitual* wake window
 * (McHill 2017 / `LATE_WINDOW_SHARE`), so it is 20 % of that window — 3 h 12
 * min on a 16 h day, 2 h on a 10 h one — and only ever exactly 3 h on the
 * fixed-clock fallback.
 */
function lastMealGapMin(late: LateEatingCheck): number {
  const w = late.score?.window;
  return w ? w.sleepMin - w.lateStartMin : FALLBACK_GAP_MIN;
}

/** "2 h", "3 h 12 min", "45 min" — the gap as the user would say it. */
function gapText(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const min = total % 60;
  if (h === 0) return `${min} min`;
  return min === 0 ? `${h} h` : `${h} h ${min} min`;
}

export interface WeighInPromptProps {
  onLog: () => void;
  onDismiss: () => void;
}

export function WeighInPrompt({ onLog, onDismiss }: WeighInPromptProps) {
  return (
    <div className="hx-row hx-press flex-row items-center gap-2">
      <button type="button" onClick={onLog} className="flex-1 min-w-0 min-h-[56px] -my-3 flex items-center justify-between gap-3 text-left">
        <span className="hx-body min-w-0">Weigh-in</span>
        <span className="flex items-center gap-3 shrink-0">
          <span className="hx-cap">Not yet today</span>
          <span className="hx-ui text-hx-text">Log weight</span>
        </span>
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss the weigh-in prompt"
        className="w-11 h-11 -my-3 shrink-0 inline-flex items-center justify-center text-hx-text2 hover:text-hx-text"
      >
        <X className="w-4 h-4" strokeWidth={1.5} aria-hidden />
      </button>
    </div>
  );
}

export interface NudgeStripProps {
  countdown: BedtimeCountdown | null;
  caffeineAfterCutoff: HHMM | null;
  caffeineCutoff: HHMM;
  late: LateEatingCheck;
  mealsLeft: number;
  /** The bed target, for the running head's dateline. */
  bedTarget?: HHMM;
  onGoingToBed: () => void;
  onAskCoach: (prompt: string) => void;
}

export function NudgeStrip({ countdown, caffeineAfterCutoff, caffeineCutoff, late, mealsLeft, bedTarget, onGoingToBed, onAskCoach }: NudgeStripProps) {
  const lateMeal = late.minutesToCutoff !== null && late.minutesToCutoff > 0 && late.minutesToCutoff <= LATE_MEAL_NUDGE_WINDOW_MIN && mealsLeft > 0;
  if (!countdown && !caffeineAfterCutoff && !lateMeal) return null;

  return (
    <section className="mt-10" aria-label="Tonight">
      <SectionHeader as="h2" rule={false} title="Tonight" caption={bedTarget ? `Bed target ${formatClock(bedTarget)}` : undefined} />
      <div className="mt-4 flex flex-col gap-4">
        {countdown && (
          <Banner kind="info" action={{ label: 'Going to bed', onClick: onGoingToBed }}>
            {countdown.message}
            {countdown.phase === 'past' && countdown.achievableHrs > 0 ? ` — lights out now still gets you ${fmt(countdown.achievableHrs, 1)} h.` : '.'}
          </Banner>
        )}
        {caffeineAfterCutoff && (
          <Banner kind="info" lead="Caffeine:" action={{ label: 'Ask the coach', onClick: () => onAskCoach('Is afternoon caffeine hurting my sleep?') }}>
            Logged at {formatClock(caffeineAfterCutoff)}, after your {formatClock(caffeineCutoff)} cutoff. Expect lighter deep sleep tonight; cut off earlier tomorrow.
          </Banner>
        )}
        {lateMeal && (
          <Banner kind="info">
            Finish your last meal by {formatClock(late.suggestedLastMeal)} — {late.minutesToCutoff} min left to keep a {gapText(lastMealGapMin(late))} gap before bed.
          </Banner>
        )}
      </div>
    </section>
  );
}
