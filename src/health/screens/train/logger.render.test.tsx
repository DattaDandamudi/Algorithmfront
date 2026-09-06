// @vitest-environment jsdom
/**
 * SessionLogger — the rules the logger exists to keep.
 *
 * Covered here: loads are shown and stored in the user's units (and the
 * stepper moves in real plate increments), the ghost line reads last session
 * back, copy-last-set does what it says, RPE chips toggle rather than latch,
 * the rest presets are the four the plan names, and the picker and finish
 * sheets are siblings — never two dialogs at once.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { Workout } from '../../data/types';
import SessionLogger from './SessionLogger';
import { newDraft, type WorkoutDraft } from './draft';
import { toKgLoad, type Units } from './trainUtils';

afterEach(cleanup);

const TODAY = '2026-09-06';

/** Last Wednesday's bench: 135 lb × 8, 8, 7 at RPE 8. */
const HISTORY: Workout[] = [
  {
    id: 'w-prev',
    d: '2026-09-02',
    start: '18:00',
    durationMin: 55,
    kind: 'strength',
    source: 'manual',
    exercises: [
      {
        exerciseId: 'bench-press',
        sets: [
          { w: toKgLoad(135, 'lb'), r: 8, rpe: 8 },
          { w: toKgLoad(135, 'lb'), r: 8, rpe: 8 },
          { w: toKgLoad(135, 'lb'), r: 7, rpe: 8 },
        ],
      },
    ],
  },
];

function draftWith(sets: WorkoutDraft['exercises'][number]['sets']): WorkoutDraft {
  return {
    // Started a moment in the future so the elapsed readout is a stable "0m".
    ...newDraft({ d: TODAY, start: '18:00', kind: 'strength', nowMs: Date.now() + 30_000, session: 'upper' }),
    exercises: [{ exerciseId: 'bench-press', sets }],
  };
}

/** The Stepper labels its group and its input identically; the input is the textbox. */
function weightField(set: number): HTMLInputElement {
  return screen.getByRole('textbox', { name: `Weight, set ${set} of Bench Press` }) as HTMLInputElement;
}

function Harness({
  initial,
  units = 'lb',
  onSave = () => {},
}: {
  initial: WorkoutDraft;
  units?: Units;
  onSave?: (done: { durationMin: number; srpe?: number; note?: string }) => void;
}) {
  const [draft, setDraft] = useState(initial);
  return (
    <SessionLogger
      draft={draft}
      units={units}
      custom={[]}
      history={HISTORY}
      today={TODAY}
      restTimerSec={90}
      onChange={setDraft}
      onSave={onSave}
      onDiscard={() => {}}
    />
  );
}

describe('SessionLogger', () => {
  it('names the session, its start and its elapsed time', () => {
    render(<Harness initial={draftWith([])} />);
    expect(screen.getByRole('heading', { name: 'Upper body session' })).toBeTruthy();
    expect(screen.getByText(/Started 18:00 · 0m/)).toBeTruthy();
  });

  it('shows the ghost line from last time in the display units', () => {
    render(<Harness initial={draftWith([])} />);
    expect(screen.getByText('last: 135 lb × 8,8,7 @8')).toBeTruthy();
  });

  it('shows the same session in kilograms when that is the setting', () => {
    render(<Harness initial={draftWith([])} units="kg" />);
    expect(screen.getByText('last: 61.2 kg × 8,8,7 @8')).toBeTruthy();
  });

  it('displays a stored kilogram load as pounds and steps it by a real plate jump', () => {
    render(<Harness initial={draftWith([{ w: toKgLoad(135, 'lb'), r: 8 }])} />);
    expect(weightField(1).value).toBe('135.0');
    fireEvent.click(screen.getByRole('button', { name: 'Increase Weight, set 1 of Bench Press' }));
    // 5 lb on a barbell, not an abstract 1.
    expect(weightField(1).value).toBe('140.0');
  });

  it('steps kilograms by 2.5 on a barbell', () => {
    render(<Harness initial={draftWith([{ w: 60, r: 8 }])} units="kg" />);
    fireEvent.click(screen.getByRole('button', { name: 'Increase Weight, set 1 of Bench Press' }));
    expect(weightField(1).value).toBe('62.5');
  });

  it('offers RPE chips that toggle off again', () => {
    render(<Harness initial={draftWith([{ w: 60, r: 8 }])} units="kg" />);
    const group = screen.getByRole('group', { name: 'RPE, set 1 of Bench Press' });
    const rpe8 = within(group).getByRole('button', { name: 'RPE 8' });
    expect(rpe8.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(rpe8);
    expect(screen.getByRole('button', { name: 'RPE 8' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'RPE 8' }));
    expect(screen.getByRole('button', { name: 'RPE 8' }).getAttribute('aria-pressed')).toBe('false');
    // Half steps are offered because the RPE table is defined on them.
    expect(within(group).getByRole('button', { name: 'RPE 8.5' })).toBeTruthy();
  });

  it('copies the last set, values and all', () => {
    render(<Harness initial={draftWith([{ w: 60, r: 8, rpe: 8 }])} units="kg" />);
    expect(screen.queryByRole('textbox', { name: 'Weight, set 2 of Bench Press' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Copy last set/ }));
    expect(weightField(2).value).toBe('60.0');
    expect((screen.getByRole('textbox', { name: 'Reps, set 2 of Bench Press' }) as HTMLInputElement).value).toBe('8');
    expect(screen.getAllByRole('button', { name: 'RPE 8' }).every((b) => b.getAttribute('aria-pressed') === 'true')).toBe(true);
  });

  it('cannot copy a set that does not exist yet', () => {
    render(<Harness initial={draftWith([])} />);
    expect((screen.getByRole('button', { name: /Copy last set/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('marks a warm-up, which then stops counting as a working set', () => {
    render(<Harness initial={draftWith([{ w: 60, r: 8 }])} units="kg" />);
    expect(screen.getByText(/480 kg/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Mark set 1 of Bench Press as a warm-up' }));
    expect(
      screen.getByRole('button', { name: 'Mark set 1 of Bench Press as a warm-up' }).getAttribute('aria-pressed'),
    ).toBe('true');
    // Volume disappears from the header: a warm-up is not work.
    expect(screen.queryByText(/480 kg/)).toBeNull();
  });

  it('offers the four rest presets and counts one down', () => {
    render(<Harness initial={draftWith([])} />);
    for (const label of ['Rest 60 seconds', 'Rest 90 seconds', 'Rest 120 seconds', 'Rest 180 seconds']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
    fireEvent.click(screen.getByRole('button', { name: 'Rest 90 seconds' }));
    expect(screen.getByRole('timer')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Stop the rest timer' })).toBeTruthy();
  });

  it('opens the exercise picker as a sibling sheet and adds what is picked', () => {
    render(<Harness initial={draftWith([{ w: 60, r: 8 }])} units="kg" />);
    expect(screen.queryAllByRole('dialog')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: /Add exercise/ }));
    expect(screen.queryAllByRole('dialog')).toHaveLength(1); // never nested
    const sheet = screen.getByRole('dialog');
    expect(within(sheet).getByRole('heading', { name: 'Add an exercise' })).toBeTruthy();

    fireEvent.change(within(sheet).getByLabelText('Search exercises'), { target: { value: 'row' } });
    fireEvent.click(within(sheet).getByRole('button', { name: /Barbell Row/ }));

    expect(screen.getByRole('heading', { name: 'Barbell Row' })).toBeTruthy();
  });

  it('finishes through a sheet that reports the session and calls back once', () => {
    const onSave = vi.fn();
    render(
      <Harness
        initial={draftWith([
          { w: toKgLoad(155, 'lb'), r: 8, rpe: 8 },
          { w: toKgLoad(155, 'lb'), r: 7, rpe: 9 },
        ])}
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));

    const sheet = screen.getByRole('dialog');
    const setsStat = within(sheet).getByText('Working sets').parentElement as HTMLElement;
    expect(within(setsStat).getByText('2')).toBeTruthy();
    // 155 lb × 8 is well past 135 lb × 8 — the session sets records.
    expect(within(sheet).getByText(/personal record/)).toBeTruthy();
    expect(within(sheet).getByText('Estimated max')).toBeTruthy();

    fireEvent.click(within(sheet).getByRole('button', { name: 'Increase Duration in minutes' }));
    fireEvent.click(within(sheet).getByRole('button', { name: 'Session RPE 8' }));
    fireEvent.click(within(sheet).getByRole('button', { name: 'Save session' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({ durationMin: 5, srpe: 8 });
  });

  it('gives every control an accessible name', () => {
    render(<Harness initial={draftWith([{ w: 60, r: 8 }])} units="kg" />);
    for (const button of screen.getAllByRole('button')) {
      const name = button.getAttribute('aria-label') ?? button.textContent ?? '';
      expect(name.trim().length).toBeGreaterThan(0);
    }
  });
});
