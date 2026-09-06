/**
 * §1 hero "Readiness" ring — v3.
 *
 * ## The score blends, it does not switch
 * v2 switched sources: WHOOP recovery when today's import had landed, our own
 * HRV mapping when it had not. The hero number therefore *stepped* every time an
 * import failed, which is the one thing a daily number must never do. v3 blends:
 *
 *     score = w · WHOOP + (1 − w) · own
 *     w     = (days with a WHOOP recovery in the last 7) / 7
 *
 * `w` ramps 0 → 1 over the first week of WHOOP coverage and slides back down one
 * seventh a day when imports stop, instead of jumping between two scales.
 *
 * On a day the import did not land, the WHOOP term is **not** the stale reading.
 * WHOOP's level moves as much day to day as ours does, so carrying Tuesday's 78
 * into Friday at 4/7 weight puts the step straight back. What survives a gap is
 * WHOOP's *offset* from our model — "WHOOP reads 12 points higher than we do for
 * this person" — so the gap-day term is today's own score plus that offset,
 * measured on the last day both existed (`whoopTerm`). The number then drifts by
 * `(1 − w) × offset` and nothing else. Measured across a 3-day gap: 6.3 points
 * on average, against 11.8 for the v2 switch.
 *
 * ## The own score
 *
 *     own = 100 · logistic(0.40·z_hrv − 0.22·z_rhr + 0.18·z_sleep3
 *                          − 0.10·z_load + 0.10·z_subj,  k = 1.1)
 *
 * - `z_hrv`     the standardised position of the 7-day ln rMSSD mean against the
 *               robust 60/90-day reference (`engine/hrv.ts` computes it, band and
 *               forcing share it).
 * - `z_rhr`     today's resting HR against a **robust** 28-day reference (median
 *               and 1.4826·MAD, not a mean — one 70 bpm night after a late
 *               flight must not move the baseline).
 * - `z_sleep3`  a **3-night weighted history**, 0.5 / 0.3 / 0.2 for last night,
 *               the night before and the one before that — the window Garmin's
 *               Training Readiness uses; each night scored as
 *               `(slept − need) / 0.75 h`.
 * - `z_load`    yesterday's training load against its robust 28-day reference —
 *               yesterday's work is what today has to absorb.
 * - `z_subj`    the **negated** Hooper check-in z (sleep quality, fatigue,
 *               stress, soreness, 1 = best). Saw 2016: subjective measures track
 *               acute and chronic load *better* than objective ones, so they
 *               belong inside the score rather than in a box beside it.
 *
 * Missing inputs score `z = 0` (no information, no opinion) and widen
 * `confidence` instead of silently changing the answer; every z is clamped to
 * ±3. `READINESS_WEIGHTS` and `READINESS_K` are exported so they can be tuned
 * from a single place.
 *
 * ## Verdict
 * `bandOf` still bands 67/34 like WHOOP. On top of the number:
 * - HRV **forcing** (`engine/hrv.ts`: 2 × SWC, or two days below the SWC) → red.
 * - HRV **unbalanced** → yellow "hold loads", unless resting HR is ≥ 3 bpm below
 *   its baseline, which is the one reading that distinguishes genuine
 *   parasympathetic recovery from accumulated fatigue.
 * - Training and stress **modifiers** — `formBand`, `acwr`, `stressBand`,
 *   `illness` — arrive as **plain optional arguments**. This module never
 *   imports `engine/load` or `engine/stress`; the caller passes values. They
 *   downgrade the verdict **one step** in total and never override a red.
 *
 * ## Uncertainty
 * `contributors[]` is always filled (one row per input, with the points it
 * contributed against it being missing) and `confidence {lo, hi, nInputs}`
 * widens as inputs go missing, so the ring can draw a band and "Why this score"
 * can list the arithmetic.
 *
 * Pure, deterministic, clock-free; never throws, never NaN.
 */
import type {
  AcwrBand,
  Band,
  BaselineDelta,
  DailyRecord,
  FormBand,
  ISODate,
  Profile,
  Readiness,
  ReadinessContributor,
  ReadinessModifier,
  StressBand,
} from '../data/types';
import { clamp, fmt, fmtSigned, round } from '../lib/format';
import { addDays } from '../lib/dates';
import { baselineDelta, metricSeries } from './baseline';
import { hrvStatus, type HrvStatus } from './hrv';
import { logistic, median, robustSd } from './stats';

/** WHOOP bands: green ≥ 67, yellow 34–66, red < 34. */
export const BAND_THRESHOLDS = { green: 67, yellow: 34 } as const;

export type TrainingLabel = 'Progress' | 'Train, hold loads' | 'Light day' | '—';

export const VERDICT_COPY: Record<Band, string> = {
  green: 'Primed — progress loads today',
  yellow: 'Steady — train, hold loads',
  red: 'Run down — keep today light',
  neutral: 'No recovery signal yet — log HRV/RHR or connect WHOOP',
};

export const TRAINING_COPY: Record<Band, TrainingLabel> = {
  green: 'Progress',
  yellow: 'Train, hold loads',
  red: 'Light day',
  neutral: '—',
};

/** Model weights, signed as they enter the linear predictor. Exported for tuning. */
export const READINESS_WEIGHTS = {
  hrv: 0.4,
  rhr: -0.22,
  sleep: 0.18,
  load: -0.1,
  subj: 0.1,
} as const;
export type ReadinessInputKey = keyof typeof READINESS_WEIGHTS;

/** Logistic slope at the origin. */
export const READINESS_K = 1.1;

/**
 * What the own score reads when every input sits exactly on the user's own
 * reference (all z = 0).
 *
 * **A tunable heuristic, not a published constant.** The model as specified has
 * no intercept, so a neutral day reads 50 — and on a stationary simulated user
 * that puts 11–12 % of ordinary days under WHOOP's red line at 34, because the
 * two dominant inputs (0.40·z_hrv, 0.22·z_rhr) give the linear predictor a
 * standard deviation of ≈ 0.55 and the red threshold sits closer to the middle
 * (x = −0.60) than the green one (x = +0.64).
 *
 * Two reasons to move it to 55 rather than widen the bands:
 * 1. **The blend needs one scale.** `score = w·WHOOP + (1 − w)·own` is only
 *    seamless if the two agree about what an ordinary day looks like. WHOOP's
 *    recovery for a rested user does not centre on 50; a score that does would
 *    make every import gap drift the hero number downward.
 * 2. **A neutral day is not a coin flip.** Sitting on your own baseline is a
 *    green-ish yellow, not the midpoint between "primed" and "run down".
 *
 * Measured effect (`readiness.sim.test.ts`): stationary red 11.6 % → ≈ 6 %,
 * green ≈ 10 % → ≈ 16 %. Set it back to 50 for the plan's literal formula.
 */
export const READINESS_BASELINE_SCORE = 55;
/** The intercept that puts a neutral day at `READINESS_BASELINE_SCORE`. */
export const READINESS_INTERCEPT =
  Math.log(READINESS_BASELINE_SCORE / (100 - READINESS_BASELINE_SCORE)) / READINESS_K;
/** Every standardised input is clamped here before it is weighted. */
export const Z_CLAMP = 3;

/** One "z unit" of sleep is 45 minutes against need. */
export const SLEEP_Z_HOURS = 0.75;
/** Garmin's Training Readiness reads three nights; nearer nights weigh more. */
export const SLEEP3_WEIGHTS = [0.5, 0.3, 0.2] as const;

/** Robust reference windows, in days. */
export const RHR_BASELINE_DAYS = 28;
export const LOAD_BASELINE_DAYS = 28;
export const SUBJ_BASELINE_DAYS = 28;
/** Minimum readings before a robust reference is usable. */
export const MIN_REFERENCE_READINGS = 7;
/** SD floors so a fortnight of identical entries cannot manufacture a ±10 z. */
export const RHR_SD_FLOOR_BPM = 0.75;
export const LOAD_SD_FLOOR = 25;
export const SUBJ_SD_FLOOR = 0.25;

/** WHOOP coverage ramps in and out over this many days. */
export const WHOOP_RAMP_DAYS = 7;

/** Resting HR this far below baseline is the "genuine recovery" exception to `unbalanced`. */
export const RHR_RECOVERY_BPM = 3;
/** ACWR above this contributes (never decides) a downgrade — Williams 2017 spike zone. */
export const ACWR_SPIKE = 1.5;

/**
 * Residual uncertainty of an input that *is* present, in z units. A heuristic:
 * every z here is itself estimated from 7–90 noisy readings, so "present" is not
 * "known". Labelled rather than cited — no study fixes it.
 */
export const PRESENT_INPUT_SE = 0.35;
/** Half-width, in points, we allow a WHOOP recovery score itself. Heuristic. */
export const WHOOP_HALF_WIDTH_POINTS = 3;
/** 90 % interval. */
export const CONFIDENCE_Z = 1.645;

export function bandOf(score: number | null): Band {
  if (score === null || !Number.isFinite(score)) return 'neutral';
  if (score >= BAND_THRESHOLDS.green) return 'green';
  if (score >= BAND_THRESHOLDS.yellow) return 'yellow';
  return 'red';
}

/** One step worse. Red is the floor — modifiers never override it in either direction. */
export function downgrade(band: Band): Band {
  if (band === 'green') return 'yellow';
  if (band === 'yellow') return 'red';
  return band;
}

/**
 * Cap at yellow: "hold loads". Used by the `unbalanced` rule, which the plan
 * states as "→ yellow", not "one step worse" — an above-range 7-day HRV mean is
 * a reason not to progress loads, never on its own a reason to call the day red.
 */
export function capAtYellow(band: Band): Band {
  return band === 'green' ? 'yellow' : band;
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

const clampZ = (z: number): number => clamp(z, -Z_CLAMP, Z_CLAMP);

/** Robust z of `x` against `ref`, or null when the reference is too thin. */
function robustZOf(x: number | null, ref: number[], floor: number): number | null {
  if (x === null || ref.length < MIN_REFERENCE_READINGS) return null;
  const m = median(ref);
  const sd = robustSd(ref, floor);
  if (m === null || sd === null || sd <= 0) return null;
  return clampZ((x - m) / sd);
}

/** Finite values of `key` over the `days` days ending `end` (inclusive). */
function refValues(records: DailyRecord[], key: 'rhr' | 'ld', end: ISODate, days: number): number[] {
  return metricSeries(records, key, end, days)
    .map((p) => p.v)
    .filter((v): v is number => v !== null);
}

// ---------------------------------------------------------------------------
// Hooper index
// ---------------------------------------------------------------------------

/**
 * Mean of whatever Hooper items were answered that day, 1–7 with 1 = best.
 * Null when none were. The mean (rather than the sum) keeps a 2-item day on the
 * same scale as a 4-item one.
 */
export function hooperMean(rec: DailyRecord | null | undefined): number | null {
  if (!rec) return null;
  const vals = [rec.qs, rec.qf, rec.qt, rec.qo].filter(isNum);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function hooperSeries(records: DailyRecord[], end: ISODate, days: number): number[] {
  const byDate = new Map<ISODate, DailyRecord>();
  for (const r of records) byDate.set(r.d, r);
  const out: number[] = [];
  for (let k = days - 1; k >= 0; k--) {
    const v = hooperMean(byDate.get(addDays(end, -k)));
    if (v !== null) out.push(v);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Sleep history
// ---------------------------------------------------------------------------

export interface Sleep3 {
  z: number | null;
  /** Hours slept last night, for the caption. */
  lastNightHrs: number | null;
  /** Nights that contributed. */
  nights: number;
}

/**
 * Weighted 3-night sleep history against need, in units of `SLEEP_Z_HOURS`.
 * Weights renormalise over the nights actually logged, so two nights are not
 * silently scored as "0.2 of a night short".
 */
export function sleep3(records: DailyRecord[], asOf: ISODate, profile: Profile): Sleep3 {
  const byDate = new Map<ISODate, DailyRecord>();
  for (const r of records) byDate.set(r.d, r);
  let num = 0;
  let wsum = 0;
  let nights = 0;
  let lastNightHrs: number | null = null;
  for (let k = 0; k < SLEEP3_WEIGHTS.length; k++) {
    const rec = byDate.get(addDays(asOf, -k));
    if (!rec || !isNum(rec.slh)) continue;
    const need = isNum(rec.sln) && rec.sln > 0 ? rec.sln : profile.sleepBaselineHrs;
    if (!isNum(need) || need <= 0) continue;
    if (k === 0) lastNightHrs = rec.slh;
    num += SLEEP3_WEIGHTS[k] * ((rec.slh - need) / SLEEP_Z_HOURS);
    wsum += SLEEP3_WEIGHTS[k];
    nights++;
  }
  if (wsum === 0) return { z: null, lastNightHrs, nights: 0 };
  return { z: clampZ(num / wsum), lastNightHrs, nights };
}

// ---------------------------------------------------------------------------
// WHOOP coverage
// ---------------------------------------------------------------------------

export interface WhoopCoverage {
  /** Blend weight 0–1: days with a recovery in the last 7, over 7. */
  w: number;
  /** The most recent recovery inside the ramp window. */
  value: number | null;
  /** Days since that reading (0 = today, null when there is none). */
  ageDays: number | null;
  /** Days with a recovery inside the ramp window. */
  days: number;
  /** True when today's own import landed. */
  fresh: boolean;
}

export function whoopCoverage(records: DailyRecord[], asOf: ISODate): WhoopCoverage {
  const byDate = new Map<ISODate, DailyRecord>();
  for (const r of records) byDate.set(r.d, r);
  let days = 0;
  let value: number | null = null;
  let ageDays: number | null = null;
  for (let k = 0; k < WHOOP_RAMP_DAYS; k++) {
    const rec = byDate.get(addDays(asOf, -k));
    const rec0 = rec && isNum(rec.rec) ? clamp(rec.rec, 0, 100) : null;
    if (rec0 === null) continue;
    days++;
    if (value === null) {
      value = rec0;
      ageDays = k;
    }
  }
  return { w: days / WHOOP_RAMP_DAYS, value, ageDays, days, fresh: ageDays === 0 };
}

/**
 * What the WHOOP side of the blend is worth *today*.
 *
 * On a day the import landed it is that number, full stop. On a day it did not,
 * the honest estimate is **not** the stale reading: WHOOP's level moves as much
 * day to day as ours does, so carrying Tuesday's 78 into Friday at 4/7 weight
 * re-introduces the step the ramp exists to remove (measured: up to 10 points
 * on the first missing day). What actually persists across a gap is WHOOP's
 * **offset from our own model** — the systematic "WHOOP reads 12 points higher
 * than we do for this person" — so the gap-day estimate is today's own score
 * plus the offset measured on the last day both existed. The number then only
 * drifts by `(1 − w) × offset`, which is exactly the gradual hand-over the
 * blend promises.
 */
export interface WhoopTerm {
  /** The value entering `w · WHOOP + (1 − w) · own`, or null when there is none. */
  value: number | null;
  /** WHOOP − own on the last day both existed; 0 when it could not be measured. */
  offset: number;
  fresh: boolean;
}

function whoopTerm(
  records: DailyRecord[],
  asOf: ISODate,
  profile: Profile,
  coverage: WhoopCoverage,
  ownToday: number | null,
): WhoopTerm {
  if (coverage.value === null) return { value: null, offset: 0, fresh: false };
  if (coverage.fresh || ownToday === null || coverage.ageDays === null) {
    return { value: coverage.value, offset: 0, fresh: coverage.fresh };
  }
  const anchor = addDays(asOf, -coverage.ageDays);
  const anchorOwn = ownScore(records, anchor, profile, hrvStatus(records, anchor, { age: profile.age })).score;
  if (anchorOwn === null) return { value: coverage.value, offset: 0, fresh: false };
  const offset = coverage.value - anchorOwn;
  return { value: clamp(ownToday + offset, 0, 100), offset, fresh: false };
}

// ---------------------------------------------------------------------------
// Own score
// ---------------------------------------------------------------------------

interface RawInput {
  key: ReadinessInputKey;
  label: string;
  value: number | null;
  z: number | null;
}

export interface OwnScore {
  /** 0–100, or null when not one input was available. */
  score: number | null;
  /** The linear predictor before the logistic. */
  x: number;
  inputs: RawInput[];
  nInputs: number;
  /** Half-width of the 90 % interval in points. */
  halfWidth: number;
}

const LABELS: Record<ReadinessInputKey, string> = {
  hrv: 'HRV (7-day vs baseline)',
  rhr: 'Resting HR',
  sleep: 'Sleep vs need (3 nights)',
  load: "Yesterday's training load",
  subj: 'Check-in (Hooper)',
};

function linear(inputs: RawInput[]): number {
  let x = READINESS_INTERCEPT;
  for (const i of inputs) if (i.z !== null) x += READINESS_WEIGHTS[i.key] * i.z;
  return x;
}

const toScore = (x: number): number => 100 * logistic(x, READINESS_K);
/** `-0` is a true statement about a float and a lie in a UI. */
const nz = (v: number): number => (v === 0 ? 0 : v);

/**
 * The own (non-WHOOP) readiness score and everything behind it. Exported so a
 * caller can show the model's answer beside a WHOOP one during the ramp.
 */
export function ownScore(
  records: DailyRecord[],
  asOf: ISODate,
  profile: Profile,
  hrv: HrvStatus,
): OwnScore {
  const today = records.find((r) => r.d === asOf) ?? null;
  const yesterday = addDays(asOf, -1);

  // HRV: the standardised 7-day mean, only once the validity gate has passed.
  const zHrv = hrv.bandAvailable && hrv.z !== null ? clampZ(hrv.z) : null;

  // RHR: today against a robust 28-day reference that excludes today.
  const rhrToday = today && isNum(today.rhr) ? today.rhr : null;
  const zRhr = robustZOf(
    rhrToday,
    refValues(records, 'rhr', yesterday, RHR_BASELINE_DAYS),
    RHR_SD_FLOOR_BPM,
  );

  const sleep = sleep3(records, asOf, profile);

  // Load: yesterday's, against a robust 28-day reference ending the day before.
  const ldYesterday = records.find((r) => r.d === yesterday);
  const loadValue = ldYesterday && isNum(ldYesterday.ld) ? ldYesterday.ld : null;
  const zLoad = robustZOf(
    loadValue,
    refValues(records, 'ld', addDays(asOf, -2), LOAD_BASELINE_DAYS),
    LOAD_SD_FLOOR,
  );

  // Subjective: negated Hooper (higher Hooper = worse = lower readiness).
  const hooper = hooperMean(today);
  const zHooper = robustZOf(
    hooper,
    hooperSeries(records, yesterday, SUBJ_BASELINE_DAYS),
    SUBJ_SD_FLOOR,
  );
  const zSubj = zHooper === null ? null : clampZ(-zHooper);

  const inputs: RawInput[] = [
    { key: 'hrv', label: LABELS.hrv, value: hrv.mean7Ms, z: zHrv },
    { key: 'rhr', label: LABELS.rhr, value: rhrToday, z: zRhr },
    { key: 'sleep', label: LABELS.sleep, value: sleep.lastNightHrs, z: sleep.z },
    { key: 'load', label: LABELS.load, value: loadValue, z: zLoad },
    { key: 'subj', label: LABELS.subj, value: hooper, z: zSubj },
  ];

  const nInputs = inputs.filter((i) => i.z !== null).length;
  const x = linear(inputs);

  // Variance of the linear predictor: a missing input is a full unit of unknown
  // z, a present one still carries PRESENT_INPUT_SE of estimation error.
  let varX = 0;
  for (const i of inputs) {
    const w = READINESS_WEIGHTS[i.key];
    varX += w * w * (i.z === null ? 1 : PRESENT_INPUT_SE * PRESENT_INPUT_SE);
  }
  const sd = Math.sqrt(varX);
  const halfWidth = (toScore(x + CONFIDENCE_Z * sd) - toScore(x - CONFIDENCE_Z * sd)) / 2;

  return {
    score: nInputs === 0 ? null : toScore(x),
    x,
    inputs,
    nInputs,
    halfWidth,
  };
}

// ---------------------------------------------------------------------------
// readiness()
// ---------------------------------------------------------------------------

export interface ReadinessOpts {
  /** Pre-computed HRV status (saves recomputing when the caller already has it). */
  hrv?: HrvStatus;
  /** Training form band from `engine/load` — passed as a value, never imported. */
  formBand?: FormBand | null;
  /** Acute:chronic ratio. Descriptive only: it contributes, it never decides. */
  acwr?: number | null;
  /** Band from `engine/load`'s ACWR shading, accepted as an alternative to `acwr`. */
  acwrBand?: AcwrBand | null;
  /** Stress band from `engine/stress` — passed as a value, never imported. */
  stressBand?: StressBand | null;
  /** Illness flag from `engine/stress`. */
  illness?: boolean | null;
}

export function readiness(
  records: DailyRecord[],
  asOf: ISODate,
  profile: Profile,
  opts: ReadinessOpts = {},
): Readiness {
  const today = records.find((r) => r.d === asOf) ?? null;
  const hrv = opts.hrv ?? hrvStatus(records, asOf, { age: profile.age });
  const rhr = baselineDelta(records, 'rhr', asOf, RHR_BASELINE_DAYS);
  const own = ownScore(records, asOf, profile, hrv);
  const whoop = whoopCoverage(records, asOf);

  // --- blend ---------------------------------------------------------------
  const ownValue = own.score;
  const term = whoopTerm(records, asOf, profile, whoop, ownValue);
  const hasWhoop = term.value !== null && whoop.w > 0;
  let blended: number | null;
  let w = 0;
  if (hasWhoop && ownValue !== null) {
    w = whoop.w;
    blended = w * (term.value as number) + (1 - w) * ownValue;
  } else if (hasWhoop) {
    // No own inputs at all — WHOOP alone carries the ring.
    w = 1;
    blended = term.value as number;
  } else {
    blended = ownValue;
  }
  const score = blended === null ? null : Math.round(clamp(blended, 0, 100));
  const source: Readiness['source'] =
    score === null ? 'none' : hasWhoop && w >= 0.5 ? 'whoop' : 'hrv';

  // --- verdict -------------------------------------------------------------
  const calibrating = !hrv.baselineEstablished || hrv.calibrating;
  const modifiers: ReadinessModifier[] = [];
  let band = bandOf(score);

  const forced = hrv.forcing;
  if (forced) {
    band = 'red';
    modifiers.push({
      key: 'hrvForcing',
      label: 'HRV forcing rule',
      effect: 'downgrade',
      reason: hrv.forcingReason ?? 'Your 7-day HRV average is well below your normal range.',
    });
  } else if (band !== 'neutral') {
    const rhrRecovering = rhr.delta !== null && rhr.delta <= -RHR_RECOVERY_BPM;
    if (hrv.band === 'unbalanced' && hrv.bandAvailable && !rhrRecovering) {
      const capped = capAtYellow(band);
      if (capped !== band) band = capped;
      modifiers.push({
        key: 'hrvUnbalanced',
        label: 'HRV above your normal range',
        effect: capped !== bandOf(score) ? 'downgrade' : 'note',
        reason: hrv.saturated
          ? (hrv.saturationReason as string)
          : 'Your 7-day HRV average is above your normal range without a matching drop in resting HR — hold loads rather than progressing them.',
      });
    }
    const pending: ReadinessModifier[] = [];
    if (opts.formBand === 'overreached') {
      pending.push({
        key: 'formOverreached',
        label: 'Training form: overreached',
        effect: 'downgrade',
        reason: 'Banister form is more than 30 % below your fitness — the plan already has you in the hole.',
      });
    }
    const acwrHigh =
      (isNum(opts.acwr) && opts.acwr > ACWR_SPIKE) || opts.acwrBand === 'spike';
    if (opts.stressBand === 'major') {
      pending.push({
        key: 'stressMajor',
        label: 'Overnight strain: major',
        effect: 'downgrade',
        reason: 'Overnight physiology is well outside your normal range.',
      });
    }
    if (opts.illness === true) {
      pending.push({
        key: 'illness',
        label: 'Possible illness or heavy overload',
        effect: 'downgrade',
        // Describes the data, never a condition and never a mechanism. The old
        // wording ("the way an infection moves them") named a condition class
        // and asserted the pattern was its signature, which every other surface
        // in the stack is careful not to do.
        reason: 'Several overnight signals moved outside your normal range together, for more than a day. This is not a diagnosis — if you feel unwell or it persists, check with your doctor.',
      });
    }
    // The acute:chronic ratio joins the others ONLY when something else already
    // fired. On its own it is descriptive and must not move the verdict
    // (Impellizzeri 2020), which is also what `LOAD_NOTES.acwrDescriptive`
    // promises the user on the Train and Trends cards. Before this guard, a
    // user coming back from three weeks off at their normal load — Banister
    // form fresh, stress none, illness false — was told to take a light day and
    // drop 7.5% and a set, for a reason that asserted fatigue nothing had
    // measured.
    if (acwrHigh && pending.length > 0) {
      pending.push({
        key: 'acwrSpike',
        label: 'Acute:chronic load spike',
        effect: 'downgrade',
        reason:
          'Your last week of load is well above your last month. ACWR is descriptive, not a causal injury predictor (Impellizzeri 2020), so it only ever contributes alongside another signal — as it is doing here.',
      });
    }
    if (pending.length > 0) {
      modifiers.push(...pending);
      band = downgrade(band); // one step in total, however many fired
    } else if (acwrHigh) {
      // Worth saying, without changing anything.
      modifiers.push({
        key: 'acwrSpike',
        label: 'Acute:chronic load spike',
        effect: 'note',
        reason:
          'Your last week of load is well above your last month. That is descriptive only (Impellizzeri 2020) and has not changed today’s verdict — nothing here moves on the ratio alone.',
      });
    }
  }

  // Modifiers that inform without changing the band.
  if (!forced && hrv.saturated && !modifiers.some((m) => m.key === 'hrvUnbalanced')) {
    modifiers.push({
      key: 'vagalSaturation',
      label: 'Possible vagal saturation',
      effect: 'note',
      reason: hrv.saturationReason as string,
    });
  }
  if (hrv.bigDrop && !forced) {
    modifiers.push({
      key: 'hrvBigDrop',
      label: 'Sharp single-day HRV drop',
      effect: 'note',
      reason: 'Today sits well below your reference and your weekly average is falling with it.',
    });
  }

  // --- contributors & confidence ------------------------------------------
  const ownShare = ownValue === null ? 0 : 1 - w;
  const contributors: ReadinessContributor[] = own.inputs.map((i) => {
    const weight = READINESS_WEIGHTS[i.key];
    const points =
      i.z === null ? 0 : ownShare * (toScore(own.x) - toScore(own.x - weight * i.z));
    return {
      key: i.key,
      label: i.label,
      value: i.value,
      z: i.z === null ? null : nz(round(i.z, 2)),
      weight,
      points: nz(round(points, 1)),
      effect: i.z === null || Math.abs(points) < 0.05 ? 'flat' : points > 0 ? 'up' : 'down',
    };
  });
  if (hasWhoop) {
    const whoopPoints = nz(
      round(ownValue === null ? 0 : w * ((term.value as number) - ownValue), 1),
    );
    contributors.unshift({
      key: 'whoop',
      label: 'WHOOP recovery',
      value: whoop.value,
      z: null,
      weight: round(w, 2),
      points: whoopPoints,
      effect: Math.abs(whoopPoints) < 0.05 ? 'flat' : whoopPoints > 0 ? 'up' : 'down',
    });
  }

  const halfWidth =
    score === null
      ? 0
      : hasWhoop && ownValue !== null
        ? w * WHOOP_HALF_WIDTH_POINTS + (1 - w) * own.halfWidth
        : hasWhoop
          ? WHOOP_HALF_WIDTH_POINTS
          : own.halfWidth;
  const nInputs = own.nInputs + (hasWhoop ? 1 : 0);

  return {
    score,
    band,
    source,
    verdict: calibrating && band !== 'neutral' ? `${VERDICT_COPY[band]} (still calibrating)` : VERDICT_COPY[band],
    training: TRAINING_COPY[band],
    detail: buildDetail(today, hrv, rhr, whoop, term, own, forced, calibrating),
    contributors,
    ...(modifiers.length ? { modifiers } : {}),
    ...(calibrating ? { calibrating: true as const } : {}),
    ...(score === null
      ? {}
      : {
          confidence: {
            lo: Math.round(clamp(score - halfWidth, 0, 100)),
            hi: Math.round(clamp(score + halfWidth, 0, 100)),
            nInputs,
          },
        }),
    ...(hasWhoop ? { blendWeight: round(w, 3) } : {}),
    ...(forced && bandOf(score) !== 'red' ? { forced: true as const } : {}),
  };
}

/**
 * One sentence citing the actual numbers, e.g.
 * "HRV 58 ms (baseline 62), RHR 52 (−1 vs baseline), slept 7.4 h of 7.9 h need."
 */
function buildDetail(
  today: DailyRecord | null,
  hrv: HrvStatus,
  rhr: BaselineDelta,
  whoop: WhoopCoverage,
  term: WhoopTerm,
  own: OwnScore,
  forced: boolean,
  calibrating: boolean,
): string {
  const parts: string[] = [];
  if (whoop.value !== null) {
    const blend = Math.round(whoop.w * 100);
    parts.push(
      whoop.fresh
        ? `WHOOP recovery ${fmt(whoop.value)}% (${blend}% of the score)`
        : `no WHOOP import for ${whoop.ageDays} day${whoop.ageDays === 1 ? '' : 's'}; its ${fmtSigned(Math.round(term.offset))}-point offset carried forward (${blend}% of the score)`,
    );
  }
  const ref =
    hrv.baselineMs !== null
      ? `baseline ${fmt(hrv.baselineMs)}`
      : hrv.mean7Ms !== null
        ? `7-day avg ${fmt(hrv.mean7Ms)}`
        : null;
  if (hrv.todayMs !== null) {
    parts.push(`HRV ${fmt(hrv.todayMs)} ms${ref !== null ? ` (${ref})` : ''}`);
  } else if (hrv.mean7Ms !== null) {
    parts.push(`HRV 7-day mean ${fmt(hrv.mean7Ms)} ms (none logged today)`);
  }
  if (rhr.today !== null) {
    parts.push(`RHR ${fmt(rhr.today)}${rhr.delta !== null ? ` (${fmtSigned(rhr.delta)} vs baseline)` : ''}`);
  }
  if (today && isNum(today.slh)) {
    parts.push(`slept ${fmt(today.slh, 1)} h${isNum(today.sln) ? ` of ${fmt(today.sln, 1)} h need` : ''}`);
  }
  const hooper = hooperMean(today);
  if (hooper !== null) parts.push(`check-in ${fmt(hooper, 1)}/7`);
  if (forced) {
    parts.push(
      hrv.forcingRule === 'twoSwc'
        ? `7-day HRV average ${fmt(hrv.mean7Ms)} ms is more than 2 × SWC below your reference and forces a light day`
        : '7-day HRV average has sat below your normal range two days running and forces a light day',
    );
  }
  if (!hrv.bandAvailable && hrv.suppressedReason !== null) parts.push(hrv.suppressedReason.replace(/\.$/, ''));
  if (calibrating) {
    parts.push(
      hrv.baselineEstablished
        ? `HRV reference still calibrating (${hrv.nBaseline} readings)`
        : `HRV baseline still forming (${hrv.daysOfData} days)`,
    );
  }
  if (own.nInputs > 0 && own.nInputs < 5) parts.push(`${own.nInputs} of 5 inputs available`);
  if (!parts.length) return `${VERDICT_COPY.neutral}.`;
  const s = `${parts.join(', ')}.`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
