/**
 * Today nudges — the behaviour-change strips from SPEC §2 and §6.4/§6.5.
 *
 * - WeighInPrompt: §2 "prompts once each morning". Shown before noon while
 *   today has no scale weight and `settings.lastWeighPromptDate !== today`;
 *   dismissing stamps the date so it appears at most once a day.
 * - NudgeStrip: the §6.4 bedtime countdown (60 min before the target to 90
 *   after, with the achievable hours in the past-bedtime state), the caffeine
 *   cutoff nudge, and the Vujović late-eating cutoff ("finish your last meal
 *   by 20:00") in its final hour. All render as `Banner kind="info"`.
 */
import type { BedtimeCountdown, LateEatingCheck } from '../../engine';
import type { HHMM } from '../../data/types';
import { formatClock } from '../../lib/dates';
import { fmt } from '../../lib/format';
import { Banner } from '../../ui';

/** Only surface the last-meal nudge inside this many minutes of the cutoff. */
const LATE_MEAL_NUDGE_WINDOW_MIN = 60;

export interface WeighInPromptProps {
  onLog: () => void;
  onDismiss: () => void;
}

export function WeighInPrompt({ onLog, onDismiss }: WeighInPromptProps) {
  return (
    <div className="px-4 pb-4">
      <Banner kind="info" onDismiss={onDismiss}>
        <button type="button" onClick={onLog} className="text-left w-full min-h-[44px] -my-2.5 flex items-center font-medium text-hx-text hover:text-hx-blue transition-colors">
          Morning weigh-in — tap to log
        </button>
      </Banner>
    </div>
  );
}

export interface NudgeStripProps {
  countdown: BedtimeCountdown | null;
  caffeineAfterCutoff: HHMM | null;
  caffeineCutoff: HHMM;
  late: LateEatingCheck;
  mealsLeft: number;
  onGoingToBed: () => void;
  onAskCoach: (prompt: string) => void;
}

export function NudgeStrip({ countdown, caffeineAfterCutoff, caffeineCutoff, late, mealsLeft, onGoingToBed, onAskCoach }: NudgeStripProps) {
  const lateMeal = late.minutesToCutoff !== null && late.minutesToCutoff > 0 && late.minutesToCutoff <= LATE_MEAL_NUDGE_WINDOW_MIN && mealsLeft > 0;
  if (!countdown && !caffeineAfterCutoff && !lateMeal) return null;

  return (
    <section className="px-4 pb-5 flex flex-col gap-3" aria-label="Tonight">
      {countdown && (
        <Banner kind="info" action={{ label: 'Going to bed', onClick: onGoingToBed }}>
          {countdown.message}
          {countdown.phase === 'past' && countdown.achievableHrs > 0 ? ` — lights out now still gets you ${fmt(countdown.achievableHrs, 1)} h.` : '.'}
        </Banner>
      )}
      {caffeineAfterCutoff && (
        <Banner kind="info" action={{ label: 'Ask the coach', onClick: () => onAskCoach('Is afternoon caffeine hurting my sleep?') }}>
          Caffeine logged at {formatClock(caffeineAfterCutoff)} — after your {formatClock(caffeineCutoff)} cutoff. Expect lighter deep sleep tonight; cut off earlier tomorrow.
        </Banner>
      )}
      {lateMeal && (
        <Banner kind="info">
          Finish your last meal by {formatClock(late.suggestedLastMeal)} — {late.minutesToCutoff} min left to keep a 3 h gap before bed.
        </Banner>
      )}
    </section>
  );
}
