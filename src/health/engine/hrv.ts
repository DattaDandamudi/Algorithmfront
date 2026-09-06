/**
 * §6.3 HRV v3 — robust ln rMSSD reference, SWC display band, and a forcing rule
 * that is deliberately separate from the band.
 *
 * ## Why ln(rMSSD)
 * Daily rMSSD is right-skewed; its natural log is ~normal, so means and SDs
 * behave and a fixed ln difference is a fixed % change (20 × Δln ≈ % change for
 * small Δ — the "20 × lnRMSSD" scale practitioners use).
 *
 * ## Reference window (v3 — the audit finding: 6 weeks was shorter than every
 * published rule)
 * Plausible readings (5–250 ms) in `[asOf − 67, asOf − 7]` (the "60-day"
 * window, 61 calendar days, lagged a week so the current week can never drag
 * its own baseline), extended to `[asOf − 97, asOf − 7]` when that window holds
 * ≥ 90 plausible readings. ln, then `median` and `robustSd` from
 * `engine/stats.ts` with a 0.03 floor; readings with `|z| > 3` are excluded
 * **once** and the pair recomputed. `nRef ≥ 20` or the reference falls back to
 * a 28-day window and the status is marked `calibrating` (no forcing, no
 * "great recovery" claim).
 *
 * Sources: Plews & Buchheit's 7-day rolling mean vs a longer reference;
 * Al Haddad 2011 for the ~week of readings a stable rMSSD reference needs;
 * Bellenger 2016 for the multi-week reference window.
 *
 * ## Display band — the practitioner SWC
 * ±0.5 SD around the reference median (Balanced / Low / Unbalanced / Poor).
 * This is the smallest worthwhile change Plews/Buchheit, Javaloyes 2019,
 * Garmin's HRV Status and HRV4Training all use.
 *
 * The banded quantity is the **7-day mean**, not one reading. A 7-day mean of
 * `n7` readings has standard error `sd/√n7`, and the reference median has its
 * own standard error `1.2533·sd/√nRef`, so the *nominal* ±0.5 SD edge is
 * expressed once as an equivalent z — `Z_SWC = 0.5·√7 = 1.3229` — and applied
 * to the standard error of `mean7 − median`:
 *
 *     se   = sd · √(1/n7 + (π/2)/nRef)
 *     edge = median ± Z_SWC · se
 *
 * With a full week (`n7 = 7`) and a long reference (`nRef → ∞`) this is exactly
 * `median ± 0.5·sd` — the practitioner SWC, unchanged. What it adds is that a
 * short reference or a week with three missing readings widens the band instead
 * of pretending it is as sharp as a complete one. That keeps the *rate* at which
 * an ordinary week leaves the band at ≈ 9% per side whatever the coverage,
 * rather than 9% at 90 readings and 15% at 20. `SWC_WIDEN_FOR_REFERENCE = true`
 * turns the widening off for anyone who wants the literal ±0.5 SD.
 *
 * ## Validity gate (audit — Plews)
 * The 7-day mean needs **≥ 4 valid readings** in its window. Below 3–4 readings
 * a week the weekly mean stops tracking anything, so the band is **suppressed**
 * (`insufficient` + a reason), never guessed.
 *
 * ## lnRmssdCv (Flatt & Esco)
 * The CV of ln rMSSD over the trailing 7 days, exported as an **independent
 * marker**: a *falling* CV marks positive adaptation and a *rising* one a loss
 * of stability. Because Flatt & Esco read a falling CV as a good sign, v3 no
 * longer lets a collapsing CV push the display band to "unbalanced" (v2 did);
 * the band is now purely the SWC position plus the age-norm check, and the CV
 * travels beside it.
 *
 * ## Vagal-saturation guard (audit)
 * With `RR ≈ 60000 / rhr` (mean R–R interval in ms), if the 28-day correlation
 * between ln rMSSD and RR is not positive then rMSSD is not tracking cardiac
 * parasympathetic activity for this user this month — a high rMSSD may be
 * saturation rather than recovery (Kiviniemi 2004; Plews 2013 on saturation in
 * highly trained athletes). `saturated` is set and **both** directions are
 * suppressed: no "low HRV" warning (`lowWarning`), no "great recovery" claim
 * (`greatRecovery`), no forcing. The reason is exported for the caption.
 *
 * The plan's threshold is "r ≤ 0"; we require r to be negative with one-sided
 * 95 % confidence instead — see `SATURATION_CONFIDENCE_Z` for the measurement
 * that forced that change.
 *
 * ## Forcing — separate from the display band
 * Fires when the baseline is established, not `calibrating` and not
 * `saturated`, and either
 *   A. `mean7 < median − 2 × SWC` (i.e. −1.0 SD). **This threshold is a tunable
 *      heuristic with no direct published support** — see `FORCING_EVIDENCE`,
 *      which exposes that fact so the UI copy can say it too, or
 *   B. the 7-day mean sat below the lower SWC edge today **and** yesterday
 *      (Kiviniemi 2007's HRV-guided training rule).
 * `forcingHitRate` replays the rule over a trailing window so it can be
 * personalised later.
 *
 * ## bigDrop
 * Today's z ≤ −2 **and** the 7-day mean fell ≥ 0.75 on the 20 × ln scale
 * (≈ 3.8 % of rMSSD). Both halves are required: a single low reading with no
 * movement in the trend is noise.
 *
 * ## referenceStart
 * An optional `ISODate` truncating the reference, so a confirmed regime shift
 * (a changepoint, a new training block, an altitude camp) does not average the
 * old regime into the new one. `hrv` deliberately does **not** import
 * `changepoint` — the caller passes the date.
 *
 * Pure, deterministic, clock-free: records in (any order), plain numbers/nulls
 * out; never NaN, never throws. Millisecond outputs are geometric (exp of ln)
 * so they match the SWC arithmetic; ln values keep full precision.
 */
import type { DailyRecord, HrvBand, ISODate } from '../data/types';
import { mean, round, stddev } from '../lib/format';
import { metricSeries } from './baseline';
import { median, pearson, robustSd } from './stats';

// ---------------------------------------------------------------------------
// Constants — every one either cited or labelled
// ---------------------------------------------------------------------------

/** SWC = median ± SWC_K × SD. 0.5 is the practitioner smallest worthwhile change. */
export const SWC_K = 0.5;
/** The nominal SWC expressed as a z of the 7-day mean: 0.5 × √7. */
export const Z_SWC = SWC_K * Math.sqrt(7);
/** Nominal readings behind a 7-day mean — the divisor `Z_SWC` is calibrated to. */
export const NOMINAL_WEEK_READINGS = 7;
/** Var(median) ≈ (π/2)·σ²/n for a Gaussian sample — the reference's own error. */
export const MEDIAN_VAR_FACTOR = Math.PI / 2;
/** Set false to use the literal ±0.5 SD band regardless of coverage. */
export const SWC_WIDEN_FOR_REFERENCE = true;

/** The reference ends this many days before `asOf` so the current week is never in it. */
export const REF_LAG_DAYS = 7;
/** Primary reference span: `[asOf − 67, asOf − 7]`. */
export const REF_WINDOW_DAYS = 60;
/** Extended reference span: `[asOf − 97, asOf − 7]`. */
export const REF_WINDOW_MAX_DAYS = 90;
/** Readings the extended window must hold before it is used instead of the 60-day one. */
export const REF_EXTEND_MIN_READINGS = 90;
/** `nRef ≥ 20` or the reference falls back to 28 days and the status is `calibrating`. */
export const MIN_REF_READINGS = 20;
/** Fallback reference span when the long window is too sparse. */
export const FALLBACK_WINDOW_DAYS = 28;
/** Minimum readings before any range can be published at all. */
export const MIN_SD_READINGS = 7;
/** ln SD floor — a fortnight of identical readings must not make the band infinitely sharp. */
export const REF_SD_FLOOR_LN = 0.03;
/** Readings this far from the reference median are excluded once, then the pair is recomputed. */
export const REF_OUTLIER_Z = 3;
/** Physiologically plausible overnight rMSSD, ms. Outside this it is a device artefact. */
export const HRV_PLAUSIBLE_MS = { min: 5, max: 250 } as const;

/** Validity gate (Plews): below 4 readings a week the weekly mean tracks nothing. */
export const MIN_WEEK_READINGS = 4;
/** The 7-day window the mean and `lnRmssdCv` are taken over. */
export const WEEK_DAYS = 7;

/** Baseline is "established" at ≥ 21 readings within the last 30 days. */
export const BASELINE_READINGS = 21;
export const BASELINE_WINDOW_DAYS = 30;

/** Forcing rule A: `mean7 < median − FORCING_SWC_MULTIPLE × SWC`. */
export const FORCING_SWC_MULTIPLE = 2;
/** Forcing rule B needs this many consecutive days below the lower SWC edge (Kiviniemi 2007). */
export const FORCING_CONSECUTIVE_DAYS = 2;
/**
 * Rule B also requires the 7-day mean to be **still falling** on the second
 * day. Our own filter, not Kiviniemi's: consecutive 7-day means share six of
 * their seven readings, so "two days below the range" is only ~55 % persistent
 * on stationary noise and the bare two-day rule fires on 5.7 % of stationary
 * days (measured, `hrv.sim.test.ts`). Adding "and not already recovering"
 * halves that to ≈ 2.5 % without costing a day of detection on a real drop,
 * because a real drop keeps falling. Labelled a heuristic in FORCING_EVIDENCE.
 */
export const FORCING_REQUIRE_FALLING = true;
/** Default replay window for `forcingHitRate`. */
export const FORCING_HIT_RATE_DAYS = 180;

/** bigDrop needs today's z at or below this… */
export const BIG_DROP_Z = -2;
/** …and the 7-day mean to have fallen at least this much on the 20 × ln scale. */
export const BIG_DROP_MEAN7_20LN = 0.75;

/** CV must move ≥ 20 % relative to the prior week to count as rising/falling. */
export const CV_TREND_PCT = 20;
/** Rising-CV flag: this week's CV at least this factor above the reference CV. */
export const CV_SHIFT_FACTOR = 2;
/** Need most of a week's readings before trusting a CV (avoids 2-point noise). */
export const MIN_CV_READINGS = 4;

/** Saturation guard window and the correlation ceiling (the plan's "≤ 0"). */
export const SATURATION_WINDOW_DAYS = 28;
export const SATURATION_MIN_PAIRS = 14;
export const SATURATION_R_MAX = 0;
/**
 * …but "≤ 0" alone is a coin flip. A correlation over 28 nights has a standard
 * error of ≈ 0.19, so a user whose HRV and resting HR simply do not covary would
 * be flagged on half of all days — and on the demo dataset that suppressed a
 * genuine −20 % HRV week (z = −5.9) because the estimate landed at −0.02.
 *
 * So the guard also requires the correlation to be negative with one-sided
 * 95 % confidence: `atanh(r)·√(n − 3) ≤ −1.645`, i.e. r ≤ −0.32 at 28 pairs.
 * A real saturating athlete sits at −0.3 to −0.6, which 28 nights detect; a
 * merely uncoupled one is left alone rather than silenced.
 */
export const SATURATION_CONFIDENCE_Z = 1.645;

/** The correlation a sample of `n` pairs must be at or below to flag saturation. */
export function saturationThreshold(n: number): number {
  if (!Number.isFinite(n) || n <= 3) return SATURATION_R_MAX;
  return Math.min(SATURATION_R_MAX, Math.tanh(-SATURATION_CONFIDENCE_Z / Math.sqrt(n - 3)));
}
/** Plausible resting HR, bpm — outside this the RR conversion is meaningless. */
export const RHR_PLAUSIBLE_BPM = { min: 25, max: 120 } as const;

/** Days of history `hrvStatus` needs to fill every window above. */
export const HRV_SPAN_DAYS = REF_LAG_DAYS + REF_WINDOW_MAX_DAYS + 1; // 98

/**
 * Where each forcing clause comes from — exported so the UI copy can say
 * "tunable heuristic" in the user's own words rather than hiding it in a
 * comment. Invariant 6 of the engine brief: a number with neither a source nor
 * a "heuristic" label is a review finding.
 */
export const FORCING_EVIDENCE = {
  twoSwc: {
    rule: `mean7 below ${FORCING_SWC_MULTIPLE} × SWC`,
    support: 'heuristic' as const,
    label: 'tunable heuristic, no direct published support',
    note:
      `The ${FORCING_SWC_MULTIPLE} × SWC (−1.0 SD) cut-off is our own tunable heuristic — ` +
      'no published study sets a light-day threshold there. We record how often it fires so it can be tuned to you.',
  },
  twoDays: {
    rule: `${FORCING_CONSECUTIVE_DAYS} days below the SWC, still falling`,
    support: 'published' as const,
    label: 'Kiviniemi 2007 (with our own "still falling" filter)',
    note:
      'Two days running below your smallest worthwhile change, and still falling — the rule Kiviniemi 2007 ' +
      'used for HRV-guided training, where it beat a fixed programme. The "still falling" half is ours: ' +
      'without it the rule fires on twice as many ordinary days.',
  },
} as const;

export type ForcingRule = keyof typeof FORCING_EVIDENCE;

/**
 * Age norms for the long-term (28-day) geometric mean; below → "poor".
 * Small population table (Garmin-style), not a diagnosis.
 */
export const HRV_AGE_NORM_MS: ReadonlyArray<{ maxAge: number; ms: number }> = [
  { maxAge: 29, ms: 35 },
  { maxAge: 39, ms: 30 },
  { maxAge: 49, ms: 25 },
  { maxAge: Infinity, ms: 20 },
];

export function ageNormMs(age: number | undefined): number | null {
  if (age === undefined || !Number.isFinite(age) || age < 0) return null;
  const row = HRV_AGE_NORM_MS.find((r) => age <= r.maxAge);
  return row ? row.ms : null;
}

/** A usable rMSSD: finite and inside the plausible physiological range. */
export function isHrv(v: unknown): v is number {
  return (
    typeof v === 'number' &&
    Number.isFinite(v) &&
    v >= HRV_PLAUSIBLE_MS.min &&
    v <= HRV_PLAUSIBLE_MS.max
  );
}

/** A usable resting HR for the RR conversion. */
function isRhr(v: unknown): v is number {
  return (
    typeof v === 'number' &&
    Number.isFinite(v) &&
    v >= RHR_PLAUSIBLE_BPM.min &&
    v <= RHR_PLAUSIBLE_BPM.max
  );
}

// ---------------------------------------------------------------------------
// Series
// ---------------------------------------------------------------------------

export interface LnPoint {
  d: ISODate;
  ln: number | null;
  ms: number | null;
}

/** One entry per calendar day (ascending, null gaps) with both ms and ln(rMSSD). */
export function lnSeries(records: DailyRecord[], asOf: ISODate, days: number): LnPoint[] {
  return metricSeries(records, 'hrv', asOf, days).map((p) => ({
    d: p.d,
    ms: isHrv(p.v) ? p.v : null,
    ln: isHrv(p.v) ? Math.log(p.v) : null,
  }));
}

/** Non-null values of `arr` in the inclusive index range, clamped to the array. */
function valuesIn(arr: Array<number | null>, from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = Math.max(0, from); i <= Math.min(arr.length - 1, to); i++) {
    const v = arr[i];
    if (v !== null && Number.isFinite(v)) out.push(v);
  }
  return out;
}

/** Coefficient of variation (%) of ln values; null when too few or mean ≤ 0. */
function cvOf(values: number[]): number | null {
  if (values.length < MIN_CV_READINGS) return null;
  const m = mean(values);
  const sd = stddev(values);
  if (m === null || sd === null || m <= 0) return null;
  return (sd / m) * 100;
}

// ---------------------------------------------------------------------------
// Reference
// ---------------------------------------------------------------------------

export interface HrvReference {
  /** Robust centre of ln rMSSD over the reference window. */
  medianLn: number | null;
  /** exp(medianLn), 1 dp — the geometric median in ms. */
  medianMs: number | null;
  /** 1.4826 × MAD of the reference ln values, floored at REF_SD_FLOOR_LN. */
  sdLn: number | null;
  /** Readings behind the reference after the single outlier pass. */
  n: number;
  /** Readings dropped by the `|z| > 3` pass. */
  nExcluded: number;
  /** 90, 60 or 28 — which window produced it. */
  windowDays: number;
  /** First / last calendar day the reference could draw on. */
  start: ISODate | null;
  end: ISODate | null;
  /** True when the reference fell back to 28 days (nRef < 20): no forcing, no claims. */
  calibrating: boolean;
  /** CV (%) of the reference ln values — the stable comparison for `lnRmssdCv`. */
  cvLn: number | null;
  /** Set when the caller truncated the reference after a confirmed regime shift. */
  truncatedAt: ISODate | null;
}

const EMPTY_REFERENCE: HrvReference = {
  medianLn: null,
  medianMs: null,
  sdLn: null,
  n: 0,
  nExcluded: 0,
  windowDays: REF_WINDOW_DAYS,
  start: null,
  end: null,
  calibrating: true,
  cvLn: null,
  truncatedAt: null,
};

const ms1 = (ln: number | null): number | null => (ln === null ? null : round(Math.exp(ln), 1));
const fmtMs = (ms: number | null): string => (ms === null ? '—' : String(Math.round(ms)));

/** Median + robust SD with one `|z| > 3` exclusion pass. */
function robustCentre(values: number[]): { m: number; sd: number; kept: number[]; dropped: number } {
  const m0 = median(values) as number;
  const sd0 = Math.max(REF_SD_FLOOR_LN, robustSd(values, REF_SD_FLOOR_LN) as number);
  const kept = values.filter((v) => Math.abs(v - m0) / sd0 <= REF_OUTLIER_Z);
  const use = kept.length >= MIN_SD_READINGS ? kept : values;
  const m = median(use) as number;
  const sd = Math.max(REF_SD_FLOOR_LN, robustSd(use, REF_SD_FLOOR_LN) as number);
  return { m, sd, kept: use, dropped: values.length - use.length };
}

interface WindowSpec {
  from: number;
  to: number;
  days: number;
  calibrating: boolean;
}

/**
 * The reference for index `i` of an ln array whose dates are `dates`.
 * Tries, in order: the 90-day window (only when it holds ≥ 90 readings), the
 * 60-day window (needs ≥ 20), a 28-day window ending a week back, and — only
 * for a user whose whole history is younger than a fortnight — the trailing 28
 * days. The last two are marked `calibrating`.
 */
function buildReference(
  ln: Array<number | null>,
  dates: ISODate[],
  i: number,
  referenceStart?: ISODate,
): HrvReference {
  const lagEnd = i - REF_LAG_DAYS;
  const specs: WindowSpec[] = [
    { from: lagEnd - REF_WINDOW_MAX_DAYS, to: lagEnd, days: REF_WINDOW_MAX_DAYS, calibrating: false },
    { from: lagEnd - REF_WINDOW_DAYS, to: lagEnd, days: REF_WINDOW_DAYS, calibrating: false },
    { from: lagEnd - FALLBACK_WINDOW_DAYS + 1, to: lagEnd, days: FALLBACK_WINDOW_DAYS, calibrating: true },
    { from: i - FALLBACK_WINDOW_DAYS + 1, to: i, days: FALLBACK_WINDOW_DAYS, calibrating: true },
  ];
  const minFor = (idx: number): number =>
    idx === 0 ? REF_EXTEND_MIN_READINGS : idx === 1 ? MIN_REF_READINGS : MIN_SD_READINGS;

  for (let k = 0; k < specs.length; k++) {
    const spec = specs[k];
    const from = Math.max(0, spec.from);
    const to = Math.min(ln.length - 1, spec.to);
    if (to < from) continue;
    const values: number[] = [];
    for (let j = from; j <= to; j++) {
      const v = ln[j];
      if (v === null || !Number.isFinite(v)) continue;
      if (referenceStart !== undefined && dates[j] < referenceStart) continue;
      values.push(v);
    }
    if (values.length < minFor(k)) continue;
    const { m, sd, kept, dropped } = robustCentre(values);
    return {
      medianLn: m,
      medianMs: ms1(m),
      sdLn: sd,
      n: kept.length,
      nExcluded: dropped,
      windowDays: spec.days,
      start: dates[from] ?? null,
      end: dates[to] ?? null,
      calibrating: spec.calibrating,
      cvLn: kept.length >= MIN_CV_READINGS && m > 0 ? (sd / m) * 100 : null,
      truncatedAt: referenceStart ?? null,
    };
  }
  return { ...EMPTY_REFERENCE, truncatedAt: referenceStart ?? null };
}

// ---------------------------------------------------------------------------
// Per-day core
// ---------------------------------------------------------------------------

export interface HrvCore {
  reference: HrvReference;
  /** 7-day rolling mean of ln rMSSD ending at the day (today included when logged). */
  mean7Ln: number | null;
  /** Valid readings inside that 7-day window. */
  n7: number;
  /** Standard error of `mean7Ln − reference.medianLn`. */
  seLn: number | null;
  /** `(mean7Ln − medianLn) / seLn`, the quantity the band and forcing threshold. */
  z: number | null;
  swcLowerLn: number | null;
  swcUpperLn: number | null;
  /** `medianLn − 2 × SWC` on the same widened scale as the band edges. */
  forceLowerLn: number | null;
  /** True when the 7-day window cleared the ≥ 4 reading validity gate. */
  weekValid: boolean;
}

function coreAt(
  ln: Array<number | null>,
  dates: ISODate[],
  i: number,
  referenceStart?: ISODate,
): HrvCore {
  const reference = buildReference(ln, dates, i, referenceStart);
  const week = valuesIn(ln, i - WEEK_DAYS + 1, i);
  const mean7Ln = mean(week);
  const n7 = week.length;
  const weekValid = n7 >= MIN_WEEK_READINGS;
  const { medianLn, sdLn, n: nRef } = reference;

  if (medianLn === null || sdLn === null || mean7Ln === null || n7 === 0) {
    return {
      reference,
      mean7Ln,
      n7,
      seLn: null,
      z: null,
      swcLowerLn: null,
      swcUpperLn: null,
      forceLowerLn: null,
      weekValid,
    };
  }
  const varUnits = SWC_WIDEN_FOR_REFERENCE
    ? 1 / n7 + MEDIAN_VAR_FACTOR / Math.max(1, nRef)
    : 1 / NOMINAL_WEEK_READINGS;
  const seLn = sdLn * Math.sqrt(varUnits);
  const halfWidth = Z_SWC * seLn;
  return {
    reference,
    mean7Ln,
    n7,
    seLn,
    z: (mean7Ln - medianLn) / seLn,
    swcLowerLn: medianLn - halfWidth,
    swcUpperLn: medianLn + halfWidth,
    forceLowerLn: medianLn - FORCING_SWC_MULTIPLE * halfWidth,
    weekValid,
  };
}

// ---------------------------------------------------------------------------
// Saturation guard
// ---------------------------------------------------------------------------

export interface SaturationCheck {
  saturated: boolean;
  /** Pearson r between ln rMSSD and RR (= 60000/rhr) over the last 28 days. */
  r: number | null;
  /** Complete (hrv, rhr) pairs behind it. */
  n: number;
  reason: string | null;
}

const NO_SATURATION: SaturationCheck = { saturated: false, r: null, n: 0, reason: null };

function saturationAt(
  ln: Array<number | null>,
  rhr: Array<number | null>,
  i: number,
): SaturationCheck {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let j = Math.max(0, i - SATURATION_WINDOW_DAYS + 1); j <= Math.min(ln.length - 1, i); j++) {
    const l = ln[j];
    const h = rhr[j];
    if (l === null || h === null || !isRhr(h)) continue;
    xs.push(l);
    ys.push(60000 / h);
  }
  if (xs.length < SATURATION_MIN_PAIRS) return { ...NO_SATURATION, n: xs.length };
  const r = pearson(xs, ys);
  if (r === null) return { ...NO_SATURATION, n: xs.length };
  if (r > saturationThreshold(xs.length)) return { saturated: false, r, n: xs.length, reason: null };
  return {
    saturated: true,
    r,
    n: xs.length,
    reason:
      `Your HRV is moving against your resting heart rate this month (r = ${round(r, 2)} over ${xs.length} nights), ` +
      'so a high rMSSD may be vagal saturation rather than recovery — HRV advice is paused either way.',
  };
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export interface HrvStatus {
  todayMs: number | null;
  todayLn: number | null;
  /** Robust z of TODAY's single reading against the reference (daily scale). */
  todayZ: number | null;
  /** 7-day rolling mean of ln(rMSSD) ending asOf — the banded quantity. */
  mean7Ln: number | null;
  /** exp(mean7Ln) — the geometric mean in ms. */
  mean7Ms: number | null;
  /** Valid readings in the 7-day window; below MIN_WEEK_READINGS the band is suppressed. */
  n7: number;
  /** `(mean7Ln − reference median) / se` — what the band and forcing thresholds test. */
  z: number | null;

  /** The robust reference behind the band (60/90-day, or a 28-day fallback). */
  reference: HrvReference;
  /** Reference median as ln — the value the SWC is centred on. */
  baselineLn: number | null;
  /** exp(baselineLn), 1 dp. */
  baselineMs: number | null;
  /** Readings behind the reference. */
  nBaseline: number;
  /** Robust SD of the reference ln values. */
  sdLn: number | null;
  /** True while the reference is a 28-day fallback (< 20 readings in the long window). */
  calibrating: boolean;

  swcLowerLn: number | null;
  swcUpperLn: number | null;
  swcLowerMs: number | null;
  swcUpperMs: number | null;

  band: HrvBand;
  /** False when the validity gate or a missing reference suppressed the band. */
  bandAvailable: boolean;
  /** Why the band is suppressed, null when it is shown. */
  suppressedReason: string | null;

  /** CV (%) of ln rMSSD over the trailing 7 days — Flatt & Esco's marker. */
  lnRmssdCv: number | null;
  /** Alias of `lnRmssdCv` kept for the existing Trends/Coach callers. */
  cv7: number | null;
  cvPrev7: number | null;
  cvTrend: 'rising' | 'falling' | 'stable' | null;
  /** CV (%) of the reference ln values. */
  cvRef: number | null;
  /** cv7 ≥ 2 × cvRef — a rising CV only; a falling CV is positive adaptation. */
  overreachingFlag: boolean;
  overreachingNote: string | null;

  /** Today's z ≤ −2 AND the 7-day mean fell ≥ 0.75 on the 20 × ln scale. */
  bigDrop: boolean;

  /** Possible vagal saturation — HRV advice is suppressed in both directions. */
  saturated: boolean;
  saturationR: number | null;
  saturationN: number;
  saturationReason: string | null;

  /** Safe to tell the user their HRV is low. */
  lowWarning: boolean;
  /** Safe to claim an unusually good recovery. */
  greatRecovery: boolean;

  /** The engine is forcing a light day. */
  forcing: boolean;
  forcingRule: ForcingRule | null;
  forcingReason: string | null;
  /** 'heuristic' for the 2 × SWC clause, 'published' for Kiviniemi's — reachable by UI copy. */
  forcingSupport: 'heuristic' | 'published' | null;
  /** The human-readable "no published support" label for the clause that fired. */
  forcingLabel: string | null;

  /** Days with an HRV reading in the last 30 days. */
  daysOfData: number;
  /** ≥ 21 readings in the last 30 days. */
  baselineEstablished: boolean;
  note: string;
}

export interface HrvOpts {
  /** Age in years — enables the "poor" (below age norm) check. Omit to skip it. */
  age?: number;
  /**
   * Truncate the reference to readings on or after this date — a confirmed
   * regime shift. `hrv` never imports `changepoint`; the caller passes the day.
   */
  referenceStart?: ISODate;
}

function cvTrendOf(cv7: number | null, cvPrev7: number | null): HrvStatus['cvTrend'] {
  if (cv7 === null || cvPrev7 === null) return null;
  if (cvPrev7 === 0) return cv7 === 0 ? 'stable' : 'rising';
  const relPct = ((cv7 - cvPrev7) / cvPrev7) * 100;
  if (relPct >= CV_TREND_PCT) return 'rising';
  if (relPct <= -CV_TREND_PCT) return 'falling';
  return 'stable';
}

/** Rising-CV note. Falling is *not* a flag in v3 (Flatt & Esco: it marks adaptation). */
function risingCvNote(cv7: number | null, cvRef: number | null): string | null {
  if (cv7 === null || cvRef === null || cvRef <= 0) return null;
  if (cv7 < CV_SHIFT_FACTOR * cvRef) return null;
  return `Day-to-day HRV variability is rising (CV ${round(cv7, 1)}% this week vs your usual ${round(cvRef, 1)}%) — worth watching.`;
}

interface ForcingResult {
  forcing: boolean;
  rule: ForcingRule | null;
}

/** Forcing given today's core, yesterday's core and the gates. */
function forcingAt(core: HrvCore, prev: HrvCore | null, allowed: boolean): ForcingResult {
  if (!allowed) return { forcing: false, rule: null };
  const { mean7Ln, forceLowerLn, swcLowerLn, weekValid } = core;
  if (mean7Ln === null || forceLowerLn === null || swcLowerLn === null || !weekValid) {
    return { forcing: false, rule: null };
  }
  if (mean7Ln < forceLowerLn) return { forcing: true, rule: 'twoSwc' };
  if (
    mean7Ln < swcLowerLn &&
    prev !== null &&
    prev.weekValid &&
    prev.mean7Ln !== null &&
    prev.swcLowerLn !== null &&
    prev.mean7Ln < prev.swcLowerLn &&
    (!FORCING_REQUIRE_FALLING || mean7Ln <= prev.mean7Ln + 1e-12)
  ) {
    return { forcing: true, rule: 'twoDays' };
  }
  return { forcing: false, rule: null };
}

/**
 * Today's HRV status vs the user's own SWC range. `records` may be unsorted;
 * only readings on or before `asOf` are considered.
 */
export function hrvStatus(records: DailyRecord[], asOf: ISODate, opts: HrvOpts = {}): HrvStatus {
  const series = lnSeries(records, asOf, HRV_SPAN_DAYS);
  const ln = series.map((p) => p.ln);
  const dates = series.map((p) => p.d);
  const rhr = metricSeries(records, 'rhr', asOf, HRV_SPAN_DAYS).map((p) => p.v);
  const i = ln.length - 1;
  const today = series[i];

  const core = coreAt(ln, dates, i, opts.referenceStart);
  const prev = i > 0 ? coreAt(ln, dates, i - 1, opts.referenceStart) : null;
  const ref = core.reference;

  const cv7 = cvOf(valuesIn(ln, i - WEEK_DAYS + 1, i));
  const cvPrev7 = cvOf(valuesIn(ln, i - 2 * WEEK_DAYS + 1, i - WEEK_DAYS));
  const cvTrend = cvTrendOf(cv7, cvPrev7);
  const cvRef = ref.cvLn;
  const overreachingNote = risingCvNote(cv7, cvRef);

  const daysOfData = valuesIn(ln, i - (BASELINE_WINDOW_DAYS - 1), i).length;
  const baselineEstablished = daysOfData >= BASELINE_READINGS;

  const todayZ =
    today.ln !== null && ref.medianLn !== null && ref.sdLn !== null
      ? (today.ln - ref.medianLn) / ref.sdLn
      : null;
  const drop20 =
    core.mean7Ln !== null && prev?.mean7Ln != null ? 20 * (prev.mean7Ln - core.mean7Ln) : null;
  const bigDrop =
    todayZ !== null &&
    todayZ <= BIG_DROP_Z &&
    drop20 !== null &&
    drop20 >= BIG_DROP_MEAN7_20LN - 1e-9;

  const sat = saturationAt(ln, rhr, i);

  // --- band ----------------------------------------------------------------
  const hasRange = core.swcLowerLn !== null && core.swcUpperLn !== null && core.mean7Ln !== null;
  const norm = ageNormMs(opts.age);
  const longTermLn = mean(valuesIn(ln, i - FALLBACK_WINDOW_DAYS + 1, i));
  const longTermMs = longTermLn === null ? null : Math.exp(longTermLn);

  let band: HrvBand;
  let bandAvailable = true;
  let suppressedReason: string | null = null;
  let reason: string;
  const lo = fmtMs(ms1(core.swcLowerLn));
  const hi = fmtMs(ms1(core.swcUpperLn));
  const m7 = fmtMs(ms1(core.mean7Ln));

  if (!hasRange) {
    band = 'insufficient';
    bandAvailable = false;
    suppressedReason =
      core.mean7Ln === null
        ? `No HRV logged in the last ${WEEK_DAYS} days — log a reading to place you in your range.`
        : `Need ${MIN_SD_READINGS}+ HRV readings behind your reference to set a range (have ${ref.n}).`;
    reason = suppressedReason;
  } else if (!core.weekValid) {
    // Plews validity gate — suppressed, never guessed.
    band = 'insufficient';
    bandAvailable = false;
    suppressedReason =
      `Only ${core.n7} HRV reading${core.n7 === 1 ? '' : 's'} in the last ${WEEK_DAYS} days — ` +
      `a weekly average needs ${MIN_WEEK_READINGS}+ to mean anything, so your range is on hold.`;
    reason = suppressedReason;
  } else if ((core.z as number) < -Z_SWC) {
    band = 'low';
    reason = sat.saturated
      ? `7-day average ${m7} ms is below your normal range (${lo}–${hi} ms). ${sat.reason}`
      : `7-day average ${m7} ms is below your normal range (${lo}–${hi} ms) — favour low intensity.`;
  } else if ((core.z as number) > Z_SWC) {
    band = 'unbalanced';
    reason = sat.saturated
      ? `7-day average ${m7} ms is above your normal range (${lo}–${hi} ms). ${sat.reason}`
      : `7-day average ${m7} ms is above your normal range (${lo}–${hi} ms) — unbalanced; watch for accumulated fatigue.`;
  } else if (norm !== null && longTermMs !== null && longTermMs < norm) {
    band = 'poor';
    reason = `Your ${FALLBACK_WINDOW_DAYS}-day average (${Math.round(longTermMs)} ms) is below the age norm (${norm} ms) — protect sleep and keep strain moderate.`;
  } else {
    band = 'balanced';
    reason = `7-day average ${m7} ms is within your normal range (${lo}–${hi} ms).`;
  }

  if (overreachingNote !== null) reason += ` ${overreachingNote}`;
  if (bigDrop) reason += ' Today dropped sharply against a falling weekly average — suggest low intensity.';
  if (ref.calibrating && bandAvailable) {
    reason += ` Reference still calibrating (${ref.n} readings; ${MIN_REF_READINGS}+ over ${REF_WINDOW_DAYS} days makes it firm).`;
  }
  if (!baselineEstablished) reason += ` Baseline still forming (${daysOfData}/${BASELINE_READINGS} days).`;

  // --- forcing -------------------------------------------------------------
  const forcingAllowed =
    baselineEstablished && !ref.calibrating && !sat.saturated && bandAvailable;
  const { forcing, rule } = forcingAt(core, prev, forcingAllowed);
  const evidence = rule ? FORCING_EVIDENCE[rule] : null;
  if (forcing && evidence) reason += ` ${evidence.note}`;

  const lowWarning = band === 'low' && bandAvailable && !sat.saturated;
  const greatRecovery =
    bandAvailable &&
    !sat.saturated &&
    !ref.calibrating &&
    core.z !== null &&
    core.z > Z_SWC &&
    band !== 'poor';

  return {
    todayMs: today.ms,
    todayLn: today.ln,
    todayZ,
    mean7Ln: core.mean7Ln,
    mean7Ms: ms1(core.mean7Ln),
    n7: core.n7,
    z: core.z,

    reference: ref,
    baselineLn: ref.medianLn,
    baselineMs: ref.medianMs,
    nBaseline: ref.n,
    sdLn: ref.sdLn,
    calibrating: ref.calibrating,

    swcLowerLn: core.swcLowerLn,
    swcUpperLn: core.swcUpperLn,
    swcLowerMs: ms1(core.swcLowerLn),
    swcUpperMs: ms1(core.swcUpperLn),

    band,
    bandAvailable,
    suppressedReason,

    lnRmssdCv: cv7 === null ? null : round(cv7, 2),
    cv7: cv7 === null ? null : round(cv7, 2),
    cvPrev7: cvPrev7 === null ? null : round(cvPrev7, 2),
    cvTrend,
    cvRef: cvRef === null ? null : round(cvRef, 2),
    overreachingFlag: overreachingNote !== null,
    overreachingNote,

    bigDrop,

    saturated: sat.saturated,
    saturationR: sat.r === null ? null : round(sat.r, 3),
    saturationN: sat.n,
    saturationReason: sat.reason,

    lowWarning,
    greatRecovery,

    forcing,
    forcingRule: rule,
    forcingReason: evidence ? evidence.note : null,
    forcingSupport: evidence ? evidence.support : null,
    forcingLabel: evidence ? evidence.label : null,

    daysOfData,
    baselineEstablished,
    note: reason,
  };
}

// ---------------------------------------------------------------------------
// Series for the chart and for tuning
// ---------------------------------------------------------------------------

export interface SwcBandPoint {
  d: ISODate;
  mean7Ms: number | null;
  lowerMs: number | null;
  upperMs: number | null;
  /** Readings behind that day's 7-day mean — the band widens as this falls. */
  n7: number;
  /** False on days the validity gate suppressed the band. */
  valid: boolean;
}

/**
 * Rolling SWC band for the Trends chart — the same construction `hrvStatus`
 * uses, evaluated on each of the last `days` days. `lower`/`upper` are null
 * until a reference exists or when the validity gate suppresses the band;
 * `mean7Ms` is null when the last 7 days hold no reading.
 */
export function swcBandSeries(
  records: DailyRecord[],
  asOf: ISODate,
  days: number,
  opts: HrvOpts = {},
): SwcBandPoint[] {
  const n = Math.max(0, Math.floor(days));
  if (n === 0) return [];
  const series = lnSeries(records, asOf, n + HRV_SPAN_DAYS - 1);
  const ln = series.map((p) => p.ln);
  const dates = series.map((p) => p.d);
  const offset = series.length - n;
  const out: SwcBandPoint[] = [];
  for (let k = 0; k < n; k++) {
    const i = offset + k;
    const core = coreAt(ln, dates, i, opts.referenceStart);
    const show = core.weekValid && core.swcLowerLn !== null;
    out.push({
      d: dates[i],
      mean7Ms: ms1(core.mean7Ln),
      lowerMs: show ? ms1(core.swcLowerLn) : null,
      upperMs: show ? ms1(core.swcUpperLn) : null,
      n7: core.n7,
      valid: core.weekValid,
    });
  }
  return out;
}

export interface ForcingHitRate {
  /** Days evaluated (those with an established baseline and a usable reference). */
  eligibleDays: number;
  /** Days the rule fired. */
  hits: number;
  /** hits / eligibleDays, or null with nothing to divide. */
  rate: number | null;
  /** Hits per clause, so the heuristic half can be tuned separately. */
  byRule: Record<ForcingRule, number>;
  /** Calendar days scanned, including the ineligible ones. */
  scannedDays: number;
}

/**
 * Replay the forcing rule over the trailing `days` days.
 *
 * The 2 × SWC clause is a heuristic (`FORCING_EVIDENCE.twoSwc`), so its hit
 * rate is the thing that has to be measured before it can be personalised: a
 * user it fires on 20 % of days needs a different multiple from one it never
 * fires on. Cheap enough to call from a settings screen, not from a render.
 */
export function forcingHitRate(
  records: DailyRecord[],
  asOf: ISODate,
  days = FORCING_HIT_RATE_DAYS,
  opts: HrvOpts = {},
): ForcingHitRate {
  const n = Math.max(0, Math.floor(days));
  const empty: ForcingHitRate = {
    eligibleDays: 0,
    hits: 0,
    rate: null,
    byRule: { twoSwc: 0, twoDays: 0 },
    scannedDays: n,
  };
  if (n === 0) return empty;
  const series = lnSeries(records, asOf, n + HRV_SPAN_DAYS);
  const ln = series.map((p) => p.ln);
  const dates = series.map((p) => p.d);
  const rhr = metricSeries(records, 'rhr', asOf, n + HRV_SPAN_DAYS).map((p) => p.v);
  const offset = series.length - n;

  let prev: HrvCore | null = offset > 0 ? coreAt(ln, dates, offset - 1, opts.referenceStart) : null;
  const out: ForcingHitRate = { ...empty, byRule: { twoSwc: 0, twoDays: 0 } };
  for (let k = 0; k < n; k++) {
    const i = offset + k;
    const core = coreAt(ln, dates, i, opts.referenceStart);
    const established = valuesIn(ln, i - (BASELINE_WINDOW_DAYS - 1), i).length >= BASELINE_READINGS;
    const sat = saturationAt(ln, rhr, i);
    const allowed =
      established && !core.reference.calibrating && !sat.saturated && core.swcLowerLn !== null && core.weekValid;
    if (allowed) {
      out.eligibleDays++;
      const { forcing, rule } = forcingAt(core, prev, true);
      if (forcing && rule) {
        out.hits++;
        out.byRule[rule]++;
      }
    }
    prev = core;
  }
  out.rate = out.eligibleDays > 0 ? out.hits / out.eligibleDays : null;
  return out;
}

/**
 * Position of the 7-day mean within the SWC band in band-widths: 0 at the
 * lower edge, 1 at the upper, < 0 below, > 1 above. Null without a range.
 */
export function swcPosition(hrv: HrvStatus): number | null {
  const v = hrv.mean7Ln;
  if (v === null || hrv.swcLowerLn === null || hrv.swcUpperLn === null) return null;
  const width = hrv.swcUpperLn - hrv.swcLowerLn;
  if (width <= 0) return 0.5;
  return (v - hrv.swcLowerLn) / width;
}
