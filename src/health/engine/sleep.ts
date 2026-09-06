/**
 * §6.4 Sleep v3 — need, debt, regularity, circadian alignment, caffeine timing.
 *
 *   Sleep Need = Baseline + f(strain) + f(debt) − naps + circadian penalty
 *
 * **What changed in v3 and why (each constant is cited or labelled):**
 *
 * - **f(strain)** is a logistic in minutes: `60 / (1 + e^(−(strain − 13.5)/3))`
 *   → ≈2.4 min at strain 4, ≈22.6 at 12, ≈55.5 at 21. **HEURISTIC — no published
 *   source.** WHOOP publishes only that strain is a logarithmic 0–21 scale and
 *   that need rises with it; the midpoint (13.5, a hard-but-normal training day)
 *   and scale (3) are product calibration, not a finding. `STRAIN_ADD_IS_HEURISTIC`
 *   is exported so the UI can say so.
 * - **f(debt)** pays debt back gradually (never all in one night): `debt/3`,
 *   capped at 45 min. It is a pay-back *ask* that only appears in the displayed
 *   need — debt itself accrues against `baseline + f(strain) − naps`, and sleep
 *   above that pays it down (R3-2). Folding f(debt) into the accrual made debt
 *   compound by ×4/3 every night a user slept exactly their baseline.
 * - **Debt decays.** `debt_t = clamp(0.85·debt_{t−1} + (need − slept)·60, 0, 300)`
 *   over the last 28 nights; a night with no `slh` only decays. λ = 0.85 is a
 *   half-life of `ln 2 / ln(1/0.85) ≈ 4.3 days`, which matches **Kitamura 2016**
 *   (Sci Rep 6:35812, "Estimating individual optimal sleep duration and potential
 *   sleep debt"), where ≈1 h of potential sleep debt took ≈4 days of extended
 *   sleep to repay. v1 carried debt forever, so a single bad week followed a user
 *   around for a fortnight.
 * - **Repayment cap: 2 h per night** (`SLEEP_DEBT_REPAY_CAP_MIN`). One long night
 *   cannot retire a week of restriction. **Banks 2010** (Sleep 33(8):1013–26,
 *   dose–response of recovery sleep after chronic restriction): a single recovery
 *   night restored neither alertness nor performance to baseline; recovery is
 *   dose-dependent and takes multiple nights. v1 let a 10-hour Sunday zero the
 *   whole balance, which is the opposite of the physiology.
 * - **Circadian-delay penalty: +15 min** when last night's sleep midpoint sat
 *   more than 60 min later than the 14-night median. **Depner 2019** (Curr Biol
 *   29:957–967, "Ad libitum weekend recovery sleep fails to prevent metabolic
 *   dysregulation"): weekend catch-up sleep delayed the circadian phase and left
 *   insulin sensitivity *worse* than continuous restriction. So a lie-in is not
 *   praised for its hours — the reason string says it cost alignment. The 60-min
 *   trigger and the 15-min size are **calibration, not published quantities**
 *   (`CIRCADIAN_PENALTY_IS_HEURISTIC`); the *direction* is the finding. A boolean
 *   is not something a screen can render, so `CIRCADIAN_PENALTY_LABEL` says that
 *   in the user's own words and rides inside `circadianDelay().reason` — the only
 *   user-facing string about the penalty, and the one `tonightNeedReason` quotes
 *   — whenever the penalty is actually charged.
 * - **SRI — Sleep Regularity Index** (`sleepRegularityIndex`). **Phillips 2017**
 *   (Sci Rep 7:3216): the probability of being in the same sleep/wake state at
 *   two times 24 h apart, scaled `200·P − 100`, on a **1-minute grid**. 100 =
 *   identical every day, 0 = coin flip. Needs ≥ 14 nights (28 preferred) or it
 *   is null. **Windred 2024** (Sleep 47(1):zsad253, UK Biobank, n ≈ 60k): median
 *   SRI 81, and SRI predicted all-cause mortality *better than sleep duration* —
 *   hence the flag at < 70 (`SRI_FLAG_BELOW`, the low end of that cohort).
 * - **Social jetlag** (`socialJetlag`). MCTQ (**Wittmann/Roenneberg 2006**,
 *   Chronobiol Int 23:497–509): |midsleep on free days − midsleep on work days|.
 *   Free/work here is the training split's rest vs scheduled days (a `lift`
 *   override on the record wins), because that is the schedule this app knows.
 * - **Dose-aware caffeine cutoff** (`caffeineCutoff`). **Gardiner 2023** (Sleep
 *   Med Rev 69:101764, systematic review + meta-analysis, 24 studies): to avoid
 *   a reduction in total sleep time, coffee at **107 mg/250 mL** should be taken
 *   ≥ **8.8 h** before bed and a standard pre-workout serve at **217.5 mg**
 *   ≥ **13.2 h** before bed, while a cup of black tea (**47 mg**) had **no**
 *   cut-off. Those three pairs were verified against the published abstract; see
 *   `CAFFEINE_ANCHORS`. The curve is linear in ln(dose) between them, which is
 *   also what first-order caffeine elimination gives: the fitted slope of 6.2 h
 *   per ln-unit is a 4.3 h half-life down to a ≈26 mg residual. Above 217.5 mg
 *   the last segment is extrapolated and flagged. Sanity check at the top end:
 *   **Drake 2013** (J Clin Sleep Med 9:1195–1200) found 400 mg taken **6 h**
 *   before bed still cost > 1 h of objective sleep — this curve asks for ≥ 6 h
 *   at 400 mg (it asks for far more), so the two are consistent.
 *   **NOTE for reviewers:** the plan's triplet (107 mg → 4.8 h, 217 mg → 6.7 h,
 *   400 mg → 8.8 h) does **not** match the paper; 8.8 h belongs to 107 mg. The
 *   verified pairs are used here.
 * - **Learned baseline** (`learnedSleepBaseline`): over 60 days, the median sleep
 *   of nights followed by top-tercile readiness, clamped to the profile baseline
 *   ± 0.75 h, and only once ≥ 14 such nights exist. This is an N-of-1 estimate of
 *   "how much sleep actually leaves you recovered" rather than a self-report; the
 *   clamp keeps one good fortnight from rewriting the profile.
 * - Consistency = rolling 7-night SD of bedtime and sleep midpoint on the
 *   "minutes since noon" axis (`minutesSinceNoon`) so 23:30 and 00:15 are 45
 *   minutes apart, not ~23 hours. The 30–60 min flag thresholds live with the
 *   insight templates (§7 #11), not here.
 * - Bedtime countdown nudge: active from 60 min before the target bedtime to
 *   90 min after it.
 *
 * Record semantics (see data/types.ts): on a record dated D, `slh`/`sln`/`bt`/
 * `wk` describe the sleep that ENDED on the morning of D, while `strn` and
 * `nap` belong to day D itself. The need for the night ending on D therefore
 * uses the strain and naps of D − 1. An imported `dbt` on `asOf` still wins over
 * the walk; an imported `sln` is used as the accrual need **only when a `dbt`
 * accompanies it** — a bare `sln` is a target the vendor never reconciled.
 *
 * Everything here is pure: records in (any order — we index by date), plain
 * numbers or null out, never NaN, never throws, never reads the clock.
 */
import type { DailyRecord, HHMM, ISODate, Profile, SessionType } from '../data/types';
import { addDays, diffDays, hhmmToMinutes, lastNDates, minutesSinceNoon, minutesSinceNoonToHHMM, minutesToHHMM, nowHHMM, weekdayOf } from '../lib/dates';
import { clamp, mean, round, stddev } from '../lib/format';
import { logistic, median, quantile } from './stats';

/**
 * Logistic midpoint / scale for the strain → sleep-need curve.
 * **Heuristic** — WHOOP publishes no formula (see header).
 */
const STRAIN_MIDPOINT = 13.5;
const STRAIN_SCALE = 3;
const STRAIN_MAX_ADD_MIN = 60;
/** True so UI copy can label the strain add as a calibration, not a finding. */
export const STRAIN_ADD_IS_HEURISTIC = true;
/** Debt is repaid at 1/3 per night, at most 45 min/night (the displayed ask). */
const DEBT_PAYBACK_DIVISOR = 3;
const DEBT_ADD_CAP_MIN = 45;
/** Need never drops below 5 h even after a long nap. */
export const SLEEP_NEED_FLOOR_HRS = 5;
/** Accumulated debt is capped at 5 h — beyond that the number stops being actionable. */
export const SLEEP_DEBT_CAP_MIN = 300;
export const SLEEP_DEBT_WINDOW_NIGHTS = 28;
/** Nightly carry-over λ (Kitamura 2016 — half-life ≈ 4.3 d). */
export const SLEEP_DEBT_DECAY = 0.85;
/** ln 2 / ln(1/λ) — the half-life the decay implies, in days (≈ 4.27). */
export const SLEEP_DEBT_HALFLIFE_DAYS = round(Math.LN2 / Math.log(1 / SLEEP_DEBT_DECAY), 2);
/** A single night may retire at most 2 h of debt (Banks 2010). */
export const SLEEP_DEBT_REPAY_CAP_MIN = 120;
/** Same as DEFAULT_PROFILE.sleepBaselineHrs; used only if a profile has no usable baseline. */
const FALLBACK_BASELINE_HRS = 7.75;
/** Countdown window around the target bedtime (§6.4 "from 60 min before"). */
export const COUNTDOWN_BEFORE_MIN = 60;
export const COUNTDOWN_AFTER_MIN = 90;

/** Circadian-delay penalty (Depner 2019): trigger, size, window, minimum sample. */
export const CIRCADIAN_DELAY_TRIGGER_MIN = 60;
export const CIRCADIAN_PENALTY_MIN = 15;
export const CIRCADIAN_WINDOW_NIGHTS = 14;
export const CIRCADIAN_MIN_REF_NIGHTS = 5;
/** The direction is Depner 2019; the 60-min trigger and 15-min size are calibration. */
export const CIRCADIAN_PENALTY_IS_HEURISTIC = true;
/**
 * The user-showable half of `CIRCADIAN_PENALTY_IS_HEURISTIC` — a boolean no
 * screen can render is not a label. Written in the same voice as the
 * muscle-recovery half-life note on Train ▸ Today and the strain-counter note
 * on the resilience card: name what is published, name what is ours, and never
 * let the sizes read as findings. `circadianDelay().reason` carries it whenever
 * the penalty applies, so the only user-facing string about the penalty can no
 * longer state 60 min / 15 min as fact.
 */
export const CIRCADIAN_PENALTY_LABEL =
  'Depner 2019 found the direction — a lie-in that delays your body clock leaves you worse off, not rested — ' +
  `but the ${CIRCADIAN_DELAY_TRIGGER_MIN}-minute trigger and the ${CIRCADIAN_PENALTY_MIN}-minute penalty are our own calibration, not published quantities.`;

/** SRI (Phillips 2017): 28-night window preferred, null below 14, flag below 70. */
export const SRI_WINDOW_NIGHTS = 28;
export const SRI_MIN_NIGHTS = 14;
export const SRI_FLAG_BELOW = 70;
/** UK Biobank median SRI (Windred 2024) — the comparison the UI can quote. */
export const SRI_POPULATION_MEDIAN = 81;

/** Social jetlag (MCTQ): window and the minimum nights per day class. */
export const SOCIAL_JETLAG_WINDOW_NIGHTS = 28;
export const SOCIAL_JETLAG_MIN_PER_CLASS = 3;

/** Learned baseline: 60-day window, top-tercile readiness, ≥ 14 nights, ±0.75 h clamp. */
export const LEARNED_BASELINE_WINDOW_DAYS = 60;
export const LEARNED_BASELINE_MIN_NIGHTS = 14;
export const LEARNED_BASELINE_CLAMP_HRS = 0.75;
export const LEARNED_BASELINE_TERCILE = 2 / 3;

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function indexByDate(records: DailyRecord[]): Map<ISODate, DailyRecord> {
  const m = new Map<ISODate, DailyRecord>();
  for (const r of records) m.set(r.d, r);
  return m;
}

/** Minutes of extra sleep need from the day's WHOOP strain (0–21). 0 when unknown. */
export function strainSleepAddMin(strain: number | null | undefined): number {
  const s = num(strain);
  if (s === null) return 0;
  return STRAIN_MAX_ADD_MIN * logistic((s - STRAIN_MIDPOINT) / STRAIN_SCALE);
}

/** Minutes of extra need to start repaying accumulated debt: min(debt/3, 45). 0 when unknown. */
export function debtSleepAddMin(debtMin: number | null | undefined): number {
  const d = num(debtMin);
  if (d === null || d <= 0) return 0;
  return Math.min(d / DEBT_PAYBACK_DIVISOR, DEBT_ADD_CAP_MIN);
}

export interface SleepNeedInput {
  baselineHrs: number;
  strain?: number | null;
  debtMin?: number | null;
  napMin?: number | null;
  /** Circadian-delay penalty in minutes (Depner 2019) — see `circadianDelay`. */
  circadianPenaltyMin?: number | null;
}

export interface SleepNeed {
  /** Hours, floored at SLEEP_NEED_FLOOR_HRS, 2 dp. */
  needHrs: number;
  strainAddMin: number;
  debtAddMin: number;
  napCreditMin: number;
  /** Minutes added because a late midpoint delayed the body clock. */
  circadianAddMin: number;
}

/** need = baseline + f(strain) + f(debt) − naps + circadian penalty, floor 5 h. */
export function sleepNeed(input: SleepNeedInput): SleepNeed {
  const baseRaw = num(input.baselineHrs);
  const baseline = baseRaw !== null && baseRaw > 0 ? baseRaw : FALLBACK_BASELINE_HRS;
  const strainAddMin = strainSleepAddMin(input.strain);
  const debtAddMin = debtSleepAddMin(input.debtMin);
  const napRaw = num(input.napMin);
  const napCreditMin = napRaw !== null && napRaw > 0 ? napRaw : 0;
  const circRaw = num(input.circadianPenaltyMin);
  const circadianAddMin = circRaw !== null && circRaw > 0 ? circRaw : 0;
  const raw = baseline + (strainAddMin + debtAddMin + circadianAddMin - napCreditMin) / 60;
  return {
    needHrs: round(Math.max(SLEEP_NEED_FLOOR_HRS, raw), 2),
    strainAddMin: round(strainAddMin, 1),
    debtAddMin: round(debtAddMin, 1),
    napCreditMin: round(napCreditMin, 1),
    circadianAddMin: round(circadianAddMin, 1),
  };
}

interface SleepNight {
  d: ISODate;
  /** Displayed need for the night: baseline + f(strain) + f(debt before it) − naps (or imported sln). */
  needHrs: number;
  /** Need the debt accrued against: baseline + f(strain) − naps (or imported sln). */
  accrualNeedHrs: number;
  sleptHrs: number;
  debtAfterMin: number;
  /** Minutes of debt this night retired (positive), after the 2 h cap. */
  repaidMin: number;
  /** True when the 2 h repayment cap bound — a long night that could not clear it all. */
  repayCapped: boolean;
}

interface DebtWalk {
  nights: SleepNight[];
  debtMin: number;
  /** Whether any night in the window hit the Banks 2010 repayment cap. */
  repayCapped: boolean;
}

/**
 * The dates one debt walk touches: the `SLEEP_DEBT_WINDOW_NIGHTS` nights ending
 * at `asOf`, preceded by one run-in day because each night's accrual need reads
 * the strain and naps of D − 1. Ascending, so `[i − 1]` is always "the day
 * before night `[i]`".
 */
function debtWalkDates(asOf: ISODate): readonly ISODate[] {
  return lastNDates(asOf, SLEEP_DEBT_WINDOW_NIGHTS + 1);
}

/**
 * Walk the last 28 nights oldest → newest.
 *
 * Each step is `debt ← clamp(λ·debt + (accrualNeed − slept)·60, 0, 300)` with
 * λ = 0.85 (Kitamura 2016) and the negative term floored at −120 min per night
 * (Banks 2010). A night with no `slh` decays and is not counted.
 *
 * The accrual need is `record.sln` **only when the same record carries `dbt`**
 * (the vendor reconciled its own figure); otherwise it is
 * `baseline + f(strain of D−1) − naps of D−1` — never including f(debt), which
 * is the pay-back ask (R3-2). The displayed need does include f(debt so far).
 */
function walkDebt(
  byDate: Map<ISODate, DailyRecord>,
  asOf: ISODate,
  baselineHrs: number,
  /**
   * `debtWalkDates(asOf)`. Passed in by callers that walk many days in a row
   * (`sleepNeedSeries`) so the axis is generated once instead of per night.
   */
  window: readonly ISODate[] = debtWalkDates(asOf),
): DebtWalk {
  const nights: SleepNight[] = [];
  let debt = 0;
  let capped = false;
  // window[0] is the run-in day: night `window[i]` reads the strain and naps of
  // `window[i − 1]`, so the loop starts at 1 and never needs `addDays`.
  for (let i = 1; i < window.length; i++) {
    const d = window[i];
    const r = byDate.get(d);
    const slept = num(r?.slh);
    if (!r || slept === null || slept < 0) {
      // A night we know nothing about still lets the physiology recover.
      debt = clamp(debt * SLEEP_DEBT_DECAY, 0, SLEEP_DEBT_CAP_MIN);
      continue;
    }
    const prev = byDate.get(window[i - 1]);
    const imported = num(r.dbt) !== null ? num(r.sln) : null;
    const base = { baselineHrs, strain: prev?.strn, napMin: prev?.nap };
    const accrualNeed = imported ?? sleepNeed({ ...base, debtMin: 0 }).needHrs;
    const need = imported ?? sleepNeed({ ...base, debtMin: debt }).needHrs;
    const rawDelta = (accrualNeed - slept) * 60;
    const repayCapped = rawDelta < -SLEEP_DEBT_REPAY_CAP_MIN;
    if (repayCapped) capped = true;
    const delta = repayCapped ? -SLEEP_DEBT_REPAY_CAP_MIN : rawDelta;
    const before = debt;
    debt = clamp(debt * SLEEP_DEBT_DECAY + delta, 0, SLEEP_DEBT_CAP_MIN);
    nights.push({
      d,
      needHrs: need,
      accrualNeedHrs: accrualNeed,
      sleptHrs: slept,
      debtAfterMin: debt,
      repaidMin: round(Math.max(0, before - debt), 1),
      repayCapped,
    });
  }
  return { nights, debtMin: debt, repayCapped: capped };
}

export interface SleepDebt {
  /** Whole minutes, 0–300 (an imported WHOOP `dbt` on `asOf` is used verbatim, ≥ 0). */
  debtMin: number;
  /** Nights with sleep data that contributed to the walk. */
  nights: number;
  /** A long night in the window hit the 2 h/night repayment cap (Banks 2010). */
  repayCapped: boolean;
}

export interface SleepDebtOptions {
  /**
   * Baseline the debt accrues against, hours. Defaults to
   * `profile.sleepBaselineHrs`; `sleepSummary` passes the learned baseline when
   * it has one.
   */
  baselineHrs?: number | null;
}

export function sleepDebt(records: DailyRecord[], asOf: ISODate, profile: Profile, options?: SleepDebtOptions): SleepDebt {
  const byDate = indexByDate(records);
  const baseline = num(options?.baselineHrs) ?? profile.sleepBaselineHrs;
  const walk = walkDebt(byDate, asOf, baseline);
  const imported = num(byDate.get(asOf)?.dbt);
  const debtMin = imported !== null ? Math.max(0, imported) : walk.debtMin;
  return { debtMin: round(debtMin), nights: walk.nights.length, repayCapped: walk.repayCapped };
}

/**
 * Sleep duration in minutes for the midpoint: wake − bed on the noon axis
 * when a wake time is present (wrapping past noon, sanity-capped at 16 h),
 * else `slh` hours. Null when neither is usable.
 */
function sleepDurationMin(r: DailyRecord, bedNoon: number): number | null {
  const wake = minutesSinceNoon(r.wk);
  if (wake !== null) {
    let d = wake - bedNoon;
    if (d <= 0) d += 1440;
    if (d <= 16 * 60) return d;
  }
  const slh = num(r.slh);
  return slh !== null && slh > 0 ? slh * 60 : null;
}

/** One night's sleep span on the "minutes since noon of D−1" axis. */
interface NightSpan {
  d: ISODate;
  /** Sleep onset, minutes since noon of the previous day (0–1439). */
  onset: number;
  durationMin: number;
  /** onset + duration/2 — the MCTQ midsleep, same axis. */
  midpoint: number;
}

function nightSpan(r: DailyRecord | undefined): NightSpan | null {
  if (!r) return null;
  const bed = minutesSinceNoon(r.bt);
  if (bed === null) return null;
  const dur = sleepDurationMin(r, bed);
  if (dur === null || dur <= 0) return null;
  return { d: r.d, onset: bed, durationMin: dur, midpoint: bed + dur / 2 };
}

export interface BedtimeConsistency {
  /** Sample SD of bedtime, minutes, 1 dp; null with < 2 nights. */
  bedtimeSdMin: number | null;
  midpointSdMin: number | null;
  meanBedtime: HHMM | null;
  meanMidpoint: HHMM | null;
  /** Nights in the window with a logged bedtime. */
  n: number;
}

/** Rolling SD of bedtime and sleep midpoint over the `nights` nights ending at `asOf`. */
export function bedtimeConsistency(records: DailyRecord[], asOf: ISODate, nights = 7): BedtimeConsistency {
  const n = Math.max(1, Math.floor(nights));
  const start = addDays(asOf, -(n - 1));
  const beds: number[] = [];
  const mids: number[] = [];
  for (const r of records) {
    if (r.d < start || r.d > asOf) continue;
    const bed = minutesSinceNoon(r.bt);
    if (bed === null) continue;
    beds.push(bed);
    const dur = sleepDurationMin(r, bed);
    if (dur !== null) mids.push(bed + dur / 2);
  }
  const bedSd = stddev(beds);
  const midSd = stddev(mids);
  const bedMean = mean(beds);
  const midMean = mean(mids);
  return {
    bedtimeSdMin: bedSd === null ? null : round(bedSd, 1),
    midpointSdMin: midSd === null ? null : round(midSd, 1),
    meanBedtime: bedMean === null ? null : minutesSinceNoonToHHMM(bedMean),
    meanMidpoint: midMean === null ? null : minutesSinceNoonToHHMM(midMean),
    n: beds.length,
  };
}

// ---------------------------------------------------------------------------
// Circadian delay — Depner 2019
// ---------------------------------------------------------------------------

export interface CircadianDelay {
  /** Minutes the last night's midpoint sat later than the reference median (signed). */
  delayMin: number | null;
  /** delayMin > 60 — the lie-in moved the body clock. */
  delayed: boolean;
  /** 15 when `delayed`, else 0. Feeds `sleepNeed`. */
  penaltyMin: number;
  medianMidpoint: HHMM | null;
  lastMidpoint: HHMM | null;
  /** Reference nights available (needs ≥ 5). */
  n: number;
  /** Why the penalty did or did not apply — never null, always renderable. */
  reason: string;
  /**
   * `CIRCADIAN_PENALTY_LABEL` while the penalty is being charged, else null:
   * the hedge travels with the penalty, so a surface that shows one shows the
   * other.
   */
  penaltyLabel: string | null;
}

/**
 * Compare the most recent night's sleep midpoint with the median of the
 * previous `nights` nights. More than an hour later and tonight's need gains
 * 15 min: Depner 2019 showed weekend recovery sleep delays circadian phase and
 * leaves insulin sensitivity worse than continuous restriction, so the extra
 * hours are not a win on their own.
 */
export function circadianDelay(records: DailyRecord[], asOf: ISODate, nights = CIRCADIAN_WINDOW_NIGHTS): CircadianDelay {
  const none: CircadianDelay = {
    delayMin: null,
    delayed: false,
    penaltyMin: 0,
    medianMidpoint: null,
    lastMidpoint: null,
    n: 0,
    reason: 'Not enough logged bed and wake times yet to know your usual sleep midpoint.',
    penaltyLabel: null,
  };
  const byDate = indexByDate(records);
  const win = Math.max(2, Math.floor(nights));
  // The night being judged: the most recent one on or before asOf with a span.
  const dates = lastNDates(asOf, win + 1);
  let last: NightSpan | null = null;
  for (let i = dates.length - 1; i >= 0; i--) {
    const s = nightSpan(byDate.get(dates[i]));
    if (s) {
      last = s;
      break;
    }
  }
  if (!last) return none;
  const refs: number[] = [];
  for (const d of lastNDates(addDays(last.d, -1), win)) {
    const s = nightSpan(byDate.get(d));
    if (s) refs.push(s.midpoint);
  }
  if (refs.length < CIRCADIAN_MIN_REF_NIGHTS) {
    return { ...none, lastMidpoint: minutesSinceNoonToHHMM(last.midpoint), n: refs.length };
  }
  const med = median(refs) as number;
  const delayMin = round(last.midpoint - med);
  const delayed = delayMin > CIRCADIAN_DELAY_TRIGGER_MIN;
  const lastHHMM = minutesSinceNoonToHHMM(last.midpoint);
  const medHHMM = minutesSinceNoonToHHMM(med);
  return {
    delayMin,
    delayed,
    penaltyMin: delayed ? CIRCADIAN_PENALTY_MIN : 0,
    medianMidpoint: medHHMM,
    lastMidpoint: lastHHMM,
    n: refs.length,
    reason: delayed
      ? `Your sleep midpoint moved to ${lastHHMM}, ${delayMin} min later than your usual ${medHHMM} — the lie-in cost you circadian alignment, so tonight needs ${CIRCADIAN_PENALTY_MIN} min more, not a later night. ${CIRCADIAN_PENALTY_LABEL}`
      : `Sleep midpoint ${lastHHMM} is in line with your usual ${medHHMM}; body clock is where it should be.`,
    penaltyLabel: delayed ? CIRCADIAN_PENALTY_LABEL : null,
  };
}

// ---------------------------------------------------------------------------
// Sleep Regularity Index — Phillips 2017
// ---------------------------------------------------------------------------

export interface SleepRegularity {
  /** 0–100 (can go negative in principle); null with fewer than 14 nights. */
  sri: number | null;
  /** Nights with a usable bed + wake/duration pair in the window. */
  nights: number;
  /** Consecutive night pairs actually compared. */
  pairs: number;
  /** sri < 70 — the low end of the UK Biobank distribution (Windred 2024). */
  flagged: boolean;
  reason: string;
}

/**
 * Sleep Regularity Index: `200 · P(same state 24 h apart) − 100`, on a 1-minute
 * grid, over the last `nights` nights (28 by default, ≥ 14 required).
 *
 * The grid runs noon → noon so a whole sleep episode lives in one day-block,
 * and only *consecutive covered* blocks are compared — a missing night removes
 * its two pairs instead of being silently scored as "awake all day".
 */
export function sleepRegularityIndex(records: DailyRecord[], asOf: ISODate, nights = SRI_WINDOW_NIGHTS): SleepRegularity {
  const byDate = indexByDate(records);
  const win = Math.max(2, Math.floor(nights));
  const dates = lastNDates(asOf, win);
  const DAY = 1440;
  // One extra block of slack so a late-morning wake can spill past the boundary.
  const asleep = new Uint8Array((dates.length + 1) * DAY);
  const covered: boolean[] = [];
  let n = 0;
  dates.forEach((d, i) => {
    const s = nightSpan(byDate.get(d));
    if (!s) {
      covered.push(false);
      return;
    }
    covered.push(true);
    n++;
    const from = i * DAY + Math.round(s.onset);
    const to = Math.min(asleep.length, from + Math.round(s.durationMin));
    for (let m = from; m < to; m++) asleep[m] = 1;
  });
  if (n < SRI_MIN_NIGHTS) {
    return {
      sri: null,
      nights: n,
      pairs: 0,
      flagged: false,
      reason: `Sleep regularity needs ${SRI_MIN_NIGHTS} nights of bed and wake times — ${n} so far.`,
    };
  }
  let matches = 0;
  let total = 0;
  let pairs = 0;
  for (let i = 0; i + 1 < dates.length; i++) {
    if (!covered[i] || !covered[i + 1]) continue;
    pairs++;
    const a = i * DAY;
    const b = (i + 1) * DAY;
    for (let m = 0; m < DAY; m++) {
      if (asleep[a + m] === asleep[b + m]) matches++;
    }
    total += DAY;
  }
  if (total === 0) {
    return {
      sri: null,
      nights: n,
      pairs: 0,
      flagged: false,
      reason: 'Sleep regularity needs nights back-to-back; the logged nights are too scattered.',
    };
  }
  const sri = round(clamp(200 * (matches / total) - 100, -100, 100), 1);
  const flagged = sri < SRI_FLAG_BELOW;
  return {
    sri,
    nights: n,
    pairs,
    flagged,
    reason: flagged
      ? `Sleep regularity ${sri} is below ${SRI_FLAG_BELOW} (population median ${SRI_POPULATION_MEDIAN}); regularity predicts health outcomes more strongly than duration does.`
      : `Sleep regularity ${sri} over ${n} nights (population median ${SRI_POPULATION_MEDIAN}).`,
  };
}

// ---------------------------------------------------------------------------
// Social jetlag — MCTQ
// ---------------------------------------------------------------------------

const NON_TRAINING: ReadonlySet<SessionType> = new Set<SessionType>(['rest']);

/**
 * MCTQ "free day" test for the night that ENDED on `d`: you woke up on `d`, so
 * `d`'s schedule is what got you out of bed. A `lift` override on the record
 * wins over the split (mirrors `nutrition.dayTypeFor`, deliberately duplicated
 * so this module imports no sibling engine module).
 */
function isFreeDay(d: ISODate, profile: Profile, r: DailyRecord | undefined): boolean {
  if (r?.lift === true) return false;
  if (r?.lift === false) return true;
  const scheduled: SessionType = profile.split?.[weekdayOf(d)] ?? 'rest';
  return NON_TRAINING.has(scheduled);
}

export interface SocialJetlag {
  /** |midsleep on rest days − midsleep on training days|, minutes; null when too few of either. */
  minutes: number | null;
  restMidpoint: HHMM | null;
  trainingMidpoint: HHMM | null;
  nRest: number;
  nTraining: number;
  reason: string;
}

/**
 * Social jetlag (Wittmann/Roenneberg 2006): the gap between the sleep midpoint
 * on days you did not have to train and on days you did. Needs ≥ 3 nights of
 * each class inside the window; medians, not means, so one all-nighter does not
 * define your weekend.
 */
export function socialJetlag(
  records: DailyRecord[],
  asOf: ISODate,
  profile: Profile,
  nights = SOCIAL_JETLAG_WINDOW_NIGHTS,
): SocialJetlag {
  const byDate = indexByDate(records);
  const free: number[] = [];
  const work: number[] = [];
  for (const d of lastNDates(asOf, Math.max(2, Math.floor(nights)))) {
    const r = byDate.get(d);
    const s = nightSpan(r);
    if (!s) continue;
    (isFreeDay(d, profile, r) ? free : work).push(s.midpoint);
  }
  if (free.length < SOCIAL_JETLAG_MIN_PER_CLASS || work.length < SOCIAL_JETLAG_MIN_PER_CLASS) {
    return {
      minutes: null,
      restMidpoint: free.length ? minutesSinceNoonToHHMM(median(free) as number) : null,
      trainingMidpoint: work.length ? minutesSinceNoonToHHMM(median(work) as number) : null,
      nRest: free.length,
      nTraining: work.length,
      reason: `Social jetlag needs ${SOCIAL_JETLAG_MIN_PER_CLASS} logged nights before rest days and ${SOCIAL_JETLAG_MIN_PER_CLASS} before training days (${free.length} and ${work.length} so far).`,
    };
  }
  const fm = median(free) as number;
  const wm = median(work) as number;
  const minutes = round(Math.abs(fm - wm));
  return {
    minutes,
    restMidpoint: minutesSinceNoonToHHMM(fm),
    trainingMidpoint: minutesSinceNoonToHHMM(wm),
    nRest: free.length,
    nTraining: work.length,
    reason: `Your sleep midpoint sits at ${minutesSinceNoonToHHMM(fm)} before rest days and ${minutesSinceNoonToHHMM(wm)} before training days — ${minutes} min of social jetlag.`,
  };
}

// ---------------------------------------------------------------------------
// Learned baseline
// ---------------------------------------------------------------------------

export type SleepBaselineSource = 'profile' | 'learned' | 'imported';

export interface LearnedSleepBaseline {
  /** Median sleep of the best-recovered nights, clamped to profile ± 0.75 h; null until 14 nights. */
  hrs: number | null;
  /** Nights that met the top-tercile readiness bar. */
  nights: number;
  /** Readiness value that defined the top tercile. */
  thresholdReadiness: number | null;
  /** True when the clamp bound — the raw median was further than 0.75 h from the profile. */
  clamped: boolean;
  /** Raw (unclamped) median, for transparency. */
  rawHrs: number | null;
  reason: string;
}

export interface LearnedBaselineOptions {
  /**
   * Readiness (0–100) per date — pass `readiness()`'s score. Falls back to the
   * record's imported WHOOP recovery `rec` when a date is missing. Passed in
   * rather than imported: this module must not depend on `readiness`.
   */
  readiness?: Readonly<Record<ISODate, number | null | undefined>>;
  /** Window length in days (default 60). */
  windowDays?: number;
}

/**
 * "How much sleep actually leaves you recovered": over the last 60 days, take
 * the nights followed by top-tercile readiness and use their median duration,
 * clamped to the profile baseline ± 0.75 h. Below 14 such nights it stays null
 * and the profile baseline is used, because a handful of good mornings is not
 * a personal constant.
 */
export function learnedSleepBaseline(
  records: DailyRecord[],
  asOf: ISODate,
  profile: Profile,
  options?: LearnedBaselineOptions,
): LearnedSleepBaseline {
  const byDate = indexByDate(records);
  const windowDays = Math.max(2, Math.floor(options?.windowDays ?? LEARNED_BASELINE_WINDOW_DAYS));
  const pairs: { slh: number; rdy: number }[] = [];
  for (const d of lastNDates(asOf, windowDays)) {
    const r = byDate.get(d);
    const slh = num(r?.slh);
    if (slh === null || slh <= 0) continue;
    const rdy = num(options?.readiness?.[d]) ?? num(r?.rec);
    if (rdy === null) continue;
    pairs.push({ slh, rdy });
  }
  const empty = (reason: string, nights = 0, threshold: number | null = null): LearnedSleepBaseline => ({
    hrs: null,
    nights,
    thresholdReadiness: threshold,
    clamped: false,
    rawHrs: null,
    reason,
  });
  if (pairs.length < LEARNED_BASELINE_MIN_NIGHTS) {
    return empty(
      `Learning your own sleep need: ${pairs.length} of ${LEARNED_BASELINE_MIN_NIGHTS} nights with both sleep and a recovery score.`,
      pairs.length,
    );
  }
  const threshold = quantile(pairs.map((p) => p.rdy), LEARNED_BASELINE_TERCILE);
  if (threshold === null) return empty('No usable recovery scores in the window.', 0);
  const best = pairs.filter((p) => p.rdy >= threshold).map((p) => p.slh);
  if (best.length < LEARNED_BASELINE_MIN_NIGHTS) {
    return empty(
      `Learning your own sleep need: ${best.length} of ${LEARNED_BASELINE_MIN_NIGHTS} well-recovered nights.`,
      best.length,
      round(threshold, 1),
    );
  }
  const raw = median(best) as number;
  const base = num(profile.sleepBaselineHrs) ?? FALLBACK_BASELINE_HRS;
  const hrs = round(clamp(raw, base - LEARNED_BASELINE_CLAMP_HRS, base + LEARNED_BASELINE_CLAMP_HRS), 2);
  const clamped = Math.abs(raw - base) > LEARNED_BASELINE_CLAMP_HRS + 1e-9;
  return {
    hrs,
    nights: best.length,
    thresholdReadiness: round(threshold, 1),
    clamped,
    rawHrs: round(raw, 2),
    reason: clamped
      ? `Your ${best.length} best-recovered nights averaged ${round(raw, 2)} h; held at ${hrs} h, within ${LEARNED_BASELINE_CLAMP_HRS} h of your set baseline.`
      : `Learned from ${best.length} nights followed by your best recovery scores: ${hrs} h.`,
  };
}

export interface BedtimeCountdown {
  /** Positive before the target bedtime, negative after it. */
  minutesToBed: number;
  message: string;
  phase: 'wind-down' | 'past';
  /** Hours of sleep still available if lights go out now (wake target − now). */
  achievableHrs: number;
}

function fmtHrs(h: number): string {
  return `${round(h, 1)} h`;
}

/**
 * Bedtime nudge, active from 60 min before `bedTarget` to 90 min after; null
 * outside that window or on malformed input. The wind-down message quotes the
 * hours you get by hitting the target (wake − bed target); `achievableHrs`
 * carries wake − now for callers who want the live figure.
 */
export function bedtimeCountdown(now: Date, bedTarget: HHMM, wakeTarget: HHMM): BedtimeCountdown | null {
  const bedNoon = minutesSinceNoon(bedTarget);
  const wakeNoon = minutesSinceNoon(wakeTarget);
  const nowNoon = Number.isNaN(now.getTime()) ? null : minutesSinceNoon(nowHHMM(now));
  if (bedNoon === null || wakeNoon === null || nowNoon === null) return null;

  // Shortest signed distance on the 24 h circle so a bedtime near noon still works.
  let toBed = bedNoon - nowNoon;
  if (toBed > 720) toBed -= 1440;
  else if (toBed <= -720) toBed += 1440;
  if (toBed > COUNTDOWN_BEFORE_MIN || toBed < -COUNTDOWN_AFTER_MIN) return null;

  const forward = (m: number) => ((m % 1440) + 1440) % 1440;
  const achievableHrs = round(forward(wakeNoon - nowNoon) / 60, 2);
  const atTargetHrs = forward(wakeNoon - bedNoon) / 60;
  const wake = minutesToHHMM(hhmmToMinutes(wakeTarget) as number);
  const bed = minutesToHHMM(hhmmToMinutes(bedTarget) as number);

  if (toBed > 0) {
    return {
      minutesToBed: toBed,
      phase: 'wind-down',
      achievableHrs,
      message: `Wind-down: ${toBed} min to bed for ${fmtHrs(atTargetHrs)} before your ${wake} alarm`,
    };
  }
  if (toBed === 0) {
    return {
      minutesToBed: 0,
      phase: 'wind-down',
      achievableHrs,
      message: `Bedtime: lights out now for ${fmtHrs(atTargetHrs)} before your ${wake} alarm`,
    };
  }
  return {
    minutesToBed: toBed,
    phase: 'past',
    achievableHrs,
    message: `You're ${-toBed} min past your ${bed} bedtime — lights out protects tomorrow's recovery`,
  };
}

// ---------------------------------------------------------------------------
// Caffeine — dose-aware cutoff (Gardiner 2023 / Drake 2013)
// ---------------------------------------------------------------------------

/**
 * The published dose → "hours before bed" pairs, verified against the Gardiner
 * 2023 abstract (Sleep Med Rev 69:101764):
 *   47 mg (a cup of black tea)     → no cut-off found
 *   107 mg (250 mL coffee)         → 8.8 h
 *   217.5 mg (pre-workout serve)   → 13.2 h
 * Interpolation is linear in ln(dose); the 107 → 217.5 slope (6.20 h per
 * ln-unit) is extrapolated above 217.5 mg and flagged as such.
 */
export const CAFFEINE_ANCHORS: ReadonlyArray<{ mg: number; hours: number }> = [
  { mg: 47, hours: 0 },
  { mg: 107, hours: 8.8 },
  { mg: 217.5, hours: 13.2 },
];
/** Drake 2013: 400 mg six hours before bed still cost > 1 h of sleep — a floor the curve must clear. */
export const CAFFEINE_DRAKE_CHECK = { mg: 400, hours: 6 } as const;
/**
 * Longest cutoff we will quote. Past this the honest message is "not today",
 * and a number larger than a waking day is not actionable advice.
 */
export const CAFFEINE_MAX_CUTOFF_HRS = 16;

/**
 * Hours before bed that a dose of caffeine should be finished, interpolated in
 * ln(dose) through `CAFFEINE_ANCHORS`. 0 at or below 47 mg (Gardiner found no
 * cut-off for a cup of black tea); null when the dose is missing or not finite.
 */
export function caffeineCutoffHours(doseMg: number | null | undefined): number | null {
  const d = num(doseMg);
  if (d === null || d <= 0) return null;
  const a = CAFFEINE_ANCHORS;
  if (d <= a[0].mg) return 0;
  for (let i = 1; i < a.length; i++) {
    if (d <= a[i].mg) {
      const t = Math.log(d / a[i - 1].mg) / Math.log(a[i].mg / a[i - 1].mg);
      return round(a[i - 1].hours + t * (a[i].hours - a[i - 1].hours), 1);
    }
  }
  const lo = a[a.length - 2];
  const hi = a[a.length - 1];
  const slope = (hi.hours - lo.hours) / Math.log(hi.mg / lo.mg);
  return round(Math.min(CAFFEINE_MAX_CUTOFF_HRS, hi.hours + slope * Math.log(d / hi.mg)), 1);
}

export interface CaffeineCutoff {
  /** Latest clock time to take this dose and still protect the night. */
  cutoff: HHMM;
  hoursBeforeBed: number;
  doseMg: number | null;
  /** 'dose' = the Gardiner curve for a logged dose; 'default' = the profile's fixed cutoff. */
  source: 'dose' | 'default';
  /** The dose sits above the highest published anchor (217.5 mg), so the curve is extrapolated. */
  extrapolated: boolean;
  /** Renderable one-liner — a personal finding when dose-aware, a default otherwise. */
  label: string;
}

/**
 * Dose-aware caffeine cutoff. With a dose it is the Gardiner 2023 curve read
 * back from the bed target; with no dose it is `defaultCutoff` (the profile's
 * fixed time, labelled as the default rather than as a personal finding), or
 * bed − 8 h if the caller has none.
 */
export function caffeineCutoff(
  doseMg: number | null | undefined,
  bedTarget: HHMM,
  defaultCutoff?: HHMM | null,
): CaffeineCutoff {
  const bedMin = hhmmToMinutes(bedTarget);
  const hrs = caffeineCutoffHours(doseMg);
  const dose = num(doseMg);
  if (hrs === null || bedMin === null) {
    const fallbackMin = hhmmToMinutes(defaultCutoff ?? null) ?? (bedMin === null ? null : bedMin - 8 * 60);
    const cutoff = fallbackMin === null ? '14:00' : minutesToHHMM(fallbackMin);
    const before = bedMin === null || fallbackMin === null
      ? null
      : round(((((bedMin - fallbackMin) % 1440) + 1440) % 1440) / 60, 1);
    return {
      cutoff,
      hoursBeforeBed: before ?? 8,
      doseMg: dose,
      source: 'default',
      extrapolated: false,
      label: `Default cutoff ${cutoff} — log how much caffeine you have and this becomes a number for your dose.`,
    };
  }
  const cutoffMin = bedMin - Math.round(hrs * 60);
  const cutoff = minutesToHHMM(cutoffMin);
  const extrapolated = (dose as number) > CAFFEINE_ANCHORS[CAFFEINE_ANCHORS.length - 1].mg;
  const label = hrs === 0
    ? `${Math.round(dose as number)} mg is small enough that Gardiner 2023 found no cutoff — it should not cost you sleep.`
    : `${Math.round(dose as number)} mg wants ${hrs} h before bed — last one by ${cutoff}${extrapolated ? ' (above the studied dose range, so this is an extrapolation)' : ''}.`;
  return { cutoff, hoursBeforeBed: hrs, doseMg: dose, source: 'dose', extrapolated, label };
}

export interface CaffeineCheck {
  /** Latest caffeine time after the cutoff, or null when none. */
  afterCutoff: HHMM | null;
  /** Latest caffeine time of the day (clock order, so an 00:30 log counts as early morning). */
  latest: HHMM | null;
  /** Hours between the latest caffeine and the target bedtime, 1 dp. */
  hoursBeforeBed: number | null;
}

/**
 * `doses` is optional and index-aligned with `caf`: an entry with a dose is
 * judged against its own Gardiner cutoff, an entry without one against the
 * profile's fixed `cutoff`. The returned shape is unchanged either way.
 */
export function caffeineCheck(
  caf: HHMM[] | undefined,
  bedTarget: HHMM,
  cutoff: HHMM,
  doses?: readonly (number | null | undefined)[],
): CaffeineCheck {
  const entries = (caf ?? [])
    .map((t, i) => ({ min: hhmmToMinutes(t), doseMg: doses?.[i] }))
    .filter((e): e is { min: number; doseMg: number | null | undefined } => e.min !== null);
  if (!entries.length) return { afterCutoff: null, latest: null, hoursBeforeBed: null };
  // Work on the eating-day axis (minutes since 04:00) so a 00:30 coffee counts as
  // late-evening — after a 14:00 cutoff and past a 23:00 bed target — instead of
  // as an early-morning one, and a bed target after midnight ('00:30') still
  // lands later than any evening time.
  const axis = (m: number) => (m - 4 * 60 + 1440) % 1440;
  const latestEntry = entries.reduce((best, e) => (axis(e.min) > axis(best.min) ? e : best), entries[0]);
  const latest = minutesToHHMM(latestEntry.min);
  const fixedMin = hhmmToMinutes(cutoff);
  const cutoffMinFor = (doseMg: number | null | undefined): number | null => {
    const own = caffeineCutoffHours(doseMg);
    const bed = hhmmToMinutes(bedTarget);
    if (own === null || bed === null) return fixedMin;
    return ((bed - Math.round(own * 60)) % 1440 + 1440) % 1440;
  };
  let afterCutoff: HHMM | null = null;
  for (const e of entries) {
    const c = cutoffMinFor(e.doseMg);
    if (c === null || axis(e.min) <= axis(c)) continue;
    if (afterCutoff === null || axis(e.min) > axis(hhmmToMinutes(afterCutoff) as number)) afterCutoff = minutesToHHMM(e.min);
  }
  const bedMin = hhmmToMinutes(bedTarget);
  let hoursBeforeBed: number | null = null;
  if (bedMin !== null) {
    // A coffee at or after the bed target is 0 h before bed — never "23.5 h" (review R7-6).
    const diff = Math.max(0, axis(bedMin) - axis(latestEntry.min));
    hoursBeforeBed = round(diff / 60, 1);
  }
  return { afterCutoff, latest, hoursBeforeBed };
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export interface SleepSummaryOptions extends LearnedBaselineOptions {
  /** Caffeine doses (mg) index-aligned with `asOf`'s `caf` list; optional per entry. */
  caffeineDosesMg?: readonly (number | null | undefined)[];
}

export interface SleepSummary {
  /** Last night's sleep hours (record `slh` on asOf). */
  hours: number | null;
  /**
   * Need for last night when it was logged; otherwise `tonightNeed`.
   */
  need: number | null;
  /**
   * Tonight's need — always computed: effective baseline + f(today's strain)
   * + f(current debt) − today's naps + any circadian-delay penalty.
   */
  tonightNeed: number;
  /** Why tonight's need is what it is (carries the Depner 2019 line when it applies). */
  tonightNeedReason: string;
  debtMin: number | null;
  /** (hours − need) × 60, whole minutes; negative = short. */
  deltaVsNeedMin: number | null;
  /** A long night in the window hit the 2 h/night repayment cap (Banks 2010). */
  debtRepayCapped: boolean;
  /** Most recent logged bedtime on or before asOf. */
  lastBedtime: HHMM | null;
  consistency: BedtimeConsistency;
  /** Mean sleep hours over the 30 nights before asOf (baseline convention: excludes today), 2 dp. */
  hours30dMean: number | null;
  /** Baseline actually used for tonight's need, hours. */
  baselineHrs: number;
  /** Median sleep of well-recovered nights; null until 14 of them exist. */
  learnedBaselineHrs: number | null;
  baselineSource: SleepBaselineSource;
  learnedBaseline: LearnedSleepBaseline;
  /** Sleep Regularity Index 0–100 (Phillips 2017); null below 14 nights. */
  sri: number | null;
  sriNights: number;
  /** sri < 70 (Windred 2024 — below the UK Biobank low end). */
  sriFlagged: boolean;
  regularity: SleepRegularity;
  /** |midsleep before rest days − midsleep before training days|, minutes (MCTQ). */
  socialJetlagMin: number | null;
  jetlag: SocialJetlag;
  /** SD of the sleep midpoint over the regularity window (28 nights), minutes. */
  midpointSdMin: number | null;
  circadian: CircadianDelay;
}

/** Everything a single night's need is built from. `sleepSummary` and `sleepNeedSeries` share it. */
interface NightNeed {
  /** The record dated `asOf`, if any. */
  today: DailyRecord | undefined;
  learned: LearnedSleepBaseline;
  baselineHrs: number;
  walk: DebtWalk;
  debtMin: number;
  /** An imported `sln`, honoured only when a `dbt` accompanies it. */
  importedNeed: number | null;
  /** The walk's entry for `asOf` — present exactly when that night carries usable sleep. */
  lastNight: SleepNight | undefined;
}

/**
 * The learned baseline, the debt walk and the night they imply, for one day.
 *
 * Factored out of `sleepSummary` so a whole series of nights can be scored
 * against ONE record index and ONE date axis: the Trends sleep chart used to
 * call `sleepSummary` per day, and each of those calls rebuilt the index over
 * the entire history (plus a second full scan for the last bedtime), which made
 * the chart quadratic in the range length — 163 ms of a 1Y flip.
 */
function nightNeed(
  byDate: Map<ISODate, DailyRecord>,
  records: DailyRecord[],
  asOf: ISODate,
  profile: Profile,
  options?: SleepSummaryOptions,
  /** `debtWalkDates(asOf)`, when the caller already has the axis. */
  walkWindow?: readonly ISODate[],
): NightNeed {
  const today = byDate.get(asOf);
  const learned = learnedSleepBaseline(records, asOf, profile, options);
  const profileBase = num(profile.sleepBaselineHrs);
  const baselineHrs = learned.hrs ?? (profileBase !== null && profileBase > 0 ? profileBase : FALLBACK_BASELINE_HRS);

  const walk = walkDebt(byDate, asOf, baselineHrs, walkWindow ?? debtWalkDates(asOf));
  const importedDebt = num(today?.dbt);
  const debtMin = round(importedDebt !== null ? Math.max(0, importedDebt) : walk.debtMin);

  return {
    today,
    learned,
    baselineHrs,
    walk,
    debtMin,
    importedNeed: importedDebt !== null ? num(today?.sln) : null,
    lastNight: walk.nights.find((n) => n.d === asOf),
  };
}

/**
 * `sleepSummary(records, d, profile, options).need` for each `d` in `dates`,
 * without paying for the rest of the summary or for a per-day index.
 *
 * The Trends sleep chart plots one need per logged night, and nothing else the
 * summary computes — the SRI grid, social jetlag, the bedtime scan, the 30-night
 * mean — reaches the chart. Calling `sleepSummary` once per day therefore did
 * `O(history)` work per point (an index rebuild, a full-history bedtime scan and
 * a fresh 28-night date axis each time). This builds the index once, generates
 * the date axis once, and reuses both for every night asked about; the values it
 * returns are identical by construction, since it runs the very same
 * `nightNeed` + `sleepNeed` path the summary does.
 *
 * `dates` need not be contiguous. Nights missing from the map had no date to
 * score (an empty list in, an empty map out).
 */
export function sleepNeedSeries(
  records: DailyRecord[],
  dates: readonly ISODate[],
  profile: Profile,
  options?: SleepSummaryOptions,
): Map<ISODate, number> {
  const out = new Map<ISODate, number>();
  if (dates.length === 0) return out;
  const byDate = indexByDate(records);

  // One axis spanning every walk any of `dates` will make, so each night's
  // 29-day window is a slice rather than 29 fresh date strings.
  let lo = dates[0];
  let hi = dates[0];
  for (const d of dates) {
    if (d < lo) lo = d;
    if (d > hi) hi = d;
  }
  const axis = lastNDates(hi, diffDays(lo, hi) + SLEEP_DEBT_WINDOW_NIGHTS + 1);
  const at = new Map<ISODate, number>();
  axis.forEach((d, i) => at.set(d, i));

  for (const d of dates) {
    const i = at.get(d);
    // `dateRange` caps very long spans; falling back keeps an absurd date list
    // correct rather than silently mis-windowed.
    const window = i === undefined || i < SLEEP_DEBT_WINDOW_NIGHTS
      ? debtWalkDates(d)
      : axis.slice(i - SLEEP_DEBT_WINDOW_NIGHTS, i + 1);
    const night = nightNeed(byDate, records, d, profile, options, window);
    if (night.lastNight) {
      out.set(d, night.lastNight.needHrs);
      continue;
    }
    // No usable sleep on `d`: the summary falls back to tonight's need, which
    // is the only place the circadian penalty enters.
    const circadian = circadianDelay(records, d);
    out.set(
      d,
      sleepNeed({
        baselineHrs: night.baselineHrs,
        strain: night.today?.strn,
        debtMin: night.debtMin,
        napMin: night.today?.nap,
        circadianPenaltyMin: circadian.penaltyMin,
      }).needHrs,
    );
  }
  return out;
}

export function sleepSummary(
  records: DailyRecord[],
  asOf: ISODate,
  profile: Profile,
  options?: SleepSummaryOptions,
): SleepSummary {
  const byDate = indexByDate(records);
  const night = nightNeed(byDate, records, asOf, profile, options);
  const { today, learned, baselineHrs, walk, debtMin, importedNeed, lastNight } = night;
  const hours = num(today?.slh);

  const circadian = circadianDelay(records, asOf);
  const tonight = sleepNeed({
    baselineHrs,
    strain: today?.strn,
    debtMin,
    napMin: today?.nap,
    circadianPenaltyMin: circadian.penaltyMin,
  });
  const tonightNeed = tonight.needHrs;

  const need = lastNight ? lastNight.needHrs : tonightNeed;
  const deltaVsNeedMin = hours === null || need === null ? null : round((hours - need) * 60);

  let lastBedtime: HHMM | null = null;
  let lastBedDate: ISODate | null = null;
  for (const r of records) {
    if (r.d <= asOf && hhmmToMinutes(r.bt) !== null && (lastBedDate === null || r.d > lastBedDate)) {
      lastBedDate = r.d;
      lastBedtime = minutesToHHMM(hhmmToMinutes(r.bt) as number);
    }
  }

  const hist = lastNDates(addDays(asOf, -1), 30)
    .map((d) => num(byDate.get(d)?.slh))
    .filter((v): v is number => v !== null);
  const hist30 = mean(hist);

  const regularity = sleepRegularityIndex(records, asOf);
  const jetlag = socialJetlag(records, asOf, profile);
  const midpoints: number[] = [];
  for (const d of lastNDates(asOf, SRI_WINDOW_NIGHTS)) {
    const s = nightSpan(byDate.get(d));
    if (s) midpoints.push(s.midpoint);
  }
  const midSd = stddev(midpoints);

  const baselineSource: SleepBaselineSource = importedNeed !== null ? 'imported' : learned.hrs !== null ? 'learned' : 'profile';

  const parts = [`Baseline ${round(baselineHrs, 2)} h`];
  if (tonight.strainAddMin > 0) parts.push(`+${Math.round(tonight.strainAddMin)} min for today's strain`);
  if (tonight.debtAddMin > 0) parts.push(`+${Math.round(tonight.debtAddMin)} min to start paying down ${debtMin} min of debt`);
  if (tonight.napCreditMin > 0) parts.push(`−${Math.round(tonight.napCreditMin)} min for today's nap`);
  const tonightNeedReason = tonight.circadianAddMin > 0
    ? `${parts.join(', ')}, +${Math.round(tonight.circadianAddMin)} min because ${circadian.reason.charAt(0).toLowerCase()}${circadian.reason.slice(1)}`
    : `${parts.join(', ')}.`;

  return {
    hours,
    need,
    tonightNeed,
    tonightNeedReason,
    debtMin,
    deltaVsNeedMin,
    debtRepayCapped: walk.repayCapped,
    lastBedtime,
    consistency: bedtimeConsistency(records, asOf, 7),
    hours30dMean: hist30 === null ? null : round(hist30, 2),
    baselineHrs: round(baselineHrs, 2),
    learnedBaselineHrs: learned.hrs,
    baselineSource,
    learnedBaseline: learned,
    sri: regularity.sri,
    sriNights: regularity.nights,
    sriFlagged: regularity.flagged,
    regularity,
    socialJetlagMin: jetlag.minutes,
    jetlag,
    midpointSdMin: midSd === null ? null : round(midSd, 1),
    circadian,
  };
}
