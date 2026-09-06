/**
 * §1h Stress — daily check-in, overnight strain, illness flag, resilience.
 *
 * The module the app was missing entirely. **Three outputs, deliberately kept
 * separate**, because fusing them into one number is exactly what makes vendor
 * stress scores unfalsifiable: a subjective check-in, an overnight
 * physiological picture, and a 14-day stress-vs-recovery balance. Pure and
 * clock-free — `asOf` is a parameter.
 *
 * Two honest limits, stated in the README and in the UI rather than papered
 * over: (1) every *daytime* stress product needs continuous HR, which we do
 * not have, so nothing here claims to measure a stress *event*; (2) Baevsky's
 * stress index and DFA-α1 need beat-to-beat RR intervals and are therefore not
 * implemented rather than faked.
 *
 * ## Check-in (`checkInSummary`)
 *
 * The **Hooper index** — sleep quality, fatigue, stress, muscle soreness, each
 * 1–7 with 1 = best — is the best-validated ultra-short daily instrument and
 * takes under 20 seconds; Saw 2016 found subjective measures track training
 * load with *better* sensitivity than objective ones, which is why the check-in
 * is a first-class input to readiness rather than a decoration beside it.
 * Returns the 4–28 total, each item's robust z against a 30-day personal
 * reference, a band, `nDays`, and the **DALDA-style rule: three consecutive
 * days worse than normal is a call to act** (`worseRun`). Every item is
 * optional and nothing here breaks when the user skips days.
 *
 * The weekly 8-item SRSS and the monthly PSS-4 (its recall window is a month
 * and α ≈ .6–.73, so shortening it to daily use would be an unvalidated
 * modification) are settings-gated and handled by the Log screen.
 *
 * ## Overnight strain (`overnightStrainIndex`)
 *
 * Per-signal robust z against a **60-day** personal reference (median/MAD),
 * sign-oriented so positive always means *more strain*: ln rMSSD (negated),
 * RHR, respiratory rate, skin temperature, SpO₂ (negated), sleep debt.
 * Two outputs, on purpose:
 *
 * 1. `osi = clamp(50 + 12.5·Σwᵢzᵢ/Σwᵢ, 0, 100)` with `OSI_WEIGHTS`
 *    renormalised over the signals actually present (the HRV-dominant
 *    structure WHOOP and Fitbit describe), reported **with a credible
 *    interval** from each signal's own MAD and the days of history behind it.
 * 2. `signalsDeviating` — the count past each signal's own threshold
 *    (`SIGNAL_THRESHOLDS`) → **none 0–1 / minor 2 / major ≥ 3**. This is Apple
 *    Vitals' "≥ 2 of 5 overnight metrics are outliers" rule and Oura Symptom
 *    Radar's three levels; it is far more defensible than any fused number,
 *    so **it is what the UI leads with**.
 *
 * Suppressed below **14 days** of reference (Apple needs 7 nights, Oura's
 * Cumulative Stress needs 21 of 31) with an explicit "still learning your
 * normal" state.
 *
 * ## Illness / overload flag (`illnessFlag`)
 *
 * Conjunctive, never a single signal: HRV z < −1 **and** RHR z > +1 on ≥ 2 of
 * 3 consecutive days; or respiratory rate ≥ **+3 brpm** over the personal mean
 * (the marker from WHOOP's COVID cohort, ~20% flagged two days before
 * symptoms); or skin temp ≥ +0.5 °C for two nights. The widely repeated
 * "+5 bpm RHR" threshold is convention, not evidence, and is deliberately not
 * used. Copy is "possible illness or heavy overload — take an easy day",
 * **never a diagnosis**; past three days it adds the existing doctor cue.
 *
 * ## Resilience (`resilienceSummary`)
 *
 * Kellmann's scissors model: what predicts breakdown is stress *outrunning*
 * recovery, not absolute stress.
 *
 *   Load(d)     = normalised training load, steps, alcohol, tobacco, late
 *                 caffeine, late bedtime and the subjective stress item
 *   Recovery(d) = sleep vs need, readiness, negated OSI, subjective recovery
 *   balance     = EWMA(Recovery, τ = 14 d) − EWMA(Load, τ = 7 d)
 *
 * → five bands in Oura's vocabulary (Limited / Adequate / Solid / Strong /
 * Exceptional) over a 14-day window, with **both component curves always
 * shown** so the band is auditable. Plus an allostatic-load-**style** counter:
 * how many of the six overnight signals sat in their personal at-risk quartile
 * on each of the last 30 days. It is labelled "AL-style" in code and copy —
 * real allostatic load is built from cortisol, CRP and blood pressure, and the
 * wearable transposition is not validated.
 */
import type {
  Band,
  CheckInItem,
  CheckInSettings,
  DailyRecord,
  ISODate,
  Profile,
  StressContext,
  StressSignal,
} from '../data/types';

/** Personal reference for the check-in items, days. */
export const CHECKIN_REF_DAYS = 30;
/** Consecutive worse-than-normal days that make it a call to act (DALDA). */
export const CHECKIN_WORSE_RUN = 3;
/** Personal reference for the overnight signals, days. */
export const OSI_REF_DAYS = 60;
/** Below this many reference days the strain index is suppressed entirely. */
export const OSI_MIN_REF_DAYS = 14;

/**
 * Weights for the fused index, renormalised over the signals actually present.
 * HRV-dominant, mirroring the structure WHOOP and Fitbit describe.
 */
export const OSI_WEIGHTS: Record<StressSignal['key'], number> = {
  hrv: 0.35,
  rhr: 0.25,
  rr: 0.15,
  skt: 0.1,
  debt: 0.1,
  spo: 0.05,
};

/**
 * Per-signal deviation thresholds, expressed on the strain-positive z scale
 * (`skt` also has an absolute +0.5 °C rule, applied on top). Counting these is
 * the Apple-Vitals-style output the UI leads with.
 */
export const SIGNAL_THRESHOLDS: Record<StressSignal['key'], number> = {
  hrv: 1,
  rhr: 1,
  rr: 1,
  skt: 1,
  debt: 1,
  spo: 1,
};

/** Scissors-model EWMA time constants, days. */
export const RESILIENCE_TAU_RECOVERY = 14;
export const RESILIENCE_TAU_LOAD = 7;
/** Window the resilience band is reported over, days. */
export const RESILIENCE_WINDOW_DAYS = 14;
/** Window for the AL-style at-risk-quartile counter, days. */
export const AL_STYLE_WINDOW_DAYS = 30;

/** Keeps stub parameters live for `noUnusedParameters`; delete with the TODOs. */
function pending(...args: unknown[]): void {
  void args;
}

// ---------------------------------------------------------------------------
// Daily check-in
// ---------------------------------------------------------------------------

export interface CheckInOpts {
  /** Which items the user is asked for (`settings.checkIn.items`). */
  items?: readonly CheckInItem[];
  /** Personal reference window; default `CHECKIN_REF_DAYS`. */
  refDays?: number;
}

/**
 * The context's check-in block plus the standardised values readiness needs.
 * `z` is **strain-positive**: a higher Hooper score is worse, so a positive z
 * means "worse than your normal".
 */
export type CheckInSummary = StressContext['checkIn'] & {
  z: { qs: number | null; qf: number | null; qt: number | null; qo: number | null };
  /** Mean of the available item z-scores — readiness's `z_subj` input. */
  zTotal: number | null;
};

const EMPTY_CHECKIN: CheckInSummary = {
  sleepQ: null,
  fatigue: null,
  stress: null,
  soreness: null,
  total: null,
  band: 'neutral' as Band,
  nDays: 0,
  worseRun: 0,
  missingToday: true,
  z: { qs: null, qf: null, qt: null, qo: null },
  zTotal: null,
};

/** Hooper summary for `asOf` against the user's own 30-day reference. */
export function checkInSummary(
  records: DailyRecord[],
  asOf: ISODate,
  opts?: CheckInOpts,
): CheckInSummary {
  // TODO(phase-1h): implement per plan §1h.
  pending(records, asOf, opts);
  return { ...EMPTY_CHECKIN, z: { ...EMPTY_CHECKIN.z } };
}

// ---------------------------------------------------------------------------
// Overnight strain index
// ---------------------------------------------------------------------------

export interface OvernightStrainOpts {
  /** Personal reference window; default `OSI_REF_DAYS`. */
  refDays?: number;
  /** Minimum reference days before anything is reported; default 14. */
  minRefDays?: number;
  /** Weight overrides, for tuning. */
  weights?: Partial<Record<StressSignal['key'], number>>;
}

export interface OvernightStrain {
  /** 0–100, higher = more overnight strain. Null while calibrating. */
  osi: number | null;
  /** Credible interval from each signal's MAD and its days of history. */
  lo: number | null;
  hi: number | null;
  /** Every signal considered, present or not — the UI's dot row. */
  signals: StressSignal[];
  /** The Apple-Vitals-style headline: how many are outside the personal range. */
  signalsDeviating: number;
  signalsAvailable: number;
  band: StressContext['band'];
  /** Fewer than `minRefDays` of reference — "still learning your normal". */
  calibrating: boolean;
  nRef: number;
}

const EMPTY_STRAIN: OvernightStrain = {
  osi: null,
  lo: null,
  hi: null,
  signals: [],
  signalsDeviating: 0,
  signalsAvailable: 0,
  band: null,
  calibrating: true,
  nRef: 0,
};

/** Per-signal z, the deviating count, and the fused index with its interval. */
export function overnightStrainIndex(
  records: DailyRecord[],
  asOf: ISODate,
  opts?: OvernightStrainOpts,
): OvernightStrain {
  // TODO(phase-1h): implement per plan §1h.
  pending(records, asOf, opts);
  return { ...EMPTY_STRAIN, signals: [] };
}

// ---------------------------------------------------------------------------
// Illness / overload
// ---------------------------------------------------------------------------

/**
 * Conjunctive illness/overload flag — see the module header for the three
 * rules. `reasons` are user-facing strings; `since` is the first day of the
 * run so the UI can say how long it has been true. **Never a diagnosis and
 * never names a condition.**
 */
export function illnessFlag(records: DailyRecord[], asOf: ISODate): StressContext['illness'] {
  // TODO(phase-1h): implement per plan §1h.
  pending(records, asOf);
  return { flag: false, since: null, reasons: [] };
}

// ---------------------------------------------------------------------------
// Resilience
// ---------------------------------------------------------------------------

export interface ResilienceOpts {
  profile: Profile;
  /** Daily training load, from `load.dailyLoadSeries` — the Load side. */
  loads?: ReadonlyArray<{ d: ISODate; load: number }>;
  /** Daily readiness 0–100 — the Recovery side. */
  readinessScores?: ReadonlyArray<{ d: ISODate; score: number | null }>;
  /** Sleep need in hours, from `sleep.sleepSummary`; falls back to the profile. */
  sleepNeedHrs?: number | null;
  /** Precomputed OSI per day, so the two modules agree on one series. */
  osi?: ReadonlyArray<{ d: ISODate; osi: number | null }>;
}

export type ResilienceSummary = StressContext['resilience'] & {
  /** The two curves, always shown so the band is auditable. */
  series: Array<{ d: ISODate; load: number | null; recovery: number | null }>;
};

const EMPTY_RESILIENCE: ResilienceSummary = {
  score: null,
  band: null,
  loadEwma: null,
  recoveryEwma: null,
  balance: null,
  nDays: 0,
  alStyleCount: null,
  series: [],
};

/** Kellmann scissors balance over 14 days, with the AL-style counter. */
export function resilienceSummary(
  records: DailyRecord[],
  asOf: ISODate,
  opts: ResilienceOpts,
): ResilienceSummary {
  // TODO(phase-1h): implement per plan §1h.
  pending(records, asOf, opts);
  return { ...EMPTY_RESILIENCE, series: [] };
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

export interface StressSummaryOpts extends ResilienceOpts {
  /** `settings.checkIn` — which items were asked for. */
  checkIn?: CheckInSettings;
}

/**
 * The whole `StressContext`, assembled from the four functions above. This is
 * the only one `context.ts` calls, so Today, Trends, the insights and the
 * coach can never disagree about how stressed the user is.
 */
export function stressSummary(
  records: DailyRecord[],
  asOf: ISODate,
  opts: StressSummaryOpts,
): StressContext {
  // TODO(phase-1h): implement per plan §1h.
  pending(records, asOf, opts);
  const checkIn = checkInSummary(records, asOf, { items: opts.checkIn?.items });
  const strain = overnightStrainIndex(records, asOf);
  const resilience = resilienceSummary(records, asOf, opts);
  return {
    osi: strain.osi,
    osiLo: strain.lo,
    osiHi: strain.hi,
    signalsDeviating: strain.signalsDeviating,
    signalsAvailable: strain.signalsAvailable,
    band: strain.band,
    outliers: strain.signals,
    checkIn: {
      sleepQ: checkIn.sleepQ,
      fatigue: checkIn.fatigue,
      stress: checkIn.stress,
      soreness: checkIn.soreness,
      total: checkIn.total,
      band: checkIn.band,
      nDays: checkIn.nDays,
      worseRun: checkIn.worseRun,
      missingToday: checkIn.missingToday,
    },
    resilience: {
      score: resilience.score,
      band: resilience.band,
      loadEwma: resilience.loadEwma,
      recoveryEwma: resilience.recoveryEwma,
      balance: resilience.balance,
      nDays: resilience.nDays,
      alStyleCount: resilience.alStyleCount,
    },
    illness: illnessFlag(records, asOf),
    calibrating: strain.calibrating,
    nRef: strain.nRef,
  };
}
