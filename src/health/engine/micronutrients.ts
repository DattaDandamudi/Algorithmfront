/**
 * §6.7 Micronutrient follow-ups — DISPLAY-ONLY, never prescribe.
 *
 * The app shows general, published dosing *ranges* and lifestyle habits for
 * the user's own lab results and always defers to a physician:
 * - every non-lead item ends with the doctor cue (SPEC §8 guardrails);
 * - elevated blood lead escalates to "Needs physician follow-up" — a
 *   physician matter, not a self-care tip (SPEC caveats);
 * - retest reminders default to testedOn + 90 days for low/elevated markers
 *   (vitamin D guidance: retest at ~3 months).
 *
 * Numbers in the copy come from the marker itself (`value`/`unit`), never
 * from constants, so an edited or re-tested marker reads back correctly.
 */
import type { BloodMarker, ISODate } from '../data/types';
import { addDays, diffDays } from '../lib/dates';
import { fmt } from '../lib/format';
import type { FrequencyCounters } from './nutrition';

export const DOCTOR_CUE = 'Confirm dosing and any changes with your doctor.';
/** Suggested retest interval when none is planned (vitamin D "retest ~3 months"). */
export const DEFAULT_RETEST_DAYS = 90;

// ---------------------------------------------------------------------------
// Retest reminders
// ---------------------------------------------------------------------------

export interface RetestReminder {
  marker: BloodMarker;
  /** Days until the (planned or suggested) retest; negative when overdue; null when unknown. */
  dueInDays: number | null;
  overdue: boolean;
  suggestedRetest: ISODate | null;
}

const NEEDS_RETEST: ReadonlySet<BloodMarker['status']> = new Set(['low', 'elevated', 'high']);

export function retestReminders(bloodwork: BloodMarker[], today: ISODate): RetestReminder[] {
  return bloodwork.map((marker) => {
    let suggestedRetest: ISODate | null = marker.retestOn ?? null;
    if (!suggestedRetest && marker.testedOn && NEEDS_RETEST.has(marker.status)) {
      suggestedRetest = addDays(marker.testedOn, DEFAULT_RETEST_DAYS);
    }
    const dueInDays = suggestedRetest ? diffDays(today, suggestedRetest) : null;
    return { marker, dueInDays, overdue: dueInDays !== null && dueInDays < 0, suggestedRetest };
  });
}

// ---------------------------------------------------------------------------
// Per-marker guidance (general information only)
// ---------------------------------------------------------------------------

export interface MarkerGuidance {
  headline: string;
  generalInfo: string;
  /** True only for a physician-level result (elevated lead): show an escalation card, no self-care tips. */
  escalate: boolean;
  habits: string[];
}

const STATUS_WORD: Record<BloodMarker['status'], string> = {
  low: 'low',
  'low-normal': 'low-normal',
  normal: 'in range',
  high: 'high',
  elevated: 'elevated',
};

/** "19 ng/mL", "4.3 µg/dL", "3.0%" — percentages keep one decimal and no space. */
const valueText = (m: BloodMarker) => {
  const pct = m.unit === '%';
  const dp = pct || !Number.isInteger(m.value) ? 1 : 0;
  const n = fmt(m.value, dp);
  if (!m.unit) return n;
  return pct ? `${n}%` : `${n} ${m.unit}`;
};
const withCue = (s: string) => (s.endsWith(DOCTOR_CUE) ? s : `${s.trim()} ${DOCTOR_CUE}`);
const isElevated = (m: BloodMarker) => m.status === 'elevated' || m.status === 'high';
const isLowish = (m: BloodMarker) => m.status === 'low' || m.status === 'low-normal';

export function markerGuidance(marker: BloodMarker): MarkerGuidance {
  const key = marker.key.toLowerCase();
  const v = valueText(marker);
  const status = STATUS_WORD[marker.status] ?? marker.status;

  if (key === 'lead') {
    if (isElevated(marker)) {
      return {
        headline: 'Needs physician follow-up',
        generalInfo:
          `Blood lead ${v} is elevated. This is not something to manage with food or supplements — ` +
          'book a follow-up with your doctor to discuss the result, likely sources and a retest.',
        escalate: true,
        habits: [
          'Cook more meals at home so you know what goes in the pot.',
          'Check imported spices, turmeric, ceramics and cookware — common lead sources worth ruling out.',
        ],
      };
    }
    return {
      headline: `Lead ${v} — ${status}`,
      generalInfo: withCue('No follow-up flagged for this result.'),
      escalate: false,
      habits: [],
    };
  }

  if (key === 'vitd' || key === 'vitamind' || key === 'vitamin-d') {
    const low = isLowish(marker);
    return {
      headline: `Vitamin D ${v} — ${status}`,
      generalInfo: withCue(
        low
          ? 'General range for 12–20 ng/mL: 800–2,000 IU/day, retest at ~3 months; maintenance 1,000–2,000 IU/day once above 30 ng/mL.'
          : 'General maintenance range: 1,000–2,000 IU/day once above 30 ng/mL.',
      ),
      escalate: false,
      habits: [
        withCue('Midday sunlight on skin most days when you can.'),
        withCue('Oily fish (salmon, sardines, mackerel) and egg yolks add some vitamin D.'),
      ],
    };
  }

  if (key === 'ferritin' || key === 'iron') {
    return {
      headline: `Ferritin ${v} — ${status}`,
      generalInfo: withCue(
        isLowish(marker)
          ? 'Low iron stores. Ask for a full iron-status review (iron, TIBC, transferrin saturation) and a retest rather than guessing at supplements.'
          : 'Iron stores look adequate on this result.',
      ),
      escalate: false,
      habits: [
        withCue('Iron-rich meals: red meat 2–3×/week, or legumes/lentils paired with vitamin C (lemon, tomato, peppers).'),
        withCue('Keep tea and coffee away from iron-rich meals — they blunt absorption.'),
      ],
    };
  }

  if (key === 'omega3' || key === 'omega-3' || key === 'omega3index') {
    return {
      headline: `Omega-3 index ${v} — ${status}`,
      generalInfo: withCue(
        isLowish(marker)
          ? 'General target is ~8%. Getting there usually means 2–3 oily-fish meals a week or a daily EPA+DHA source; recheck in ~4 months.'
          : 'At or near the ~8% general target — keep the oily fish coming.',
      ),
      escalate: false,
      habits: [
        withCue('Oily fish 2–3×/week — salmon, sardines, mackerel, tandoori or grilled.'),
        withCue('If fish is hard to fit, an EPA+DHA supplement is the usual alternative.'),
      ],
    };
  }

  if (key === 'zinc') {
    return {
      headline: `Zinc${marker.value > 0 ? ` ${v}` : ''} — ${status}`,
      generalInfo: withCue(
        isLowish(marker)
          ? 'Low-normal. Zinc-rich foods (red meat, seafood, legumes, seeds) usually close a small gap; supplements above the RDA are not a default.'
          : 'In range on this result.',
      ),
      escalate: false,
      habits: [
        withCue('Red meat, prawns and other seafood, chickpeas and pumpkin seeds are the dense zinc sources.'),
      ],
    };
  }

  if (key === 'testosterone' || key === 'test' || key === 'total-testosterone') {
    return {
      headline: `Testosterone ${v} — ${status}`,
      generalInfo: withCue(
        isLowish(marker)
          ? 'Low-normal. Sleep ≥7 h (one week at 5 h cuts daytime testosterone 10–15%), keep dietary fat ≥60 g/day, lift progressively, and cut tobacco — these move the needle before any medical option.'
          : 'In range on this result. Sleep, fat intake ≥60 g and resistance training keep it there.',
      ),
      escalate: false,
      habits: [
        withCue('Sleep ≥7 h nightly at a consistent bedtime.'),
        withCue('Hold fat at or above your 60 g floor even on low-calorie days.'),
        withCue('Resistance training 3–4×/week with progressive loads.'),
        withCue('Tobacco cessation — nicotine is associated with lower HRV and worse sleep.'),
      ],
    };
  }

  // Unknown / custom marker: describe, never interpret.
  const flagged = marker.status !== 'normal';
  return {
    headline: `${marker.label} ${v} — ${status}`,
    generalInfo: withCue(
      flagged
        ? `This result is flagged ${status}. The app does not interpret it — review it with your doctor.`
        : 'In range on this result.',
    ),
    escalate: false,
    habits: [],
  };
}

// ---------------------------------------------------------------------------
// Lab-linked habit nudges (§7 #13/#14 and friends)
// ---------------------------------------------------------------------------

/** Enough meals to make a restaurant share meaningful. */
const MIN_MEALS_FOR_SHARE = 4;

function findMarker(bloodwork: BloodMarker[], ...keys: string[]): BloodMarker | undefined {
  return bloodwork.find((m) => keys.includes(m.key.toLowerCase()));
}

/**
 * Short nudges that connect the week's food-frequency counters to the user's
 * own lab results. Copy follows the §7 templates; numbers come from the
 * counters and markers. Empty when nothing is worth saying.
 */
export function labLinkedHabits(counters: FrequencyCounters, bloodwork: BloodMarker[]): string[] {
  const out: string[] = [];
  const period = counters.days === 7 ? 'this week' : `in the last ${counters.days} days`;

  const omega = findMarker(bloodwork, 'omega3', 'omega-3', 'omega3index');
  if (omega && isLowish(omega) && counters.fishServings < 2) {
    out.push(
      `You've had fish ${counters.fishServings}× ${period}. With your omega-3 index at ${valueText(omega)}, ` +
        `one more oily-fish meal (or fish oil) moves the needle. ${DOCTOR_CUE}`,
    );
  }

  const lead = findMarker(bloodwork, 'lead');
  if (
    lead &&
    isElevated(lead) &&
    counters.restaurantPct !== null &&
    counters.totalMeals >= MIN_MEALS_FOR_SHARE &&
    counters.restaurantPct >= 50
  ) {
    out.push(
      `${counters.restaurantPct}% of meals were restaurant ${period}. Given your elevated lead, ` +
        'cooking 1–2 more meals at home lowers exposure and sodium.',
    );
  }

  const ferritin = findMarker(bloodwork, 'ferritin', 'iron');
  if (ferritin && isLowish(ferritin) && counters.redMeatServings < 2) {
    out.push(
      `Red meat ${counters.redMeatServings}× ${period} with ferritin at ${valueText(ferritin)}. ` +
        'Aim for 2–3 iron-rich meals — red meat, or lentils and chickpeas with a squeeze of lemon.',
    );
  }

  const zinc = findMarker(bloodwork, 'zinc');
  if (zinc && isLowish(zinc) && counters.redMeatServings + counters.seafoodServings < 2 && (!ferritin || !isLowish(ferritin))) {
    out.push(
      `Red meat and seafood ${counters.redMeatServings + counters.seafoodServings}× ${period} — ` +
        'with zinc low-normal, one or two more servings (or legumes and seeds) helps.',
    );
  }

  return out;
}
