/**
 * Insight cards — SPEC §7 (templates #1–#26) plus the promotion rules in
 * "Thresholds that should change behavior/targets", the coach chips (§4),
 * the per-tile suggested prompts (WHOOP pattern) and the Today empty states (§1).
 *
 * This module computes no metrics: it reads a fully-built CoachContext
 * (engine/context.ts) and turns *state* into cards. It imports the *types* of
 * the v3 analysis blocks (training, stress, energy, impact, changepoints) but
 * never the engine modules that produce them — every number arrives as an
 * argument. The two exceptions are a threshold and a cue rule those modules own
 * and this one must not restate (`BASELINE_READINGS`, `illnessDoctorCue`): a
 * rule copied into a card is a rule that drifts. Pure and deterministic: no clock, no
 * randomness; ids are `ins-<template>-<date>` so a card keeps its identity
 * across re-renders.
 *
 * Copy rules (§7): ≤2 sentences, name the number, one action verb, band colour
 * by state. Every number comes from the context; when a datapoint is missing
 * the clause that needs it is dropped, and when the whole block is missing the
 * template renders nothing rather than a half-finished sentence.
 *
 * **Ranking (v3).** `priority = base + (red +12 | yellow +5 | green/neutral −8)
 * − 4 · streak`, where `streak` is the number of consecutive prior days the
 * same template was shown (`settings.insightHistory`, passed in). The decay is
 * a product decision, not a finding: it stops one yellow card owning the top
 * slot all week, and at −4/day a yellow card gives the slot up inside a week.
 *
 * **ACWR is descriptive, never an alert** (Impellizzeri 2020 — the ratio has no
 * demonstrated predictive validity), so the old ACWR card is gone and template
 * #18 leads on the week-on-week load ramp instead.
 */
import type {
  Band,
  BloodMarker,
  Changepoint,
  CoachContext,
  EnergyContext,
  HHMM,
  ISODate,
  Insight,
  ImpactContext,
  Muscle,
  Profile,
  ResilienceBand,
  SessionType,
  StressContext,
  Targets,
  TrainingContext,
} from '../data/types';
import { addDays, formatClock, formatDateShort, hhmmToMinutes, minutesSinceNoon, minutesSinceNoonToHHMM } from '../lib/dates';
import { fmt, fmtWeight, round } from '../lib/format';
import { BASELINE_READINGS } from './hrv';
import { illnessDoctorCue } from './stress';

/**
 * The coach quick-prompt chips (§4), verbatim and in order. Indices 0–7 are the
 * original eight; 8–11 were added with the training and stress stacks and are
 * referenced by index from the new templates, so nothing here is reordered.
 */
export const COACH_CHIPS: string[] = [
  'Should I train today?',
  'What should I eat now?',
  'Why is my recovery low?',
  "How's my weight trend — adjust calories?",
  'Plan my carbs for a lift day.',
  "How did last night's sleep affect me?",
  'Help me cut back tobacco today.',
  'Are my vitamin D / ferritin / omega-3 habits on track?',
  'What should I lift today?',
  'Am I overtraining?',
  'Why am I so stressed?',
  'When will I have energy today?',
];

/**
 * Sort priorities (higher first) *before* the band bonus and streak decay.
 * Consistency jumps to 95 when bedtime SD > 60 min ("promote a consistency card
 * above duration cards"); the sleep-debt card jumps to 98 — above a red
 * recovery card even after both take their band bonus — when fat loss has
 * stalled AND sleep is short, while the weight and calorie cards drop, so the
 * app asks for sleep before a calorie cut (Nedeltcheva 2010: short sleep turns
 * the deficit into lean loss).
 */
export const INSIGHT_PRIORITY = {
  recovery: 90, sleepDebt: 80, sleepDebtStall: 98, consistency: 70, consistencyPromoted: 95, protein: 75, fatFloor: 72,
  weight: 65, weightStall: 45, calories: 60, caloriesStall: 40, caffeine: 58, tobacco: 55, steps: 50, carbs: 45, lab: 40,
  // -- v3 blocks -----------------------------------------------------------
  illness: 96, deload: 85, strainOutliers: 82, loadRamp: 78, stressTrend: 76, verdictModified: 74,
  overload: 68, personalRecord: 66, impact: 64, belowMev: 62, resilience: 56, regimeShift: 54,
} as const;

/** Band bonus applied to every card's base priority. */
export const INSIGHT_BAND_BONUS: Readonly<Record<Band, number>> = { red: 12, yellow: 5, green: -8, neutral: -8 };
/** Priority lost per consecutive prior day the same template was shown. */
export const INSIGHT_STREAK_DECAY = 4;
/** How far back `insightHistory` is walked when counting a streak. */
export const INSIGHT_HISTORY_DAYS = 14;

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
const BEDTIME_MIN_NIGHTS = 3; // #11 needs three nights before it calls a swing a habit
/**
 * #9: the smoke-free vs smoking comparison needs this many paired days on EACH
 * side (the same 5/5 gate `impact` uses, which is WHOOP's) …
 */
const TOBACCO_MIN_N = 5;
/**
 * … and a difference this large in ms. **Heuristic**: night-to-night rMSSD
 * moves by more than a millisecond on its own, so a 1 ms gap between two means
 * is measurement noise dressed as feedback.
 */
const TOBACCO_MIN_DELTA_MS = 2;
/** #18: weekly acute-load rise the body absorbs comfortably (Gabbett's 10% rule of thumb — a heuristic, not a validated threshold). */
const LOAD_RAMP_PCT = 10;
/** Where the ramp card turns red. **Heuristic** — no published cut point exists. */
const LOAD_RAMP_RED_PCT = 30;
/** #21: the DALDA rule — three consecutive days worse than normal is a call to act. */
const CHECKIN_WORSE_RUN = 3;
/** Where it turns red. **Heuristic** — DALDA defines the three-day rule, not a second tier. */
const CHECKIN_WORSE_RUN_RED = 5;
/** #22: Apple Vitals' "≥ 2 of 5 overnight metrics are outliers"; ≥ 3 is Oura's major band. */
const STRAIN_OUTLIER_MIN = 2;
const STRAIN_OUTLIER_MAJOR = 3;

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
/**
 * Lower-case the first letter only when it starts an ordinary word, so an
 * engine label folded mid-sentence reads "resting HR" but "HRV" and "SpO₂"
 * survive intact rather than becoming "hRV".
 */
const softLower = (s: string): string => (/^[A-Z][a-z]/.test(s) ? lcFirst(s) : s);
/**
 * Weights and rates are stored in lb; the copy follows `profile.units` (R1-12:
 * a kg user sees "77.9 kg" and "0.4 kg/wk", never a lb figure). Always the
 * absolute value — the templates supply the direction word.
 */
const weightStr = (lb: number, profile: Profile): string => fmtWeight(Math.abs(lb), profile.units === 'kg' ? 'kg' : 'lb');
/** "a, b and c" — Oxford-comma-free, so a reason list reads as one clause. */
const joinList = (xs: string[]): string =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
/** 'front-delts' → 'Front delts'. */
const muscleLabel = (m: Muscle | string): string => {
  const s = String(m).replace(/-/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
};
/** A finite string of free-form engine text, trimmed of a trailing full stop. */
const clause = (s: unknown): string | null => {
  if (typeof s !== 'string') return null;
  const t = s.trim().replace(/[.\s]+$/, '');
  return t.length > 0 ? t : null;
};

function card(ctx: CoachContext, template: number, title: string, band: Band, body: string, coachPrompt: string, priority: number): Insight {
  return { id: `ins-${template}-${ctx.today}`, template: String(template), band, title, body, coachPrompt, priority };
}

/**
 * Consecutive prior days (today excluded) on which `template` was shown, read
 * from `settings.insightHistory`. A day the app never rendered a card for ends
 * the streak — an unshown day is not a shown day.
 */
export function insightStreak(
  history: Readonly<Record<ISODate, string[]>> | undefined,
  template: string,
  today: ISODate,
  maxDays = INSIGHT_HISTORY_DAYS,
): number {
  if (!history) return 0;
  let streak = 0;
  for (let i = 1; i <= Math.max(0, Math.floor(maxDays)); i++) {
    const ids = history[addDays(today, -i)];
    if (!Array.isArray(ids) || !ids.includes(template)) break;
    streak++;
  }
  return streak;
}

/** `base + band bonus − 4 · streak`. */
export function insightPriority(base: number, band: Band, streak = 0): number {
  return round(base + (INSIGHT_BAND_BONUS[band] ?? 0) - INSIGHT_STREAK_DECAY * Math.max(0, streak));
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

/**
 * Everything a template may need beyond the context: the shown-history the
 * streak decay reads, and the previous evaluation's bands (the engine holds no
 * state, so "this changed" facts are passed in).
 */
export interface InsightOpts {
  /** Cards to return, highest priority first. Default 3. */
  max?: number;
  /** `settings.insightHistory` — template ids shown per day, for the streak decay. */
  history?: Readonly<Record<ISODate, string[]>>;
  /** State from the last evaluation, for the "band changed" templates. */
  previous?: { resilienceBand?: ResilienceBand | null };
}

type TemplateFn = (ctx: CoachContext, profile: Profile, targets: Targets, opts: InsightOpts) => Insight | null;

const sleepDebt: TemplateFn = (ctx, profile) => {
  const debt = num(ctx.sleep.debtMin);
  if (debt === null || debt < SLEEP_DEBT_MIN) return null;
  const hrs = num(ctx.sleep.hours);
  const after = hrs === null ? '' : ` after last night's ${n1(hrs)} h`;
  const body = `You're carrying ${n0(debt)} min of sleep debt${after}. Get to bed by ${clock(bedtimeToClear(ctx, profile))} to clear it.`;
  return card(ctx, 1, 'Sleep debt', debt >= SLEEP_DEBT_RED_MIN ? 'red' : 'yellow', body, COACH_CHIPS[5], INSIGHT_PRIORITY.sleepDebt);
};

/**
 * #2 (red) or #3 (green) — never both; yellow/neutral readiness gets no
 * recovery card.
 *
 * When `readiness.forced` is set the red band is not the score's — the HRV
 * forcing rule put it there, over a score that was green or yellow. That is the
 * one case where the card is repeating a verdict the *heuristic* produced, so it
 * names the rule and its evidence label (`ctx.hrv.forcingLabel`, from
 * `FORCING_EVIDENCE`). A hedge that only fires when the hedged rule is idle is
 * not a hedge.
 */
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
    const label = ctx.readiness.forced === true ? (ctx.hrv.forcingLabel ?? null) : null;
    const forcedClause = label ? ` That call is our HRV forcing rule — ${label}.` : '';
    return card(ctx, 2, 'Recovery low', 'red', `${lead}${hrvClause} — keep today light: mobility or a walk.${forcedClause}`, COACH_CHIPS[2], INSIGHT_PRIORITY.recovery);
  }
  const lead = score === null ? 'Recovery is green' : `Recovery ${n0(score)}% (green)`;
  const action =
    ctx.dayType === 'lift' && ctx.sessionType !== 'rest'
      ? `progress your ${SESSION_LABEL[ctx.sessionType] ?? ctx.sessionType} loads today.`
      : 'rest day, so bank it and push loads at your next session.';
  return card(ctx, 3, 'Recovery high', 'green', `${lead}. You're primed — ${action}`, COACH_CHIPS[0], INSIGHT_PRIORITY.recovery);
};

/**
 * #4 — carries the §6.5 "< 0.4 g/kg meal slot" nudge when the last occasion
 * fell short (R3-7). A per-meal need **above** the 0.55 g/kg optimum is a note,
 * never a warning: Trommelen 2023 showed a 100 g bolus is used rather than
 * wasted, so a big sitting is fine and only a *small* one is a problem.
 */
const proteinPace: TemplateFn = (ctx, _profile, targets) => {
  const per = num(ctx.nutrition.proteinPerMealNeeded);
  const left = num(ctx.nutrition.remaining.p) ?? 0;
  const meals = num(ctx.nutrition.mealsLeft) ?? 0;
  if (per === null || left <= 0 || meals <= 0) return null;
  const sofar = num(ctx.nutrition.totals.p) ?? 0;
  const target = num(ctx.nutrition.targets.p) ?? targets.protein;
  const optimum = num(ctx.nutrition.maxPerMeal) ?? PROTEIN_PER_MEAL_HI;
  const big = per > optimum;
  const suggest = big ? 'chicken tikka (200 g ≈ 50 g protein)' : 'tandoori prawns or chicken tikka';
  const lastP = num(ctx.nutrition.lastMealProtein);
  const minMeal = num(ctx.nutrition.minPerMeal);
  const lowSlot = ctx.nutrition.lastMealBelowMin === true && lastP !== null && minMeal !== null;
  const lead = `You're at ${n0(sofar)} g protein with ${plural(meals, 'meal')} left — you need ~${n0(per)} g each to hit ${n0(target)} g.`;
  const body = lowSlot
    ? `${lead} Your last meal came in at ${n0(lastP as number)} g, under your ${n0(minMeal as number)} g floor — lead your next meal with ${suggest}.`
    : big
      ? `${lead} That's a bigger sitting than your usual ${n0(optimum)} g and your body still uses it — lead with ${suggest}.`
      : `${lead} Lead your next meal with ${suggest}.`;
  return card(ctx, 4, 'Protein pace', lowSlot ? 'yellow' : 'neutral', body, COACH_CHIPS[1], INSIGHT_PRIORITY.protein);
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
          ? `Stay under to hold your ${weightStr(rate, profile)}/wk trend.`
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
  const nFree = num(ctx.tobacco.nFree);
  const nSmoke = num(ctx.tobacco.nSmoke);
  // §7 #9 quotes the last 3 smoke-free days (R3-11); the 30-day comparison is
  // the fallback. Both are gated on ≥ 5 paired days a side and a ≥ 2 ms
  // difference — a comparison of means without its counts is not a finding, and
  // a 1 ms gap between two 30-day means is measurement noise. The counts are
  // printed, never implied.
  const powered =
    nFree !== null &&
    nSmoke !== null &&
    nFree >= TOBACCO_MIN_N &&
    nSmoke >= TOBACCO_MIN_N &&
    delta !== null &&
    Math.round(delta) >= TOBACCO_MIN_DELTA_MS;
  let hrvClause = '';
  if (powered && free3 !== null && delta3 !== null && Math.round(delta3) >= TOBACCO_MIN_DELTA_MS) {
    hrvClause = ` — on your last 3 smoke-free days HRV averaged ${n0(free3)} ms, ${n0(delta3)} ms above your ${plural(nSmoke as number, 'smoking day')}`;
  } else if (powered && free !== null && delta !== null && Math.round(delta) >= TOBACCO_MIN_DELTA_MS) {
    hrvClause = ` — across ${plural(nFree as number, 'smoke-free day')} HRV averaged ${n0(free)} ms, ${n0(delta)} ms above your ${plural(nSmoke as number, 'smoking day')}`;
  }
  const lead = avg === null ? `${n0(today)} today so far` : `${n0(today)} today vs your ${n1(avg)} average`;
  const streak = num(ctx.tobacco.streakDays) ?? 0;
  const action = today > 0 ? 'One fewer keeps the streak alive.' : streak > 0 ? `Stay at zero to extend your ${plural(streak, 'day')} streak.` : 'Stay at zero tonight to start a streak.';
  const band: Band = today <= 0 ? 'green' : avg !== null && today < avg ? 'yellow' : 'red';
  return card(ctx, 9, 'Tobacco', band, `${lead}${hrvClause}. ${action}`, COACH_CHIPS[6], INSIGHT_PRIORITY.tobacco);
};

const weightTrend: TemplateFn = (ctx, profile, targets) => {
  const rate = num(ctx.weight.weeklyRateLb);
  const trend = num(ctx.weight.trend);
  if (rate === null || trend === null) return null;
  const pct = num(ctx.weight.weeklyRatePct) ?? (trend > 0 ? (rate / trend) * 100 : null);
  // R7-10: the % rate at 2 dp, as the Trends card prints it — at 1 dp a
  // 0.45 %/wk rate would read "0.5%/wk — under the 0.5–1% target".
  const rateStr = `${rate <= 0 ? 'down' : 'up'} ${weightStr(rate, profile)}/wk${pct === null ? '' : ` (${fmt(Math.abs(pct), 2)}%/wk)`}`;
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
  return card(ctx, 10, 'Weight trend', band, `Trend is ${weightStr(trend, profile)}, ${rateStr} — ${verdict}. ${second}`, COACH_CHIPS[3], INSIGHT_PRIORITY.weight);
};

/** #11 — gated on ≥ 3 nights: an SD over one or two nights is not a habit. */
const bedtimeConsistency: TemplateFn = (ctx, profile) => {
  const sd = num(ctx.sleep.bedtimeSdMin);
  const nights = num(ctx.sleep.bedtimeNights);
  if (sd === null || sd <= BEDTIME_SD_YELLOW) return null;
  if (nights === null || nights < BEDTIME_MIN_NIGHTS) return null;
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

// ---------------------------------------------------------------------------
// Templates #15–#26 — the v3 blocks.
//
// Every one of these reads a block that may simply not be there yet (no
// workouts logged, no overnight signals, not enough days for an effect). The
// rule is absolute: **a missing block renders nothing**, never a sentence with
// a hole in it. Each template's first two lines are the guard.
// ---------------------------------------------------------------------------

/** #15 — the next lift that is ready to move up. */
const overloadSuggestion: TemplateFn = (ctx) => {
  const t: TrainingContext | undefined = ctx.training;
  if (!t || !Array.isArray(t.plannedExercises)) return null;
  const next = t.plannedExercises.find((p) => p.mode === 'progress' && num(p.loadKg) !== null && clause(p.name) !== null);
  if (!next) return null;
  const load = num(next.loadKg) as number;
  const [lo, hi] = Array.isArray(next.reps) ? next.reps : [0, 0];
  const reps = num(lo) === null || num(hi) === null ? null : lo === hi ? n0(lo) : `${n0(lo)}–${n0(hi)}`;
  const sets = num(next.sets);
  if (reps === null || sets === null || sets <= 0) return null;
  const last = next.last && num(next.last.loadKg) !== null ? ` Last time: ${trim(next.last.loadKg, 1)} kg.` : '';
  const body = `${next.name} is ready to move up — take ${trim(load, 1)} kg for ${n0(sets)}×${reps}.${last}`;
  return card(ctx, 15, 'Progress this lift', 'green', body, COACH_CHIPS[8], INSIGHT_PRIORITY.overload);
};

/**
 * #16 — deload, and only ever *reactive*. Coleman 2024 (PeerJ) found a
 * scheduled mid-program deload produced no hypertrophy benefit, which is
 * exactly why the app will not put one on your calendar; it waits for the
 * signals and then says so.
 */
const deloadCard: TemplateFn = (ctx) => {
  const t: TrainingContext | undefined = ctx.training;
  if (!t || t.deload?.recommended !== true) return null;
  const reasons = (t.deload.reasons ?? []).map(clause).filter((r): r is string => r !== null);
  if (reasons.length === 0) return null;
  const body =
    `${joinList(reasons.map(softLower))} — cut sets ~40% and load ~10% for a week. ` +
    `This one is reactive: a deload put on the calendar in advance showed no hypertrophy benefit (Coleman 2024).`;
  return card(ctx, 16, 'Deload week', 'yellow', body, COACH_CHIPS[9], INSIGHT_PRIORITY.deload);
};

/** #17 — volume under MEV. An opportunity, never a scolding: these are the cheapest sets on the table. */
const belowMev: TemplateFn = (ctx) => {
  const t: TrainingContext | undefined = ctx.training;
  if (!t || !Array.isArray(t.weeklySets)) return null;
  const under = t.weeklySets
    .filter((v) => v.status === 'below-mev' && num(v.sets) !== null && num(v.mev) !== null && v.mev > v.sets)
    .sort((a, b) => b.mev - b.sets - (a.mev - a.sets) || String(a.muscle).localeCompare(String(b.muscle)));
  if (under.length === 0) return null;
  const top = under[0];
  const gap = Math.max(1, Math.ceil(top.mev - top.sets));
  const more =
    under.length > 1
      ? ` ${plural(under.length - 1, 'other muscle')} ${under.length === 2 ? 'has' : 'have'} the same room.`
      : '';
  const body = `${muscleLabel(top.muscle)} got ${plural(top.sets, 'set')} this week — ${n0(gap)} more clears the ${n0(top.mev)} where growth starts, and that is the easiest gain on your plan.${more}`;
  return card(ctx, 17, 'Room to grow', 'neutral', body, COACH_CHIPS[8], INSIGHT_PRIORITY.belowMev);
};

/**
 * #18 — the week-on-week load ramp. This **replaces** the old ACWR alert:
 * Impellizzeri 2020 showed the acute:chronic ratio has no demonstrated
 * predictive validity, so ACWR stays on the chart as description and the
 * actionable number is how much more you did than last week.
 */
const loadRamp: TemplateFn = (ctx) => {
  const t: TrainingContext | undefined = ctx.training;
  const pct = t ? num(t.load?.weekOverWeekPct) : null;
  if (!t || pct === null || pct <= LOAD_RAMP_PCT) return null;
  const band: Band = pct >= LOAD_RAMP_RED_PCT ? 'red' : 'yellow';
  const weekly = num(t.load.weeklyLoad);
  const load = weekly === null ? '' : ` (${n0(weekly)} load units)`;
  const body = `Training load is up ${n0(pct)}% on last week${load} — past the ~${n0(LOAD_RAMP_PCT)}%/wk your body absorbs comfortably. Hold this week's volume where it is and let the jump settle.`;
  return card(ctx, 18, 'Load ramp', band, body, COACH_CHIPS[9], INSIGHT_PRIORITY.loadRamp);
};

const PR_KIND: Record<string, { label: string; unit: string }> = {
  weight: { label: 'weight', unit: 'kg' },
  reps: { label: 'reps', unit: 'reps' },
  e1rm: { label: 'estimated 1RM', unit: 'kg' },
};

/** #19 — a PR in the last 7 days. */
const personalRecord: TemplateFn = (ctx) => {
  const t: TrainingContext | undefined = ctx.training;
  if (!t || !Array.isArray(t.prs7d) || t.prs7d.length === 0) return null;
  const prs = [...t.prs7d]
    .filter((p) => num(p.value) !== null && clause(p.name) !== null)
    .sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0) || b.value - a.value || a.name.localeCompare(b.name));
  const pr = prs[0];
  if (!pr) return null;
  const kind = PR_KIND[pr.kind] ?? { label: String(pr.kind), unit: '' };
  const unit = kind.unit ? ` ${kind.unit}` : '';
  const prev = num(pr.previous);
  const was = prev === null ? '' : `, up from ${trim(prev, 1)}${unit}`;
  const rest = prs.length > 1 ? ` ${plural(prs.length - 1, 'more PR')} this week.` : '';
  const body = `New ${kind.label} PR on ${pr.name}: ${trim(pr.value, 1)}${unit}${was}.${rest}`;
  return card(ctx, 19, 'Personal record', 'green', body, COACH_CHIPS[8], INSIGHT_PRIORITY.personalRecord);
};

/** #20 — something moved today's verdict after the score was computed. */
const verdictModified: TemplateFn = (ctx) => {
  const mods = (ctx.readiness.modifiers ?? []).filter((m) => m.effect === 'downgrade');
  const m = mods.find((x) => clause(x.reason) !== null && clause(x.label) !== null);
  const verdict = clause(ctx.readiness.training);
  if (!m || verdict === null) return null;
  const score = num(ctx.readiness.score);
  const scored = score === null ? '' : ` Your score alone read ${n0(score)}%.`;
  const body = `${m.label} moved today's call to "${verdict}" — ${softLower(clause(m.reason) as string)}.${scored}`;
  return card(ctx, 20, 'Verdict adjusted', 'yellow', body, COACH_CHIPS[0], INSIGHT_PRIORITY.verdictModified);
};

/** #21 — the DALDA rule on the daily check-in: three days worse than normal is a call to act. */
const stressCheckInTrend: TemplateFn = (ctx) => {
  const s: StressContext | undefined = ctx.stress;
  const run = s ? num(s.checkIn?.worseRun) : null;
  if (!s || run === null || run < CHECKIN_WORSE_RUN) return null;
  const total = num(s.checkIn.total);
  const hooper = total === null ? '' : ` (Hooper ${n0(total)}/28)`;
  const band: Band = run >= CHECKIN_WORSE_RUN_RED ? 'red' : 'yellow';
  const body = `Your check-in has come in worse than normal ${plural(run, 'day')} running${hooper}. Three in a row is the cue to take an easy day rather than push through it.`;
  return card(ctx, 21, 'Check-in trend', band, body, COACH_CHIPS[10], INSIGHT_PRIORITY.stressTrend);
};

/**
 * #22 — how many overnight signals sit outside the personal range. Apple
 * Vitals' "≥ 2 of 5 metrics are outliers" and Oura's three levels: far more
 * defensible than any single fused stress number, so it is what leads.
 */
const strainOutliers: TemplateFn = (ctx) => {
  const s: StressContext | undefined = ctx.stress;
  if (!s || s.calibrating === true) return null;
  const dev = num(s.signalsDeviating);
  const avail = num(s.signalsAvailable);
  if (dev === null || avail === null || avail <= 0 || dev < STRAIN_OUTLIER_MIN) return null;
  const names = (s.outliers ?? []).filter((o) => o.deviating).map((o) => clause(o.label)).filter((l): l is string => l !== null);
  const which = names.length ? ` — ${joinList(names.map(softLower))}` : '';
  const major = dev >= STRAIN_OUTLIER_MAJOR;
  const action = major ? 'Treat today as a recovery day.' : 'Keep today moderate and check again tomorrow.';
  const body = `${n0(dev)} of ${n0(avail)} overnight signals are outside your range${which}. ${action}`;
  return card(ctx, 22, 'Overnight signals', major ? 'red' : 'yellow', body, COACH_CHIPS[10], INSIGHT_PRIORITY.strainOutliers);
};

const RESILIENCE_ORDER: ResilienceBand[] = ['limited', 'adequate', 'solid', 'strong', 'exceptional'];

/** #23 — the resilience band changed since the previous evaluation (passed in; the engine holds no state). */
const resilienceChange: TemplateFn = (ctx, _profile, _targets, opts) => {
  const r = ctx.stress?.resilience;
  const prev = opts.previous?.resilienceBand ?? null;
  const band = r?.band ?? null;
  if (!r || band === null || prev === null || prev === band) return null;
  if (!RESILIENCE_ORDER.includes(band) || !RESILIENCE_ORDER.includes(prev)) return null;
  const up = RESILIENCE_ORDER.indexOf(band) > RESILIENCE_ORDER.indexOf(prev);
  const score = num(r.score);
  const at = score === null ? '' : ` (${n0(score)}/100)`;
  const action = up
    ? 'Your recovery is outpacing your load — room to add work.'
    : 'Your load is outpacing your recovery — protect sleep before adding any.';
  const body = `Resilience moved from ${prev} to ${band}${at}. ${action}`;
  return card(ctx, 23, 'Resilience', up ? 'green' : 'yellow', body, COACH_CHIPS[9], INSIGHT_PRIORITY.resilience);
};

/**
 * #24 — conjunctive illness/overload flag. Copy is a pattern in the user's own
 * numbers, never a diagnosis.
 *
 * This is the highest-priority card on Today, so it is also where
 * `ILLNESS_DOCTOR_DAYS` has to be honoured: past that many days the card adds
 * the doctor cue (`illnessDoctorCue`, the engine's own rule — this template does
 * not invent a threshold). One easy day is a training decision; a pattern that
 * has not cleared in most of a week is one to take to a person.
 */
const illnessFlagCard: TemplateFn = (ctx) => {
  const s: StressContext | undefined = ctx.stress;
  if (!s || s.illness?.flag !== true) return null;
  const reasons = (s.illness.reasons ?? []).map(clause).filter((r): r is string => r !== null);
  if (reasons.length === 0) return null;
  const since = s.illness.since ? ` since ${formatDateShort(s.illness.since)}` : '';
  const cue = illnessDoctorCue(s.illness, ctx.today);
  const body =
    `Possible illness or heavy overload${since}: ${joinList(reasons.map(softLower))}. ` +
    `Take an easy day — this is a pattern in your own numbers, not a diagnosis.${cue ? ` ${cue}` : ''}`;
  return card(ctx, 24, 'Possible illness', 'red', body, COACH_CHIPS[2], INSIGHT_PRIORITY.illness);
};

/** Human phrasing for the behaviours `impact` reports; unknown keys fall back to the effect's own label. */
const BEHAVIOUR_PHRASE: Record<string, string> = {
  alcohol: 'drank',
  tobacco: 'smoked',
  lateCaffeine: 'had caffeine after your cutoff',
  lateEating: 'ate late',
  highLoad: 'trained hard',
  shortSleep: 'slept short',
  lateBedtime: 'went to bed late',
};
/** Metric label, unit, and whether up is good — used only to pick the card's colour. */
const IMPACT_METRIC: Record<string, { label: string; unit: string; upIsGood: boolean }> = {
  readiness: { label: 'recovery', unit: 'points', upIsGood: true },
  hrv: { label: 'HRV', unit: 'ms', upIsGood: true },
  rhr: { label: 'resting HR', unit: 'bpm', upIsGood: false },
  sleepHrs: { label: 'sleep', unit: 'h', upIsGood: true },
  osi: { label: 'overnight strain', unit: 'points', upIsGood: false },
};

/**
 * #25 — a behaviour effect the user's own data confirmed: "on the 9 days you
 * drank, recovery was 11 points lower, 95% CI 4–18". Only rendered when the
 * interval clears zero — a "confirmed" effect whose CI straddles zero is not
 * confirmed, and printing |lo|–|hi| for such an interval would be a lie.
 */
const behaviourImpactCard: TemplateFn = (ctx) => {
  const impact: ImpactContext | undefined = ctx.impact;
  const effects = impact?.effects ?? [];
  if (!impact || effects.length === 0) return null;
  const usable = effects.filter((e) => {
    const d = num(e.deltaMean);
    const lo = num(e.lo95);
    const hi = num(e.hi95);
    return d !== null && lo !== null && hi !== null && d !== 0 && lo * hi > 0 && num(e.nYes) !== null && num(e.nNo) !== null;
  });
  const best = [...usable].sort(
    (a, b) => a.qValue - b.qValue || Math.abs(b.deltaMean) - Math.abs(a.deltaMean) || a.behaviour.localeCompare(b.behaviour),
  )[0];
  if (!best) return null;
  const metric = IMPACT_METRIC[best.metric] ?? { label: clause(best.metric) ?? 'that metric', unit: '', upIsGood: true };
  const phrase = BEHAVIOUR_PHRASE[best.behaviour] ?? clause(best.label) ?? clause(best.behaviour);
  if (phrase === null) return null;
  const mag = Math.abs(best.deltaMean);
  const lo = Math.min(Math.abs(best.lo95), Math.abs(best.hi95));
  const hi = Math.max(Math.abs(best.lo95), Math.abs(best.hi95));
  const unit = metric.unit ? ` ${metric.unit}` : '';
  const dir = best.deltaMean < 0 ? 'lower' : 'higher';
  const adverse = metric.upIsGood ? best.deltaMean < 0 : best.deltaMean > 0;
  const confound = clause(best.confound);
  const note = confound ? ` Worth knowing: ${softLower(confound)}.` : '';
  const body = `On the ${plural(best.nYes, 'day')} you ${phrase}, ${metric.label} was ${trim(mag, 1)}${unit} ${dir}, 95% CI ${trim(lo, 1)}–${trim(hi, 1)} (against ${plural(best.nNo, 'day')} without).${note}`;
  return card(ctx, 25, 'Your own data', adverse ? 'yellow' : 'neutral', body, COACH_CHIPS[2], INSIGHT_PRIORITY.impact);
};

/** #26 — a confirmed regime shift: the baseline itself moved, so the old one is no longer the comparison. */
const regimeShift: TemplateFn = (ctx) => {
  const cps: Changepoint[] = ctx.changepoints ?? [];
  const usable = cps.filter(
    (c) => num(c.meanBefore) !== null && num(c.meanAfter) !== null && clause(c.label) !== null && typeof c.d === 'string' && c.d.length > 0,
  );
  const cp = [...usable].sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0) || (num(b.prob) ?? 0) - (num(a.prob) ?? 0))[0];
  if (!cp) return null;
  const dir = cp.meanAfter > cp.meanBefore ? 'up' : 'down';
  const body = `Your ${softLower(cp.label)} has settled at a new level since ${formatDateShort(cp.d)} — ${dir} from ${trim(cp.meanBefore, 1)} to ${trim(cp.meanAfter, 1)}. Your baseline now starts from that date, so today is compared with the new normal.`;
  return card(ctx, 26, 'New baseline', 'neutral', body, COACH_CHIPS[2], INSIGHT_PRIORITY.regimeShift);
};

const TEMPLATES: TemplateFn[] = [
  sleepDebt,
  recovery,
  proteinPace,
  calories,
  fatFloor,
  carbDayType,
  steps,
  tobacco,
  weightTrend,
  bedtimeConsistency,
  caffeine,
  fishFrequency,
  homeCooked,
  overloadSuggestion,
  deloadCard,
  belowMev,
  loadRamp,
  personalRecord,
  verdictModified,
  stressCheckInTrend,
  strainOutliers,
  resilienceChange,
  illnessFlagCard,
  behaviourImpactCard,
  regimeShift,
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate every template against the context, apply the promotion rules, score
 * each card `base + band bonus − 4 · streak`, and return the top `max`
 * (default 3) — ties broken by template number so the order is deterministic.
 *
 * The base priority each template returns is pre-bonus; this is where it
 * becomes the number on the card, so a caller reading `insight.priority` sees
 * the same value the sort used.
 */
export function generateInsights(ctx: CoachContext, profile: Profile, targets: Targets, opts: InsightOpts = {}): Insight[] {
  const max = Math.max(0, Math.floor(opts.max ?? 3));
  if (max === 0) return [];
  const cards: Insight[] = [];
  for (const t of TEMPLATES) {
    try {
      const c = t(ctx, profile, targets, opts);
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
  for (const c of cards) {
    c.priority = insightPriority(c.priority, c.band, insightStreak(opts.history, c.template, ctx.today));
  }
  cards.sort((a, b) => b.priority - a.priority || Number(a.template) - Number(b.template));
  return cards.slice(0, max);
}

export interface SuggestedPrompts {
  today: string[];
  sleep: string[];
  recovery: string[];
  nutrition: string[];
  training: string[];
  stress: string[];
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

  // -- v3 tiles: only ever offer a prompt whose block actually has data ------
  const t: TrainingContext | undefined = ctx.training;
  const s: StressContext | undefined = ctx.stress;
  const e: EnergyContext | undefined = ctx.energy;
  const training = pick(
    [
      COACH_CHIPS[8],
      t?.deload?.recommended === true
        ? 'Should I deload this week?'
        : (t?.plateaus?.length ?? 0) > 0
          ? 'Why has this lift stalled?'
          : (num(t?.load?.weekOverWeekPct) ?? 0) > LOAD_RAMP_PCT
            ? COACH_CHIPS[9]
            : null,
      (t?.weeklySets ?? []).some((v) => v.status === 'below-mev') ? 'Which muscles need more volume?' : null,
    ],
    [COACH_CHIPS[0], COACH_CHIPS[9]],
  );
  const stress = pick(
    [
      COACH_CHIPS[10],
      s?.illness?.flag === true
        ? 'Am I getting sick or just tired?'
        : (num(s?.signalsDeviating) ?? 0) >= STRAIN_OUTLIER_MIN
          ? 'Which overnight signals are off?'
          : (num(s?.checkIn?.worseRun) ?? 0) >= CHECKIN_WORSE_RUN
            ? 'What do I do about three bad days?'
            : null,
      e?.trough ? COACH_CHIPS[11] : null,
    ],
    [COACH_CHIPS[11], 'How do I get my stress down today?'],
  );
  return { today, sleep, recovery: recoveryChips, nutrition, training, stress };
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
