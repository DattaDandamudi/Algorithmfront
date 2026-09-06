import { describe, expect, it } from 'vitest';
import { DEFAULT_BLOODWORK } from '../data/defaults';
import type { BloodMarker } from '../data/types';
import type { FrequencyCounters } from './nutrition';
import { DOCTOR_CUE, labLinkedHabits, markerGuidance, retestReminders } from './micronutrients';

const byKey = (key: string): BloodMarker => DEFAULT_BLOODWORK.find((m) => m.key === key)!;

const counters = (over: Partial<FrequencyCounters> = {}): FrequencyCounters => ({
  redMeatServings: 3,
  fishServings: 3,
  seafoodServings: 1,
  poultryServings: 4,
  restaurantMeals: 4,
  homeMeals: 8,
  totalMeals: 14,
  restaurantPct: 29,
  homeCookedPct: 57,
  fiberAvg: 24.5,
  daysLogged: 7,
  days: 7,
  ...over,
});

describe('retestReminders', () => {
  const today = '2026-09-06';

  it('uses the planned retest date when present', () => {
    const [r] = retestReminders([{ ...byKey('vitd'), testedOn: '2026-06-01', retestOn: '2026-09-20' }], today);
    expect(r).toMatchObject({ dueInDays: 14, overdue: false, suggestedRetest: '2026-09-20' });
  });

  it('suggests testedOn + 90 days for low/elevated markers without a plan', () => {
    const out = retestReminders(
      [
        { ...byKey('ferritin'), testedOn: '2026-06-01' }, // low → 2026-08-30, overdue by 7
        { ...byKey('lead'), testedOn: '2026-07-01' }, // elevated → 2026-09-29
        { ...byKey('zinc'), testedOn: '2026-06-01' }, // low-normal → no suggestion
        { key: 'b12', label: 'B12', value: 500, unit: 'pg/mL', status: 'normal', testedOn: '2026-01-01' },
      ],
      today,
    );
    expect(out[0]).toMatchObject({ suggestedRetest: '2026-08-30', dueInDays: -7, overdue: true });
    expect(out[1]).toMatchObject({ suggestedRetest: '2026-09-29', dueInDays: 23, overdue: false });
    expect(out[2]).toMatchObject({ suggestedRetest: null, dueInDays: null, overdue: false });
    expect(out[3]).toMatchObject({ suggestedRetest: null, dueInDays: null, overdue: false });
  });

  it('returns nulls when the test date is unknown', () => {
    const [r] = retestReminders([byKey('vitd')], today);
    expect(r).toMatchObject({ marker: byKey('vitd'), suggestedRetest: null, dueInDays: null, overdue: false });
  });
});

describe('markerGuidance', () => {
  it('escalates elevated lead to a physician and never offers dosing', () => {
    const g = markerGuidance(byKey('lead'));
    expect(g.escalate).toBe(true);
    expect(g.headline).toBe('Needs physician follow-up');
    expect(g.generalInfo).toContain('4.3 µg/dL');
    expect(g.generalInfo).toMatch(/doctor/i);
    expect(g.generalInfo).not.toContain('IU');
    expect(g.habits.join(' ')).toMatch(/home/i);
    expect(g.habits.join(' ')).toMatch(/spices|cookware/i);
  });

  it('ends every non-lead item with the doctor cue', () => {
    for (const m of DEFAULT_BLOODWORK.filter((x) => x.key !== 'lead')) {
      const g = markerGuidance(m);
      expect(g.escalate).toBe(false);
      expect(g.generalInfo.endsWith(DOCTOR_CUE)).toBe(true);
      for (const h of g.habits) expect(h.endsWith(DOCTOR_CUE)).toBe(true);
    }
  });

  it('shows general vitamin D ranges from the marker value', () => {
    const g = markerGuidance(byKey('vitd'));
    expect(g.headline).toBe('Vitamin D 19 ng/mL — low');
    expect(g.generalInfo).toContain('800–2,000 IU/day');
    expect(g.generalInfo).toMatch(/3 months/);
    expect(g.habits.join(' ')).toMatch(/sunlight/i);
    expect(g.habits.join(' ')).toMatch(/oily fish/i);
  });

  it('covers ferritin, omega-3, zinc and testosterone habits', () => {
    expect(markerGuidance(byKey('ferritin')).habits.join(' ')).toMatch(/red meat 2–3×\/week/i);
    expect(markerGuidance(byKey('ferritin')).generalInfo).toMatch(/iron-status review/i);
    const omega = markerGuidance(byKey('omega3'));
    expect(omega.headline).toBe('Omega-3 index 3.0% — low');
    expect(omega.generalInfo).toContain('~8%');
    expect(omega.habits.join(' ')).toMatch(/EPA\+DHA/);
    expect(markerGuidance(byKey('zinc')).headline).toBe('Zinc — low-normal');
    const t = markerGuidance(byKey('testosterone'));
    expect(t.headline).toBe('Testosterone 382 ng/dL — low-normal');
    const habits = t.habits.join(' ');
    expect(habits).toMatch(/Sleep ≥7 h/);
    expect(habits).toMatch(/60 g/);
    expect(habits).toMatch(/Resistance training/);
    expect(habits).toMatch(/Tobacco/);
  });

  it('describes but never interprets a custom marker', () => {
    const g = markerGuidance({ key: 'crp', label: 'hs-CRP', value: 3.2, unit: 'mg/L', status: 'high' });
    expect(g.headline).toBe('hs-CRP 3.2 mg/L — high');
    expect(g.escalate).toBe(false);
    expect(g.generalInfo).toMatch(/does not interpret/);
    expect(g.generalInfo.endsWith(DOCTOR_CUE)).toBe(true);
  });

  it('does not escalate a lead result that is in range', () => {
    const g = markerGuidance({ ...byKey('lead'), value: 1.1, status: 'normal' });
    expect(g.escalate).toBe(false);
    expect(g.headline).toBe('Lead 1.1 µg/dL — in range');
  });
});

describe('labLinkedHabits', () => {
  it('nudges fish when omega-3 is low and fish < 2×/wk', () => {
    const out = labLinkedHabits(counters({ fishServings: 1 }), DEFAULT_BLOODWORK);
    const fish = out.find((s) => s.startsWith("You've had fish"));
    expect(fish).toBeDefined();
    expect(fish).toContain('fish 1× this week');
    expect(fish).toContain('3.0%');
    expect(fish!.endsWith(DOCTOR_CUE)).toBe(true);
    expect(labLinkedHabits(counters({ fishServings: 2 }), DEFAULT_BLOODWORK).some((s) => s.startsWith("You've had fish"))).toBe(false);
  });

  it('nudges home cooking when lead is elevated and ≥ 50% of meals are restaurant', () => {
    const out = labLinkedHabits(counters({ restaurantPct: 60, restaurantMeals: 6, homeMeals: 4, totalMeals: 10 }), DEFAULT_BLOODWORK);
    expect(out.some((s) => s.startsWith('60% of meals were restaurant this week'))).toBe(true);
    // too few meals to call a share
    expect(labLinkedHabits(counters({ restaurantPct: 100, restaurantMeals: 2, totalMeals: 2 }), DEFAULT_BLOODWORK).some((s) => /restaurant/.test(s))).toBe(false);
    // lead in range → no nudge
    const normalLead = DEFAULT_BLOODWORK.map((m) => (m.key === 'lead' ? { ...m, status: 'normal' as const } : m));
    expect(labLinkedHabits(counters({ restaurantPct: 60, totalMeals: 10 }), normalLead).some((s) => /restaurant/.test(s))).toBe(false);
  });

  it('nudges iron-rich meals when ferritin is low and red meat < 2×/wk', () => {
    const out = labLinkedHabits(counters({ redMeatServings: 1 }), DEFAULT_BLOODWORK);
    expect(out.some((s) => s.startsWith('Red meat 1× this week with ferritin at 23 ng/mL'))).toBe(true);
  });

  it('says nothing when habits already cover the labs', () => {
    expect(labLinkedHabits(counters(), DEFAULT_BLOODWORK)).toEqual([]);
    expect(labLinkedHabits(counters({ fishServings: 0 }), [])).toEqual([]);
  });
});
