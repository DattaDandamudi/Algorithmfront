// @vitest-environment jsdom
/**
 * The Today nudge strip, rendered against real engine output.
 *
 * The rule under test is that the last-meal banner quotes the gap the engine
 * actually applied. The cutoff is the start of the final fifth of the
 * *habitual* wake window (McHill 2017, `LATE_WINDOW_SHARE`), so its distance
 * from sleep onset is 20 % of that window — three hours only for a 15-hour day.
 * The copy used to say "a 3 h gap" whatever the window, which was wrong for
 * every user who does not keep the default schedule.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { DailyRecord, HHMM, ISODate } from '../../data/types';
import { habitualWakeWindow, lateEatingCheck } from '../../engine';
import { addDays } from '../../lib/dates';
import { NudgeStrip } from './Nudges';

afterEach(cleanup);

const TODAY: ISODate = '2026-09-06';
const TARGETS = { wakeTarget: '07:00' as HHMM, bedTarget: '23:00' as HHMM };

const nights = (wk: HHMM, bt: HHMM): DailyRecord[] =>
  Array.from({ length: 14 }, (_, i) => ({ d: addDays(TODAY, -i), wk, bt }) as DailyRecord);

/** The late-eating check a user with that habitual window gets at `now`. */
function lateAt(wake: HHMM, sleep: HHMM, now: HHMM) {
  const window = habitualWakeWindow(nights(wake, sleep), TODAY, TARGETS);
  return lateEatingCheck([], TARGETS.bedTarget, now, window);
}

function strip(late: ReturnType<typeof lateAt>): string {
  const { container } = render(
    <NudgeStrip
      countdown={null}
      caffeineAfterCutoff={null}
      caffeineCutoff="14:00"
      late={late}
      mealsLeft={2}
      onGoingToBed={() => {}}
      onAskCoach={() => {}}
    />,
  );
  return container.textContent ?? '';
}

describe('NudgeStrip — the last-meal gap is the one the engine used', () => {
  it('a 08:00–18:00 day gets its own 2 h gap, not the default schedule’s 3 h', () => {
    const late = lateAt('08:00', '18:00', '15:30');
    // 10 h awake → the late window opens 2 h before sleep onset.
    expect(late.suggestedLastMeal).toBe('16:00');
    expect(late.minutesToCutoff).toBe(30);

    const text = strip(late);
    expect(text).toContain('Finish your last meal by 4:00 pm');
    expect(text).toContain('30 min left to keep a 2 h gap before bed');
    expect(text).not.toContain('3 h gap');
  });

  it('a 16 h day gets 3 h 12 min — the number, not a rounded fiction', () => {
    const late = lateAt('05:00', '21:00', '17:00');
    expect(late.suggestedLastMeal).toBe('17:48');
    expect(strip(late)).toContain('48 min left to keep a 3 h 12 min gap before bed');
  });

  it('the default 07:00–23:00 schedule still reads 3 h 12 min, and the fixed-clock fallback reads 3 h', () => {
    expect(strip(lateAt('07:00', '23:00', '19:00'))).toContain('3 h 12 min gap before bed');
    // No habitual window: the engine falls back to bed target − 3 h, and so does the copy.
    const fallback = lateEatingCheck([], '23:00', '19:30');
    expect(fallback.suggestedLastMeal).toBe('20:00');
    expect(strip(fallback)).toContain('30 min left to keep a 3 h gap before bed');
  });
});
