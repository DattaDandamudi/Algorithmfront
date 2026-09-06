// @vitest-environment jsdom
/**
 * TrainingTile — Today's training card (plan 2b).
 *
 * Covers the four states it can be in, that every number it shows comes from
 * the training context it was handed, that suggested loads are converted to
 * the user's display unit, and that the single call to action deep-links into
 * the Train tab.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { TrainingContext, Workout } from '../../data/types';
import { fullContext } from '../../ai/coachContext.fixture';
import TrainingTile, { EMPTY_HINT, NO_PLAN_HINT, REST_HINT, REST_TITLE } from './TrainingTile';

afterEach(cleanup);

const TODAY = '2026-09-04';

const training = (patch: Partial<TrainingContext> = {}): TrainingContext => ({
  ...(fullContext().training as TrainingContext),
  ...patch,
});

const session: Workout = {
  id: 'w1',
  d: TODAY,
  start: '18:10',
  durationMin: 62,
  kind: 'strength',
  session: 'lower',
  source: 'manual',
  srpe: 8,
  load: 496,
};

function setup(props: Partial<React.ComponentProps<typeof TrainingTile>> = {}) {
  const onOpenTrain = vi.fn();
  const onOpenCoach = vi.fn();
  render(<TrainingTile training={training()} today={TODAY} units="kg" onOpenTrain={onOpenTrain} onOpenCoach={onOpenCoach} {...props} />);
  return { onOpenTrain, onOpenCoach };
}

/** Everything the tile says, as one string. */
const text = (): string => screen.getByRole('region', { name: 'Training' }).textContent ?? '';

describe('TrainingTile — planned session', () => {
  it('names the session, counts the exercises and lists sets × reps, load and the mode word', () => {
    setup();
    expect(text()).toContain('Lower');
    expect(text()).toContain('Planned · 3 exercises');
    expect(text()).toContain('Back squat 4 × 5–8 @ 102.5 kg');
    expect(text()).toContain('Romanian deadlift 3 × 6–10 @ 90 kg');
    // Never a colour on its own: every mode ships its word.
    expect(text()).toContain('add load');
    expect(text()).toContain('hold load');
    // The engine's own reason for the top exercise.
    expect(text()).toContain('You hit 8 reps on every set at RPE 8 last time — up 5 kg.');
  });

  it('converts the suggested load to the display unit without touching storage', () => {
    setup({ units: 'lb' });
    expect(text()).toContain('Back squat 4 × 5–8 @ 226 lb');
  });

  it('shows the week-on-week load line — the number advice leads on', () => {
    setup();
    expect(text()).toContain('This week 2,394 load · +6% on last week');
  });

  it('deep-links into the Train tab from one button', () => {
    const { onOpenTrain } = setup();
    fireEvent.click(screen.getByRole('button', { name: /Open today/ }));
    expect(onOpenTrain).toHaveBeenCalledTimes(1);
  });

  it('summarises the exercises it does not list', () => {
    const t = training();
    setup({ training: { ...t, plannedExercises: [...t.plannedExercises, { ...t.plannedExercises[0], exerciseId: 'front-squat', name: 'Front squat' }] } });
    expect(text()).toContain('+1 more in Train');
    expect(screen.queryByText(/Front squat/)).toBeNull();
  });
});

describe('TrainingTile — logged today', () => {
  it('reports what was logged, not what was planned', () => {
    setup({ training: training({ todayWorkouts: [session] }) });
    expect(text()).toContain('Logged');
    expect(text()).toContain('62 min · RPE 8 · 496 load');
    expect(text()).not.toContain('Back squat 4 × 5–8');
    expect(screen.getByRole('button', { name: /See today/ })).toBeTruthy();
  });

  it('ignores a personal record set earlier in the week and badges one set today', () => {
    const t = training({ todayWorkouts: [session] });
    setup({ training: t });
    // The fixture's PR is from 2026-09-01.
    expect(text()).not.toContain('Personal record');

    cleanup();
    setup({ training: { ...t, prs7d: [{ ...t.prs7d[0], d: TODAY }] } });
    expect(text()).toContain('Personal record · Back squat 121.6 kg');
  });

  it('names each session when more than one was logged', () => {
    setup({
      training: training({
        todayWorkouts: [session, { ...session, id: 'w2', kind: 'cardio', session: undefined, durationMin: 34, cardio: { distanceKm: 6.2, avgHr: 148 } }],
      }),
    });
    expect(text()).toContain('Logged · 2 sessions');
    expect(text()).toContain('Cardio · 34 min');
    expect(text()).toContain('6.2 km · avg HR 148');
  });
});

describe('TrainingTile — nothing planned', () => {
  it('says rest day and still invites a session', () => {
    setup({ training: training({ todaySession: 'rest', plannedExercises: [] }) });
    expect(text()).toContain(REST_TITLE);
    expect(text()).toContain(REST_HINT);
    expect(screen.getByRole('button', { name: /Log a session/ })).toBeTruthy();
  });

  it('explains an unfilled session day rather than showing an empty list', () => {
    setup({ training: training({ plannedExercises: [] }) });
    expect(text()).toContain('No plan yet');
    expect(text()).toContain(NO_PLAN_HINT);
  });

  it('renders with no training context at all', () => {
    setup({ training: undefined });
    expect(text()).toContain(EMPTY_HINT);
  });
});

describe('TrainingTile — deload', () => {
  it('carries the engine reasons beside the recommendation', () => {
    setup({ training: training({ deload: { recommended: true, reasons: ['3 sessions of falling e1RM', 'form 32% below fitness'] } }) });
    expect(text()).toContain('Deload suggested — 3 sessions of falling e1RM · form 32% below fitness');
  });
});
