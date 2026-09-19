// @vitest-environment jsdom
/**
 * Onboarding render tests: the cover offers the two paths by the names the
 * browser probe clicks ("Continue", "Load demo data"), the four steps carry
 * the one honest count in the app as their dateline, fields write to the
 * store as they are edited and refuse out-of-range values in words, and the
 * last Continue marks the profile onboarded.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PROFILE } from '../data/defaults';
import { resetStorageCache } from '../data/storage';
import { HealthStoreProvider, useHealth } from '../data/store';
import Onboarding from './Onboarding';
import { ONBOARDING_STEPS } from './onboardingPlan';

type Ctx = ReturnType<typeof useHealth>;
let ctx: Ctx;

function Probe() {
  ctx = useHealth();
  return null;
}

function mount() {
  return render(
    <HealthStoreProvider>
      <Probe />
      <Onboarding />
    </HealthStoreProvider>,
  );
}

const click = async (el: HTMLElement) => {
  await act(async () => {
    fireEvent.click(el);
  });
};

const commit = async (el: HTMLElement, value: string) => {
  await act(async () => {
    fireEvent.focus(el);
    fireEvent.change(el, { target: { value } });
    fireEvent.blur(el);
  });
};

const button = (name: string | RegExp) => screen.getByRole('button', { name });

beforeEach(() => {
  window.localStorage.clear();
  resetStorageCache();
  // jsdom has no layout: the page turn's scroll-to-top is a no-op here.
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  resetStorageCache();
  vi.unstubAllGlobals();
});

describe('Onboarding cover', () => {
  it('names the app, lists what the four steps set up, and offers Continue and demo data by name', () => {
    mount();
    expect(screen.getByRole('heading', { level: 1, name: 'Pulse' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Contents' })).toBeTruthy();
    for (const s of ONBOARDING_STEPS) {
      expect(screen.getByText(s.title)).toBeTruthy();
      expect(screen.getByText(s.sets)).toBeTruthy();
    }
    expect(button('Continue')).toBeTruthy();
    expect(button(/demo data/i).textContent).toBe('Load demo data');
    expect(screen.getByText('Wellness information only, not medical advice.')).toBeTruthy();
    // One ink rule on the cover, and no count anywhere but the contents dateline.
    expect(document.querySelectorAll('.hx-rule')).toHaveLength(1);
    expect(screen.queryByText(/Step \d of \d/)).toBeNull();
  });

  it('loads the demo data and finishes onboarding in one tap', async () => {
    mount();
    expect(ctx.state.settings.onboarded).toBe(false);
    await click(button(/demo data/i));
    expect(ctx.state.settings.demoLoaded).toBe(true);
    expect(ctx.state.settings.onboarded).toBe(true);
  });
});

describe('Onboarding steps', () => {
  it('walks the four steps with an honest dateline on each, Back included, and onboards on the last Continue', async () => {
    mount();
    await click(button('Continue'));
    for (let n = 1; n <= ONBOARDING_STEPS.length; n++) {
      expect(screen.getByRole('heading', { level: 2, name: ONBOARDING_STEPS[n - 1].title })).toBeTruthy();
      expect(screen.getByText(`Step ${n} of 4`)).toBeTruthy();
      expect(document.querySelectorAll('.hx-rule')).toHaveLength(1);
      expect(ctx.state.settings.onboarded).toBe(false);
      if (n < ONBOARDING_STEPS.length) await click(button('Continue'));
    }
    // Back is a real page turn.
    await click(button('Back'));
    expect(screen.getByText('Step 3 of 4')).toBeTruthy();
    await click(button('Continue'));
    expect(screen.getByText('Step 4 of 4')).toBeTruthy();
    await click(button('Continue'));
    expect(ctx.state.settings.onboarded).toBe(true);
  });

  it('writes profile fields to the store as they are edited and explains an out-of-range value in words', async () => {
    mount();
    await click(button('Continue'));
    const age = screen.getByLabelText('Age');
    await commit(age, '31');
    expect(ctx.state.settings.profile.age).toBe(31);

    await commit(age, '7');
    expect(screen.getByRole('alert').textContent).toBe('Minimum is 13 yrs.');
    expect(ctx.state.settings.profile.age).toBe(31);

    // A blank name keeps the default rather than storing an empty string.
    const name = screen.getByLabelText('Name');
    await act(async () => {
      fireEvent.change(name, { target: { value: 'Ana' } });
    });
    expect(ctx.state.settings.profile.name).toBe('Ana');
    await act(async () => {
      fireEvent.change(name, { target: { value: '' } });
    });
    expect(ctx.state.settings.profile.name).toBe(DEFAULT_PROFILE.name);

    // Units are words on a hairline; kg converts the stored reference weight back to lb.
    await click(screen.getByRole('radio', { name: 'kg' }));
    expect(ctx.state.settings.profile.units).toBe('kg');
    expect(ctx.state.settings.training.units).toBe('kg');
    await commit(screen.getByLabelText('Weight'), '80');
    expect(ctx.state.settings.profile.weightLb).toBeCloseTo(176.4, 1);
  });

  it('sets the week as seven session selects named by weekday, and counts the lift days', async () => {
    mount();
    await click(button('Continue'));
    await click(button('Continue'));
    await click(button('Continue'));
    expect(screen.getByText('Step 3 of 4')).toBeTruthy();
    expect(screen.getByText(/^4 lift days a week\./)).toBeTruthy();
    const wed = screen.getByLabelText('Wednesday session') as HTMLSelectElement;
    expect(wed.value).toBe('rest');
    await act(async () => {
      fireEvent.change(wed, { target: { value: 'full' } });
    });
    expect(ctx.state.settings.profile.split[3]).toBe('full');
    expect(screen.getByText(/^5 lift days a week\./)).toBeTruthy();
  });
});
