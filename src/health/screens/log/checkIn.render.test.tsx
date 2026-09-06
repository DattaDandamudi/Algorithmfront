// @vitest-environment jsdom
/**
 * CheckInSection — the four Hooper items in Log (Phase 2g).
 *
 * Covers the rules the section exists to keep: worded anchors at both ends,
 * nothing preselected (so an untouched item is never written as a 4), ONE
 * save call carrying only the answered items, and "skip today" as a visible
 * button that writes nothing.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { CheckInSettings, DailyRecord } from '../../data/types';
import CheckInSection, { SAVE_LABEL, SKIP_LABEL, UNANSWERED } from './CheckInSection';

afterEach(cleanup);

const settings = (patch: Partial<CheckInSettings> = {}): CheckInSettings => ({
  enabled: true,
  items: ['qs', 'qf', 'qt', 'qo'],
  promptAfter: '07:00',
  weeklySrss: false,
  monthlyPss: false,
  ...patch,
});

const DATE = '2026-09-06';

function setup(props: Partial<React.ComponentProps<typeof CheckInSection>> = {}) {
  const onSave = vi.fn();
  const onSkip = vi.fn();
  render(<CheckInSection date={DATE} record={undefined} settings={settings()} onSave={onSave} onSkip={onSkip} {...props} />);
  return { onSave, onSkip };
}

/** Pick value `n` on the scale whose accessible group name starts with `label`. */
function pick(groupLabel: string, n: number) {
  const group = screen.getByRole('radiogroup', { name: new RegExp(`^${groupLabel}`, 'i') });
  const radios = Array.from(group.querySelectorAll('input[type="radio"]'));
  fireEvent.click(radios[n - 1]);
}

describe('CheckInSection', () => {
  it('asks four 1–7 items with a worded anchor at both ends', () => {
    setup();
    expect(screen.getByText('Sleep quality')).toBeTruthy();
    expect(screen.getByText('Fatigue')).toBeTruthy();
    expect(screen.getByText('Stress')).toBeTruthy();
    expect(screen.getByText('Muscle soreness')).toBeTruthy();
    expect(screen.getByText('1 · Very restful')).toBeTruthy();
    expect(screen.getByText('7 · Very restless')).toBeTruthy();
    expect(screen.getByText('1 · No soreness')).toBeTruthy();
    expect(screen.getByText('7 · Very sore')).toBeTruthy();
    expect(screen.getAllByRole('radiogroup')).toHaveLength(4);
  });

  it('preselects nothing and gives every step a spoken word', () => {
    setup();
    expect(screen.getAllByText(UNANSWERED)).toHaveLength(4);
    expect(screen.queryAllByRole('radio', { checked: true })).toHaveLength(0);
    expect(screen.getByRole('radio', { name: '5 — Fairly tired' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: '1 — Very relaxed' })).toBeTruthy();
  });

  it('names the pick in words as soon as it is made', () => {
    setup();
    pick('Fatigue', 5);
    expect(screen.getByText('Fairly tired · 5/7')).toBeTruthy();
    expect(screen.getAllByText(UNANSWERED)).toHaveLength(3);
  });

  it('saves every answered item in ONE call and leaves untouched items out', () => {
    const { onSave } = setup();
    pick('Sleep quality', 3);
    pick('Fatigue', 5);
    fireEvent.click(screen.getByRole('button', { name: SAVE_LABEL }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({ qs: 3, qf: 5 });
  });

  it('reports the Hooper total only once every asked item is answered', () => {
    setup();
    pick('Sleep quality', 3);
    expect(screen.getByText('1 of 4 answered — the Hooper total needs all 4.')).toBeTruthy();
    pick('Fatigue', 4);
    pick('Stress', 2);
    pick('Muscle soreness', 5);
    expect(screen.getByText('Hooper total 14 of 28 · lower is better.')).toBeTruthy();
  });

  it('will not save an empty check-in', () => {
    setup();
    expect(screen.getByRole('button', { name: SAVE_LABEL }).hasAttribute('disabled')).toBe(true);
  });

  it('makes "skip today" a visible button that writes nothing and can be undone', () => {
    const { onSave, onSkip } = setup();
    const skip = screen.getByRole('button', { name: SKIP_LABEL });
    expect(skip).toBeTruthy();
    fireEvent.click(skip);
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/Skipped today/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Check in anyway' }));
    expect(screen.getAllByRole('radiogroup')).toHaveLength(4);
  });

  it('summarises a saved day and reopens the scales on Edit', () => {
    const record: DailyRecord = { d: DATE, qs: 3, qf: 4, qt: 2, qo: 5 };
    setup({ record });
    expect(screen.getByText('Checked in · Hooper 14 of 28')).toBeTruthy();
    expect(screen.getByText('Fairly restful · 3/7')).toBeTruthy();
    expect(screen.queryAllByRole('radiogroup')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getAllByRole('radiogroup')).toHaveLength(4);
    // The saved answers seed the scales.
    expect((screen.getByRole('radio', { name: '3 — Fairly restful' }) as HTMLInputElement).checked).toBe(true);
  });

  it('asks only the items settings selected, in the canonical order', () => {
    setup({ settings: settings({ items: ['qo', 'qs'] }) });
    const groups = screen.getAllByRole('radiogroup');
    expect(groups).toHaveLength(2);
    expect(groups[0].getAttribute('aria-label')).toContain('Sleep quality');
    expect(groups[1].getAttribute('aria-label')).toContain('Muscle soreness');
  });

  it('points at Settings when nothing is selected', () => {
    const onOpenSettings = vi.fn();
    setup({ settings: settings({ items: [] }), onOpenSettings });
    expect(screen.getByText(/Pick which of the four items/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open Settings' }));
    expect(onOpenSettings).toHaveBeenCalled();
  });

  it('marks SRSS and PSS-4 as placeholders rather than dropping answers', () => {
    setup({ settings: settings({ weeklySrss: true, monthlyPss: true }) });
    expect(screen.getByText(/Weekly recovery and stress scale \(SRSS\) — placeholder/)).toBeTruthy();
    expect(screen.getByText(/Monthly perceived stress scale \(PSS-4\) — placeholder/)).toBeTruthy();
  });

  it('keeps every scale button at the 44 px touch floor', () => {
    setup();
    const labels = Array.from(document.querySelectorAll('[role="radiogroup"] label'));
    expect(labels).toHaveLength(28);
    expect(labels.every((l) => l.className.includes('h-11'))).toBe(true);
  });
});
