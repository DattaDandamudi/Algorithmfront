/**
 * Numeric primitives for engine v3 — the one place any statistics live.
 *
 * Every uncertainty number the app shows (Kalman bands, TDEE credible
 * intervals, HRV robust z-scores, N-of-1 effect intervals and their
 * multiplicity control) is computed from this file, so there is still no
 * runtime dependency: no numeric library ships to the browser.
 *
 * Contract, enforced by stats.test.ts and relied on by every caller:
 *
 * - **Pure and total.** No clock, no globals, no mutation of the inputs,
 *   never throws for any input at all (including `[]`, `NaN`, `Infinity`,
 *   sparse arrays and mismatched lengths).
 * - **Null, never NaN.** Aggregates over samples (`median`, `mad`, `robustSd`,
 *   `quantile`, `zScore`, `robustZ`, `pearson`, `linreg`, `tCdf`,
 *   `normalQuantile`) return `null` when the input is degenerate — empty, all
 *   non-finite, zero variance, or fewer points than the estimator needs. A
 *   `NaN` leaking into a `CoachContext` is a bug in this file, not in a caller.
 * - **Scalar transforms are closed over the reals.** `erf`, `normalCdf` and
 *   `logistic` map every input to a number in their range: ±Infinity go to the
 *   limits and `NaN` goes to the value at 0 (`erf` → 0, `normalCdf` → 0.5,
 *   `logistic` → 0.5). They are used inline inside formulas where a `null`
 *   check per call would be pure noise, and a documented, finite fallback is
 *   safer than an `!` assertion at 40 call sites.
 * - **Non-finite entries are skipped, not zeroed.** A missing HRV reading must
 *   not be read as "0 ms"; every sample-consuming function filters first and
 *   reports the count it actually used where that count is meaningful.
 *
 * Sources for the approximations (each function repeats its own):
 *   erf              Abramowitz & Stegun 7.1.26 (|ε| ≤ 1.5e-7)
 *   normalQuantile   Acklam's rational approximation (relative |ε| < 1.15e-9)
 *   tCdf             Student-t via the regularised incomplete beta function
 *                    (continued fraction, Numerical Recipes §6.4) with a
 *                    Lanczos ln Γ
 *   robustSd         1.4826 · MAD — the consistency factor that makes MAD an
 *                    unbiased σ estimate for Gaussian data
 *   benjaminiHochberg  Benjamini & Hochberg 1995, step-up FDR control
 */

/** A finite number — the only kind of sample any function here consumes. */
function finite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** The finite members of `xs`, in input order. */
function clean(xs: readonly (number | null | undefined)[]): number[] {
  const out: number[] = [];
  for (const x of xs) if (finite(x)) out.push(x);
  return out;
}

// ---------------------------------------------------------------------------
// Location and scale
// ---------------------------------------------------------------------------

/**
 * Median of the finite values (average of the middle pair when even).
 * `null` when nothing finite was supplied. Robust to the single 20-lb typo
 * that a mean would happily absorb — which is why baselines use it.
 */
export function median(xs: readonly (number | null | undefined)[]): number | null {
  const v = clean(xs);
  if (v.length === 0) return null;
  v.sort((a, b) => a - b);
  const mid = v.length >> 1;
  return v.length % 2 === 1 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/**
 * Median absolute deviation about `center` (the sample median by default).
 * `null` for an empty sample; **0 is a legitimate answer** (every value
 * identical) and callers that divide by it must use `robustSd`'s floor.
 */
export function mad(xs: readonly (number | null | undefined)[], center?: number): number | null {
  const v = clean(xs);
  if (v.length === 0) return null;
  const c = finite(center) ? center : (median(v) as number);
  return median(v.map((x) => Math.abs(x - c)));
}

/**
 * Robust standard deviation: `1.4826 · MAD`, the Gaussian-consistent scale
 * estimate. `floor` is the caller's minimum — HRV uses 0.03 on the ln scale so
 * a week of identical readings cannot make every z-score infinite, and the
 * Kalman filter uses a variance floor for the same reason. `null` only when
 * the sample is empty or entirely non-finite.
 */
export function robustSd(xs: readonly (number | null | undefined)[], floor = 0): number | null {
  const m = mad(xs);
  if (m === null) return null;
  const sd = 1.4826 * m;
  const f = finite(floor) && floor > 0 ? floor : 0;
  return Math.max(f, sd);
}

/**
 * Linearly interpolated quantile (R's type 7, the default in R and NumPy):
 * `h = (n − 1)·p`, interpolating between the two neighbouring order
 * statistics. `p` is clamped to [0, 1]; `null` for an empty sample.
 */
export function quantile(xs: readonly (number | null | undefined)[], p: number): number | null {
  const v = clean(xs);
  if (v.length === 0 || !finite(p)) return null;
  v.sort((a, b) => a - b);
  if (v.length === 1) return v[0];
  const pp = Math.min(1, Math.max(0, p));
  const h = (v.length - 1) * pp;
  const lo = Math.floor(h);
  const hi = Math.min(v.length - 1, lo + 1);
  return v[lo] + (h - lo) * (v[hi] - v[lo]);
}

// ---------------------------------------------------------------------------
// Standardisation
// ---------------------------------------------------------------------------

/**
 * `(x − mean)/sd`, or `null` when any input is non-finite or `sd ≤ 0`.
 * Callers clamp the result themselves (readiness clamps to ±3) because the
 * clamp is a modelling choice, not a numeric one.
 */
export function zScore(x: number, mean: number, sd: number): number | null {
  if (!finite(x) || !finite(mean) || !finite(sd) || sd <= 0) return null;
  return (x - mean) / sd;
}

/**
 * z against a *robust* reference: `(x − median(ref)) / robustSd(ref, floor)`.
 * This is the standardisation the whole engine uses — a single outlier in the
 * reference window moves a mean/SD z-score enough to invent or hide a signal,
 * and the reference windows here are 28–90 days of real, occasionally
 * mistyped, data.
 */
export function robustZ(
  x: number,
  ref: readonly (number | null | undefined)[],
  sdFloor = 0,
): number | null {
  if (!finite(x)) return null;
  const m = median(ref);
  const sd = robustSd(ref, sdFloor);
  if (m === null || sd === null || sd <= 0) return null;
  return (x - m) / sd;
}

/**
 * Exponentially weighted moving average, aligned 1:1 with the input so a
 * day-indexed series keeps its dates. `out[0]` seeds at the first finite
 * value; entries before it are `null`, and gaps carry the previous value
 * forward (a day without a weigh-in is a day the trend does not move).
 * `alpha` is clamped to (0, 1]; a non-finite alpha falls back to 0.1.
 */
export function ewma(
  xs: readonly (number | null | undefined)[],
  alpha: number,
): (number | null)[] {
  const a = finite(alpha) ? Math.min(1, Math.max(1e-6, alpha)) : 0.1;
  const out: (number | null)[] = [];
  let cur: number | null = null;
  for (const x of xs) {
    if (finite(x)) {
      const next: number = cur === null ? x : cur + a * (x - cur);
      // Overflow (two 1e308 entries of opposite sign) must not poison the rest
      // of the series: hold the last good value instead.
      if (finite(next)) cur = next;
    }
    out.push(cur);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Distributions
// ---------------------------------------------------------------------------

const ERF_A = [0.254829592, -0.284496736, 1.421413741, -1.453152027, 1.061405429];
const ERF_P = 0.3275911;

/**
 * Error function, Abramowitz & Stegun 7.1.26: with `t = 1/(1 + 0.3275911·x)`,
 * `erf(x) = 1 − (a₁t + a₂t² + a₃t³ + a₄t⁴ + a₅t⁵)·e^{−x²}` for `x ≥ 0`, and
 * odd symmetry below. Absolute error ≤ 1.5e-7 — three orders of magnitude
 * finer than anything the UI prints.
 *
 * Total: `±Infinity → ±1`, `NaN → 0` (the value at 0).
 */
export function erf(x: number): number {
  if (!finite(x)) return x === Infinity ? 1 : x === -Infinity ? -1 : 0;
  // The polynomial evaluates to 1 − 1e-9 at the origin; erf(0) is exactly 0,
  // and `normalCdf(0) === 0.5` is worth more to callers than one saved branch.
  if (x === 0) return 0;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + ERF_P * ax);
  const poly = ((((ERF_A[4] * t + ERF_A[3]) * t + ERF_A[2]) * t + ERF_A[1]) * t + ERF_A[0]) * t;
  return sign * (1 - poly * Math.exp(-ax * ax));
}

/**
 * Standard-normal CDF, `Φ(x) = ½(1 + erf(x/√2))`, with optional mean and sd.
 * `Φ(1.96) ≈ 0.975`. Total: `NaN → 0.5`, `sd ≤ 0` → a step at the mean
 * (a point mass has all of its probability at one place, which is the honest
 * limit rather than a null the callers would have to branch on).
 */
export function normalCdf(x: number, mean = 0, sd = 1): number {
  if (!finite(x) || !finite(mean)) return 0.5;
  if (!finite(sd) || sd <= 0) return x > mean ? 1 : x < mean ? 0 : 0.5;
  return 0.5 * (1 + erf((x - mean) / (sd * Math.SQRT2)));
}

// Acklam's rational approximation to the inverse normal CDF.
const AQ_A = [
  -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2,
  -3.066479806614716e1, 2.506628277459239,
];
const AQ_B = [
  -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1,
  -1.328068155288572e1,
];
const AQ_C = [
  -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734,
  4.374664141464968, 2.938163982698783,
];
const AQ_D = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
const AQ_LOW = 0.02425;

/**
 * Inverse standard-normal CDF (probit) by Acklam's rational approximation:
 * three regions (lower tail, central, upper tail) with relative error below
 * 1.15e-9 — far tighter than the 3–4 significant figures any caption shows.
 * `normalQuantile(0.975) ≈ 1.95996`, `normalQuantile(0.95) ≈ 1.64485`.
 *
 * `null` outside the open interval (0, 1): ±∞ is not a number this app can
 * put in a band.
 */
export function normalQuantile(p: number): number | null {
  if (!finite(p) || p <= 0 || p >= 1) return null;
  if (p < AQ_LOW) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((AQ_C[0] * q + AQ_C[1]) * q + AQ_C[2]) * q + AQ_C[3]) * q + AQ_C[4]) * q + AQ_C[5]) /
      ((((AQ_D[0] * q + AQ_D[1]) * q + AQ_D[2]) * q + AQ_D[3]) * q + 1)
    );
  }
  if (p > 1 - AQ_LOW) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return (
      -(((((AQ_C[0] * q + AQ_C[1]) * q + AQ_C[2]) * q + AQ_C[3]) * q + AQ_C[4]) * q + AQ_C[5]) /
      ((((AQ_D[0] * q + AQ_D[1]) * q + AQ_D[2]) * q + AQ_D[3]) * q + 1)
    );
  }
  const q = p - 0.5;
  const r = q * q;
  return (
    ((((((AQ_A[0] * r + AQ_A[1]) * r + AQ_A[2]) * r + AQ_A[3]) * r + AQ_A[4]) * r + AQ_A[5]) * q) /
    (((((AQ_B[0] * r + AQ_B[1]) * r + AQ_B[2]) * r + AQ_B[3]) * r + AQ_B[4]) * r + 1)
  );
}

/**
 * Logistic squash `1 / (1 + e^{−k·x})` — the readiness composite's link
 * function. `k` is the slope at the origin (readiness uses 1.1). Total:
 * `NaN → 0.5`, `±Infinity → 1/0`.
 */
export function logistic(x: number, k = 1): number {
  if (!finite(x)) return x === Infinity ? 1 : x === -Infinity ? 0 : 0.5;
  const kk = finite(k) ? k : 1;
  return 1 / (1 + Math.exp(-kk * x));
}

// Lanczos ln Γ (g = 5, n = 6), |ε| < 2e-10 for x > 0.
const LG_COF = [
  76.18009172947146, -86.50532032941678, 24.01409824083091, -1.231739572450155,
  0.1208650973866179e-2, -0.5395239384953e-5,
];

function lnGamma(x: number): number {
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += LG_COF[j] / ++y;
  return -tmp + Math.log((2.5066282746310007 * ser) / x);
}

// Continued-fraction expansion for the incomplete beta (Numerical Recipes §6.4,
// modified Lentz). Converges in well under 200 iterations for every (a, b, x)
// this app produces.
function betacf(x: number, a: number, b: number): number {
  const MAXIT = 200;
  const EPS = 3e-12;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/**
 * Regularised incomplete beta `I_x(a, b)` — exported because the t and F
 * tails both need it and a second copy would drift from this one.
 * `null` for a non-finite or non-positive parameter; 0/1 at the endpoints.
 */
export function incompleteBeta(x: number, a: number, b: number): number | null {
  if (!finite(x) || !finite(a) || !finite(b) || a <= 0 || b <= 0) return null;
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front =
    lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x);
  if (x < (a + 1) / (a + b + 2)) return (Math.exp(front) * betacf(x, a, b)) / a;
  return 1 - (Math.exp(front) * betacf(1 - x, b, a)) / b;
}

/**
 * Student-t CDF with `df` degrees of freedom, via the incomplete beta:
 *
 *   P(T ≤ t) = 1 − ½·I_{df/(df+t²)}(df/2, ½)   for t > 0, mirrored for t < 0.
 *
 * Checked against published tables in stats.test.ts (t = 2.015 at df 5 → 0.95;
 * t = 2.042 at df 30 → 0.975). Used for the Welch intervals in the N-of-1
 * behaviour-impact engine and the slope tests in `linreg` consumers.
 *
 * `null` for a non-finite `t` or `df ≤ 0`.
 */
export function tCdf(t: number, df: number): number | null {
  if (!finite(t) || !finite(df) || df <= 0) return null;
  if (t === 0) return 0.5;
  const x = df / (df + t * t);
  const ib = incompleteBeta(x, df / 2, 0.5);
  if (ib === null) return null;
  const tail = 0.5 * ib;
  return t > 0 ? 1 - tail : tail;
}

// ---------------------------------------------------------------------------
// Association
// ---------------------------------------------------------------------------

/** Pairs of `xs`/`ys` where both are finite, up to the shorter length. */
function pairs(
  xs: readonly (number | null | undefined)[],
  ys: readonly (number | null | undefined)[],
): { x: number[]; y: number[] } {
  const x: number[] = [];
  const y: number[] = [];
  const n = Math.min(xs.length, ys.length);
  for (let i = 0; i < n; i++) {
    const a = xs[i];
    const b = ys[i];
    if (finite(a) && finite(b)) {
      x.push(a);
      y.push(b);
    }
  }
  return { x, y };
}

/**
 * Pearson product-moment correlation over the complete pairs.
 * `null` when fewer than 2 pairs survive or either side has zero variance
 * (a constant series correlates with nothing — reporting 0 would imply an
 * answered question).
 *
 * Used by the HRV vagal-saturation guard (ln rMSSD vs RR over 28 days) and by
 * the confound check in the behaviour-impact engine.
 */
export function pearson(
  xs: readonly (number | null | undefined)[],
  ys: readonly (number | null | undefined)[],
): number | null {
  const { x, y } = pairs(xs, ys);
  const n = x.length;
  if (n < 2) return null;
  const mx = x.reduce((s, v) => s + v, 0) / n;
  const my = y.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx <= 0 || syy <= 0) return null;
  const r = sxy / Math.sqrt(sxx * syy);
  // Guards an overflowed sum of squares (values near 1e308) rather than
  // returning the NaN that Infinity/Infinity produces.
  if (!finite(r)) return null;
  return Math.min(1, Math.max(-1, r));
}

export interface LinReg {
  slope: number;
  intercept: number;
  /**
   * Standard error of the slope, `√((SSres/(n−2)) / Sxx)`. `null` when
   * `n < 3`: two points define a line exactly and carry no residual degrees of
   * freedom, so any "error" reported for them would be fiction.
   */
  seSlope: number | null;
  /** Complete pairs used. */
  n: number;
  /** Coefficient of determination; 1 for an exact fit. */
  r2: number;
}

/**
 * Ordinary least-squares fit of `y` on `x` over the complete pairs.
 *
 * `null` when fewer than 2 pairs survive or `x` has zero variance (a vertical
 * fit has no slope). The VO₂max pace-on-HR regression, the WHOOP strain fit
 * and the Banister τ search all read `seSlope` to say how much to trust the
 * line, which is why it is part of the return rather than a second pass.
 */
export function linreg(
  xs: readonly (number | null | undefined)[],
  ys: readonly (number | null | undefined)[],
): LinReg | null {
  const { x, y } = pairs(xs, ys);
  const n = x.length;
  if (n < 2) return null;
  const mx = x.reduce((s, v) => s + v, 0) / n;
  const my = y.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx <= 0) return null;
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  // As in `pearson`: an overflowed cross-product is no fit at all.
  if (!finite(slope) || !finite(intercept)) return null;
  let ssres = 0;
  for (let i = 0; i < n; i++) {
    const resid = y[i] - (intercept + slope * x[i]);
    ssres += resid * resid;
  }
  // SStot = 0 means every y is identical; the line reproduces them exactly.
  const rawR2 = syy > 0 ? 1 - ssres / syy : 1;
  const r2 = finite(rawR2) ? Math.min(1, Math.max(0, rawR2)) : 0;
  const df = n - 2;
  const rawSe = df >= 1 ? Math.sqrt(Math.max(0, ssres / df) / sxx) : null;
  const seSlope = rawSe !== null && finite(rawSe) ? rawSe : null;
  return { slope, intercept, seSlope, n, r2 };
}

// ---------------------------------------------------------------------------
// Multiplicity
// ---------------------------------------------------------------------------

/**
 * Benjamini–Hochberg step-up FDR control (1995). Returns q-values **in the
 * input order**, so a caller can zip them straight back onto its effect list.
 *
 *   sort p ascending → raw q₍ᵢ₎ = p₍ᵢ₎·n/i → enforce monotonicity from the
 *   largest down (q₍ᵢ₎ = min(q₍ᵢ₎, q₍ᵢ₊₁₎)) → clamp to ≤ 1
 *
 * The behaviour-impact engine tests every behaviour × metric pair at once, so
 * without this a 7 × 5 grid of null behaviours would "confirm" two or three
 * effects by chance. Correction runs across the **whole grid**, never per
 * behaviour (Phase 3 checks exactly this).
 *
 * Entries that are not p-values (non-finite, or outside [0, 1]) get `null` in
 * the same slot and are excluded from `n` rather than silently counted.
 */
export function benjaminiHochberg(
  ps: readonly (number | null | undefined)[],
): (number | null)[] {
  const idx: number[] = [];
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    if (finite(p) && p >= 0 && p <= 1) idx.push(i);
  }
  const out: (number | null)[] = ps.map(() => null);
  const n = idx.length;
  if (n === 0) return out;
  idx.sort((a, b) => (ps[a] as number) - (ps[b] as number));
  let running = 1;
  for (let rank = n; rank >= 1; rank--) {
    const i = idx[rank - 1];
    const q = ((ps[i] as number) * n) / rank;
    running = Math.min(running, q);
    out[i] = Math.min(1, Math.max(0, running));
  }
  return out;
}
