/**
 * The four onboarding steps, as data: the cover's contents list reads `title`
 * and `sets`, each step page reads `title` and `lede`, and the dateline
 * "Step N of 4" is the one honest count in the app (DESIGN.md "Running
 * heads"). Pure, so the screen and its test share it.
 */
export interface OnboardingStep {
  id: 'about' | 'goal' | 'week' | 'signals';
  /** The running head of the step page, and the contents entry. */
  title: string;
  /** What the step sets up, for the cover's contents list. */
  sets: string;
  /** One sentence under the running head saying why the step matters. */
  lede: string;
}

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  {
    id: 'about',
    title: 'About you',
    sets: 'age, sex, height, weight, units',
    lede: 'The engine scales protein, calories and the weight-trend math from these. Everything here can be changed later in Settings.',
  },
  {
    id: 'goal',
    title: 'Goal and targets',
    sets: 'phase, training level, calories, protein',
    lede: 'The targets are yours to set. The coach holds you to them and says when the trend disagrees.',
  },
  {
    id: 'week',
    title: 'Training week',
    sets: 'a session type for each weekday',
    lede: 'Lift days and rest days set the carb cycling and what the coach expects of you each morning.',
  },
  {
    id: 'signals',
    title: 'Signals',
    sets: 'wearable, bed and wake times, morning check-in, tobacco',
    lede: 'What the readiness score reads from, and the morning routine around it.',
  },
];

export type OnboardingStepId = OnboardingStep['id'];

export const STEP_COUNT = ONBOARDING_STEPS.length;

/** The dateline of step `n` (1-based). */
export const stepDateline = (n: number): string => `Step ${n} of ${STEP_COUNT}`;
