// @vitest-environment jsdom
/**
 * CheckInSection — the four Hooper items plus the two optional instruments,
 * the weekly SRSS and the monthly PSS-4 (Phase 2g).
 *
 * Covers the rules the section exists to keep: worded anchors at both ends,
 * nothing preselected (so an untouched item is never written as a 4), ONE
 * save call carrying only the answered items, and "skip" as a visible button
 * that writes nothing.
 *
 * For the instruments it also pins the two things that are easy to get quietly
 * wrong: the PSS-4's REVERSE-SCORED items 2 and 3 (the flip must move the total
 * and nothing the reader sees), and the all-or-nothing rule — a subscale with
 * three of its four items answered writes no field at all.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { CheckInSettings, DailyRecord } from '../../data/types';
import CheckInSection, {
  PSS_SAVE_LABEL,
  PSS_SKIP_LABEL,
  PSS_TITLE,
  SAVE_LABEL,
  SKIP_LABEL,
  SRSS_SAVE_LABEL,
  SRSS_SKIP_LABEL,
  SRSS_TITLE,
  UNANSWERED,
} from './CheckInSection';
import { PSS_REVERSED, pss4Total, pssItemScore, srssValues } from './instruments';

afterEach(cleanup);

const settings = (patch: Partial<CheckInSettings> = {}): CheckInSettings => ({
  enabled: true,
  items: ['qs', 'qf', 'qt', 'qo'],
  promptAfter: '07:00',
  weeklySrss: false,
  monthlyPss: false,
  ...patch,
});

/** A Sunday — the day the weekly SRSS is meant to be asked. */
const DATE = '2026-09-06';

function setup(props: Partial<React.ComponentProps<typeof CheckInSection>> = {}) {
  const onSave = vi.fn();
  const onSkip = vi.fn();
  render(<CheckInSection date={DATE} record={undefined} settings={settings()} onSave={onSave} onSkip={onSkip} {...props} />);
  return { onSave, onSkip };
}

/** The scale whose accessible group name starts with `label`. */
const group = (groupLabel: string) => screen.getByRole('radiogroup', { name: new RegExp(`^${groupLabel}`, 'i') });

/** Pick the button whose VALUE is `n` — works for 1–7, 0–6 and 0–4 scales alike. */
function pick(groupLabel: string, n: number) {
  const radio = group(groupLabel).querySelector(`input[type="radio"][value="${n}"]`);
  fireEvent.click(radio as HTMLInputElement);
}

const ariaLabels = (groupLabel: string) =>
  within(group(groupLabel))
    .getAllByRole('radio')
    .map((r) => r.getAttribute('aria-label'));

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

  it('asks neither instrument until settings turn it on', () => {
    setup();
    expect(screen.queryByText(SRSS_TITLE)).toBeNull();
    expect(screen.queryByText(PSS_TITLE)).toBeNull();
    expect(screen.getAllByRole('radiogroup')).toHaveLength(4);
  });

  it('keeps every scale button at the 44 px touch floor', () => {
    setup();
    const labels = Array.from(document.querySelectorAll('[role="radiogroup"] label'));
    expect(labels).toHaveLength(28);
    expect(labels.every((l) => l.className.includes('h-11'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Weekly SRSS
// ---------------------------------------------------------------------------

const srssOn = (patch: Partial<CheckInSettings> = {}) => settings({ weeklySrss: true, ...patch });

/** Every SRSS item answered, recovery first: 6,5,4,3 → 18 · 2,1,2,1 → 6. */
function answerSrss(recovery: number[], stress: number[]) {
  const rec = ['Physical performance capability', 'Mental performance capability', 'Emotional balance', 'Overall recovery'];
  const str = ['Muscular stress', 'Lack of activation', 'Negative emotional state', 'Overall stress'];
  recovery.forEach((n, i) => pick(rec[i], n));
  stress.forEach((n, i) => pick(str[i], n));
}

describe('CheckInSection · weekly SRSS', () => {
  it('asks eight items in two subscales of four, 0–6, with both anchors worded', () => {
    setup({ settings: srssOn() });
    expect(screen.getByText(SRSS_TITLE)).toBeTruthy();
    for (const label of [
      'Physical performance capability',
      'Mental performance capability',
      'Emotional balance',
      'Overall recovery',
      'Muscular stress',
      'Lack of activation',
      'Negative emotional state',
      'Overall stress',
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    // Four daily scales + eight SRSS ones.
    expect(screen.getAllByRole('radiogroup')).toHaveLength(12);
    expect(screen.getAllByText('0 · Does not apply at all')).toHaveLength(8);
    expect(screen.getAllByText('6 · Fully applies')).toHaveLength(8);
    expect(screen.getByText('Recovery: 0 of 4 answered — the subscale total needs all four.')).toBeTruthy();
    expect(screen.getByText('Stress: 0 of 4 answered — the subscale total needs all four.')).toBeTruthy();
  });

  it('preselects nothing and gives every one of the seven steps a word', () => {
    setup({ settings: srssOn() });
    expect(screen.queryAllByRole('radio', { checked: true })).toHaveLength(0);
    expect(ariaLabels('Emotional balance')).toEqual([
      '0 — Does not apply at all',
      '1 — Applies very slightly',
      '2 — Applies slightly',
      '3 — Applies somewhat',
      '4 — Applies quite a bit',
      '5 — Applies strongly',
      '6 — Fully applies',
    ]);
  });

  it('stores the two subscale TOTALS, not the eight items, in one save', () => {
    const { onSave } = setup({ settings: srssOn() });
    answerSrss([6, 5, 4, 3], [2, 1, 2, 1]);
    expect(screen.getByText('Recovery 18 of 24 · higher is better.')).toBeTruthy();
    expect(screen.getByText('Stress 6 of 24 · lower is better.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: SRSS_SAVE_LABEL }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({ srssR: 18, srssS: 6 });
  });

  it('writes nothing for a half-answered subscale', () => {
    const { onSave } = setup({ settings: srssOn() });
    // Recovery complete, stress three of four — only the complete one is written.
    answerSrss([6, 6, 6, 6], [4, 4, 4]);
    expect(screen.getByText('Stress: 3 of 4 answered — the subscale total needs all four.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: SRSS_SAVE_LABEL }));
    expect(onSave).toHaveBeenCalledWith({ srssR: 24 });
    expect(srssValues({ s1: 4, s2: 4, s3: 4 })).toEqual({});
  });

  it('cannot be saved at all while neither subscale is complete', () => {
    setup({ settings: srssOn() });
    expect(screen.getByRole('button', { name: SRSS_SAVE_LABEL }).hasAttribute('disabled')).toBe(true);
    answerSrss([3, 3, 3], []);
    expect(screen.getByRole('button', { name: SRSS_SAVE_LABEL }).hasAttribute('disabled')).toBe(true);
    pick('Overall recovery', 3);
    expect(screen.getByRole('button', { name: SRSS_SAVE_LABEL }).hasAttribute('disabled')).toBe(false);
  });

  it('is skippable, writes nothing when skipped, and can be undone', () => {
    const { onSave } = setup({ settings: srssOn() });
    fireEvent.click(screen.getByRole('button', { name: SRSS_SKIP_LABEL }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/Skipped this week/)).toBeTruthy();
    // The daily check-in is untouched by skipping the weekly one.
    expect(screen.getAllByRole('radiogroup')).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: 'Answer it anyway' }));
    expect(screen.getAllByRole('radiogroup')).toHaveLength(12);
  });

  it('summarises the subscales once the week is answered', () => {
    setup({ settings: srssOn(), record: { d: DATE, srssR: 18, srssS: 6 } });
    expect(screen.getByText('Recovery 18 · Stress 6 (of 24 each)')).toBeTruthy();
    expect(screen.getAllByRole('radiogroup')).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: 'Answer again' }));
    expect(screen.getAllByRole('radiogroup')).toHaveLength(12);
    // Only totals are stored, so re-answering starts from a blank scale.
    expect(screen.queryAllByRole('radio', { checked: true })).toHaveLength(0);
  });

  describe('gating', () => {
    const groups = () => screen.getAllByRole('radiogroup').length;

    it('appears on a Sunday when the week has no recovery total', () => {
      setup({ settings: srssOn(), records: [] });
      expect(groups()).toBe(12);
    });

    it('stays open mid-week when the Sunday was missed', () => {
      setup({ date: '2026-09-09', settings: srssOn(), records: [{ d: '2026-09-06', qs: 3 }] });
      expect(groups()).toBe(12);
    });

    it('disappears for the rest of the week once it is answered', () => {
      setup({ date: '2026-09-09', settings: srssOn(), records: [{ d: '2026-09-06', srssR: 18, srssS: 6 }] });
      expect(screen.queryByText(SRSS_TITLE)).toBeNull();
      expect(groups()).toBe(4);
    });

    it('comes back the next Sunday — the week runs Sunday to Saturday', () => {
      const answered: DailyRecord[] = [{ d: '2026-09-06', srssR: 18, srssS: 6 }];
      setup({ date: '2026-09-13', settings: srssOn(), records: answered });
      expect(groups()).toBe(12);
      cleanup();
      // …and last week's answer (Saturday the 5th) does not close this week.
      setup({ date: DATE, settings: srssOn(), records: [{ d: '2026-09-05', srssR: 18 }] });
      expect(groups()).toBe(12);
    });

    it('is never asked while settings leave it off', () => {
      setup({ settings: settings({ weeklySrss: false }), records: [] });
      expect(screen.queryByText(SRSS_TITLE)).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// Monthly PSS-4
// ---------------------------------------------------------------------------

const pssOn = (patch: Partial<CheckInSettings> = {}) => settings({ monthlyPss: true, ...patch });

const P1 = 'Felt unable to control the important things in your life';
const P2 = 'Felt confident about your ability to handle your personal problems';
const P3 = 'Felt that things were going your way';
const P4 = 'Felt difficulties were piling up so high you could not overcome them';

/** Answer all four in order p1…p4 with their RAW picks. */
const answerPss = (raw: [number, number, number, number]) => [P1, P2, P3, P4].forEach((label, i) => pick(label, raw[i]));

describe('CheckInSection · monthly PSS-4', () => {
  it('asks four items about the last month, 0–4, with both anchors worded', () => {
    setup({ settings: pssOn() });
    expect(screen.getByText(PSS_TITLE)).toBeTruthy();
    expect(screen.getByText('In the last month, how often have you…')).toBeTruthy();
    expect(screen.getByText(/they ask about the last month, which is why they are never asked daily/)).toBeTruthy();
    for (const label of [P1, P2, P3, P4]) expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getAllByRole('radiogroup')).toHaveLength(8); // four daily + four PSS-4
    expect(screen.getAllByText('0 · Never')).toHaveLength(4);
    expect(screen.getAllByText('4 · Very often')).toHaveLength(4);
    expect(ariaLabels(P3)).toEqual(['0 — Never', '1 — Almost never', '2 — Sometimes', '3 — Fairly often', '4 — Very often']);
    expect(screen.queryAllByRole('radio', { checked: true })).toHaveLength(0);
  });

  // --- reverse scoring ------------------------------------------------------

  it('reverse-scores items 2 and 3 into the total', () => {
    const { onSave } = setup({ settings: pssOn() });
    // Every item answered "Never" (0). Items 1 and 4 score 0; items 2 and 3
    // are flipped to 4 each, so the total is 8 and NOT 0.
    answerPss([0, 0, 0, 0]);
    expect(screen.getByText(/^PSS-4 8 of 16/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: PSS_SAVE_LABEL }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({ pss4: 8 });
  });

  it('puts the most-stressed answers at 16 and the least-stressed at 0', () => {
    const { onSave } = setup({ settings: pssOn() });
    // Out of control / no confidence / nothing going your way / piling up.
    answerPss([4, 0, 0, 4]);
    expect(screen.getByText('PSS-4 16 of 16 — around 10 or above, which suggests you are feeling overloaded.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: PSS_SAVE_LABEL }));
    expect(onSave).toHaveBeenCalledWith({ pss4: 16 });
    cleanup();

    const second = setup({ settings: pssOn() });
    answerPss([0, 4, 4, 0]);
    expect(screen.getByText(/^PSS-4 0 of 16 — below the 10 or so/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: PSS_SAVE_LABEL }));
    expect(second.onSave).toHaveBeenCalledWith({ pss4: 0 });
  });

  it('keeps the flip out of sight — the read-out names the raw pick', () => {
    setup({ settings: pssOn() });
    pick(P2, 4); // a reverse-scored item, answered "Very often"
    // "Very often · 4/4", never the flipped "Never · 0/4".
    expect(screen.getByText('Very often · 4/4')).toBeTruthy();
    expect(screen.queryByText('Never · 0/4')).toBeNull();
    expect((within(group(P2)).getByRole('radio', { name: '4 — Very often' }) as HTMLInputElement).checked).toBe(true);
  });

  it('scores the reversal the same way in the pure helpers', () => {
    expect(PSS_REVERSED).toEqual(['p2', 'p3']);
    expect(pssItemScore('p1', 4)).toBe(4);
    expect(pssItemScore('p4', 1)).toBe(1);
    expect(pssItemScore('p2', 4)).toBe(0);
    expect(pssItemScore('p3', 0)).toBe(4);
    expect(pss4Total({ p1: 0, p2: 0, p3: 0, p4: 0 })).toBe(8);
    expect(pss4Total({ p1: 4, p2: 4, p3: 4, p4: 4 })).toBe(8);
    expect(pss4Total({ p1: 4, p2: 0, p3: 0, p4: 4 })).toBe(16);
    expect(pss4Total({ p1: 0, p2: 4, p3: 4, p4: 0 })).toBe(0);
  });

  // --- partial / skip -------------------------------------------------------

  it('writes nothing while it is partly answered', () => {
    const { onSave } = setup({ settings: pssOn() });
    pick(P1, 2);
    pick(P2, 3);
    pick(P3, 1);
    expect(screen.getByText('3 of 4 answered — the PSS-4 total needs all four.')).toBeTruthy();
    expect(screen.getByRole('button', { name: PSS_SAVE_LABEL }).hasAttribute('disabled')).toBe(true);
    expect(pss4Total({ p1: 2, p2: 3, p3: 1 })).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
    pick(P4, 0);
    expect(screen.getByRole('button', { name: PSS_SAVE_LABEL }).hasAttribute('disabled')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: PSS_SAVE_LABEL }));
    expect(onSave).toHaveBeenCalledWith({ pss4: 2 + (4 - 3) + (4 - 1) + 0 });
  });

  it('is skippable, writes nothing when skipped, and can be undone', () => {
    const { onSave } = setup({ settings: pssOn() });
    fireEvent.click(screen.getByRole('button', { name: PSS_SKIP_LABEL }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/Skipped this month/)).toBeTruthy();
    expect(screen.getAllByRole('radiogroup')).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: 'Answer it anyway' }));
    expect(screen.getAllByRole('radiogroup')).toHaveLength(8);
  });

  it('summarises the month once it is answered', () => {
    setup({ settings: pssOn(), record: { d: DATE, pss4: 12 } });
    expect(screen.getByText('PSS-4 12 of 16')).toBeTruthy();
    expect(screen.getAllByRole('radiogroup')).toHaveLength(4);
  });

  describe('gating', () => {
    it('appears when the calendar month has no total yet', () => {
      setup({ settings: pssOn(), records: [{ d: '2026-09-01', qs: 3 }] });
      expect(screen.getAllByRole('radiogroup')).toHaveLength(8);
    });

    it('disappears for the rest of the month once it is answered', () => {
      setup({ date: '2026-09-20', settings: pssOn(), records: [{ d: '2026-09-01', pss4: 7 }] });
      expect(screen.queryByText(PSS_TITLE)).toBeNull();
      expect(screen.getAllByRole('radiogroup')).toHaveLength(4);
    });

    it('comes back in the next calendar month', () => {
      setup({ settings: pssOn(), records: [{ d: '2026-08-31', pss4: 7 }] });
      expect(screen.getAllByRole('radiogroup')).toHaveLength(8);
    });

    it('is never asked while settings leave it off', () => {
      setup({ settings: settings({ monthlyPss: false }), records: [] });
      expect(screen.queryByText(PSS_TITLE)).toBeNull();
    });
  });
});

describe('CheckInSection · both instruments', () => {
  it('stacks the daily card, the weekly scale and the monthly one', () => {
    setup({ settings: settings({ weeklySrss: true, monthlyPss: true }) });
    expect(screen.getByText('Daily check-in')).toBeTruthy();
    expect(screen.getByText(SRSS_TITLE)).toBeTruthy();
    expect(screen.getByText(PSS_TITLE)).toBeTruthy();
    expect(screen.getAllByRole('radiogroup')).toHaveLength(16); // 4 + 8 + 4
  });

  it('keeps every button on every instrument at the 44 px touch floor', () => {
    setup({ settings: settings({ weeklySrss: true, monthlyPss: true }) });
    const labels = Array.from(document.querySelectorAll('[role="radiogroup"] label'));
    expect(labels).toHaveLength(4 * 7 + 8 * 7 + 4 * 5);
    expect(labels.every((l) => l.className.includes('h-11'))).toBe(true);
  });

  it('saves each instrument through the same single check-in write', () => {
    const { onSave } = setup({ settings: settings({ weeklySrss: true, monthlyPss: true }) });
    pick('Sleep quality', 3);
    fireEvent.click(screen.getByRole('button', { name: SAVE_LABEL }));
    answerSrss([6, 5, 4, 3], [2, 1, 2, 1]);
    fireEvent.click(screen.getByRole('button', { name: SRSS_SAVE_LABEL }));
    answerPss([0, 0, 0, 0]);
    fireEvent.click(screen.getByRole('button', { name: PSS_SAVE_LABEL }));
    expect(onSave.mock.calls.map((c) => c[0])).toEqual([{ qs: 3 }, { srssR: 18, srssS: 6 }, { pss4: 8 }]);
  });
});
