/**
 * Insight cards — SPEC §7 (the 14 copy templates) plus the promotion rules in
 * "Thresholds that should change behavior/targets", the 8 coach chips (§4),
 * the per-tile suggested prompts (WHOOP pattern) and the Today empty states (§1).
 *
 * This module computes no metrics: it reads a fully-built CoachContext
 * (engine/context.ts) and turns *state* into cards. Pure and deterministic —
 * no clock, no randomness; ids are `ins-<template>-<date>` so a card keeps its
 * identity across re-renders on the same day.
 *
 * Copy rules (§7): ≤2 sentences, name the number, one action verb, band colour
 * by state. Every number comes from the context; when a datapoint is missing
 * the clause that needs it is dropped rather than invented.
 */
import type { Band, BloodMarker, CoachContext, HHMM, Insight, Profile, SessionType, Targets } from '../data/types';
import { formatClock, hhmmToMinutes, minutesSinceNoon, minutesSinceNoonToHHMM } from '../lib/dates';
import { fmt, round } from '../lib/format';
import { BASELINE_READINGS } from './hrv';

/** The 8 coach quick-prompt chips (§4), verbatim and in order. */
export const COACH_CHIPS: string[] = [
  'Should I train today?',
  'What should I eat now?',
  'Why is my recovery low?',
  "How's my weight trend — adjust calories?",
  'Plan my carbs for a lift day.',
  "How did last night's sleep affect me?",
  'Help me cut back tobacco today.',
  'Are my vitamin D / ferritin / omega-3 habits on track?',
];

/**
 * Sort priorities (higher first). Consistency jumps to 95 when bedtime SD > 60
 * min ("promote a consistency card above duration cards"); the sleep-debt card
 * jumps to 92 — above recovery — when fat loss has stalled AND sleep is short,
 * while the weight and calorie cards drop, so the app asks for sleep before a
 * calorie cut (Nedeltcheva 2010: short sleep turns the deficit into lean loss).
 */
export const INSIGHT_PRIORITY = {
  recovery: 90, sleepDebt: 80, sleepDebtStall: 92, consistency: 70, consistencyPromoted: 95, protein: 75, fatFloor: 72,
  weight: 65, weightStall: 45, calories: 60, caloriesStall: 40, caffeine: 58, tobacco: 55, steps: 50, carbs: 45, lab: 40,
} as const;

// Thresholds (§6/§7 and the task brief). Commented where non-obvious.
const SLEEP_DEBT_MIN = 45;
const SLEEP_DEBT_RED_MIN = 90; // 1.5 h+ of debt is a red card, not a nudge
const PROTEIN_PER_MEAL_HI = 43; // 0.55 g/kg × 78 kg (§6.5): more than this per meal is hard to hit
const CARBS_ROOM_MIN = 60;
const CARBS_CUTOFF_MIN = 18 * 60; // no "fuel training" nudge after 18:00
const STEPS_SHORT_MIN = 1000;
const STEPS_PER_MIN = 100; // brisk walk ≈ 100 steps/min
const STEPS_LATE_MIN = 15 * 60; // a step shortfall is only a warning once the afternoon is here
const KCAL_TIGHT = 200;
const BEDTIME_SD_YELLOW = 30;
const BEDTIME_SD_RED = 60;
const FISH_MIN_7D = 2;
const RESTAURANT_PCT_MIN = 60;
const WATER_BUMP_LB = 1; // scale − trend > 1 lb reads as water, not fat
const SHORT_SLEEP_HRS = 0.5;
const BEDTIME_EARLIEST_SHIFT_MIN = 120; // never suggest a bedtime > 2 h before the target

/** Restaurant-prior portions (kcal) from the default favorites, for "~1 chicken tikka plate" examples. */
const PORTIONS: Array<[number, string, string]> = [
  [630, 'chicken biryani plate', 'chicken biryani plates'],
  [330, 'chicken tikka plate', 'chicken tikka plates'],
  [180, 'serving of tandoori prawns', 'servings of tandoori prawns'],
  [120, 'roti', 'rotis'],
];

const SESSION_LABEL: Record<SessionType, string> = { upper: 'upper-body', lower: 'lower-body', push: 'push', pull: 'pull', legs: 'leg', full: 'full-body', cardio: 'cardio', rest: 'rest' };

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const n0 = (v: number): string => fmt(v, 0);
const n1 = (v: number): string => fmt(round(v, 1), 1);
/** Variable precision, no trailing zeros: 0.5 → "0.5", 1 → "1". */
const trim = (v: number, dp = 2): string => v.toLocaleString('en-US', { maximumFractionDigits: dp });
const clock = (t: HHMM | null | undefined): string => formatClock(t);
const plural = (n: number, word: string): string => `${n0(n)} ${word}${n === 1 ? '' : 's'}`;
const lcFirst = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);

function card(ctx: CoachContext, template: number, title: string, band: Band, body: string, coachPrompt: string, priority: number): Insight {
  return { id: `ins-${template}-${ctx.today}`, template: String(template), band, title, body, coachPrompt, priority };
}

/** ctx.bloodwork is the snapshot the rest of the app saw; the profile is only a fallback when it is empty. */
function findMarker(ctx: CoachContext, profile: Profile, key: string): BloodMarker | null {
  const pool = ctx.bloodwork?.length ? ctx.bloodwork : profile.bloodwork ?? [];
  const k = key.toLowerCase();
  return pool.find((m) => m.key?.toLowerCase() === k) ?? pool.find((m) => m.label?.toLowerCase().includes(k)) ?? null;
}

function markerValue(m: BloodMarker): string {
  return m.unit === '%' ? `${trim(m.value)}%` : `${trim(m.value)}${m.unit ? ` ${m.unit}` : ''}`;
}

/** Fat-loss stall (§thresholds): losing slower than the band while sleeping > 30 min under need. */
function stallWithShortSleep(ctx: CoachContext): boolean {
  const hrs = num(ctx.sleep.hours);
  const need = num(ctx.sleep.need);
  return ctx.weight.inBand === 'below' && hrs !== null && need !== null && hrs < need - SHORT_SLEEP_HRS;
}

/**
 * Bedtime that fits tonight's sleep need before the wake target (§6.4 — need
 * already includes the debt term). Never later than the bed target, never more
 * than 2 h earlier, snapped to a 5-min grid.
 */
function bedtimeToClear(ctx: CoachContext, profile: Profile): HHMM {
  const target = minutesSinceNoon(profile.bedTarget);
  const wake = minutesSinceNoon(profile.wakeTarget);
  const need = num(ctx.sleep.need) ?? profile.sleepBaselineHrs + (num(ctx.sleep.debtMin) ?? 0) / 60;
  if (target === null) return profile.bedTarget;
  if (wake === null || !Number.isFinite(need) || need <= 0) return minutesSinceNoonToHHMM(target);
  const needed = Math.floor((wake - need * 60) / 5) * 5;
  return minutesSinceNoonToHHMM(Math.min(target, Math.max(needed, target - BEDTIME_EARLIEST_SHIFT_MIN)));
}

/** "1 chicken tikka plate" / "2 rotis" — the largest favorite portion that fits, at most ×2. */
export function examplePortion(kcal: number): string {
  for (const [kc, one, many] of PORTIONS) {
    if (kcal >= kc) {
      const n = Math.min(2, Math.floor(kcal / kc));
      return `${n} ${n === 1 ? one : many}`;
    }
  }
  return 'less than a roti';
}

// ---------------------------------------------------------------------------
// Templates (§7 #1–#14). Each returns null when its trigger is not met.
// ---------------------------------------------------------------------------

type TemplateFn = (ctx: CoachContext, profile: Profile, targets: Targets) => Insight | null;

const sleepDebt: TemplateFn = (ctx, profile) => {
  const debt = num(ctx.sleep.debtMin);
  if (debt === null || debt < SLEEP_DEBT_MIN) return null;
  const hrs = num(ctx.sleep.hours);
  const after = hrs === null ? '' : ` after last night's ${n1(hrs)} h`;
  const body = `You're carrying ${n0(debt)} min of sleep debt${after}. Get to bed by ${clock(bedtimeToClear(ctx, profile))} to clear it.`;
  return card(ctx, 1, 'Sleep debt', debt >= SLEEP_DEBT_RED_MIN ? 'red' : 'yellow', body, COACH_CHIPS[5], INSIGHT_PRIORITY.sleepDebt);
};

/** #2 (red) or #3 (green) — never both; yellow/neutral readiness gets no recovery card. */
const recovery: TemplateFn = (ctx) => {
  const band = ctx.readiness.band;
  if (band !== 'red' && band !== 'green') return null;
  const score = num(ctx.readiness.score);
  if (band === 'red') {
    const lead = score === null ? 'Recovery is in the red' : `Recovery is ${n0(score)}% (red)`;
    const hrv = num(ctx.hrv.today);
    const base = num(ctx.hrv.delta.baseline) ?? num(ctx.hrv.baseline7);
    const delta = num(ctx.hrv.delta.delta) ?? (hrv !== null && base !== null ? hrv - base : null);
    let hrvClause = '';
    if (hrv !== null) {
      const vs = delta === null ? '' : delta < 0 ? ` is ${n0(-delta)} ms below baseline` : delta > 0 ? ` is ${n0(delta)} ms above baseline` : ' is at baseline';
      hrvClause = `. HRV ${n0(hrv)} ms${vs}`;
    }
    return card(ctx, 2, 'Recovery low', 'red', `${lead}${hrvClause} — keep today light: mobility or a walk.`, COACH_CHIPS[2], INSIGHT_PRIORITY.recovery);
  }
  const lead = score === null ? 'Recovery is green' : `Recovery ${n0(score)}% (green)`;
  const action =
    ctx.dayType === 'lift' && ctx.sessionType !== 'rest'
      ? `progress your ${SESSION_LABEL[ctx.sessionType] ?? ctx.sessionType} loads today.`
      : 'rest day, so bank it and push loads at your next session.';
  return card(ctx, 3, 'Recovery high', 'green', `${lead}. You're primed — ${action}`, COACH_CHIPS[0], INSIGHT_PRIORITY.recovery);
};

/** #4 — also carries the §6.5 "< 0.4 g/kg meal slot" nudge when the last occasion fell short (R3-7). */
const proteinPace: TemplateFn = (ctx, _profile, targets) => {
  const per = num(ctx.nutrition.proteinPerMealNeeded);
  const left = num(ctx.nutrition.remaining.p) ?? 0;
  const meals = num(ctx.nutrition.mealsLeft) ?? 0;
  if (per === null || left <= 0 || meals <= 0) return null;
  const sofar = num(ctx.nutrition.totals.p) ?? 0;
  const target = num(ctx.nutrition.targets.p) ?? targets.protein;
  const hard = per > (num(ctx.nutrition.maxPerMeal) ?? PROTEIN_PER_MEAL_HI);
  const suggest = hard ? 'chicken tikka (200 g ≈ 50 g protein)' : 'tandoori prawns or chicken tikka';
  const lastP = num(ctx.nutrition.lastMealProtein);
  const minMeal = num(ctx.nutrition.minPerMeal);
  const lowSlot = ctx.nutrition.lastMealBelowMin === true && lastP !== null && minMeal !== null;
  const lead = `You're at ${n0(sofar)} g protein with ${plural(meals, 'meal')} left — you need ~${n0(per)} g each to hit ${n0(target)} g.`;
  const body = lowSlot
    ? `${lead} Your last meal came in at ${n0(lastP as number)} g, under your ${n0(minMeal as number)} g floor — lead your next meal with ${suggest}.`
    : `${lead} Lead your next meal with ${suggest}.`;
  return card(ctx, 4, 'Protein pace', hard || lowSlot ? 'yellow' : 'neutral', body, COACH_CHIPS[1], INSIGHT_PRIORITY.protein);
};

const calories: TemplateFn = (ctx, profile, targets) => {
  const kc = num(ctx.nutrition.totals.kc) ?? 0;
  if ((num(ctx.nutrition.mealsLogged) ?? 0) <= 0 && kc <= 0) return null;
  const target = num(ctx.nutrition.targets.kc) ?? targets.kcal;
  const left = num(ctx.nutrition.remaining.kc) ?? target - kc;
  if (left < 0) {
    const body = `You're ${n0(-left)} kcal over today's ${n0(target)} kcal. Make anything else protein-only — tikka or prawns, no rice.`;
    return card(ctx, 5, 'Calories', 'red', body, COACH_CHIPS[3], INSIGHT_PRIORITY.calories);
  }
  const rate = num(ctx.weight.weeklyRateLb);
  const hold =
    profile.goalPhase !== 'fat-loss'
      ? 'Land on it to stay on plan.'
      : rate === null
        ? 'Stay under to keep the deficit.'
        : rate < 0
          ? `Stay under to hold your ${n1(-rate)} lb/wk trend.`
          : 'Stay under to get the trend moving down again.';
  const tight = left < KCAL_TIGHT && (num(ctx.nutrition.mealsLeft) ?? 0) > 0;
  const body = `${n0(left)} kcal left today (~${examplePortion(left)}). ${hold}`;
  return card(ctx, 5, 'Calories', tight ? 'yellow' : 'neutral', body, `What should I eat with ${n0(left)} kcal left?`, INSIGHT_PRIORITY.calories);
};

const fatFloor: TemplateFn = (ctx, _profile, targets) => {
  if (!ctx.nutrition.fatBelowFloor) return null;
  const fat = num(ctx.nutrition.totals.f) ?? 0;
  const floor = num(ctx.nutrition.targets.fatFloor) ?? targets.fatFloor;
  if (fat >= floor) return null; // refuse to print "below your floor" when the totals say otherwise
  const suggest = floor - fat > 20 ? 'lamb chops or 2 eggs plus a handful of nuts' : 'a handful of almonds (~14 g fat)';
  const body = `Fat's at ${n0(fat)} g — below your ${n0(floor)} g floor. Add ${suggest} to protect testosterone and vitamin absorption.`;
  return card(ctx, 6, 'Fat floor', 'yellow', body, `How do I reach my ${n0(floor)} g fat floor today?`, INSIGHT_PRIORITY.fatFloor);
};

const carbDayType: TemplateFn = (ctx, _profile, targets) => {
  if (ctx.dayType !== 'lift') return null;
  const left = num(ctx.nutrition.remaining.c);
  if (left === null || left < CARBS_ROOM_MIN) return null;
  const now = hhmmToMinutes(ctx.nowHHMM);
  if (now !== null && now >= CARBS_CUTOFF_MIN) return null;
  const [lo, hi] = ctx.nutrition.targets.carbsRange ?? targets.carbsLift;
  const body = `It's a lift day — room for ${n0(left)} g more carbs (${n0(lo)}–${n0(hi)} g target). Fuel training with rice or roti.`;
  return card(ctx, 7, 'Lift-day carbs', 'neutral', body, COACH_CHIPS[4], INSIGHT_PRIORITY.carbs);
};

const steps: TemplateFn = (ctx, _profile, targets) => {
  const today = num(ctx.steps.today);
  const goal = num(ctx.steps.goalMin) ?? targets.stepsMin;
  if (today === null) return null;
  const short = goal - today;
  if (short < STEPS_SHORT_MIN) return null;
  const mins = Math.max(5, Math.round(short / STEPS_PER_MIN / 5) * 5);
  const now = hhmmToMinutes(ctx.nowHHMM);
  const body = `${n0(today)} steps, ${n0(short)} short of your ${n0(goal)} goal. A ${mins}-min walk closes it.`;
  return card(ctx, 8, 'Steps', now !== null && now >= STEPS_LATE_MIN ? 'yellow' : 'neutral', body, 'How do I close my step gap today?', INSIGHT_PRIORITY.steps);
};

const tobacco: TemplateFn = (ctx) => {
  const today = num(ctx.tobacco.today) ?? 0;
  const avg = num(ctx.tobacco.avg7);
  if (today <= 0 && !(avg !== null && avg > 0)) return null;
  const free = num(ctx.tobacco.hrvSmokeFree);
  const smoking = num(ctx.tobacco.hrvSmoking);
  const delta = free !== null && smoking !== null ? free - smoking : null;
  const free3 = num(ctx.tobacco.hrvFree3);
  const delta3 = num(ctx.tobacco.hrvDelta3);
  // §7 #9 quotes the last 3 smoke-free days (R3-11); the 30-day comparison is the fallback.
  // Only cite a difference that rounds to ≥ 1 ms — "0 ms higher" is noise, not feedback.
  let hrvClause = '';
  if (free3 !== null && delta3 !== null && Math.round(delta3) >= 1) {
    hrvClause = ` — on your last 3 smoke-free days HRV averaged ${n0(free3)} ms, ${n0(delta3)} ms higher`;
  } else if (delta !== null && Math.round(delta) >= 1 && free !== null) {
    hrvClause = ` — on smoke-free days your HRV averaged ${n0(free)} ms, ${n0(delta)} ms higher`;
  }
  const lead = avg === null ? `${n0(today)} today so far` : `${n0(today)} today vs your ${n1(avg)} average`;
  const streak = num(ctx.tobacco.streakDays) ?? 0;
  const action = today > 0 ? 'One fewer keeps the streak alive.' : streak > 0 ? `Stay at zero to extend your ${plural(streak, 'day')} streak.` : 'Stay at zero tonight to start a streak.';
  const band: Band = today <= 0 ? 'green' : avg !== null && today < avg ? 'yellow' : 'red';
  return card(ctx, 9, 'Tobacco', band, `${lead}${hrvClause}. ${action}`, COACH_CHIPS[6], INSIGHT_PRIORITY.tobacco);
};

const weightTrend: TemplateFn = (ctx, _profile, targets) => {
  const rate = num(ctx.weight.weeklyRateLb);
  const trend = num(ctx.weight.trend);
  if (rate === null || trend === null) return null;
  const pct = num(ctx.weight.weeklyRatePct) ?? (trend > 0 ? (rate / trend) * 100 : null);
  const rateStr = `${rate <= 0 ? 'down' : 'up'} ${n1(Math.abs(rate))} lb/wk${pct === null ? '' : ` (${n1(Math.abs(pct))}%/wk)`}`;
  const [lo, hi] = targets.weeklyRatePct;
  const bandStr = `${trim(lo)}–${trim(hi)}%`;
  const latest = num(ctx.weight.latest);
  const bump = latest !== null && latest - trend > WATER_BUMP_LB;
  const kcal = n0(num(ctx.nutrition.targets.kc) ?? targets.kcal);
  let verdict: string;
  let action: string;
  let band: Band;
  switch (ctx.weight.inBand) {
    case 'in':
      verdict = `right in the ${bandStr} target`;
      action = 'Hold your current intake.';
      band = 'green';
      break;
    case 'below': {
      verdict = `under the ${bandStr} target`;
      // Once the weekly check has a live cut (a full week outside the band — R3-3),
      // say so instead of "hold one more week", so the card and Trends never disagree.
      const sugg = num(ctx.expenditure.suggestedKcal);
      const cut = num(ctx.expenditure.suggestedDelta);
      const live = ctx.expenditure.valid && sugg !== null && cut !== null && cut < 0;
      action = stallWithShortSleep(ctx)
        ? `Fix sleep before cutting calories: you slept ${n1(num(ctx.sleep.hours) ?? 0)} h, and short sleep turns the deficit into muscle loss.`
        : live
          ? `Trim to ${n0(sugg as number)} kcal (−${n0(Math.abs(cut as number))}) from tomorrow — the rate has been under the band for a full week.`
          : `Hold ${kcal} kcal one more week, then trim 100–200 kcal.`;
      band = 'yellow';
      break;
    }
    case 'above':
      verdict = `faster than the ${bandStr} target`;
      action = 'Add ~150 kcal of carbs on lift days to protect lean mass.';
      band = 'yellow';
      break;
    default:
      verdict = 'target band not set';
      action = 'Keep weighing in daily so the trend settles.';
      band = 'neutral';
  }
  // The water clause is dropped in the stall case — the sleep message is the one that must land.
  const second = bump && !stallWithShortSleep(ctx) ? `Ignore today's scale bump; it's water — ${lcFirst(action)}` : action;
  return card(ctx, 10, 'Weight trend', band, `Trend is ${n1(trend)} lb, ${rateStr} — ${verdict}. ${second}`, COACH_CHIPS[3], INSIGHT_PRIORITY.weight);
};

const bedtimeConsistency: TemplateFn = (ctx, profile) => {
  const sd = num(ctx.sleep.bedtimeSdMin);
  if (sd === null || sd <= BEDTIME_SD_YELLOW) return null;
  const red = sd > BEDTIME_SD_RED;
  const body = `Your bedtime swung ${n0(sd)} min this week. Aiming for ${clock(profile.bedTarget)} nightly does more for recovery than total hours.`;
  return card(ctx, 11, 'Bedtime consistency', red ? 'red' : 'yellow', body, 'How do I make my bedtime more consistent?', red ? INSIGHT_PRIORITY.consistencyPromoted : INSIGHT_PRIORITY.consistency);
};

const caffeine: TemplateFn = (ctx, profile) => {
  const t = ctx.nutrition.caffeineAfterCutoff;
  if (!t) return null;
  const at = minutesSinceNoon(t);
  const bed = minutesSinceNoon(profile.bedTarget);
  const hrs = at !== null && bed !== null ? (bed - at) / 60 : null;
  const within = hrs === null ? '' : hrs > 0 ? ` — within ${n1(hrs)} h of bed` : ' — past your bed target';
  const body = `You logged caffeine at ${clock(t)}${within}. Cut off by ${clock(profile.caffeineCutoff)} tomorrow to protect deep sleep.`;
  return card(ctx, 12, 'Caffeine', 'yellow', body, 'Is afternoon caffeine hurting my sleep?', INSIGHT_PRIORITY.caffeine);
};

/** #13 — lab-linked, so the fish-oil aside carries the "confirm with your doctor" cue. */
const fishFrequency: TemplateFn = (ctx, profile) => {
  const fish = num(ctx.frequency.fishServings7d);
  const marker = findMarker(ctx, profile, 'omega3') ?? findMarker(ctx, profile, 'omega');
  if (fish === null || fish >= FISH_MIN_7D || !marker || marker.status !== 'low') return null;
  const body = `You've had fish ${n0(fish)}× this week. With your omega-3 index at ${markerValue(marker)}, one more oily-fish meal (or fish oil — confirm dosing with your doctor) moves the needle.`;
  return card(ctx, 13, 'Fish this week', 'yellow', body, COACH_CHIPS[7], INSIGHT_PRIORITY.lab);
};

/** #14 — elevated lead escalates to a physician; the home-cooking nudge only reduces exposure. */
const homeCooked: TemplateFn = (ctx, profile) => {
  const pct = num(ctx.frequency.restaurantPct7d);
  const lead = findMarker(ctx, profile, 'lead');
  if (pct === null || pct < RESTAURANT_PCT_MIN || !lead || (lead.status !== 'elevated' && lead.status !== 'high')) return null;
  const body = `${n0(pct)}% of meals were restaurant this week. Given your elevated lead (${markerValue(lead)} — follow up with your doctor), cooking 1–2 more meals at home lowers exposure and sodium.`;
  return card(ctx, 14, 'Home cooking', 'yellow', body, 'What should I ask my doctor about my lead level?', INSIGHT_PRIORITY.lab);
};

const TEMPLATES: TemplateFn[] = [sleepDebt, recovery, proteinPace, calories, fatFloor, carbDayType, steps, tobacco, weightTrend, bedtimeConsistency, caffeine, fishFrequency, homeCooked];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate every §7 template against the context, apply the promotion rules,
 * and return the top `max` (default 3) by priority — ties broken by template
 * number so the order is deterministic.
 */
export function generateInsights(ctx: CoachContext, profile: Profile, targets: Targets, opts: { max?: number } = {}): Insight[] {
  const max = Math.max(0, Math.floor(opts.max ?? 3));
  if (max === 0) return [];
  const cards: Insight[] = [];
  for (const t of TEMPLATES) {
    try {
      const c = t(ctx, profile, targets);
      if (c) cards.push(c);
    } catch {
      // A malformed context field must never take the dashboard down; skip the card.
    }
  }
  if (stallWithShortSleep(ctx)) {
    for (const c of cards) {
      if (c.template === '1') c.priority = INSIGHT_PRIORITY.sleepDebtStall;
      else if (c.template === '10') c.priority = INSIGHT_PRIORITY.weightStall;
      else if (c.template === '5') c.priority = INSIGHT_PRIORITY.caloriesStall;
    }
  }
  cards.sort((a, b) => b.priority - a.priority || Number(a.template) - Number(b.template));
  return cards.slice(0, max);
}

export interface SuggestedPrompts {
  today: string[];
  sleep: string[];
  recovery: string[];
  nutrition: string[];
}

/** Contextual coach chips per tile (WHOOP pattern) — 2–3 each, chosen by state. */
export function suggestedPrompts(ctx: CoachContext): SuggestedPrompts {
  const band = ctx.readiness.band;
  const tobaccoToday = (num(ctx.tobacco.today) ?? 0) > 0;
  const debt = num(ctx.sleep.debtMin) ?? 0;
  const sd = num(ctx.sleep.bedtimeSdMin) ?? 0;

  const today = pick(
    [
      COACH_CHIPS[0],
      band === 'red' ? COACH_CHIPS[2] : ctx.dayType === 'lift' ? COACH_CHIPS[4] : COACH_CHIPS[1],
      tobaccoToday ? COACH_CHIPS[6] : debt >= SLEEP_DEBT_MIN ? COACH_CHIPS[5] : null,
    ],
    [COACH_CHIPS[1], COACH_CHIPS[3]],
  );
  const sleep = pick(
    [
      COACH_CHIPS[5],
      debt >= SLEEP_DEBT_MIN ? 'How do I clear my sleep debt this week?' : null,
      sd > BEDTIME_SD_YELLOW ? 'How do I make my bedtime more consistent?' : null,
      ctx.nutrition.caffeineAfterCutoff ? 'Is afternoon caffeine hurting my sleep?' : null,
    ],
    ["What's my ideal bedtime tonight?", 'How much sleep do I need tonight?'],
  );
  const recoveryChips = pick(
    [
      band === 'red' ? COACH_CHIPS[2] : COACH_CHIPS[0],
      band === 'green' ? 'How hard can I push today?' : band === 'red' ? 'What should I do on a red day?' : 'Train or hold loads today?',
      ctx.hrv.band === 'low' || ctx.hrv.band === 'unbalanced' ? 'Why is my HRV outside my normal range?' : tobaccoToday ? 'Is tobacco hurting my HRV?' : null,
    ],
    ["What's driving my recovery score?", COACH_CHIPS[2]],
  );
  const proteinLeft = num(ctx.nutrition.remaining.p) ?? 0;
  const proteinTarget = num(ctx.nutrition.targets.p);
  const nutrition = pick(
    [
      COACH_CHIPS[1],
      ctx.nutrition.fatBelowFloor
        ? `How do I reach my ${n0(num(ctx.nutrition.targets.fatFloor) ?? 60)} g fat floor?`
        : proteinLeft > 0 && proteinTarget !== null
          ? `How do I hit ${n0(proteinTarget)} g protein today?`
          : null,
      ctx.dayType === 'lift' ? COACH_CHIPS[4] : ctx.weight.weeklyRateLb !== null ? COACH_CHIPS[3] : null,
    ],
    [COACH_CHIPS[3], COACH_CHIPS[7]],
  );
  return { today, sleep, recovery: recoveryChips, nutrition };
}

/** Dedupe, drop nulls, pad from `fill` to at least 2, cap at 3. */
function pick(primary: Array<string | null>, fill: string[]): string[] {
  const out: string[] = [];
  for (const p of [...primary, ...fill]) {
    if (p && !out.includes(p)) out.push(p);
    if (out.length === 3) break;
  }
  return out;
}

export interface EmptyStates {
  protein?: string;
  weight?: string;
  hrv?: string;
  sleep?: string;
}

/** §1 empty-state copy — instructive, one line, only for tiles that have nothing to show. */
export function emptyStates(ctx: CoachContext): EmptyStates {
  const out: EmptyStates = {};
  if ((num(ctx.nutrition.mealsLogged) ?? 0) <= 0 && (num(ctx.nutrition.totals.p) ?? 0) <= 0) {
    out.protein = 'Log your first meal to see protein remaining.';
  }
  if (num(ctx.weight.trend) === null || (num(ctx.weight.weighInsThisWeek) ?? 0) < 5) {
    out.weight = 'Weigh in 5+ days this week so your trend and expenditure calibrate.';
  }
  // One "baseline established" gate for the tile and the hero (R3-10): hrv.ts's
  // 21-readings-in-30-days rule, carried on the context; legacy contexts fall back to the count.
  const hrvDays = num(ctx.hrv.daysOfData) ?? num(ctx.hrv.delta.n) ?? 0;
  const established = ctx.hrv.baselineEstablished ?? hrvDays >= BASELINE_READINGS;
  if (num(ctx.hrv.today) === null && num(ctx.hrv.baseline7) === null) {
    out.hrv = 'Log HRV or connect WHOOP to start your baseline.';
  } else if (ctx.hrv.band === 'insufficient' || !established) {
    out.hrv = `Baseline forms after ~3 weeks of HRV — ${plural(hrvDays, 'day')} logged so far.`;
  }
  if (num(ctx.sleep.hours) === null) {
    out.sleep = "Log last night's sleep or connect WHOOP to see hours vs need.";
  } else if (num(ctx.sleep.bedtimeSdMin) === null) {
    out.sleep = 'Tap "Going to bed" nightly — consistency shows after 3 nights.';
  }
  return out;
}
