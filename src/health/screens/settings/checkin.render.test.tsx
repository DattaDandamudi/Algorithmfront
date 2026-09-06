// @vitest-environment jsdom
/**
 * Daily check-in settings render tests (Phase 2e).
 *
 * What matters here is that the prompt is genuinely optional, that turning
 * items off can never leave an empty prompt, and that the two longer
 * instruments describe what they actually collect, since both are now live in
 * Log and stale "not collected yet" copy would be worse than no copy.
 */
import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetStorageCache } from '../../data/storage';
import { HealthStoreProvider } from '../../data/store';
import CheckInSection from './CheckInSection';
import { ConfirmProvider } from './confirm';

function mount(ui: ReactNode) {
  return render(
    <HealthStoreProvider>
      <ConfirmProvider>{ui}</ConfirmProvider>
    </HealthStoreProvider>,
  );
}

const click = async (el: HTMLElement) => {
  await act(async () => {
    fireEvent.click(el);
  });
};

beforeEach(() => {
  window.localStorage.clear();
  resetStorageCache();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  resetStorageCache();
});

describe('CheckInSection (settings)', () => {
  it('offers the four Hooper items, all on by default, each named in words', () => {
    mount(<CheckInSection />);
    for (const label of ['Sleep quality', 'Fatigue', 'Stress', 'Muscle soreness']) {
      expect(screen.getByRole('button', { name: label, pressed: true })).toBeTruthy();
    }
    expect(screen.getByText('4 of 4 · about 20 seconds.')).toBeTruthy();
    expect(screen.getByText(/How restful last night felt, 1–7/)).toBeTruthy();
  });

  it('can switch the Today prompt off entirely', async () => {
    mount(<CheckInSection />);
    const ask = screen.getByRole('switch', { name: 'Ask on Today' });
    expect(ask.getAttribute('aria-checked')).toBe('true');
    await click(ask);
    expect(screen.getByRole('switch', { name: 'Ask on Today' }).getAttribute('aria-checked')).toBe('false');
    // With the prompt off the item chips are disabled rather than silently live.
    expect((screen.getByRole('button', { name: 'Fatigue' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('drops an item from the prompt and keeps the rest in their asking order', async () => {
    mount(<CheckInSection />);
    await click(screen.getByRole('button', { name: 'Stress' }));
    expect(screen.getByRole('button', { name: 'Stress', pressed: false })).toBeTruthy();
    expect(screen.getByText('3 of 4 · about 15 seconds.')).toBeTruthy();
    expect(screen.queryByText(/Life stress, not training stress/)).toBeNull();
    // Turning it back on restores the canonical order, not the click order.
    await click(screen.getByRole('button', { name: 'Stress' }));
    const listed = screen.getAllByRole('listitem').map((li) => li.textContent ?? '');
    expect(listed[2]).toContain('Stress');
  });

  it('never lets the last item be removed — the switch above is how you stop being asked', async () => {
    mount(<CheckInSection />);
    for (const label of ['Sleep quality', 'Fatigue', 'Stress']) await click(screen.getByRole('button', { name: label }));
    expect(screen.getByText('One item left — turn the prompt off above if you would rather not be asked at all.')).toBeTruthy();
    await click(screen.getByRole('button', { name: 'Muscle soreness' }));
    expect(screen.getByRole('button', { name: 'Muscle soreness', pressed: true })).toBeTruthy();
  });

  it('lets the prompt time move', () => {
    mount(<CheckInSection />);
    const time = screen.getByLabelText('Ask from') as HTMLInputElement;
    expect(time.value).toBe('07:00');
    fireEvent.change(time, { target: { value: '09:30' } });
    expect((screen.getByLabelText('Ask from') as HTMLInputElement).value).toBe('09:30');
  });

  it('offers the weekly and monthly instruments, off by default, and describes what each collects', async () => {
    mount(<CheckInSection />);
    const srss = screen.getByRole('switch', { name: 'Weekly recovery & stress (SRSS)' });
    const pss = screen.getByRole('switch', { name: 'Monthly perceived stress (PSS-4)' });
    expect(srss.getAttribute('aria-checked')).toBe('false');
    expect(pss.getAttribute('aria-checked')).toBe('false');
    expect(screen.getByText(/Eight items on Sundays/)).toBeTruthy();
    expect(screen.getByText(/Four items, once a month/)).toBeTruthy();
    // Both instruments are live, so the copy must not still claim otherwise.
    expect(document.body.textContent).not.toMatch(/not collectable|placeholder|nothing is stored/i);
    await click(srss);
    expect(screen.getByRole('switch', { name: 'Weekly recovery & stress (SRSS)' }).getAttribute('aria-checked')).toBe('true');
  });

  it('carries the cycle-tracking toggle, off unless asked for', async () => {
    mount(<CheckInSection />);
    const cycle = screen.getByRole('switch', { name: 'Track menstrual cycle' });
    expect(cycle.getAttribute('aria-checked')).toBe('false');
    await click(cycle);
    expect(screen.getByRole('switch', { name: 'Track menstrual cycle' }).getAttribute('aria-checked')).toBe('true');
  });

  it('summarises what is already answered without inventing a number', () => {
    mount(<CheckInSection />);
    expect(screen.getByText('Days with a check-in')).toBeTruthy();
    expect(screen.getByText('0')).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy();
  });
});
