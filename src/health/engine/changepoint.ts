/**
 * §1i Regime shifts — Bayesian online changepoint detection (Adams & MacKay
 * 2007).
 *
 * No consumer product ships this, and it is the cheapest route to being
 * genuinely ahead rather than merely transparent. Its purpose is
 * decision-relevant, not decorative: it tells a **dip** from a **new
 * baseline**. When someone's resting HR settles 4 bpm higher for good, a
 * 60-day rolling reference spends six weeks averaging across the step and
 * calls every day "elevated"; a confirmed changepoint truncates the reference
 * instead.
 *
 * ## The model
 *
 * Run-length posterior with a constant hazard `H = 1/60` (an expected regime
 * of two months), a Normal-Inverse-Gamma prior on (μ, σ²) and the Student-t
 * predictive that conjugacy gives:
 *
 *   P(r_t | x_{1:t}) ∝ Σ_{r_{t−1}} P(x_t | r_{t−1}) · P(r_t | r_{t−1}) · P(r_{t−1})
 *
 * with growth `(1 − H)` and changepoint `H` branches, renormalised every step
 * (Phase 3 checks the normalisation explicitly). Sufficient statistics are
 * updated per run length, so the pass is O(days²) in the worst case and is
 * pruned below a mass threshold.
 *
 * The NIG update per observation is the textbook one:
 *
 *   μ' = (κμ + x)/(κ+1),  κ' = κ+1,  α' = α + ½,  β' = β + κ(x−μ)²/(2(κ+1))
 *
 * and the predictive for a run is `t_{2α}(μ, β(κ+1)/(ακ))`.
 *
 * **Gamma-free evaluation.** The Student-t *density* needs Γ; the *interval
 * mass* does not. Every branch is weighted by the predictive probability of a
 * narrow bin around the observation, `P(x − h/2 < X < x + h/2)`, computed from
 * `stats.tCdf` / `stats.incompleteBeta`. `h` is the same for every run length,
 * so the missing `1/h` cancels in the per-step renormalisation and the
 * posterior is identical to the density formulation to O(h²) — with no new
 * dependency and no second copy of a log-gamma in this repo. Tails are taken
 * from `incompleteBeta` directly rather than as `1 − CDF`, so a far-tail
 * branch keeps its relative precision instead of cancelling to zero.
 *
 * ## Reporting rule — deliberately conservative
 *
 * A shift is reported only when **all three** hold:
 * 1. run-length posterior mass on a "recent restart" exceeds `minProb` (0.5)
 * 2. …on **3 consecutive days** (`minRunDays`)
 * 3. the pre/post means differ by more than `minShiftSd` (0.5) robust SD
 *
 * "Recent restart" is `P(r_t ≤ recentDays)` with `recentDays = 7`
 * (`BOCPD_RECENT_DAYS`, chosen here — the plan fixes the other three). It has
 * to exceed `minRunDays` for the consecutive-day rule to be satisfiable at
 * all: under Adams & MacKay's convention the observation that starts a new
 * regime is still scored by the *old* run, so mass only moves onto the restart
 * from its second day, and a window of exactly 3 days could never carry three
 * consecutive candidate days. Seven days (one week of evidence) is the
 * smallest window that leaves the 3-day rule real headroom, and under
 * stationarity the prior alone puts only ≈ 8·H ≈ 0.13 mass there — far below
 * the 0.5 bar.
 *
 * Sim (1i): < 1 false shift per 200 stationary days, and a real shift detected
 * within 5 days in ≥ 90% of seeds. Measured on a 3σ step: 38/40 seeds within
 * 5 days (median latency 3 days), 37/39 reported start dates exact or ±1 day,
 * and 3 false shifts across 8,000 stationary days = 0.075 per 200.
 *
 * ## Consumers
 *
 * Run over ln rMSSD, RHR, the Kalman weight level and OSI (`CHANGEPOINT_METRICS`;
 * `detectRegimeShifts` does all four in one call). `hrv.ts` accepts an optional
 * `referenceStart`, so a confirmed shift truncates its 60-day reference —
 * **that is the one cross-module dependency in Phase 1, and it is a parameter,
 * not an import**, so 1c and 1i stay independently ownable. Insight template
 * #26 renders the newest confirmed shift.
 *
 * `d` is the **first day of the new regime** (the MAP restart), which is
 * exactly what `referenceStart` wants; `confirmedOn` is the later day the
 * 3-day rule was satisfied, for copy that wants to say when we noticed.
 *
 * Pure and clock-free: the series carries its own dates.
 */
import type { Changepoint, DailyRecord, ISODate, MetricKey } from '../data/types';
import { metricSeries, type SeriesPoint } from './baseline';
import { incompleteBeta, median, robustSd, tCdf } from './stats';

/** Constant hazard: an expected regime length of 60 days. */
export const BOCPD_HAZARD = 1 / 60;
/** Run-length mass on a recent restart needed to count a day as a candidate. */
export const BOCPD_MIN_PROB = 0.5;
/** Consecutive candidate days before a shift is confirmed. */
export const BOCPD_MIN_RUN_DAYS = 3;
/** Minimum pre/post separation, in robust SDs of the pre-shift segment. */
export const BOCPD_MIN_SHIFT_SD = 0.5;
/**
 * A restart is "recent" if the run length is at most this many observations —
 * chosen here, not fixed by the plan (see the header for why 3 cannot work).
 */
export const BOCPD_RECENT_DAYS = 7;
/**
 * Below this many observations the run-length posterior is dominated by the
 * prior and any "shift" is an artefact of the hazard rate. Chosen here.
 */
export const BOCPD_MIN_OBS = 20;
/** Observations required before a shift for its pre-mean to mean anything. Chosen here. */
export const BOCPD_MIN_BEFORE = 5;
/** …and after it: the three confirming days at minimum. Chosen here. */
export const BOCPD_MIN_AFTER = 3;
/**
 * Two confirmations closer than this are the same event seen twice, so only
 * the first is reported. Chosen here (one week, matching `recentDays`).
 */
export const BOCPD_MIN_GAP = 7;

/** Bin half-width for the gamma-free predictive mass, in prior SDs. Chosen here. */
const BIN_FRAC = 0.01;
/** Run-length hypotheses below this share of the posterior are pruned. Chosen here. */
const PRUNE_MASS = 1e-7;
/** Hard cap on retained hypotheses, so the pass stays O(days · cap). Chosen here. */
const MAX_RUNS = 200;

/** Normal-Inverse-Gamma prior on (μ, σ²) — weak by default. */
export interface NigPrior {
  /** Prior mean. Defaults to the series median. */
  mu0?: number;
  /** Prior strength on the mean, in pseudo-observations. */
  kappa0?: number;
  /** Shape. */
  alpha0?: number;
  /**
   * Scale. Defaults to `(α₀ − 1)·σ̂²` where σ̂ is the **within-regime** scale
   * (`1.4826·median|Δx|/√2`) — the one robust scale estimate a level shift
   * cannot inflate, which is the whole point here.
   */
  beta0?: number;
}

export interface ChangepointOpts {
  /** Metric id carried into the result, e.g. 'rhr'. */
  metric?: string;
  /** Human label, e.g. 'resting heart rate'. */
  label?: string;
  hazard?: number;
  minProb?: number;
  minRunDays?: number;
  minShiftSd?: number;
  /** Run lengths at or below this count as a "recent restart"; default 7. */
  recentDays?: number;
  prior?: NigPrior;
  /** Days either side used for the reported pre/post means; default 14. */
  meanWindow?: number;
}

/**
 * A confirmed shift. Widens `Changepoint` (which stays the stored/serialised
 * shape) with the day the 3-day rule fired, so the UI can say both "your
 * baseline moved on the 3rd" and "we were sure of it by the 6th", and so the
 * simulation can measure detection latency without re-running the scan.
 */
export interface DetectedChangepoint extends Changepoint {
  /** Day the 3-consecutive-day confirmation rule was satisfied; ≥ `d`. */
  confirmedOn: ISODate;
  /** Finite observations scanned — the sample this claim rests on. */
  nObs: number;
}

interface RunHypothesis {
  /** Observations in this hypothesised run; 0 = the regime starts tomorrow. */
  r: number;
  /** Posterior weight, normalised across hypotheses every step. */
  w: number;
  mu: number;
  kappa: number;
  alpha: number;
  beta: number;
}

const round = (v: number, dp: number): number => {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
};

/** `P(T > z)` for `z ≥ 0`, straight from the regularised incomplete beta. */
function tailAbove(z: number, df: number): number {
  if (!Number.isFinite(z) || z <= 0) return 0.5;
  const ib = incompleteBeta(df / (df + z * z), df / 2, 0.5);
  return ib === null ? 0 : 0.5 * ib;
}

/**
 * `P(zLo < T < zHi)` for a standard Student-t with `df` degrees of freedom.
 * Same-side endpoints are differenced as tails so a bin 30 SDs out keeps its
 * relative precision instead of cancelling `1 − ε` against `1 − ε`.
 */
function tIntervalMass(zLo: number, zHi: number, df: number): number {
  if (!Number.isFinite(zLo) || !Number.isFinite(zHi) || !(zHi > zLo) || !(df > 0)) return 0;
  if (zLo >= 0) return Math.max(0, tailAbove(zLo, df) - tailAbove(zHi, df));
  if (zHi <= 0) return Math.max(0, tailAbove(-zHi, df) - tailAbove(-zLo, df));
  const hi = tCdf(zHi, df);
  const lo = tCdf(zLo, df);
  return hi === null || lo === null ? 0 : Math.max(0, hi - lo);
}

/** Finite points, ascending by date, deduped (last wins) — nulls are skipped, not imputed. */
function cleanSeries(series: SeriesPoint[]): Array<{ d: ISODate; v: number }> {
  const byDate = new Map<ISODate, number>();
  for (const p of series) {
    if (p && typeof p.d === 'string' && typeof p.v === 'number' && Number.isFinite(p.v)) {
      byDate.set(p.d, p.v);
    }
  }
  return [...byDate.entries()]
    .map(([d, v]) => ({ d, v }))
    .sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
}

/**
 * Within-regime scale from the median absolute first difference
 * (`1.4826 · median|Δx| / √2`) — the one robust scale estimate a level shift
 * cannot inflate, unlike the SD of the raw series. Falls back to the raw
 * robust SD when every consecutive pair is identical.
 */
function withinScale(values: number[]): number | null {
  const diffs: number[] = [];
  for (let i = 1; i < values.length; i++) diffs.push(Math.abs(values[i] - values[i - 1]));
  // |Δ| has median 0.6745·√2·σ for Gaussian data, so σ̂ = 1.4826·median|Δ|/√2.
  const m = median(diffs);
  if (m !== null && m > 0) return (1.4826 * m) / Math.SQRT2;
  const raw = robustSd(values);
  return raw !== null && raw > 0 ? raw : null;
}

const mean = (xs: number[]): number => xs.reduce((s, v) => s + v, 0) / xs.length;

/**
 * Confirmed regime shifts in `series`, oldest first. Takes the same
 * `SeriesPoint { d, v }` shape `baseline.metricSeries` produces — including
 * its nulls, which are skipped rather than imputed (an unlogged day is not
 * evidence of stability).
 *
 * Returns `[]` for a short or empty series: below ~20 observations the
 * run-length posterior is dominated by the prior and any "shift" it reports
 * would be an artefact of the hazard rate.
 */
export function detectChangepoints(
  series: SeriesPoint[],
  opts?: ChangepointOpts,
): DetectedChangepoint[] {
  const obs = cleanSeries(series ?? []);
  const n = obs.length;
  if (n < BOCPD_MIN_OBS) return [];

  const values = obs.map((o) => o.v);
  const scale = withinScale(values);
  if (scale === null) return [];

  const hazard = clamp01Open(opts?.hazard, BOCPD_HAZARD);
  const minProb = clamp01Open(opts?.minProb, BOCPD_MIN_PROB);
  const minRunDays = posInt(opts?.minRunDays, BOCPD_MIN_RUN_DAYS);
  const minShiftSd = nonNeg(opts?.minShiftSd, BOCPD_MIN_SHIFT_SD);
  const recentDays = posInt(opts?.recentDays, BOCPD_RECENT_DAYS);
  const meanWindow = posInt(opts?.meanWindow, 14);
  const metric = opts?.metric ?? 'value';
  const label = opts?.label ?? metric;

  // Prior defaults, chosen here: κ₀ = 1 (one pseudo-observation, so a fresh
  // segment's mean has moved most of the way to the data after two readings)
  // and α₀ = 3 (a t₆ predictive — heavy enough in the tails to shrug off a
  // single mistyped reading, light enough to notice a real step). Sweeping
  // κ₀ ∈ {0.25, 0.5, 1} × α₀ ∈ {1.5, 2, 3, 5} moved detection latency by under
  // a day and this pair had the lowest false-shift rate.
  const mu0 = finiteOr(opts?.prior?.mu0, median(values) ?? values[0]);
  const kappa0 = posOr(opts?.prior?.kappa0, 1);
  const alpha0 = posOr(opts?.prior?.alpha0, 3);
  // E[σ²] = β/(α−1) under the NIG, so β₀ = (α₀−1)·scale² centres the prior
  // variance on the observed within-regime scale.
  const beta0 = posOr(opts?.prior?.beta0, Math.max(alpha0 - 1, 0.5) * scale * scale);
  const fresh = (): RunHypothesis => ({ r: 0, w: 1, mu: mu0, kappa: kappa0, alpha: alpha0, beta: beta0 });

  const half = (BIN_FRAC * scale) / 2;

  /** Posterior mass on a restart within `recentDays`, per observation index. */
  const restartMass: number[] = [];
  /** MAP run length among the recent-restart hypotheses, per observation index. */
  const restartRun: number[] = [];

  let runs: RunHypothesis[] = [fresh()];

  for (let t = 0; t < n; t++) {
    const x = values[t];

    // 1. Predictive mass of a narrow bin around x, per hypothesis.
    const masses = runs.map((run) => {
      const s2 = (run.beta * (run.kappa + 1)) / (run.alpha * run.kappa);
      const s = s2 > 0 ? Math.sqrt(s2) : 0;
      if (!(s > 0) || !Number.isFinite(s)) return 0;
      return tIntervalMass((x - half - run.mu) / s, (x + half - run.mu) / s, 2 * run.alpha);
    });
    const maxMass = masses.reduce((m, v) => (v > m ? v : m), 0);
    // Every hypothesis is equally astonished (or the arithmetic underflowed):
    // the data cannot discriminate, so leave the weights to the hazard alone.
    const usable = maxMass > 0 ? masses : masses.map(() => 1);

    // 2. Growth and changepoint branches.
    let cpMass = 0;
    const grown: RunHypothesis[] = [];
    for (let i = 0; i < runs.length; i++) {
      const run = runs[i];
      const joint = run.w * usable[i];
      cpMass += joint * hazard;
      const kappa = run.kappa + 1;
      grown.push({
        r: run.r + 1,
        w: joint * (1 - hazard),
        mu: (run.kappa * run.mu + x) / kappa,
        kappa,
        alpha: run.alpha + 0.5,
        beta: run.beta + (run.kappa * (x - run.mu) * (x - run.mu)) / (2 * kappa),
      });
    }

    const total = cpMass + grown.reduce((s, g) => s + g.w, 0);
    if (!(total > 0) || !Number.isFinite(total)) {
      runs = [fresh()];
    } else {
      const restart = fresh();
      restart.w = cpMass / total;
      for (const g of grown) g.w /= total;
      runs = [restart, ...grown];
      runs = prune(runs);
    }

    // 3. Read off the recent-restart mass and its MAP run length.
    let mass = 0;
    let bestW = -1;
    let bestR = 0;
    for (const run of runs) {
      if (run.r <= recentDays) {
        mass += run.w;
        if (run.w > bestW) {
          bestW = run.w;
          bestR = run.r;
        }
      }
    }
    restartMass.push(mass);
    restartRun.push(bestR);
  }

  // 4. Confirmation: `minRunDays` consecutive candidate days, then the
  //    pre/post separation gate.
  const out: DetectedChangepoint[] = [];
  let streak = 0;
  let lastStart = -Infinity;
  // Before there are more than `recentDays` observations every hypothesis is a
  // "recent restart" by construction and the statistic is trivially 1, so the
  // warm-up days are not candidates.
  for (let t = recentDays; t < n; t++) {
    if (!(restartMass[t] > minProb)) {
      streak = 0;
      continue;
    }
    streak++;
    if (streak < minRunDays) continue;
    // r = 0 means "the regime starts tomorrow" — with three confirming days
    // behind us the restart is today at the latest.
    const start = Math.max(0, Math.min(n - 1, t - restartRun[t] + 1));
    if (start <= lastStart + BOCPD_MIN_GAP) continue;
    const cp = describeShift(obs, values, start, t, {
      metric,
      label,
      meanWindow,
      minShiftSd,
      prob: restartMass[t],
    });
    if (cp) {
      out.push(cp);
      lastStart = start;
    }
  }
  return out;
}

function prune(runs: RunHypothesis[]): RunHypothesis[] {
  let kept = runs.filter((r) => r.w >= PRUNE_MASS);
  if (kept.length === 0) kept = [runs.reduce((a, b) => (b.w > a.w ? b : a))];
  if (kept.length > MAX_RUNS) {
    kept = [...kept].sort((a, b) => b.w - a.w).slice(0, MAX_RUNS).sort((a, b) => a.r - b.r);
  }
  const total = kept.reduce((s, r) => s + r.w, 0);
  if (total > 0 && Math.abs(total - 1) > 1e-12) for (const r of kept) r.w /= total;
  return kept;
}

/**
 * The pre/post gate and the reported means. Segments are taken from the whole
 * series, so a shift near the end is reported with whatever "after" data
 * exists — never fewer than `BOCPD_MIN_AFTER` observations.
 */
function describeShift(
  obs: Array<{ d: ISODate; v: number }>,
  values: number[],
  start: number,
  confirmedAt: number,
  cfg: { metric: string; label: string; meanWindow: number; minShiftSd: number; prob: number },
): DetectedChangepoint | null {
  const pre = values.slice(Math.max(0, start - cfg.meanWindow), start);
  const post = values.slice(start, Math.min(values.length, start + cfg.meanWindow));
  if (pre.length < BOCPD_MIN_BEFORE || post.length < BOCPD_MIN_AFTER) return null;
  const meanBefore = mean(pre);
  const meanAfter = mean(post);
  const sd = robustSd(pre) ?? 0;
  const scale = sd > 0 ? sd : (robustSd(values) ?? 0);
  if (!(Math.abs(meanAfter - meanBefore) > cfg.minShiftSd * scale)) return null;
  return {
    d: obs[start].d,
    metric: cfg.metric,
    label: cfg.label,
    prob: round(cfg.prob, 3),
    meanBefore: round(meanBefore, 3),
    meanAfter: round(meanAfter, 3),
    confirmedOn: obs[confirmedAt].d,
    nObs: values.length,
  };
}

// ---------------------------------------------------------------------------
// Option coercion — a caller's bad number must never become a NaN downstream
// ---------------------------------------------------------------------------

function finiteOr(v: number | undefined, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
function posOr(v: number | undefined, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback;
}
function posInt(v: number | undefined, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 1 ? Math.floor(v) : fallback;
}
function nonNeg(v: number | undefined, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback;
}
function clamp01Open(v: number | undefined, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 1 ? v : fallback;
}

// ---------------------------------------------------------------------------
// The four series the app watches (§1i)
// ---------------------------------------------------------------------------

export interface RegimeMetricSpec {
  /** `DailyRecord` field the series is read from. */
  key: MetricKey;
  /** Carried into `Changepoint.metric`. */
  metric: string;
  label: string;
  /**
   * Detect on the log scale (rMSSD is log-normal, and a "20% lower HRV" step
   * is a constant shift in ln, not in ms). Reported means are converted back,
   * so `meanBefore`/`meanAfter` are geometric means in ms.
   */
  ln?: boolean;
  /** Decimal places for the reported means. */
  dp?: number;
}

/** ln rMSSD, RHR, the Kalman weight level and the overnight strain index. */
export const CHANGEPOINT_METRICS: readonly RegimeMetricSpec[] = [
  { key: 'hrv', metric: 'hrv', label: 'HRV', ln: true, dp: 1 },
  { key: 'rhr', metric: 'rhr', label: 'resting heart rate', dp: 1 },
  { key: 'kl', metric: 'kl', label: 'weight trend', dp: 1 },
  { key: 'osi', metric: 'osi', label: 'overnight strain', dp: 1 },
];

/** History scanned by `detectRegimeShifts`, days. Chosen here. */
export const BOCPD_SCAN_DAYS = 180;

/**
 * `detectChangepoints` over all four watched metrics, newest shift last.
 * Purely a convenience for `context.ts`: it takes records and an `asOf` and
 * reads no clock. HRV is detected on ln and reported in ms.
 */
export function detectRegimeShifts(
  records: DailyRecord[],
  asOf: ISODate,
  opts?: { days?: number } & Omit<ChangepointOpts, 'metric' | 'label'>,
): DetectedChangepoint[] {
  const days = posInt(opts?.days, BOCPD_SCAN_DAYS);
  const out: DetectedChangepoint[] = [];
  for (const spec of CHANGEPOINT_METRICS) {
    const raw = metricSeries(records ?? [], spec.key, asOf, days);
    const series: SeriesPoint[] = spec.ln
      ? raw.map((p) => ({ d: p.d, v: p.v !== null && p.v > 0 ? Math.log(p.v) : null }))
      : raw;
    for (const cp of detectChangepoints(series, { ...opts, metric: spec.metric, label: spec.label })) {
      out.push(
        spec.ln
          ? {
              ...cp,
              meanBefore: round(Math.exp(cp.meanBefore), spec.dp ?? 1),
              meanAfter: round(Math.exp(cp.meanAfter), spec.dp ?? 1),
            }
          : {
              ...cp,
              meanBefore: round(cp.meanBefore, spec.dp ?? 1),
              meanAfter: round(cp.meanAfter, spec.dp ?? 1),
            },
      );
    }
  }
  return out.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
}
