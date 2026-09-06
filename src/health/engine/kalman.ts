/**
 * §1a Kalman weight trend — the *decision* trend (EWMA in `weight.ts` stays
 * the display trend and is untouched).
 *
 * ## The model
 *
 * Local linear trend on a daily step. State `x = [L, S]` (level in lb, slope in
 * lb·day⁻¹), measurement = the scale reading:
 *
 *   F = [[1, 1], [0, 1]]        H = [1, 0]
 *   Q = diag(0.01, 3e-4)        R = 0.81 = (0.9 lb)²  (floor 0.36)
 *   x₀ = [w₀, 0]                P₀ = diag(0.81, 0.09)   at the first weigh-in
 *
 * Predict on **every calendar day** through `through` — a week without a
 * weigh-in widens the band rather than freezing it — and update with the
 * Joseph form (numerically stable, keeps P symmetric positive-definite).
 *
 * `R` is **adapted** to the user's own scale once ≥ `adaptAfter` (10)
 * innovations exist: `R = max(floor, (1.4826 · MAD(ν))²)` over the last
 * `adaptWindow` (30) accepted innovations. A user who weighs in dressed at
 * random times gets a wider band automatically instead of a hard-coded one.
 *
 * ## Outlier gate and reset
 *
 * A weigh-in is **rejected** (and flagged `suspect`, surfaced as `ws` on the
 * day record) when `|z| > 3.5` or `|ν| > max(8 lb, 4√R)`. This is what stops a
 * single "172" typed as "272" from moving the published TDEE (sim K2: level
 * shift < 0.2 lb).
 *
 * Rejection cannot be allowed to lock the filter out of a *real* step (a move,
 * a new scale, a genuine 6-lb jump), so after `resetAfter` (3) consecutive
 * same-sign rejections the filter **re-anchors**: level ← median of the three
 * rejected readings, slope ← unchanged, `P₀₀ ← R_default`. Sim K5 covers it.
 *
 * ## Rate availability
 *
 * The weekly rate is reported as "unavailable" while `7·√P₁₁ > 0.6 lb/wk` —
 * i.e. while the filter itself cannot tell a half-pound-a-week loss from
 * nothing. The UI says "rate unavailable — N more weigh-ins", never a number
 * the data does not support.
 *
 * ## RTS smoother (added after the state-of-the-art audit)
 *
 * `smoothKalman` runs the Rauch–Tung–Striebel fixed-interval backward pass
 * over the stored predicted/filtered moments, so **history is re-estimated
 * with hindsight** — Happy Scale ships a retrospective smoother and
 * MacroFactor's deterministic weighted average structurally cannot. The
 * smoothed series is what Trends draws; the filtered (causal) series is what
 * decisions use. Sim K6: smoothed RMSE ≤ filtered RMSE on every seed, and the
 * two series never disagree by more than 1 lb on demo data.
 *
 * ## Cycle covariate (optional, off by default)
 *
 * With `profile.tracksCycle`, days inside a logged menses window carry extra
 * measurement variance and a **+0.45 kg (≈ 1 lb, sd 0.35)** mean offset
 * (Kanellakis 2023 — the folk "1–3 kg" figure is not supported), removed from
 * the level before any rate is computed. Absent entirely when the flag was
 * never logged.
 *
 * Pure and clock-free: `through` is a parameter.
 */
import type { DailyRecord, ISODate } from '../data/types';

/** Default measurement variance: a 0.9 lb scale/hydration sd. */
export const KALMAN_R_DEFAULT = 0.81;
/** Never trust a scale to better than 0.6 lb. */
export const KALMAN_R_FLOOR = 0.36;
/** Process noise: level wanders 0.1 lb/day, slope 0.017 lb/day². */
export const KALMAN_Q_LEVEL = 0.01;
export const KALMAN_Q_SLOPE = 3e-4;
/** Rate is suppressed while 7·√P₁₁ exceeds this (lb/wk). */
export const KALMAN_RATE_SD_CAP = 0.6;

export interface KalmanOpts {
  /** Q₀₀, default `KALMAN_Q_LEVEL`. */
  qLevel?: number;
  /** Q₁₁, default `KALMAN_Q_SLOPE`. */
  qSlope?: number;
  /** Initial/default R, default `KALMAN_R_DEFAULT`. */
  measurementVar?: number;
  /** Lower bound for the adapted R, default `KALMAN_R_FLOOR`. */
  measurementVarFloor?: number;
  /** Innovations needed before R adapts (default 10). */
  adaptAfter?: number;
  /** Innovations the adapted R is estimated over (default 30). */
  adaptWindow?: number;
  /** Reject above this standardised innovation (default 3.5). */
  rejectZ?: number;
  /** …or above this absolute innovation in lb (default 8). */
  rejectLb?: number;
  /** Consecutive same-sign rejections that force a re-anchor (default 3). */
  resetAfter?: number;
  /** Rate suppressed above this slope sd in lb/wk (default 0.6). */
  rateSdCap?: number;
  /**
   * Cycle covariate. `enabled` follows `profile.tracksCycle`; the offset is
   * subtracted from the level on flagged days before rates are computed.
   */
  cycle?: { enabled: boolean; offsetLb?: number; offsetSdLb?: number };
}

export interface KalmanPoint {
  d: ISODate;
  /** Filtered level, lb. */
  level: number;
  /** √P₀₀ — the level's own uncertainty, lb. */
  levelSd: number;
  /** Filtered slope, lb·day⁻¹ (×7 for lb/wk). */
  slope: number;
  /** √P₁₁, lb·day⁻¹. */
  slopeSd: number;
  /** No accepted weigh-in that day: prediction only. */
  predicted: boolean;
  /** The day's weigh-in failed the outlier gate. */
  suspect?: true;
  /** Standardised innovation for the day's weigh-in; null when there was none. */
  z?: number | null;
}

/**
 * Filtered and one-step-ahead predicted moments per day, retained so
 * `smoothKalman` can run the RTS backward pass without re-filtering.
 * Covariances are row-major 2×2: `[P₀₀, P₀₁, P₁₀, P₁₁]`.
 */
export interface KalmanMoment {
  d: ISODate;
  x: [number, number];
  P: [number, number, number, number];
  xPred: [number, number];
  PPred: [number, number, number, number];
}

export interface KalmanResult {
  /** One point per calendar day from the first weigh-in to `through`. */
  points: KalmanPoint[];
  byDate: Map<ISODate, KalmanPoint>;
  /** √R actually used (adapted once enough innovations exist), lb. */
  measurementSd: number;
  nAccepted: number;
  nRejected: number;
  /** Date of the first weigh-in; null when there is none. */
  first: ISODate | null;
  /** Retained for `smoothKalman`; same length and order as `points`. */
  moments: KalmanMoment[];
  /** True on the output of `smoothKalman` — the drawn, non-causal series. */
  smoothed: boolean;
}

export interface KalmanRate {
  /** Signed weekly rate (negative = losing), lb/wk. Null when unavailable. */
  lbPerWk: number | null;
  /** Standard error of that rate, lb/wk. */
  sdLbPerWk: number | null;
  lo90: number | null;
  hi90: number | null;
  /** As % of body weight per week. */
  pctPerWk: number | null;
  /** False while `7·√P₁₁ > rateSdCap` or before the first weigh-in. */
  available: boolean;
  /** Why not, in the user's terms ("rate unavailable — 3 more weigh-ins"). */
  reason: string;
}

export interface BandProbability {
  /** P(true rate outside [lo, hi]). */
  p: number;
  pBelow: number;
  pAbove: number;
  /** Which side carries the mass; null when the rate is unavailable. */
  direction: 'below' | 'above' | null;
}

const EMPTY_RATE: KalmanRate = {
  lbPerWk: null,
  sdLbPerWk: null,
  lo90: null,
  hi90: null,
  pctPerWk: null,
  available: false,
  reason: 'No weigh-ins yet',
};

/** A well-formed "no data" result: every consumer must survive this shape. */
function emptyResult(): KalmanResult {
  return {
    points: [],
    byDate: new Map(),
    measurementSd: Math.sqrt(KALMAN_R_DEFAULT),
    nAccepted: 0,
    nRejected: 0,
    first: null,
    moments: [],
    smoothed: false,
  };
}

/** Keeps stub parameters live for `noUnusedParameters`; delete with the TODOs. */
function pending(...args: unknown[]): void {
  void args;
}

/**
 * Filter `records` (any order) up to `through`, or to the last record when
 * `through` is omitted. Days before the first weigh-in produce no points.
 */
export function computeKalmanTrend(
  records: DailyRecord[],
  through?: ISODate,
  opts?: KalmanOpts,
): KalmanResult {
  // TODO(phase-1a): implement per plan §1a.
  pending(records, through, opts);
  return emptyResult();
}

/**
 * RTS fixed-interval smoother. Returns a **new** result whose `points` carry
 * the smoothed level/slope and their (smaller) variances, with
 * `smoothed: true`. Input untouched — Trends draws the smoothed series while
 * decisions keep reading the filtered one.
 */
export function smoothKalman(res: KalmanResult): KalmanResult {
  // TODO(phase-1a): implement per plan §1a (RTS backward pass over `moments`).
  pending(res);
  return { ...emptyResult(), smoothed: true };
}

/**
 * Level per date as a plain map — deliberately the same shape
 * `computeEwmaTrend` returns, so `trendAt`/`weeklyRate` and every existing
 * consumer work against a Kalman trend with no changes.
 */
export function kalmanLevelMap(res: KalmanResult): Map<ISODate, number> {
  // TODO(phase-1a): implement per plan §1a.
  pending(res);
  return new Map();
}

/** The point on `d`, or the latest earlier one (a gap carries forward). */
export function kalmanAt(res: KalmanResult, d: ISODate): KalmanPoint | null {
  // TODO(phase-1a): implement per plan §1a.
  pending(res, d);
  return null;
}

/**
 * Weekly rate at `asOf` with its 90% interval: `7·slope ± 1.645·7·√P₁₁`,
 * suppressed (`available: false`) while `7·√P₁₁ > rateSdCap` (0.6 lb/wk).
 * `bodyWeightLb` only scales `pctPerWk`.
 */
export function kalmanRate(res: KalmanResult, asOf: ISODate, bodyWeightLb: number): KalmanRate {
  // TODO(phase-1a): implement per plan §1a.
  pending(res, asOf, bodyWeightLb);
  return { ...EMPTY_RATE };
}

/**
 * Probability the *true* rate lies outside a target band, from the rate's own
 * normal posterior: `pBelow = Φ((lo − r)/sd)`, `pAbove = 1 − Φ((hi − r)/sd)`.
 * §1b's intake tiers are gated on this (fine tier `p ≥ 0.7`, coarse `p ≥ 0.8`)
 * rather than on a point estimate crossing a line.
 *
 * Takes any `{ lbPerWk, sdLbPerWk }` so both `kalmanRate` and the per-block
 * expenditure rates can call it. `lo`/`hi` are signed lb/wk (a loss band is
 * negative).
 */
export function pOutsideBand(
  rate: { lbPerWk: number | null; sdLbPerWk: number | null } | null,
  lo: number,
  hi: number,
): BandProbability {
  // TODO(phase-1a): implement per plan §1a.
  pending(rate, lo, hi);
  return { p: 0, pBelow: 0, pAbove: 0, direction: null };
}

/**
 * Dates whose weigh-in the gate rejected — what the store stamps as `ws` and
 * what Trends draws hollow ("Looks like a typo — keep?").
 */
export function suspectWeighIns(res: KalmanResult): ISODate[] {
  // TODO(phase-1a): implement per plan §1a.
  pending(res);
  return [];
}
