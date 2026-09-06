// @vitest-environment jsdom
/**
 * TrainingSection render tests (Phase 2e).
 *
 * The rules this section exists to keep: the landmark table is advisory (it
 * carries VOLUME_ADVISORY_NOTE verbatim and never speaks of caps), destructive
 * actions confirm first, and every write goes through `updateTraining` so the
 * store — not a local draft — is the source of truth.
 */
import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_LANDMARKS } from '../../data/defaults';
import { resetStorageCache } from '../../data/storage';
import { HealthStoreProvider } from '../../data/store';
import { MUSCLES } from '../../engine/exerciseDb';
import { VOLUME_ADVISORY_NOTE } from '../../engine/strength';
import { ConfirmProvider } from './confirm';
import TrainingSection from './TrainingSection';

function mount(ui: ReactNode) {
  return render(
    <HealthStoreProvider>
      <ConfirmProvider>{ui}</ConfirmProvider>
    </HealthStoreProvider>,
  );
}

/** Type into a NumberField and commit it (blur), the way a user does. */
async function typeInto(el: HTMLElement, value: string) {
  await act(async () => {
    fireEvent.focus(el);
    fireEvent.change(el, { target: { value } });
    fireEvent.blur(el);
  });
}

/** Click, then let the confirm promise settle inside act(). */
async function click(el: HTMLElement) {
  await act(async () => {
    fireEvent.click(el);
  });
}

beforeEach(() => {
  window.localStorage.clear();
  resetStorageCache();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  resetStorageCache();
});

describe('TrainingSection', () => {
  it('renders units, the rest timer, and the progression rule the engine reads', () => {
    mount(<TrainingSection />);
    expect(screen.getByRole('radiogroup', { name: 'Load units' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'lb', checked: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: /2:00/, pressed: true })).toBeTruthy();
    expect((screen.getByLabelText('Or a custom rest, in seconds') as HTMLInputElement).value).toBe('120');
    expect((screen.getByLabelText('Target RPE from') as HTMLInputElement).value).toBe('7');
    expect((screen.getByLabelText('Target RPE to') as HTMLInputElement).value).toBe('8');
    expect((screen.getByLabelText('Upper-body step') as HTMLInputElement).value).toBe('2.5');
    expect((screen.getByLabelText('Lower-body step') as HTMLInputElement).value).toBe('5');
    expect((screen.getByLabelText('Reps from') as HTMLInputElement).value).toBe('6');
  });

  it('writes a progression change straight to the store', async () => {
    mount(<TrainingSection />);
    await typeInto(screen.getByLabelText('Upper-body step'), '1.5');
    expect((screen.getByLabelText('Upper-body step') as HTMLInputElement).value).toBe('1.5');
    // The explanatory line reads the same numbers, so copy and setting can't drift.
    expect(screen.getByText(/1.5% of a press is a plate change/)).toBeTruthy();
  });

  it('draws all 15 muscles with three editable numbers each', () => {
    mount(<TrainingSection />);
    expect(screen.getAllByRole('rowheader')).toHaveLength(MUSCLES.length);
    for (const m of ['Chest', 'Front delts', 'Lower back', 'Calves']) expect(screen.getByRole('rowheader', { name: m })).toBeTruthy();
    const chest = screen.getByLabelText('Chest MEV — minimum effective volume, sets per week') as HTMLInputElement;
    expect(chest.value).toBe(String(DEFAULT_LANDMARKS.chest.mev));
    expect((screen.getByLabelText('Chest MRV — maximum recoverable volume, sets per week') as HTMLInputElement).value).toBe(String(DEFAULT_LANDMARKS.chest.mrv));
  });

  it('carries the advisory note verbatim and never calls a landmark a cap', () => {
    const { container } = mount(<TrainingSection />);
    expect(screen.getByText(VOLUME_ADVISORY_NOTE)).toBeTruthy();
    const text = container.textContent ?? '';
    expect(text).toContain('advisory bands, not caps');
    expect(text).toContain('MRV context only');
    expect(/\bmaximum you (may|can)\b|\bdo not exceed\b|\bhard limit\b/i.test(text)).toBe(false);
  });

  it('keeps a row ordered instead of silently clamping it', async () => {
    mount(<TrainingSection />);
    // Chest MAV is 10, so 12 for MEV is rejected with a reason rather than accepted.
    await typeInto(screen.getByLabelText('Chest MEV — minimum effective volume, sets per week'), '12');
    expect(screen.getByRole('alert').textContent).toContain('MEV can’t be above MAV');
  });

  it('confirms before resetting the landmark table, then restores the level defaults', async () => {
    mount(<TrainingSection />);
    const chest = () => screen.getByLabelText('Chest MEV — minimum effective volume, sets per week') as HTMLInputElement;
    const reset = () => screen.getByRole('button', { name: 'Reset' });
    expect(reset().hasAttribute('disabled')).toBe(true);

    await typeInto(chest(), '9');
    expect(chest().value).toBe('9');
    expect(reset().hasAttribute('disabled')).toBe(false);

    await click(reset());
    const sheet = screen.getByRole('dialog');
    expect(within(sheet).getByText('Reset every volume landmark?')).toBeTruthy();
    await click(within(sheet).getByRole('button', { name: 'Reset landmarks' }));
    expect(chest().value).toBe(String(DEFAULT_LANDMARKS.chest.mev));
  });

  it('adds a custom exercise and lists it with its muscle and equipment', async () => {
    mount(<TrainingSection />);
    await click(screen.getByRole('button', { name: 'Add an exercise' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Pendulum Squat' } });
    fireEvent.change(screen.getByLabelText('Main muscle'), { target: { value: 'quads' } });
    fireEvent.change(screen.getByLabelText('Equipment'), { target: { value: 'machine' } });
    await click(screen.getByRole('button', { name: 'Add exercise' }));
    expect(screen.getByText('Pendulum Squat')).toBeTruthy();
    expect(screen.getByText(/Quads · Machine/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete Pendulum Squat' })).toBeTruthy();
  });

  it('refuses a duplicate exercise name instead of shadowing a built-in', async () => {
    mount(<TrainingSection />);
    await click(screen.getByRole('button', { name: 'Add an exercise' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Back Squat' } });
    expect(screen.getByText('That name is already in the library — search finds it already.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Add exercise' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('lists the built-in programs and copies one into an editable program', async () => {
    mount(<TrainingSection />);
    // Each program shows twice: once as a row, once as an option in the picker.
    expect(screen.getAllByText('Upper / Lower — 4 day (A)')).toHaveLength(2);
    expect(screen.getAllByText('Upper / Lower — 4 day (B)')).toHaveLength(2);
    expect(screen.getAllByText('Built-in')).toHaveLength(2);
    expect(screen.getAllByText('Upper 7 · Lower 6')).toHaveLength(2);

    await click(screen.getAllByRole('button', { name: 'Make an editable copy' })[0]);
    expect(screen.getAllByText('Upper / Lower — 4 day (A) (my copy)').length).toBeGreaterThan(0);
    expect(screen.getByText('Yours')).toBeTruthy();
    // The copy becomes the active program and opens for editing.
    expect((screen.getByLabelText('Active program') as HTMLSelectElement).value).toBe('builtin-ul4-copy');
    expect((screen.getByLabelText('Program name') as HTMLInputElement).value).toBe('Upper / Lower — 4 day (A) (my copy)');
    expect(screen.getByLabelText('Bench Press sets')).toBeTruthy();
  });

  it('confirms before replacing an edited copy with the built-in again', async () => {
    mount(<TrainingSection />);
    await click(screen.getAllByRole('button', { name: 'Make an editable copy' })[0]);
    await typeInto(screen.getByLabelText('Bench Press sets'), '6');
    expect((screen.getByLabelText('Bench Press sets') as HTMLInputElement).value).toBe('6');

    await click(screen.getByRole('button', { name: 'Replace my copy' }));
    const sheet = screen.getByRole('dialog');
    expect(within(sheet).getByText('Replace “Upper / Lower — 4 day (A) (my copy)”?')).toBeTruthy();
    await click(within(sheet).getByRole('button', { name: 'Replace copy' }));
    expect((screen.getByLabelText('Bench Press sets') as HTMLInputElement).value).toBe('4');
  });

  it('confirms before deleting a program', async () => {
    mount(<TrainingSection />);
    await click(screen.getAllByRole('button', { name: 'Make an editable copy' })[0]);
    await click(screen.getByRole('button', { name: 'Delete' }));
    await click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete program' }));
    expect(screen.queryAllByText('Upper / Lower — 4 day (A) (my copy)')).toHaveLength(0);
    expect((screen.getByLabelText('Active program') as HTMLSelectElement).value).toBe('');
  });
});
