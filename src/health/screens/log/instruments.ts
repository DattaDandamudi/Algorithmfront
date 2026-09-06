/**
 * The two optional check-in instruments: the weekly SRSS and the monthly PSS-4
 * (SPEC §5 "longer instruments"; plan 2g). Pure — no React, no clock reads:
 * every gate takes the date and the records it should judge, so the schedule is
 * unit-testable rather than eyeballed against a real calendar.
 *
 * WHAT IS STORED. Neither instrument stores its raw items. `DailyRecord` keeps
 * the SRSS as its two SUBSCALE TOTALS (`srssR`, `srssS`, 0–24 each) and the
 * PSS-4 as its single total (`pss4`, 0–16) — those are the numbers the
 * literature interprets, and they ride the series/baseline/CSV stack that an
 * array of items could not. A subscale is therefore all-or-nothing: four
 * answers make a total, three make nothing (`srssValues` / `pss4Values` simply
 * leave the field out), because a partial sum is not comparable to any other
 * week and would quietly poison the series.
 *
 * SCHEDULES. The SRSS week runs SUNDAY → Saturday, so a fresh week has no
 * answer and Sunday is the natural day to be asked; missing that Sunday leaves
 * it open for the rest of the week instead of losing the week outright, and one
 * answer closes the week. (This is deliberately NOT the engine's ISO
 * Monday-start bucket — with Monday weeks a Sunday answer would be the last day
 * of one week and Monday would ask again the very next morning.) The PSS-4 is
 * per calendar month for the same reason its questions say "in the last month":
 * the recall window IS the schedule.
 */
import type { CheckInItem, CheckInSettings, DailyRecord, ISODate } from '../../data/types';
import { addDays, weekdayOf, yearMonthOf } from '../../lib/dates';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Everything one check-in save may write. The daily four plus the instrument
 * totals — all of it goes through the SAME `saveCheckIn` store write, so a day
 * is never assembled from two competing patches.
 */
export type CheckInWrite = Partial<Pick<DailyRecord, CheckInItem | 'srssR' | 'srssS' | 'pss4'>>;

// ---------------------------------------------------------------------------
// SRSS — Short Recovery and Stress Scale (Kellmann & Kölling), weekly
// ---------------------------------------------------------------------------

export type SrssScale = 'recovery' | 'stress';
export type SrssItemKey = 'r1' | 'r2' | 'r3' | 'r4' | 's1' | 's2' | 's3' | 's4';
export type SrssAnswers = Partial<Record<SrssItemKey, number>>;

export const SRSS_STEPS = [0, 1, 2, 3, 4, 5, 6] as const;
export const SRSS_MAX_STEP = 6;
/** Four items × 0–6 — the number the literature interprets, per subscale. */
export const SRSS_SUBSCALE_MAX = 24;

/** The published anchors: the scale is agreement with a state, not a rating. */
export const SRSS_LOW = 'Does not apply at all';
export const SRSS_HIGH = 'Fully applies';

/**
 * A word for every step. Kellmann and Kölling label only the two ends; the five
 * middle words are ours, evenly graded between them, so that no answer is ever
 * spoken as a bare number.
 */
export const SRSS_WORDS = [
  SRSS_LOW,
  'Applies very slightly',
  'Applies slightly',
  'Applies somewhat',
  'Applies quite a bit',
  'Applies strongly',
  SRSS_HIGH,
] as const;

export interface SrssItemMeta {
  key: SrssItemKey;
  scale: SrssScale;
  /** The item's short descriptive label — never "item 3". */
  label: string;
  /** The adjectives the scale publishes under that label. */
  hint: string;
  /** Accessible group name for the item's scale. */
  aria: string;
}

const srssAria = (label: string) => `${label}, 0 ${SRSS_LOW.toLowerCase()} to 6 ${SRSS_HIGH.toLowerCase()}`;

const SRSS_DEFS: ReadonlyArray<Omit<SrssItemMeta, 'aria'>> = [
  { key: 'r1', scale: 'recovery', label: 'Physical performance capability', hint: 'physically capable, strong, ready to perform' },
  { key: 'r2', scale: 'recovery', label: 'Mental performance capability', hint: 'attentive, receptive, mentally alert' },
  { key: 'r3', scale: 'recovery', label: 'Emotional balance', hint: 'balanced, even-tempered, calm' },
  { key: 'r4', scale: 'recovery', label: 'Overall recovery', hint: 'recovered, rested, physically relaxed' },
  { key: 's1', scale: 'stress', label: 'Muscular stress', hint: 'sore, heavy limbs, muscles worn out' },
  { key: 's2', scale: 'stress', label: 'Lack of activation', hint: 'unmotivated, no drive, low energy' },
  { key: 's3', scale: 'stress', label: 'Negative emotional state', hint: 'annoyed, irritable, out of sorts' },
  { key: 's4', scale: 'stress', label: 'Overall stress', hint: 'stressed overall, overloaded, worn down' },
];

/** The eight items, in the order the scale asks them: recovery, then stress. */
export const SRSS_ITEMS: readonly SrssItemMeta[] = SRSS_DEFS.map((i) => ({ ...i, aria: srssAria(i.label) }));

export const SRSS_SCALE_LABEL: Record<SrssScale, string> = { recovery: 'Recovery', stress: 'Stress' };

/** The `DailyRecord` field each subscale totals into. */
export const SRSS_SCALE_FIELD: Record<SrssScale, 'srssR' | 'srssS'> = { recovery: 'srssR', stress: 'srssS' };

export function srssScaleItems(scale: SrssScale): SrssItemMeta[] {
  return SRSS_ITEMS.filter((i) => i.scale === scale);
}

/** The word for one 0–6 answer ("Applies somewhat"); '' when unanswered. */
export function srssWord(value: number | null | undefined): string {
  if (!isNum(value)) return '';
  return SRSS_WORDS[Math.round(value)] ?? '';
}

/**
 * One subscale total, 0–24. Null unless ALL FOUR of its items are answered —
 * three answers are not a subscale score, and storing their sum would put a
 * number in the series that no other week could be compared to.
 */
export function srssSubtotal(answers: SrssAnswers, scale: SrssScale): number | null {
  let sum = 0;
  for (const item of srssScaleItems(scale)) {
    const v = answers[item.key];
    if (!isNum(v)) return null;
    sum += Math.round(v);
  }
  return sum;
}

/**
 * What a save writes: only the subscales that are complete. An untouched or
 * half-finished subscale contributes no field at all, so the store is never
 * given a total the user did not actually produce.
 */
export function srssValues(answers: SrssAnswers): CheckInWrite {
  const out: CheckInWrite = {};
  for (const scale of ['recovery', 'stress'] as const) {
    const total = srssSubtotal(answers, scale);
    if (total !== null) out[SRSS_SCALE_FIELD[scale]] = total;
  }
  return out;
}

/** "Recovery 18 of 24 · higher is better." — the line under the subscale. */
export function srssSubtotalLine(scale: SrssScale, total: number | null, answered: number): string {
  const label = SRSS_SCALE_LABEL[scale];
  if (total === null) return `${label}: ${answered} of 4 answered — the subscale total needs all four.`;
  const direction = scale === 'recovery' ? 'higher is better' : 'lower is better';
  return `${label} ${total} of ${SRSS_SUBSCALE_MAX} · ${direction}.`;
}

// ---------------------------------------------------------------------------
// PSS-4 — Perceived Stress Scale, monthly
// ---------------------------------------------------------------------------

export type PssItemKey = 'p1' | 'p2' | 'p3' | 'p4';
export type PssAnswers = Partial<Record<PssItemKey, number>>;

export const PSS_STEPS = [0, 1, 2, 3, 4] as const;
export const PSS_MAX_STEP = 4;
/** Four items × 0–4. */
export const PSS_MAX = 16;
/** Around here and above, the month is reading as overloaded (never a diagnosis). */
export const PSS_OVERLOAD_AT = 10;

export const PSS_LOW = 'Never';
export const PSS_HIGH = 'Very often';
/** The published anchors — every step has its own word, none is a bare number. */
export const PSS_WORDS = [PSS_LOW, 'Almost never', 'Sometimes', 'Fairly often', PSS_HIGH] as const;

/** The stem every item completes; the recall window lives here, in the copy. */
export const PSS_STEM = 'In the last month, how often have you…';

export interface PssItemMeta {
  key: PssItemKey;
  label: string;
  /**
   * True for the two POSITIVELY worded items. See `pssItemScore`: the raw pick
   * is flipped before it enters the total. Invisible to the reader — the
   * read-out beside the item always names the raw answer.
   */
  reversed: boolean;
  aria: string;
}

/**
 * THE REVERSE-SCORED ITEMS, named once so the rule has exactly one home.
 * `p2` ("felt confident…") and `p3` ("things were going your way") are worded
 * the *good* way round, so a high raw answer there means LESS perceived stress.
 */
export const PSS_REVERSED: readonly PssItemKey[] = ['p2', 'p3'];

const pssAria = (label: string) => `${label}, 0 ${PSS_LOW.toLowerCase()} to 4 ${PSS_HIGH.toLowerCase()}`;

const PSS_DEFS: ReadonlyArray<Pick<PssItemMeta, 'key' | 'label'>> = [
  { key: 'p1', label: 'Felt unable to control the important things in your life' },
  { key: 'p2', label: 'Felt confident about your ability to handle your personal problems' },
  { key: 'p3', label: 'Felt that things were going your way' },
  { key: 'p4', label: 'Felt difficulties were piling up so high you could not overcome them' },
];

export const PSS_ITEMS: readonly PssItemMeta[] = PSS_DEFS.map((i) => ({
  ...i,
  reversed: PSS_REVERSED.includes(i.key),
  aria: pssAria(i.label),
}));

/**
 * REVERSE SCORING, the whole rule in one function.
 *
 * The two positively worded items are flipped — 4 − raw — before they enter the
 * total, which is what makes the 0–16 sum read in one direction (Cohen's PSS
 * scoring). Everything else is taken as answered.
 *
 * The user is never shown this: the read-out beside the item reports the raw
 * pick they made ("Very often"), never the flipped number. Only the total moves.
 */
export function pssItemScore(key: PssItemKey, raw: number): number {
  const v = Math.round(raw);
  return PSS_REVERSED.includes(key) ? PSS_MAX_STEP - v : v;
}

/** The word for one 0–4 answer ("Fairly often"); '' when unanswered. */
export function pssWord(value: number | null | undefined): string {
  if (!isNum(value)) return '';
  return PSS_WORDS[Math.round(value)] ?? '';
}

/**
 * PSS-4 total, 0–16 with items 2 and 3 reversed. Null unless all four are
 * answered — a three-item sum is not a PSS-4 score.
 */
export function pss4Total(answers: PssAnswers): number | null {
  let sum = 0;
  for (const item of PSS_ITEMS) {
    const v = answers[item.key];
    if (!isNum(v)) return null;
    sum += pssItemScore(item.key, v);
  }
  return sum;
}

/** What a save writes: the total, or nothing at all when it is incomplete. */
export function pss4Values(answers: PssAnswers): CheckInWrite {
  const total = pss4Total(answers);
  return total === null ? {} : { pss4: total };
}

/** The reading under the total — a description of the month, not a finding. */
export function pss4Line(total: number | null, answered: number): string {
  if (total === null) return `${answered} of 4 answered — the PSS-4 total needs all four.`;
  const reading =
    total >= PSS_OVERLOAD_AT
      ? 'around 10 or above, which suggests you are feeling overloaded'
      : 'below the 10 or so where the month starts to read as overloaded';
  return `PSS-4 ${total} of ${PSS_MAX} — ${reading}.`;
}

// ---------------------------------------------------------------------------
// Schedules
// ---------------------------------------------------------------------------

/**
 * The Sunday that opens the SRSS week containing `d`. Sunday-first on purpose:
 * the scale is asked on Sundays, so the day it is asked must START its week —
 * otherwise answering on Sunday closes a week that ends that night and Monday
 * asks all over again.
 */
export function srssWeekStart(d: ISODate): ISODate {
  return addDays(d, -weekdayOf(d)); // weekdayOf: Sunday = 0
}

/** True once any day in `date`'s SRSS week carries a recovery total. */
export function srssAnsweredThisWeek(date: ISODate, records: readonly DailyRecord[]): boolean {
  const start = srssWeekStart(date);
  const end = addDays(start, 6);
  return records.some((r) => r.d >= start && r.d <= end && isNum(r.srssR));
}

/** True once any day in `date`'s calendar month carries a PSS-4 total. */
export function pssAnsweredThisMonth(date: ISODate, records: readonly DailyRecord[]): boolean {
  const ym = yearMonthOf(date);
  return records.some((r) => yearMonthOf(r.d) === ym && isNum(r.pss4));
}

/**
 * Ask the SRSS when it is switched on and this week has no `srssR` yet — which
 * is true on Sunday (a fresh week) and stays true for the rest of a week whose
 * Sunday was missed. One answer closes the week.
 */
export function srssDue(date: ISODate, settings: CheckInSettings, records: readonly DailyRecord[]): boolean {
  return settings.weeklySrss && !srssAnsweredThisWeek(date, records);
}

/** Ask the PSS-4 when it is switched on and this calendar month has no total. */
export function pssDue(date: ISODate, settings: CheckInSettings, records: readonly DailyRecord[]): boolean {
  return settings.monthlyPss && !pssAnsweredThisMonth(date, records);
}
