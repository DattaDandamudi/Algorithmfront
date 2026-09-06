/**
 * §1i N-of-1 behaviour impact — "on the 9 days you drank, next-day recovery
 * averaged 11 points lower (95% CI 4–18)".
 *
 * WHOOP's Journal is the closest shipping thing, and it reports a point
 * estimate with no interval, no multiplicity control and no shrinkage. This
 * module keeps WHOOP's gate and adds the three things that stop an N-of-1
 * engine inventing effects — which is the whole risk here, because a coach
 * that invents effects is worse than one that says nothing.
 *
 * ## Design
 *
 * - **Behaviours** (`BEHAVIOURS`): alcohol, tobacco, late caffeine, late
 *   eating, high load, short sleep, late bedtime. Each is a per-day yes/no
 *   derived from the record, thresholded against the user's own distribution
 *   where "high"/"short"/"late" is relative.
 * - **Outcomes** (`IMPACT_METRICS`): **next-day** readiness, HRV, RHR, sleep
 *   hours and OSI. The lag is deliberate: the behaviour happens today, the
 *   physiology answers tomorrow morning.
 * - **Gate**: ≥ 5 "yes" **and** ≥ 5 "no" days within 90 days — WHOOP's own bar,
 *   and we keep it. Behaviours that exist but miss the gate go to
 *   `ImpactContext.pending` so the UI can say "keep logging" instead of
 *   silently dropping them.
 * - **Estimate**: difference in means with a **Welch** standard error
 *   (unequal variances, unequal n — the usual case here), then **shrunk toward
 *   a published population prior**: `w = σ²_prior/(σ²_prior + se²)`, reported
 *   estimate `= w·observed + (1 − w)·prior`, with `shrunkToPrior = 1 − w`
 *   carried into the UI so an estimate pulled more than halfway to the prior
 *   says so. `w` is bounded to [0, 1] (a Phase 3 review dimension).
 * - **Multiplicity**: Benjamini–Hochberg across the **whole behaviour × metric
 *   grid**, never per behaviour, with the q-value carried into the UI.
 * - **Confounds**: when the "yes" days differ systematically in training load,
 *   the effect names the confound rather than hiding it.
 *
 * ## Two properties worth stating out loud
 *
 * 1. **The p-value that BH corrects is the *unshrunk* Welch p.** Testing the
 *    shrunk estimate would let the population prior manufacture significance
 *    on a user whose own days show nothing — the exact failure the headline
 *    simulation guards. Shrinkage moves the reported number and the interval;
 *    it never moves the evidence.
 * 2. **A logged day with the field absent is a "no" day** for alcohol,
 *    tobacco and caffeine. It is an assumption, and it is the safe one: a
 *    forgotten drink lands in the "no" group and pulls the estimate *toward
 *    zero*, so the bias is against claiming an effect, never for it.
 *
 * ## Priors
 *
 * Alcohol: HRV −7 ms and RHR +3 bpm (PLOS Digital Health, 20,968 users /
 * 5.1 M person-days; ≈ +1.3 bpm per drink). **Caffeine is modelled as acting
 * through sleep**, not directly on HRV, because that is what the evidence
 * supports: the only caffeine prior is on sleep hours (Gardiner 2023
 * meta-analysis, total sleep time −45 min; Drake 2013 JCSM, 400 mg six hours
 * before bed costs > 1 h), and the caffeine rows for HRV, RHR, readiness and
 * OSI carry a note pointing at the sleep row instead of a prior of their own.
 * WHOOP's published journal figures are the intended secondary prior; no
 * number is encoded for them here because none of their public figures comes
 * with an effect size and a dispersion we could cite, and an uncited constant
 * is a review finding. A pair with no published prior is not shrunk
 * (`shrunkToPrior: 0`) and leans entirely on the user's own days, which is the
 * honest default. `BEHAVIOUR_PRIORS` is exported so the UI can name the source
 * whenever `shrunkToPrior` is large.
 *
 * ## Copy
 *
 * `BehaviourEffect.label` is the sentence the UI renders and it is **phrased
 * for association, never causation**: "on the 9 days you drank, next-day
 * readiness averaged 11 points lower (95% CI 4–18)". No "because", no
 * "caused", no imperative. Phase 3 reviews this; if you add a metric or a
 * behaviour, add its wording to `METRIC_COPY`/`BEHAVIOUR_COPY` and keep the
 * verb "averaged".
 *
 * The sim that guards the maths is the headline one: a null behaviour must
 * survive BH correction as "confirmed" in < 5% of 200 runs (measured: 1.0%,
 * and 2.5% for *any* cell of a fully null 35-cell grid against BH's nominal
 * 5%), and a true −10-point alcohol effect with 12 yes-days must be recovered
 * within ±4 points in ≥ 85% of seeds (measured: 95%, with 95% interval
 * coverage).
 *
 * Pure and clock-free: `asOf` is a parameter.
 */
import type {
  BehaviourEffect,
  DailyRecord,
  HHMM,
  ImpactContext,
  ISODate,
  Profile,
  Workout,
} from '../data/types';
import { addDays, formatClock, hhmmToMinutes, minutesSinceNoon } from '../lib/dates';
import { lateEatingCheck } from './nutrition';
import { benjaminiHochberg, quantile, tCdf } from './stats';

/** Lookback for both the yes- and no-day counts, days. */
export const IMPACT_WINDOW_DAYS = 90;
/** WHOOP's gate, kept: at least this many days on each side. */
export const MIN_YES_DAYS = 5;
export const MIN_NO_DAYS = 5;
/**
 * Benjamini–Hochberg cut-off for calling an effect "confirmed" — the
 * conventional 5% FDR. Exported so the UI and `context.ts` use the same bar
 * (`isConfirmedEffect`) instead of each inventing one.
 */
export const IMPACT_Q_THRESHOLD = 0.05;

export type BehaviourKey =
  | 'alcohol'
  | 'tobacco'
  | 'lateCaffeine'
  | 'lateEating'
  | 'highLoad'
  | 'shortSleep'
  | 'lateBedtime';

export type ImpactMetricKey = 'readiness' | 'hrv' | 'rhr' | 'sleepHrs' | 'osi';

export const BEHAVIOURS: readonly BehaviourKey[] = [
  'alcohol',
  'tobacco',
  'lateCaffeine',
  'lateEating',
  'highLoad',
  'shortSleep',
  'lateBedtime',
];

export const IMPACT_METRICS: readonly ImpactMetricKey[] = [
  'readiness',
  'hrv',
  'rhr',
  'sleepHrs',
  'osi',
];

export interface BehaviourPrior {
  /** Published population effect on the metric, in the metric's own unit. */
  deltaMean: number;
  /** Prior sd — the shrinkage weight is `σ²/(σ² + se²)`. */
  sd: number;
  /** Citation, repeated in the caption when shrinkage dominates. */
  source: string;
}

/**
 * Population priors, keyed `behaviour:metric`. Sparse on purpose: a pair with
 * no published prior is not shrunk (`shrunkToPrior: 0`) and leans entirely on
 * the user's own days, which is the honest default.
 */
export const BEHAVIOUR_PRIORS: Partial<Record<string, BehaviourPrior>> = {
  'alcohol:hrv': {
    deltaMean: -7,
    sd: 4,
    source: 'PLOS Digital Health 2024, 20,968 users / 5.1 M person-days',
  },
  'alcohol:rhr': {
    deltaMean: 3,
    sd: 2,
    source: 'PLOS Digital Health 2024 (≈ +1.3 bpm per drink)',
  },
  // Caffeine acts *through sleep*, so this is the only caffeine prior there is.
  'lateCaffeine:sleepHrs': {
    deltaMean: -0.75,
    sd: 0.5,
    source: 'Gardiner 2023 meta-analysis (total sleep time −45 min); Drake 2013 JCSM',
  },
};

export interface ImpactOpts {
  profile?: Profile;
  /** Lookback; default `IMPACT_WINDOW_DAYS`. */
  windowDays?: number;
  /** Gate overrides — lowering these is a Phase 3 review finding, not a knob. */
  minYes?: number;
  minNo?: number;
  /** Daily readiness 0–100, since it is derived rather than stored. */
  readinessScores?: ReadonlyArray<{ d: ISODate; score: number | null }>;
  /** Daily training load, for the `highLoad` behaviour and the confound check. */
  loads?: ReadonlyArray<{ d: ISODate; load: number }>;
}

// ---------------------------------------------------------------------------
// Copy — association, never causation (see the header)
// ---------------------------------------------------------------------------

interface MetricCopy {
  label: string;
  unit: string;
  /** Decimal places in the rendered sentence. */
  dp: number;
}

const METRIC_COPY: Record<ImpactMetricKey, MetricCopy> = {
  readiness: { label: 'readiness', unit: 'points', dp: 0 },
  hrv: { label: 'HRV', unit: 'ms', dp: 1 },
  rhr: { label: 'resting heart rate', unit: 'bpm', dp: 1 },
  sleepHrs: { label: 'sleep', unit: 'h', dp: 1 },
  osi: { label: 'overnight strain', unit: 'points', dp: 0 },
};

/** Short names for `ImpactContext.pending` and any UI that needs a title. */
export const BEHAVIOUR_LABELS: Record<BehaviourKey, string> = {
  alcohol: 'alcohol',
  tobacco: 'tobacco',
  lateCaffeine: 'late caffeine',
  lateEating: 'late eating',
  highLoad: 'hard training days',
  shortSleep: 'short sleep',
  lateBedtime: 'late bedtime',
};

/** `on the N days …` — the second clause of every sentence this module writes. */
const BEHAVIOUR_COPY: Record<BehaviourKey, (detail: string) => string> = {
  alcohol: () => 'you drank',
  tobacco: () => 'you used tobacco',
  lateCaffeine: (d) => `you had caffeine after ${d}`,
  lateEating: (d) => `you ate a large meal within ${d} of bed`,
  highLoad: (d) => `your training load was above ${d}`,
  shortSleep: (d) => `you slept under ${d}`,
  lateBedtime: (d) => `you went to bed after ${d}`,
};

// ---------------------------------------------------------------------------
// Small numeric helpers (everything statistical lives in stats.ts)
// ---------------------------------------------------------------------------

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const round = (v: number, dp: number): number => {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
};

const mean = (xs: number[]): number => xs.reduce((s, v) => s + v, 0) / xs.length;

/** Unbiased sample variance; `null` below two points. */
function variance(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = mean(xs);
  return xs.reduce((s, v) => s + (v - m) * (v - m), 0) / (xs.length - 1);
}

interface Welch {
  diff: number;
  se: number;
  df: number;
  t: number;
  p: number;
}

/**
 * Welch's unequal-variance t: `se = √(s²ₐ/nₐ + s²_b/n_b)` with the
 * Welch–Satterthwaite df. `null` when either group is too small or both are
 * constant (a zero standard error is not a certainty, it is a degenerate
 * sample — reporting an infinite t would be a lie).
 */
function welchTest(a: number[], b: number[]): Welch | null {
  const va = variance(a);
  const vb = variance(b);
  if (va === null || vb === null) return null;
  const sa = va / a.length;
  const sb = vb / b.length;
  const se = Math.sqrt(sa + sb);
  if (!(se > 0) || !Number.isFinite(se)) return null;
  const df =
    ((sa + sb) * (sa + sb)) / ((sa * sa) / (a.length - 1) + (sb * sb) / (b.length - 1));
  if (!(df > 0) || !Number.isFinite(df)) return null;
  const diff = mean(a) - mean(b);
  const t = diff / se;
  const cdf = tCdf(Math.abs(t), df);
  if (cdf === null) return null;
  const p = Math.min(1, Math.max(0, 2 * (1 - cdf)));
  return { diff, se, df, t, p };
}

/**
 * Student-t quantile by bisection on `stats.tCdf` — the inverse the CI needs
 * and the one distribution function `stats.ts` does not expose. 60 halvings of
 * [0, 200] is exact to ~1e-16 and costs nothing at this grid size; a normal
 * 1.96 would understate the interval at the small df the 5/5 gate allows
 * (t₀.₉₇₅ is 2.78 at df 4).
 */
function tQuantile(p: number, df: number): number | null {
  if (!(p > 0.5) || !(p < 1) || !(df > 0) || !Number.isFinite(df)) return null;
  let lo = 0;
  let hi = 200;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const c = tCdf(mid, df);
    if (c === null) return null;
    if (c < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// ---------------------------------------------------------------------------
// Behaviour extraction
// ---------------------------------------------------------------------------

/** Foster sRPE fallback when a workout carries no stamped load. */
const FOSTER_SRPE = (w: Workout): number | null =>
  isNum(w.load) ? w.load : isNum(w.srpe) && isNum(w.durationMin) ? w.srpe * w.durationMin : null;

/** A day the user actually logged something on — an empty record is not evidence. */
function isLogged(rec: DailyRecord): boolean {
  for (const k of Object.keys(rec)) if (k !== 'd') return true;
  return false;
}

interface Behaviour {
  key: BehaviourKey;
  /** Rendered into the sentence, e.g. "2:00 PM" or "6.4 h". */
  detail: string;
  /** Day → true (yes), false (no); days absent from the map are unobserved. */
  days: Map<ISODate, boolean>;
}

/** Caffeine after midnight belongs to the evening before, not to the morning. */
function lateClock(t: HHMM | undefined | null): number | null {
  const m = hhmmToMinutes(t);
  if (m === null) return null;
  return m < 4 * 60 ? m + 1440 : m;
}

function buildBehaviours(
  days: ISODate[],
  byDate: Map<ISODate, DailyRecord>,
  loadByDate: Map<ISODate, number>,
  profile: Profile | undefined,
): Behaviour[] {
  const cutoff = profile?.caffeineCutoff ?? '14:00';
  const bedTarget = profile?.bedTarget ?? '23:00';
  const logged = days.filter((d) => {
    const r = byDate.get(d);
    return !!r && isLogged(r);
  });

  // Relative thresholds come from the user's own window. **These four numbers
  // are heuristics with no published support** and are labelled as such for
  // the UI copy: the top quartile of *training* days is "high load" (rest days
  // are excluded so a 3-on/4-off week does not make every session "hard"), the
  // bottom quartile of nights is "short sleep" and the top quartile of
  // bedtimes is "late" — each with a margin (30 min) against the user's own
  // median, so a metronomic sleeper has no short nights and no late nights
  // however tight their quartiles are.
  const MARGIN_MIN = 30;
  const loadValues = logged.map((d) => loadByDate.get(d)).filter(isNum).filter((v) => v > 0);
  const loadP75 = quantile(loadValues, 0.75);
  const sleepValues = logged.map((d) => byDate.get(d)?.slh).filter(isNum);
  const sleepP25 = quantile(sleepValues, 0.25);
  const sleepMed = quantile(sleepValues, 0.5);
  const bedValues = logged.map((d) => minutesSinceNoon(byDate.get(d)?.bt)).filter(isNum);
  const bedP75 = quantile(bedValues, 0.75);
  const bedMed = quantile(bedValues, 0.5);

  const out: Behaviour[] = [];
  const push = (
    key: BehaviourKey,
    detail: string,
    fn: (rec: DailyRecord, d: ISODate) => boolean | null,
  ) => {
    const map = new Map<ISODate, boolean>();
    for (const d of logged) {
      const rec = byDate.get(d) as DailyRecord;
      const v = fn(rec, d);
      if (v !== null) map.set(d, v);
    }
    out.push({ key, detail, days: map });
  };

  push('alcohol', '', (r) => (isNum(r.alc) ? r.alc > 0 : false));
  push('tobacco', '', (r) => (isNum(r.tob) ? r.tob > 0 : false));

  const cutoffMin = lateClock(cutoff);
  push('lateCaffeine', formatClock(cutoff), (r) => {
    if (cutoffMin === null) return null;
    const times = Array.isArray(r.caf) ? r.caf : [];
    return times.some((t) => {
      const m = lateClock(t);
      return m !== null && m >= cutoffMin;
    });
  });

  // Vujović 2022, via nutrition.lateEatingCheck: ≥ 400 kcal within 3 h of bed.
  push('lateEating', '3 h', (r) =>
    r.meals && r.meals.length > 0 ? lateEatingCheck(r.meals, bedTarget).late : null,
  );

  push('highLoad', loadP75 === null ? '' : `${Math.round(loadP75)} load units`, (_r, d) => {
    if (loadP75 === null) return null;
    const v = loadByDate.get(d);
    return isNum(v) ? v > 0 && v >= loadP75 : null;
  });

  push('shortSleep', sleepP25 === null ? '' : `${round(sleepP25, 1)} h`, (r) => {
    if (sleepP25 === null || sleepMed === null) return null;
    if (!isNum(r.slh)) return null;
    return r.slh <= sleepP25 && r.slh <= sleepMed - MARGIN_MIN / 60;
  });

  push('lateBedtime', bedP75 === null ? '' : formatClock(hhmmFromNoon(bedP75)), (r) => {
    if (bedP75 === null || bedMed === null) return null;
    const m = minutesSinceNoon(r.bt);
    return m === null ? null : m >= bedP75 && m >= bedMed + MARGIN_MIN;
  });

  return out;
}

/** Minutes-since-noon back to a clock time, for the threshold in the copy. */
function hhmmFromNoon(mins: number): HHMM {
  const m = ((Math.round(mins) + 720) % 1440 + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h < 10 ? '0' : ''}${h}:${mm < 10 ? '0' : ''}${mm}`;
}

// ---------------------------------------------------------------------------
// The engine
// ---------------------------------------------------------------------------

interface Candidate {
  behaviour: BehaviourKey;
  metric: ImpactMetricKey;
  detail: string;
  nYes: number;
  nNo: number;
  welch: Welch;
  estimate: number;
  sePost: number;
  shrunk: number;
  confound?: string;
}

/**
 * Every behaviour × metric pair that clears the gate, shrunk, BH-corrected and
 * sorted by strength (smallest q first). `pending` lists the behaviours that
 * exist in the log but lack the 5/5 days to be reported — as human labels
 * (`BEHAVIOUR_LABELS`), not keys, so "keep logging: alcohol, late caffeine"
 * renders straight from it. `context.ts` caps the list at the five strongest
 * survivors of `isConfirmedEffect`.
 */
export function behaviourImpact(
  records: DailyRecord[],
  workouts: Workout[],
  asOf: ISODate,
  opts?: ImpactOpts,
): ImpactContext {
  const windowDays = Math.max(1, Math.floor(opts?.windowDays ?? IMPACT_WINDOW_DAYS));
  const minYes = Math.max(1, Math.floor(opts?.minYes ?? MIN_YES_DAYS));
  const minNo = Math.max(1, Math.floor(opts?.minNo ?? MIN_NO_DAYS));
  const start = addDays(asOf, -(windowDays - 1));

  const byDate = new Map<ISODate, DailyRecord>();
  for (const r of records ?? []) {
    if (r && typeof r.d === 'string' && r.d >= start && r.d <= asOf) byDate.set(r.d, r);
  }
  const days = [...byDate.keys()].sort();
  if (days.length === 0) return { effects: [], pending: [] };

  // Daily load, weakest source first — later writes win, so the caller's
  // series (context.ts passes load.ts's) beats the stamped `ld`, which beats
  // what the workouts themselves imply.
  const loadByDate = new Map<ISODate, number>();
  for (const w of workouts ?? []) {
    if (!w || typeof w.d !== 'string' || w.d < start || w.d > asOf) continue;
    const l = FOSTER_SRPE(w);
    if (l !== null) loadByDate.set(w.d, (loadByDate.get(w.d) ?? 0) + l);
  }
  for (const d of days) {
    const ld = byDate.get(d)?.ld;
    if (isNum(ld)) loadByDate.set(d, ld);
  }
  for (const p of opts?.loads ?? []) {
    if (p && typeof p.d === 'string' && isNum(p.load) && p.d >= start && p.d <= asOf) {
      loadByDate.set(p.d, p.load);
    }
  }

  const readinessByDate = new Map<ISODate, number>();
  for (const p of opts?.readinessScores ?? []) {
    if (p && typeof p.d === 'string' && isNum(p.score)) readinessByDate.set(p.d, p.score);
  }

  const outcome = (d: ISODate, metric: ImpactMetricKey): number | null => {
    const next = addDays(d, 1);
    if (next > asOf) return null;
    if (metric === 'readiness') return readinessByDate.get(next) ?? null;
    const rec = byDate.get(next);
    if (!rec) return null;
    const v =
      metric === 'hrv' ? rec.hrv : metric === 'rhr' ? rec.rhr : metric === 'sleepHrs' ? rec.slh : rec.osi;
    return isNum(v) ? v : null;
  };

  const behaviours = buildBehaviours(days, byDate, loadByDate, opts?.profile);

  const candidates: Candidate[] = [];
  const seen = new Set<BehaviourKey>();
  const reported = new Set<BehaviourKey>();

  for (const b of behaviours) {
    const yesDays: ISODate[] = [];
    const noDays: ISODate[] = [];
    for (const [d, yes] of b.days) (yes ? yesDays : noDays).push(d);
    if (yesDays.length === 0) continue; // never happened: not a behaviour of theirs
    seen.add(b.key);
    if (yesDays.length < minYes || noDays.length < minNo) continue;

    const confound = loadConfound(b, yesDays, noDays, loadByDate);

    for (const metric of IMPACT_METRICS) {
      const yes = yesDays.map((d) => outcome(d, metric)).filter(isNum);
      const no = noDays.map((d) => outcome(d, metric)).filter(isNum);
      // The gate again, on the days that actually carry this outcome: five
      // drinking days with two HRV readings is not five drinking days.
      if (yes.length < minYes || no.length < minNo) continue;
      const w = welchTest(yes, no);
      if (w === null) continue;

      const prior = BEHAVIOUR_PRIORS[`${b.key}:${metric}`];
      let estimate = w.diff;
      let sePost = w.se;
      let shrunk = 0;
      if (prior && isNum(prior.deltaMean) && isNum(prior.sd) && prior.sd > 0) {
        const pv = prior.sd * prior.sd;
        const weight = Math.min(1, Math.max(0, pv / (pv + w.se * w.se)));
        estimate = weight * w.diff + (1 - weight) * prior.deltaMean;
        sePost = w.se * Math.sqrt(weight);
        shrunk = 1 - weight;
      }

      candidates.push({
        behaviour: b.key,
        metric,
        detail: b.detail,
        nYes: yes.length,
        nNo: no.length,
        welch: w,
        estimate,
        sePost,
        shrunk,
        confound: mediationNote(b.key, metric, confound),
      });
      reported.add(b.key);
    }
  }

  const qs = benjaminiHochberg(candidates.map((c) => c.welch.p));
  const ranked: Array<{ effect: BehaviourEffect; t: number }> = [];
  candidates.forEach((c, i) => {
    const crit = tQuantile(0.975, c.welch.df);
    if (crit === null) return;
    const half = crit * c.sePost;
    const lo = c.estimate - half;
    const hi = c.estimate + half;
    ranked.push({
      t: Math.abs(c.welch.t),
      effect: {
        behaviour: c.behaviour,
        metric: c.metric,
        label: sentence(c, lo, hi),
        deltaMean: round(c.estimate, 2),
        lo95: round(lo, 2),
        hi95: round(hi, 2),
        nYes: c.nYes,
        nNo: c.nNo,
        shrunkToPrior: round(c.shrunk, 2),
        qValue: round(qs[i] ?? 1, 4),
        ...(c.confound ? { confound: c.confound } : {}),
      },
    });
  });

  // Strongest first = most evidence first; the q-value is what the UI filters
  // on, so it is also what the order has to follow.
  ranked.sort((a, b) =>
    a.effect.qValue !== b.effect.qValue ? a.effect.qValue - b.effect.qValue : b.t - a.t,
  );
  const effects = ranked.map((r) => r.effect);

  const pending = BEHAVIOURS.filter((k) => seen.has(k) && !reported.has(k)).map(
    (k) => BEHAVIOUR_LABELS[k],
  );
  return { effects, pending };
}

/** `q ≤ 0.05` after Benjamini–Hochberg — the one bar for "we'd say this out loud". */
export function isConfirmedEffect(e: BehaviourEffect): boolean {
  return Number.isFinite(e.qValue) && e.qValue <= IMPACT_Q_THRESHOLD;
}

/**
 * Names a training-load imbalance between the yes- and no-days, so the user
 * reads "and those days were also harder training days" instead of a clean
 * causal story. Uncorrected on purpose: this is a diagnostic about the sample,
 * not a claim about the world, and being told about a possible confound too
 * often is the cheap direction of the error.
 */
function loadConfound(
  b: Behaviour,
  yesDays: ISODate[],
  noDays: ISODate[],
  loadByDate: Map<ISODate, number>,
): string | undefined {
  if (b.key === 'highLoad') return undefined; // it *is* the load
  const yes = yesDays.map((d) => loadByDate.get(d)).filter(isNum);
  const no = noDays.map((d) => loadByDate.get(d)).filter(isNum);
  if (yes.length < 3 || no.length < 3) return undefined;
  const w = welchTest(yes, no);
  if (w === null || w.p >= 0.05) return undefined;
  const dir = w.diff > 0 ? 'harder' : 'easier';
  return `those days were also ${dir} training days (mean load ${Math.round(mean(yes))} vs ${Math.round(mean(no))})`;
}

/**
 * Caffeine's published route is through sleep, so its non-sleep rows say so
 * rather than implying a direct effect on the morning's physiology.
 */
function mediationNote(
  behaviour: BehaviourKey,
  metric: ImpactMetricKey,
  confound: string | undefined,
): string | undefined {
  const note =
    behaviour === 'lateCaffeine' && metric !== 'sleepHrs'
      ? "caffeine's known route is through sleep — read the sleep row first"
      : undefined;
  if (note && confound) return `${note}; ${confound}`;
  return note ?? confound;
}

/**
 * The rendered sentence. Association only: "on the N days you drank, next-day
 * readiness averaged 11 points lower (95% CI 4–18)".
 */
function sentence(c: Candidate, lo: number, hi: number): string {
  const copy = METRIC_COPY[c.metric];
  const dir = c.estimate < 0 ? 'lower' : 'higher';
  const mag = Math.abs(c.estimate);
  const when = BEHAVIOUR_COPY[c.behaviour](c.detail);
  const fmt = (v: number) => round(v, copy.dp).toFixed(copy.dp);
  const ci =
    lo * hi > 0
      ? `95% CI ${fmt(Math.min(Math.abs(lo), Math.abs(hi)))}–${fmt(Math.max(Math.abs(lo), Math.abs(hi)))}`
      : `95% CI ${fmt(Math.abs(lo))} ${lo < 0 ? 'lower' : 'higher'} to ${fmt(Math.abs(hi))} ${hi < 0 ? 'lower' : 'higher'}`;
  return `on the ${c.nYes} days ${when}, next-day ${copy.label} averaged ${fmt(mag)} ${copy.unit} ${dir} (${ci})`;
}
