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
 * ### Why the outlier threshold is the 90th percentile and not z = 1
 *
 * The plan writes the per-signal rule as "z ≥ +1". A ±1 σ rule fires on 15.9 %
 * of days *per signal*, so for the five overnight signals a wearable actually
 * supplies it puts `minor` (exactly two deviating) at ~15 % of days and `major`
 * (three or more) at ~3.2 % — above this feature's own stated false-positive
 * budget (`major` ≤ 3 %, `minor` ≤ 12 % on a stationary sleeper). Apple's
 * "outside your typical range" is a **percentile band**, not a 1 σ rule, so
 * `SIGNAL_THRESHOLDS` is set to the 90th percentile of the standard normal
 * (z ≈ 1.2816, `OSI_OUTLIER_Z`): one signal in ten on an ordinary day, which
 * puts `minor` at ~7 % and `major` at ~0.9 % for five signals and ~10 % / ~1.6 %
 * for six. The threshold is per-signal and overridable through
 * `OvernightStrainOpts.thresholds`. The *illness* rule below keeps the plan's
 * z = 1 unchanged, because it is conjunctive and its joint rate is ~0.2 %/day.
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
 * "Over the personal mean" is implemented as *over the personal median* of the
 * same 60-day reference: the median is the robust analogue this whole module
 * standardises on, and it is what keeps a five-day episode from dragging the
 * baseline it is being measured against.
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
 *
 * The component weights (`LOAD_WEIGHTS`, `RECOVERY_WEIGHTS`) and the band cuts
 * (`RESILIENCE_BAND_CUTS`) are **heuristics**: no published weighting of these
 * particular inputs exists, and the UI copy says so. What is *not* heuristic is
 * the shape of the model (two EWMAs with Kellmann's asymmetric time constants,
 * recovery slower than load) and the fact that both curves are always returned,
 * so a user can see which side moved.
 *
 * Sources
 *   Hooper & Mackinnon 1995      the four 1–7 items and the 4–28 total
 *   Rushall 1990 (DALDA)         "worse than normal" on consecutive days
 *   Saw, Main & Gastin 2016      subjective > objective sensitivity to load
 *   Apple Health Vitals          ≥ 2 of 5 overnight metrics outside range
 *   Oura Symptom Radar           three levels; 21-of-31-day reference
 *   WHOOP COVID-19 cohort 2020   +3 brpm respiratory rate ~2 days pre-symptom
 *   Kellmann 2010                the stress/recovery "scissors" model
 *   McEwen & Stellar 1993        allostatic load as a count of at-risk markers
 *   Huber 1981                   MAD scale estimation and its asymptotic error
 */
import type {
  Band,
  CheckInItem,
  CheckInSettings,
  DailyRecord,
  ISODate,
  Profile,
  ResilienceBand,
  StressBand,
  StressContext,
  StressSignal,
} from '../data/types';
import { addDays, hhmmToMinutes, lastNDates, minutesSinceNoon } from '../lib/dates';
import { clamp, round } from '../lib/format';
import { median, normalQuantile, quantile, robustZ } from './stats';

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

/** One-sided tail an overnight signal has to reach to count as an outlier. */
export const OSI_OUTLIER_P = 0.1;
/** The z that tail corresponds to (≈ 1.2816) — see the module header. */
export const OSI_OUTLIER_Z = normalQuantile(1 - OSI_OUTLIER_P) ?? 1.2816;

/**
 * Per-signal deviation thresholds, expressed on the strain-positive z scale
 * (`rr` and `skt` also have the absolute rules in `SIGNAL_ABS_RULE`, applied on
 * top with an OR). Counting these is the Apple-Vitals-style output the UI
 * leads with.
 */
export const SIGNAL_THRESHOLDS: Record<StressSignal['key'], number> = {
  hrv: OSI_OUTLIER_Z,
  rhr: OSI_OUTLIER_Z,
  rr: OSI_OUTLIER_Z,
  skt: OSI_OUTLIER_Z,
  debt: OSI_OUTLIER_Z,
  spo: OSI_OUTLIER_Z,
};

/**
 * Absolute deviation rules, in each signal's own unit, OR-ed with the z rule.
 * They exist so a user whose reference window happens to be very tight cannot
 * be flagged by a physiologically trivial move, and they are the two the plan
 * names: respiratory rate +1 brpm, skin temperature +0.5 °C.
 */
export const SIGNAL_ABS_RULE: Partial<Record<StressSignal['key'], number>> = {
  rr: 1,
  skt: 0.5,
};

/**
 * Robust-SD floors, in each signal's own unit (ln ms for HRV). Without them a
 * fortnight of identical readings makes every z infinite. The HRV floor is the
 * 0.03 ln-unit floor `hrv.ts` already uses; the rest are the smallest change
 * the field is recorded to (1 dp) times a small factor. **Heuristic.**
 */
export const SIGNAL_SD_FLOOR: Record<StressSignal['key'], number> = {
  hrv: 0.03,
  rhr: 0.5,
  rr: 0.2,
  skt: 0.05,
  spo: 0.2,
  debt: 5,
};

/** Deviating-signal counts that open the `minor` and `major` bands. */
export const OSI_BAND_MINOR = 2;
export const OSI_BAND_MAJOR = 3;

/**
 * The "still learning your normal" state, in words, so every surface says the
 * same thing rather than inventing its own euphemism for "we don't know yet".
 */
export const CALIBRATING_COPY =
  'Still learning your normal — overnight strain needs about two weeks of your own nights before it means anything.';

/** Scissors-model EWMA time constants, days. */
export const RESILIENCE_TAU_RECOVERY = 14;
export const RESILIENCE_TAU_LOAD = 7;
/** Window the resilience band is reported over, days. */
export const RESILIENCE_WINDOW_DAYS = 14;
/** Window for the AL-style at-risk-quartile counter, days. */
export const AL_STYLE_WINDOW_DAYS = 30;

/** Days of history the AL-style quartiles are drawn from. */
export const AL_STYLE_REF_DAYS = 90;
/** Fewer reference days than this and the AL-style counter is not reported. */
export const AL_STYLE_MIN_REF_DAYS = 21;
/** McEwen's "at-risk" cut: the worst quartile of the personal distribution. */
export const AL_STYLE_QUANTILE = 0.75;

/** The label the UI must use for `alStyleCount`. Never "allostatic load". */
export const AL_STYLE_LABEL = 'AL-style signal load';
/** …and the caveat that goes with it, so no screen can quietly drop it. */
export const AL_STYLE_COPY =
  'AL-style: how many of your six overnight signals sat in your own at-risk quartile on an average day this month. ' +
  'It borrows the shape of the allostatic-load index, which is built from cortisol, CRP and blood pressure — the wearable version is not validated.';
/** The caveat that goes with the five resilience bands. */
export const RESILIENCE_HEURISTIC_COPY =
  'The five bands are our mapping, not a validated scale. The two curves are the actual model: recovery over 14 days against load over 7.';

/** 95 % two-sided normal deviate for the OSI credible interval. */
const Z95 = normalQuantile(0.975) ?? 1.959964;

/**
 * Asymptotic sampling error of a median, in σ units: √(π/2)/√n ≈ 1.2533/√n.
 * Used for the OSI interval — the reference median is estimated, not known.
 */
const SE_MEDIAN_K = Math.sqrt(Math.PI / 2);
/**
 * Asymptotic relative error of the MAD-based σ̂ for Gaussian data,
 * √1.361/√n ≈ 1.166/√n (Huber 1981). The scale is estimated too, and that
 * error scales with |z|, which is why a big z carries a wider interval.
 */
const SE_SCALE_K = Math.sqrt(1.361);

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const num = (v: unknown): number | null => (finite(v) ? v : null);

/** Records in `[from, to]`, keyed by date. Callers may pass unsorted arrays. */
function indexRange(records: DailyRecord[], from: ISODate, to: ISODate): Map<ISODate, DailyRecord> {
  const out = new Map<ISODate, DailyRecord>();
  for (const r of records) {
    if (typeof r?.d !== 'string') continue;
    if (r.d >= from && r.d <= to) out.set(r.d, r);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Daily check-in
// ---------------------------------------------------------------------------

/** The four Hooper items in their canonical order, with their labels. */
export const CHECKIN_ITEMS: ReadonlyArray<{ key: CheckInItem; label: string }> = [
  { key: 'qs', label: 'Sleep quality' },
  { key: 'qf', label: 'Fatigue' },
  { key: 'qt', label: 'Stress' },
  { key: 'qo', label: 'Soreness' },
];

/**
 * Robust-SD floor for a 1–7 integer item. A week of identical answers gives
 * MAD 0; 0.74 is the robust SD of a half-point MAD, so a one-point move reads
 * as z ≈ 1.35 rather than as infinity. **Heuristic.**
 */
export const CHECKIN_SD_FLOOR = 0.74;

/**
 * How far above the personal median a day has to sit to count as "worse than
 * normal" for the DALDA run. Half a robust SD: on stationary answers the daily
 * mean-of-items z clears it on ~2 % of days and three in a row is ~5e-6, while
 * a genuine +1.5-point week clears it on ~98 %. A plain "> 0" rule would call
 * one ordinary day in two "worse than normal" and fire the three-day rule on
 * 12 % of days. **Heuristic, with that arithmetic as its justification.**
 */
export const CHECKIN_WORSE_Z = 0.5;

/** Band cuts on the mean item z (worse-is-positive) and on the raw mean item. */
export const CHECKIN_Z_YELLOW = 0.5;
export const CHECKIN_Z_RED = 1.5;
export const CHECKIN_RAW_YELLOW = 3.5;
export const CHECKIN_RAW_RED = 5;
/** Days back the DALDA run is searched over. */
const CHECKIN_RUN_LOOKBACK = 30;

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

/** A logged 1–7 answer, or null. Out-of-range answers are not answers. */
function itemValue(r: DailyRecord | undefined, key: CheckInItem): number | null {
  const v = num(r?.[key]);
  if (v === null || v < 1 || v > 7) return null;
  return v;
}

/**
 * Mean of the available item z-scores for `d`, against the `refDays` days
 * before it. Null when the day has no answers or has no usable reference.
 */
function checkInDayZ(
  byDate: Map<ISODate, DailyRecord>,
  d: ISODate,
  items: readonly CheckInItem[],
  refDays: number,
): number | null {
  const refDates = lastNDates(addDays(d, -1), refDays);
  const zs: number[] = [];
  for (const key of items) {
    const v = itemValue(byDate.get(d), key);
    if (v === null) continue;
    const ref: number[] = [];
    for (const rd of refDates) {
      const rv = itemValue(byDate.get(rd), key);
      if (rv !== null) ref.push(rv);
    }
    const z = robustZ(v, ref, CHECKIN_SD_FLOOR);
    if (z !== null) zs.push(z);
  }
  if (zs.length === 0) return null;
  return zs.reduce((a, b) => a + b, 0) / zs.length;
}

function bandFromZ(z: number | null): Band | null {
  if (z === null) return null;
  if (z >= CHECKIN_Z_RED) return 'red';
  if (z >= CHECKIN_Z_YELLOW) return 'yellow';
  return 'green';
}

function bandFromRaw(mean: number | null): Band | null {
  if (mean === null) return null;
  if (mean >= CHECKIN_RAW_RED) return 'red';
  if (mean >= CHECKIN_RAW_YELLOW) return 'yellow';
  return 'green';
}

const BAND_ORDER: Record<Band, number> = { neutral: 0, green: 1, yellow: 2, red: 3 };

/** Hooper summary for `asOf` against the user's own 30-day reference. */
export function checkInSummary(
  records: DailyRecord[],
  asOf: ISODate,
  opts?: CheckInOpts,
): CheckInSummary {
  const asked = (opts?.items?.length ? opts.items : CHECKIN_ITEMS.map((i) => i.key)).filter(
    (k): k is CheckInItem => CHECKIN_ITEMS.some((i) => i.key === k),
  );
  const refDays = Math.max(1, Math.floor(opts?.refDays ?? CHECKIN_REF_DAYS));
  if (asked.length === 0) return { ...EMPTY_CHECKIN, z: { ...EMPTY_CHECKIN.z } };

  const windowStart = addDays(asOf, -(refDays + CHECKIN_RUN_LOOKBACK));
  const byDate = indexRange(records, windowStart, asOf);
  const today = byDate.get(asOf);

  const values: Record<CheckInItem, number | null> = {
    qs: itemValue(today, 'qs'),
    qf: itemValue(today, 'qf'),
    qt: itemValue(today, 'qt'),
    qo: itemValue(today, 'qo'),
  };

  // Per-item robust z against the refDays days BEFORE asOf: today is compared
  // against the past, never against a window that contains itself.
  const refDates = lastNDates(addDays(asOf, -1), refDays);
  const z: CheckInSummary['z'] = { qs: null, qf: null, qt: null, qo: null };
  for (const key of asked) {
    const v = values[key];
    if (v === null) continue;
    const ref: number[] = [];
    for (const rd of refDates) {
      const rv = itemValue(byDate.get(rd), key);
      if (rv !== null) ref.push(rv);
    }
    const zi = robustZ(v, ref, CHECKIN_SD_FLOOR);
    z[key] = zi === null ? null : round(zi, 3);
  }

  const askedPresent = asked.filter((k) => values[k] !== null);
  const total =
    askedPresent.length === asked.length
      ? asked.reduce((s, k) => s + (values[k] as number), 0)
      : null;
  const rawMean =
    askedPresent.length > 0
      ? askedPresent.reduce((s, k) => s + (values[k] as number), 0) / askedPresent.length
      : null;

  const zList = asked.map((k) => z[k]).filter((v): v is number => v !== null);
  const zTotal = zList.length > 0 ? round(zList.reduce((a, b) => a + b, 0) / zList.length, 3) : null;

  // The band is the WORSE of "against your own normal" and "against the scale".
  // A user whose normal is 6/7 across the board is not green just because today
  // matches it, and a single bad day against a good normal is not green either.
  const zBand = bandFromZ(zTotal);
  const rawBand = bandFromRaw(rawMean);
  let band: Band = 'neutral';
  if (zBand !== null || rawBand !== null) {
    const a = zBand ?? 'neutral';
    const b = rawBand ?? 'neutral';
    band = BAND_ORDER[a] >= BAND_ORDER[b] ? a : b;
  }

  // nDays: days in the reference window (asOf included) with any asked answer.
  let nDays = 0;
  for (const d of lastNDates(asOf, refDays)) {
    const r = byDate.get(d);
    if (asked.some((k) => itemValue(r, k) !== null)) nDays++;
  }

  // DALDA: consecutive days ending at asOf whose mean item z clears
  // CHECKIN_WORSE_Z. A skipped day breaks the run — we cannot know whether a
  // day the user did not answer was worse than normal, and inventing one is
  // exactly the kind of gap-filling this module exists to avoid.
  let worseRun = 0;
  for (let i = 0; i < CHECKIN_RUN_LOOKBACK; i++) {
    const d = addDays(asOf, -i);
    const dz = checkInDayZ(byDate, d, asked, refDays);
    if (dz === null || dz < CHECKIN_WORSE_Z) break;
    worseRun++;
  }

  return {
    sleepQ: values.qs,
    fatigue: values.qf,
    stress: values.qt,
    soreness: values.qo,
    total,
    band,
    nDays,
    worseRun,
    missingToday: askedPresent.length === 0,
    z,
    zTotal,
  };
}

// ---------------------------------------------------------------------------
// Overnight strain index
// ---------------------------------------------------------------------------

interface SignalSpec {
  key: StressSignal['key'];
  label: string;
  /** Value on the scale the z is computed on (ln ms for HRV). */
  read: (r: DailyRecord | undefined) => number | null;
  /** What the UI shows (ms for HRV, minutes for debt). */
  display: (r: DailyRecord | undefined) => number | null;
  /** +1 when higher = more strain, −1 when higher = less strain. */
  sign: 1 | -1;
}

/** Sleep debt in minutes: the imported `dbt`, else need − slept. */
function debtMin(r: DailyRecord | undefined): number | null {
  const dbt = num(r?.dbt);
  if (dbt !== null) return Math.max(0, dbt);
  const need = num(r?.sln);
  const slept = num(r?.slh);
  if (need === null || slept === null) return null;
  return Math.max(0, (need - slept) * 60);
}

/**
 * The six overnight signals, in the order the UI's dot row shows them.
 * Sign-oriented: `sign` turns each raw z into a strain-positive one.
 */
const SIGNALS: readonly SignalSpec[] = [
  {
    key: 'hrv',
    label: 'HRV',
    // ln rMSSD: daily rMSSD is right-skewed, its log is ~normal.
    read: (r) => {
      const v = num(r?.hrv);
      return v !== null && v > 0 ? Math.log(v) : null;
    },
    display: (r) => num(r?.hrv),
    sign: -1,
  },
  { key: 'rhr', label: 'Resting HR', read: (r) => num(r?.rhr), display: (r) => num(r?.rhr), sign: 1 },
  { key: 'rr', label: 'Breathing rate', read: (r) => num(r?.rr), display: (r) => num(r?.rr), sign: 1 },
  { key: 'skt', label: 'Skin temp', read: (r) => num(r?.skt), display: (r) => num(r?.skt), sign: 1 },
  { key: 'spo', label: 'Blood oxygen', read: (r) => num(r?.spo), display: (r) => num(r?.spo), sign: -1 },
  { key: 'debt', label: 'Sleep debt', read: debtMin, display: debtMin, sign: 1 },
];

/** One signal's standing on one day against its own trailing reference. */
interface SignalState {
  key: StressSignal['key'];
  label: string;
  /** Value on the z scale (ln for HRV). */
  raw: number | null;
  /** Value the UI shows. */
  value: number | null;
  /** Reference median on the z scale. */
  med: number | null;
  /** Raw (un-oriented) robust z. */
  z: number | null;
  /** Strain-positive z: `sign · z`. */
  zStrain: number | null;
  /** Reference days behind this signal. */
  n: number;
}

function signalStatesOn(
  byDate: Map<ISODate, DailyRecord>,
  d: ISODate,
  refDays: number,
): SignalState[] {
  const refDates = lastNDates(addDays(d, -1), refDays);
  const today = byDate.get(d);
  return SIGNALS.map((s) => {
    const ref: number[] = [];
    for (const rd of refDates) {
      const v = s.read(byDate.get(rd));
      if (v !== null) ref.push(v);
    }
    const raw = s.read(today);
    const med = median(ref);
    const z = raw === null ? null : robustZ(raw, ref, SIGNAL_SD_FLOOR[s.key]);
    return {
      key: s.key,
      label: s.label,
      raw,
      value: s.display(today),
      med,
      z,
      zStrain: z === null ? null : s.sign * z,
      n: ref.length,
    };
  });
}

/** Deviating by the z rule OR the signal's absolute rule. */
function isDeviating(st: SignalState, threshold: number): boolean {
  if (st.zStrain !== null && st.zStrain >= threshold) return true;
  const abs = SIGNAL_ABS_RULE[st.key];
  if (abs !== undefined && st.raw !== null && st.med !== null) {
    const sign = SIGNALS.find((s) => s.key === st.key)?.sign ?? 1;
    if (sign * (st.raw - st.med) >= abs) return true;
  }
  return false;
}

export interface OvernightStrainOpts {
  /** Personal reference window; default `OSI_REF_DAYS`. */
  refDays?: number;
  /** Minimum reference days before anything is reported; default 14. */
  minRefDays?: number;
  /** Weight overrides, for tuning. */
  weights?: Partial<Record<StressSignal['key'], number>>;
  /** Per-signal z-threshold overrides, for tuning. */
  thresholds?: Partial<Record<StressSignal['key'], number>>;
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

/** 0–1 → none, 2 → minor, ≥ 3 → major. */
export function strainBandOf(signalsDeviating: number): StressBand {
  if (signalsDeviating >= OSI_BAND_MAJOR) return 'major';
  if (signalsDeviating >= OSI_BAND_MINOR) return 'minor';
  return 'none';
}

/** Per-signal z, the deviating count, and the fused index with its interval. */
export function overnightStrainIndex(
  records: DailyRecord[],
  asOf: ISODate,
  opts?: OvernightStrainOpts,
): OvernightStrain {
  const refDays = Math.max(1, Math.floor(opts?.refDays ?? OSI_REF_DAYS));
  const minRefDays = Math.max(1, Math.floor(opts?.minRefDays ?? OSI_MIN_REF_DAYS));
  const byDate = indexRange(records, addDays(asOf, -refDays), asOf);
  const states = signalStatesOn(byDate, asOf, refDays);

  // Reference days = days before asOf carrying at least one overnight signal.
  let nRef = 0;
  for (const d of lastNDates(addDays(asOf, -1), refDays)) {
    const r = byDate.get(d);
    if (r && SIGNALS.some((s) => s.read(r) !== null)) nRef++;
  }
  const calibrating = nRef < minRefDays;

  const signals: StressSignal[] = states.map((st) => {
    const threshold = opts?.thresholds?.[st.key] ?? SIGNAL_THRESHOLDS[st.key];
    const usable = !calibrating && st.n >= minRefDays;
    const z = usable && st.zStrain !== null ? round(st.zStrain, 3) : null;
    return {
      key: st.key,
      label: st.label,
      value: st.value === null ? null : round(st.value, 2),
      z,
      threshold: round(threshold, 3),
      deviating: usable ? isDeviating(st, threshold) : false,
    };
  });

  const signalsAvailable = states.filter((s) => s.raw !== null).length;
  const signalsDeviating = signals.filter((s) => s.deviating).length;

  if (calibrating) {
    return {
      ...EMPTY_STRAIN,
      signals,
      signalsAvailable,
      signalsDeviating: 0,
      calibrating: true,
      nRef,
    };
  }

  // Fused index: weights renormalised over the signals that actually have both
  // a reading today and enough history to standardise it.
  let sumW = 0;
  let sumWz = 0;
  let varW = 0;
  for (const st of states) {
    if (st.zStrain === null || st.n < minRefDays) continue;
    const w = opts?.weights?.[st.key] ?? OSI_WEIGHTS[st.key];
    if (!finite(w) || w <= 0) continue;
    sumW += w;
    sumWz += w * st.zStrain;
    // Var(z) ≈ (π/2 + 1.361·z²)/n: the reference median and the reference
    // scale are both estimates, and the scale's error scales with |z|.
    varW += w * w * (SE_MEDIAN_K ** 2 + SE_SCALE_K ** 2 * st.zStrain ** 2) / Math.max(1, st.n);
  }
  if (sumW <= 0) {
    return {
      ...EMPTY_STRAIN,
      signals,
      signalsAvailable,
      signalsDeviating,
      band: strainBandOf(signalsDeviating),
      calibrating: false,
      nRef,
    };
  }
  const zBar = sumWz / sumW;
  const seBar = Math.sqrt(varW) / sumW;
  const osi = clamp(50 + 12.5 * zBar, 0, 100);
  const lo = clamp(50 + 12.5 * (zBar - Z95 * seBar), 0, 100);
  const hi = clamp(50 + 12.5 * (zBar + Z95 * seBar), 0, 100);

  return {
    osi: round(osi, 1),
    lo: round(lo, 1),
    hi: round(hi, 1),
    signals,
    signalsDeviating,
    signalsAvailable,
    band: strainBandOf(signalsDeviating),
    calibrating: false,
    nRef,
  };
}

// ---------------------------------------------------------------------------
// Illness / overload
// ---------------------------------------------------------------------------

/** HRV z below this AND RHR z above `ILLNESS_RHR_Z` on the same day. */
export const ILLNESS_HRV_Z = -1;
export const ILLNESS_RHR_Z = 1;
/** …on at least this many of the last three days. */
export const ILLNESS_CONJUNCT_DAYS = 2;
export const ILLNESS_CONJUNCT_WINDOW = 3;
/** Respiratory rate over the personal median, brpm (WHOOP's COVID cohort). */
export const ILLNESS_RR_BRPM = 3;
/** Skin temperature over the personal median, °C… */
export const ILLNESS_SKT_C = 0.5;
/** …for this many consecutive nights. */
export const ILLNESS_SKT_NIGHTS = 2;
/** Past this many days the caller adds the existing doctor cue. */
export const ILLNESS_DOCTOR_DAYS = 3;
/** How far back `since` is searched. */
const ILLNESS_SINCE_LOOKBACK = 21;

/**
 * The one sentence every surface uses. It names a *possibility* and an action,
 * never a condition and never a diagnosis.
 */
export const ILLNESS_COPY = 'Possible illness or heavy overload — take an easy day.';

function stateOf(states: SignalState[], key: StressSignal['key']): SignalState | undefined {
  return states.find((s) => s.key === key);
}

/** Evaluates the three rules for one day. Returns the reasons that fired. */
function illnessReasonsOn(
  byDate: Map<ISODate, DailyRecord>,
  d: ISODate,
  refDays: number,
  minRefDays: number,
  cache: Map<ISODate, SignalState[]>,
): string[] {
  const statesFor = (day: ISODate): SignalState[] => {
    const hit = cache.get(day);
    if (hit) return hit;
    const st = signalStatesOn(byDate, day, refDays);
    cache.set(day, st);
    return st;
  };
  const reasons: string[] = [];

  // Rule 1 — conjunctive HRV/RHR on ≥ 2 of 3 consecutive days.
  let conjunct = 0;
  for (let i = 0; i < ILLNESS_CONJUNCT_WINDOW; i++) {
    const st = statesFor(addDays(d, -i));
    const hrv = stateOf(st, 'hrv');
    const rhr = stateOf(st, 'rhr');
    if (!hrv || !rhr) continue;
    if (hrv.n < minRefDays || rhr.n < minRefDays) continue;
    if (hrv.z !== null && rhr.z !== null && hrv.z < ILLNESS_HRV_Z && rhr.z > ILLNESS_RHR_Z) {
      conjunct++;
    }
  }
  if (conjunct >= ILLNESS_CONJUNCT_DAYS) {
    reasons.push(
      `HRV below and resting heart rate above your normal on ${conjunct} of the last ${ILLNESS_CONJUNCT_WINDOW} days`,
    );
  }

  // Rule 2 — respiratory rate ≥ +3 brpm over the personal median, today.
  const rr = stateOf(statesFor(d), 'rr');
  if (rr && rr.n >= minRefDays && rr.raw !== null && rr.med !== null) {
    const delta = rr.raw - rr.med;
    if (delta >= ILLNESS_RR_BRPM) {
      reasons.push(`Breathing rate ${round(delta, 1)} breaths/min above your normal`);
    }
  }

  // Rule 3 — skin temperature ≥ +0.5 °C for two nights.
  let sktNights = 0;
  let sktDelta: number | null = null;
  for (let i = 0; i < ILLNESS_SKT_NIGHTS; i++) {
    const skt = stateOf(statesFor(addDays(d, -i)), 'skt');
    if (!skt || skt.n < minRefDays || skt.raw === null || skt.med === null) break;
    const delta = skt.raw - skt.med;
    if (delta < ILLNESS_SKT_C) break;
    if (sktDelta === null) sktDelta = delta;
    sktNights++;
  }
  if (sktNights >= ILLNESS_SKT_NIGHTS && sktDelta !== null) {
    reasons.push(`Skin temperature ${round(sktDelta, 1)} °C above your normal for two nights`);
  }

  return reasons;
}

export interface IllnessOpts {
  /** Personal reference window; default `OSI_REF_DAYS`. */
  refDays?: number;
  /** Minimum reference days before any rule may fire; default 14. */
  minRefDays?: number;
}

/**
 * Conjunctive illness/overload flag — see the module header for the three
 * rules. `reasons` are user-facing strings; `since` is the first day of the
 * run so the UI can say how long it has been true. **Never a diagnosis and
 * never names a condition.**
 */
export function illnessFlag(
  records: DailyRecord[],
  asOf: ISODate,
  opts?: IllnessOpts,
): StressContext['illness'] {
  const refDays = Math.max(1, Math.floor(opts?.refDays ?? OSI_REF_DAYS));
  const minRefDays = Math.max(1, Math.floor(opts?.minRefDays ?? OSI_MIN_REF_DAYS));
  const byDate = indexRange(
    records,
    addDays(asOf, -(refDays + ILLNESS_SINCE_LOOKBACK + ILLNESS_CONJUNCT_WINDOW)),
    asOf,
  );
  const cache = new Map<ISODate, SignalState[]>();

  const reasons = illnessReasonsOn(byDate, asOf, refDays, minRefDays, cache);
  if (reasons.length === 0) return { flag: false, since: null, reasons: [] };

  // Walk back while the flag would also have been up, so the UI can say how
  // long this has been true. Short-circuits on the first clear day.
  let since = asOf;
  for (let i = 1; i <= ILLNESS_SINCE_LOOKBACK; i++) {
    const d = addDays(asOf, -i);
    if (illnessReasonsOn(byDate, d, refDays, minRefDays, cache).length === 0) break;
    since = d;
  }
  return { flag: true, since, reasons };
}

// ---------------------------------------------------------------------------
// Resilience
// ---------------------------------------------------------------------------

/**
 * Load-side component weights. **Heuristic** — no published weighting of these
 * inputs exists; they encode "training and the subjective stress item carry
 * most of it, the behaviours are modifiers". Renormalised over what is present.
 */
export const LOAD_WEIGHTS = {
  load: 0.3,
  steps: 0.1,
  alcohol: 0.15,
  tobacco: 0.1,
  lateCaffeine: 0.1,
  lateBedtime: 0.1,
  stress: 0.15,
} as const;

/** Recovery-side component weights. **Heuristic**, as above. */
export const RECOVERY_WEIGHTS = {
  sleep: 0.35,
  readiness: 0.3,
  osi: 0.2,
  subjective: 0.15,
} as const;

/**
 * Band cuts on the 0–100 resilience score (= 50 + 200 · balance, clamped).
 * Oura's five-band vocabulary; the cut points are **heuristic** — there is no
 * published mapping from a stress/recovery balance to these words.
 */
export const RESILIENCE_BAND_CUTS: ReadonlyArray<{ below: number; band: ResilienceBand }> = [
  { below: 20, band: 'limited' },
  { below: 40, band: 'adequate' },
  { below: 60, band: 'solid' },
  { below: 80, band: 'strong' },
  { below: Infinity, band: 'exceptional' },
];

/**
 * Score = 50 + gain × (balance − centre), clamped to 0–100.
 *
 * The centre is not cosmetic. The recovery components (sleep vs need, readiness,
 * 1 − OSI/100, subjective recovery) naturally sit near 0.5–0.65 for an ordinary
 * user, while the load components sit near 0.3–0.4 because most of the
 * behaviours (alcohol, tobacco, late caffeine) are zero on most days. So an
 * ordinary balance is ≈ +0.20, and without the offset every ordinary user would
 * read "Exceptional" — the exact unfalsifiable flattery this module exists to
 * avoid. Both numbers are **heuristics**: the *shape* of the model is
 * Kellmann's, the mapping to five words is ours, and the UI says so.
 */
export const RESILIENCE_BALANCE_CENTRE = 0.2;
export const RESILIENCE_SCORE_GAIN = 100;
/** Days in the reported window that need both curves before a band is given. */
export const RESILIENCE_MIN_DAYS = 7;
/** Days the EWMAs are integrated over before the reported window. */
const RESILIENCE_BURN_IN_DAYS = 28;
/** Alcoholic drinks that saturate the alcohol component. **Heuristic.** */
export const LOAD_ALCOHOL_SATURATION = 4;
/** Late-caffeine servings past the cutoff that saturate the component. */
export const LOAD_LATE_CAFFEINE_SATURATION = 2;
/** Minutes past the bed target that saturate the late-bedtime component. */
export const LOAD_LATE_BEDTIME_SATURATION_MIN = 120;
/** Sleep-vs-need ratios that map to 0 and 1 on the recovery side. */
export const RECOVERY_SLEEP_RATIO_LO = 0.6;
export const RECOVERY_SLEEP_RATIO_HI = 1.15;

export function resilienceBandOf(score: number | null): ResilienceBand | null {
  if (score === null) return null;
  for (const cut of RESILIENCE_BAND_CUTS) if (score < cut.below) return cut.band;
  return 'exceptional';
}

/** EWMA smoothing constant for a continuous time constant τ in days. */
export function tauToAlpha(tauDays: number): number {
  const t = finite(tauDays) && tauDays > 0 ? tauDays : 1;
  return 1 - Math.exp(-1 / t);
}

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

/** Weighted mean over the components that are present; null when none are. */
function weightedMean(parts: Array<{ w: number; v: number | null }>): number | null {
  let sw = 0;
  let sv = 0;
  for (const p of parts) {
    if (p.v === null || !finite(p.v) || !finite(p.w) || p.w <= 0) continue;
    sw += p.w;
    sv += p.w * p.v;
  }
  return sw > 0 ? sv / sw : null;
}

/** Minutes late relative to a target bedtime, on the noon axis. */
function lateBedtimeMin(bt: string | undefined, bedTarget: string): number | null {
  const actual = minutesSinceNoon(bt);
  const target = minutesSinceNoon(bedTarget);
  if (actual === null || target === null) return null;
  let late = actual - target;
  if (late < -720) late += 1440;
  if (late > 720) late -= 1440;
  return Math.max(0, late);
}

/** Caffeine servings logged after the cutoff. */
function lateCaffeineCount(caf: readonly string[] | undefined, cutoff: string): number | null {
  if (!Array.isArray(caf)) return null;
  const cut = hhmmToMinutes(cutoff);
  if (cut === null) return null;
  let n = 0;
  for (const t of caf) {
    const m = hhmmToMinutes(t);
    if (m !== null && m >= cut) n++;
  }
  return n;
}

/** Kellmann scissors balance over 14 days, with the AL-style counter. */
export function resilienceSummary(
  records: DailyRecord[],
  asOf: ISODate,
  opts: ResilienceOpts,
): ResilienceSummary {
  const profile = opts.profile;
  const windowDays = RESILIENCE_WINDOW_DAYS;
  const spanDays = windowDays + RESILIENCE_BURN_IN_DAYS;
  const normStart = addDays(asOf, -(AL_STYLE_REF_DAYS + spanDays));
  const byDate = indexRange(records, normStart, asOf);

  const loadByDate = new Map<ISODate, number>();
  for (const p of opts.loads ?? []) if (finite(p?.load)) loadByDate.set(p.d, p.load);
  const readyByDate = new Map<ISODate, number>();
  for (const p of opts.readinessScores ?? []) if (finite(p?.score)) readyByDate.set(p.d, p.score as number);
  const osiByDate = new Map<ISODate, number>();
  for (const p of opts.osi ?? []) if (finite(p?.osi)) osiByDate.set(p.d, p.osi as number);

  // Personal anchors for the two components that have no natural scale.
  const normDates = lastNDates(asOf, spanDays);
  const loadRef: number[] = [];
  const stepRef: number[] = [];
  for (const d of normDates) {
    const r = byDate.get(d);
    const ld = loadByDate.get(d) ?? num(r?.ld);
    if (ld !== null && ld !== undefined && ld > 0) loadRef.push(ld);
    const st = num(r?.st);
    if (st !== null && st > 0) stepRef.push(st);
  }
  const loadHi = quantile(loadRef, 0.9);
  const stepHi = quantile(stepRef, 0.9);

  const needHrs =
    num(opts.sleepNeedHrs) ?? (finite(profile?.sleepBaselineHrs) ? profile.sleepBaselineHrs : 8);
  const bedTarget = profile?.bedTarget ?? '23:00';
  const cutoff = profile?.caffeineCutoff ?? '14:00';
  const tobBase = Math.max(1, num(profile?.tobaccoBaselinePerDay) ?? 10);

  const dates = lastNDates(asOf, spanDays);
  const loads: (number | null)[] = [];
  const recoveries: (number | null)[] = [];
  for (const d of dates) {
    const r = byDate.get(d);
    const ld = loadByDate.get(d) ?? num(r?.ld);
    const st = num(r?.st);
    const alc = num(r?.alc);
    const tob = num(r?.tob);
    const lateCaf = lateCaffeineCount(r?.caf, cutoff);
    const lateBed = lateBedtimeMin(r?.bt, bedTarget);
    const qt = itemValue(r, 'qt');

    const load = weightedMean([
      {
        w: LOAD_WEIGHTS.load,
        v: ld === null || ld === undefined || loadHi === null || loadHi <= 0 ? null : clamp(ld / loadHi, 0, 1),
      },
      { w: LOAD_WEIGHTS.steps, v: st === null || stepHi === null || stepHi <= 0 ? null : clamp(st / stepHi, 0, 1) },
      { w: LOAD_WEIGHTS.alcohol, v: alc === null ? null : clamp(alc / LOAD_ALCOHOL_SATURATION, 0, 1) },
      { w: LOAD_WEIGHTS.tobacco, v: tob === null ? null : clamp(tob / tobBase, 0, 1) },
      {
        w: LOAD_WEIGHTS.lateCaffeine,
        v: lateCaf === null ? null : clamp(lateCaf / LOAD_LATE_CAFFEINE_SATURATION, 0, 1),
      },
      {
        w: LOAD_WEIGHTS.lateBedtime,
        v: lateBed === null ? null : clamp(lateBed / LOAD_LATE_BEDTIME_SATURATION_MIN, 0, 1),
      },
      { w: LOAD_WEIGHTS.stress, v: qt === null ? null : (qt - 1) / 6 },
    ]);

    const slept = num(r?.slh);
    const ready = readyByDate.get(d) ?? num(r?.rec);
    const osiD = osiByDate.get(d) ?? num(r?.osi);
    const qs = itemValue(r, 'qs');
    const qf = itemValue(r, 'qf');
    const subj =
      qs === null && qf === null
        ? null
        : ((qs === null ? 0 : (7 - qs) / 6) + (qf === null ? 0 : (7 - qf) / 6)) /
          ((qs === null ? 0 : 1) + (qf === null ? 0 : 1));

    const recovery = weightedMean([
      {
        w: RECOVERY_WEIGHTS.sleep,
        v:
          slept === null || needHrs <= 0
            ? null
            : clamp(
                (slept / needHrs - RECOVERY_SLEEP_RATIO_LO) /
                  (RECOVERY_SLEEP_RATIO_HI - RECOVERY_SLEEP_RATIO_LO),
                0,
                1,
              ),
      },
      { w: RECOVERY_WEIGHTS.readiness, v: ready === null || ready === undefined ? null : clamp(ready / 100, 0, 1) },
      { w: RECOVERY_WEIGHTS.osi, v: osiD === null || osiD === undefined ? null : clamp((100 - osiD) / 100, 0, 1) },
      { w: RECOVERY_WEIGHTS.subjective, v: subj },
    ]);

    loads.push(load);
    recoveries.push(recovery);
  }

  // Two EWMAs with Kellmann's asymmetry: recovery accumulates slowly (τ 14 d),
  // load turns over quickly (τ 7 d). Written out rather than using stats.ewma
  // so both curves keep their dates and their gaps.
  const aLoad = tauToAlpha(RESILIENCE_TAU_LOAD);
  const aRec = tauToAlpha(RESILIENCE_TAU_RECOVERY);
  const loadEwmaSeries: (number | null)[] = [];
  const recEwmaSeries: (number | null)[] = [];
  let curL: number | null = null;
  let curR: number | null = null;
  for (let i = 0; i < dates.length; i++) {
    const l = loads[i];
    if (l !== null) curL = curL === null ? l : curL + aLoad * (l - curL);
    const rr = recoveries[i];
    if (rr !== null) curR = curR === null ? rr : curR + aRec * (rr - curR);
    loadEwmaSeries.push(curL);
    recEwmaSeries.push(curR);
  }

  const from = Math.max(0, dates.length - windowDays);
  const series = dates.slice(from).map((d, i) => ({
    d,
    load: loads[from + i] === null ? null : round(loads[from + i] as number, 3),
    recovery: recoveries[from + i] === null ? null : round(recoveries[from + i] as number, 3),
  }));
  const nDays = series.filter((p) => p.load !== null || p.recovery !== null).length;
  const nBoth = series.filter((p) => p.load !== null && p.recovery !== null).length;

  const loadEwma = curL;
  const recoveryEwma = curR;
  const balance = loadEwma === null || recoveryEwma === null ? null : recoveryEwma - loadEwma;
  const enough = nBoth >= RESILIENCE_MIN_DAYS && balance !== null;
  const score = enough
    ? clamp(50 + RESILIENCE_SCORE_GAIN * ((balance as number) - RESILIENCE_BALANCE_CENTRE), 0, 100)
    : null;

  return {
    score: score === null ? null : round(score, 1),
    band: resilienceBandOf(score),
    loadEwma: loadEwma === null ? null : round(loadEwma, 3),
    recoveryEwma: recoveryEwma === null ? null : round(recoveryEwma, 3),
    balance: balance === null ? null : round(balance, 3),
    nDays,
    alStyleCount: alStyleCount(byDate, asOf),
    series,
  };
}

/**
 * Allostatic-load-**STYLE** counter. McEwen's index counts how many biomarkers
 * sit in the sample's worst quartile; this transposes the *shape* of that idea
 * onto the six overnight signals — the mean number of them (0–6) that sat in
 * the user's own at-risk quartile per day over the last 30 days, measured
 * against a 90-day personal reference.
 *
 * It is **not** allostatic load: the real index is built from cortisol, CRP,
 * blood pressure, waist-hip ratio and lipids, and the wearable transposition is
 * unvalidated. Both the field name and the UI copy carry "AL-style" so nobody
 * can read it as the published construct.
 */
function alStyleCount(byDate: Map<ISODate, DailyRecord>, asOf: ISODate): number | null {
  const refDates = lastNDates(asOf, AL_STYLE_REF_DAYS);
  const cuts = new Map<StressSignal['key'], number>();
  let refDays = 0;
  for (const d of refDates) {
    const r = byDate.get(d);
    if (r && SIGNALS.some((s) => s.read(r) !== null)) refDays++;
  }
  if (refDays < AL_STYLE_MIN_REF_DAYS) return null;

  for (const s of SIGNALS) {
    const vals: number[] = [];
    for (const d of refDates) {
      const v = s.read(byDate.get(d));
      if (v !== null) vals.push(v);
    }
    if (vals.length < AL_STYLE_MIN_REF_DAYS) continue;
    // At-risk = the strain-positive tail: the 75th percentile for signals where
    // higher is worse, the 25th where lower is worse.
    const q = quantile(vals, s.sign === 1 ? AL_STYLE_QUANTILE : 1 - AL_STYLE_QUANTILE);
    if (q !== null) cuts.set(s.key, q);
  }
  if (cuts.size === 0) return null;

  let dayCount = 0;
  let total = 0;
  for (const d of lastNDates(asOf, AL_STYLE_WINDOW_DAYS)) {
    const r = byDate.get(d);
    if (!r) continue;
    let present = false;
    let n = 0;
    for (const s of SIGNALS) {
      const cut = cuts.get(s.key);
      const v = s.read(r);
      if (cut === undefined || v === null) continue;
      present = true;
      if (s.sign === 1 ? v >= cut : v <= cut) n++;
    }
    if (!present) continue;
    dayCount++;
    total += n;
  }
  if (dayCount === 0) return null;
  return round(total / dayCount, 2);
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

export interface StressSummaryOpts extends ResilienceOpts {
  /** `settings.checkIn` — which items were asked for. */
  checkIn?: CheckInSettings;
  /** Overrides forwarded to `overnightStrainIndex`. */
  strain?: OvernightStrainOpts;
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
  const checkIn = checkInSummary(records, asOf, { items: opts.checkIn?.items });
  const strain = overnightStrainIndex(records, asOf, opts.strain);
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
