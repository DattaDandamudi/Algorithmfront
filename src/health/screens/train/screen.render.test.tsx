// @vitest-environment jsdom
/**
 * The Train screen wired to the real store and nav providers.
 *
 * The rule under test is the one the whole sub-tab is built around: a live
 * session lives in `hx:wk:draft`, is written as it is logged, is restored on
 * mount — so closing the app mid-workout loses nothing — and is cleared when
 * the session is discarded or saved. The four sub-views are also mounted in
 * turn, which is the cheapest way to catch a render-time throw in any of them.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { HealthStoreProvider } from '../../data/store';
import { NavProvider } from '../../nav';
import Train from '../Train';
import { readDraft } from './draft';

const DRAFT_KEY = 'hx:wk:draft';

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

function mount() {
  return render(
    <NavProvider>
      <HealthStoreProvider>
        <Train />
      </HealthStoreProvider>
    </NavProvider>,
  );
}

describe('Train screen', () => {
  it('renders all four sub-views', () => {
    mount();
    expect(screen.getByRole('heading', { name: 'Train' })).toBeTruthy();
    for (const view of ['Log', 'History', 'Analysis', 'Today']) {
      fireEvent.click(screen.getByRole('radio', { name: view }));
      expect(screen.getByRole('radio', { name: view }).getAttribute('aria-checked')).toBe('true');
    }
  });

  it('persists a started session to hx:wk:draft and clears it on discard', () => {
    mount();
    fireEvent.click(screen.getByRole('radio', { name: 'Log' }));
    fireEvent.click(screen.getAllByRole('button', { name: /^Start/ })[0]);

    expect(screen.getByRole('button', { name: 'Finish' })).toBeTruthy();
    expect(localStorage.getItem(DRAFT_KEY)).toBeTruthy();
    expect(readDraft()?.kind).toBe('strength');

    fireEvent.click(screen.getByRole('button', { name: /Discard/ }));
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Finish' })).toBeNull();
  });

  it('comes back into the live session after a reload', () => {
    mount();
    fireEvent.click(screen.getByRole('radio', { name: 'Log' }));
    fireEvent.click(screen.getAllByRole('button', { name: /^Start/ })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Rest 120 seconds' }));
    const saved = localStorage.getItem(DRAFT_KEY);

    // A "reload": tear the tree down, leave storage alone, mount again.
    cleanup();
    expect(localStorage.getItem(DRAFT_KEY)).toBe(saved);
    mount();

    // Straight back into the logger, not the Today view.
    expect(screen.getByRole('button', { name: 'Finish' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Log' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('button', { name: 'Stop the rest timer' })).toBeTruthy();
  });

  it('saves a logged session into the store and lands on its History entry', () => {
    mount();
    fireEvent.click(screen.getByRole('radio', { name: 'Log' }));
    fireEvent.click(screen.getAllByRole('button', { name: /^Start/ })[0]);

    fireEvent.click(screen.getByRole('button', { name: /Add exercise/ }));
    fireEvent.change(screen.getByLabelText('Search exercises'), { target: { value: 'bench press' } });
    fireEvent.click(screen.getByRole('button', { name: /^Bench Press/ }));
    fireEvent.click(screen.getByRole('button', { name: /Add set/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Increase Weight, set 1 of Bench Press' }));

    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save session' }));

    // The draft is gone and the session is in History, with its detail open.
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(screen.getByRole('radio', { name: 'History' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getAllByText(/Strength session|Rest session/).length).toBeGreaterThan(0);
  });

  it('starts a cardio session on the short form rather than the set logger', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Log cardio' }));
    expect(screen.getByRole('heading', { name: 'Log cardio' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Add exercise/ })).toBeNull();
    expect(readDraft()?.kind).toBe('cardio');
  });
});
