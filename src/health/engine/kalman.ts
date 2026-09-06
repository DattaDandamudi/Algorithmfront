/**
 * §1a Kalman weight trend — the *decision* trend (EWMA in `weight.ts` stays
 * the display trend and is untouched).
 *
 * ## The model
 *
 * Local linear trend on a daily step (Harvey 1989, *Forecasting, Structural
 * Time Series Models and the Kalman Filter*, §2.3 — the "local linear trend"
 * / integrated random walk). State `x = [L, S]` (level in lb, slope in
 * lb·day⁻¹), measurement = the scale reading:
 *
 *   F = [[1, 1], [0, 1]]        H = [1, 0]
 *   Q = diag(0.01, 3e-4)        R = 0.81 = (0.9 lb)²  (floor 0.36)
 *   x₀ = [w₀, 0]                P₀ = diag(0.81, 0.09)   at the first weigh-in
 *
 * Predict on **every calendar day** through `through` — a week without a
 * weigh-in widens the band rather than freezing it — and update with the
 * Joseph form (Bucy & Joseph 1968; Grewal & Andrews §4.4: numerically stable,
 * keeps P symmetric positive-definite even when the gain is not exactly
 * optimal, which it is not the moment R is adapted mid-series).
 *
 * `R` is **adapted** to the user's own scale once ≥ `adaptAfter` (10)
 * innovations exist: `R = max(floor, (1.4826 · MAD(ν))²)` over the last
 * `adaptWindow` (30) accepted innovations — innovation-based adaptive
 * estimation (Mehra 1970; Odelson 2006), with the MAD scale estimator in place
 * of a sample variance so a survived near-outlier cannot inflate the band.
 * A user who weighs in dressed at random times gets a wider band automatically
 * instead of a hard-coded one. (This slightly *over*-estimates R, because
 * Var(ν) = P₀₀⁻ + R rather than R; erring wide is the safe direction for a
 * band the UI publishes.)
 *
 * ## Outlier gate and reset
 *
 * A weigh-in is **rejected** (and flagged `suspect`, surfaced as `ws` on the
 * day record) when `|z| > 3.5` or `|ν| > max(8 lb, 4√R)`. This is what stops a
 * single "172" typed as "272" from moving the published TDEE (sim K2: level
 * shift < 0.2 lb). Both thresholds are **heuristics** — no published rule
 * covers "is this scale reading a typo" — chosen so a 3.5σ reading (1 in 2 000
 * under the model) and any single-day move a real body cannot make are the
 * only things refused.
 *
 * Rejection cannot be allowed to lock the filter out of a *real* step (a move,
 * a new scale, a genuine 6-lb jump), so after `resetAfter` (3, heuristic)
 * consecutive same-sign rejections the filter **re-anchors**: level ← median
 * of the three rejected readings, slope ← unchanged, `P₀₀ ← R_default`. The
 * three days are un-flagged when that happens: the filter has just decided
 * they were real, so asking "looks like a typo — keep?" about them would be
 * wrong. Sim K5 covers it.
 *
 * ## Rate availability
 *
 * The weekly rate is reported as "unavailable" while `7·√P₁₁ > 0.6 lb/wk` —
 * i.e. while the filter itself cannot tell a half-pound-a-week loss from
 * nothing. The UI says "rate unavailable — N more weigh-ins", never a number
 * the data does not support. The 0.6 lb/wk cap is a **heuristic**, set at the
 * smallest rate the app ever acts on.
 *
 * ## RTS smoother (added after the state-of-the-art audit)
 *
 * `smoothKalman` runs the Rauch–Tung–Striebel fixed-interval backward pass
 * (Rauch, Tung & Striebel 1965) over the stored predicted/filtered moments, so
 * **history is re-estimated with hindsight** — Happy Scale ships a
 * retrospective smoother and MacroFactor's deterministic weighted average
 * structurally cannot. The smoothed series is what Trends draws; the filtered
 * (causal) series is what decisions use. Sim K6: smoothed RMSE ≤ filtered RMSE
 * on every seed, and the two series never disagree by more than 1 lb on demo
 * data.
 *
 * ## Cycle covariate (optional, off by default)
 *
 * With `profile.tracksCycle`, days inside a logged menses window carry extra
 * measurement variance and a **+0.45 kg (≈ 0.99 lb, sd 0.35)** mean offset
 * (Kanellakis 2023, *Nutrients* 15(19):4207 — a systematic review measuring
 * ≈ 0.45 kg of luteal/menstrual water weight; the folk "1–3 kg" figure is not
 * supported), removed from the reading before it reaches the level, so no rate
 * is ever computed from cycle water. Absent entirely when the flag was never
 * logged.
 *
 * Pure and clock-free: `through` is a parameter.
 */
import type { DailyRecord, ISODate } from '../data/types';
import { addDays } from '../lib/dates';
import { median, normalCdf, normalQuantile, robustSd } from './stats';

/** Default measurement variance: a 0.9 lb scale/hydration sd. */
export const KALMAN_R_DEFAULT = 0.81;
/** Never trust a scale to better than 0.6 lb. */
export const KALMAN_R_FLOOR = 0.36;
/** Process noise: level wanders 0.1 lb/day, slope 0.017 lb/day². */
export const KALMAN_Q_LEVEL = 0.01;
export const KALMAN_Q_SLOPE = 3e-4;
/** Rate is suppressed while 7·√P₁₁ exceeds this (lb/wk). */
export const KALMAN_RATE_SD_CAP = 0.6;
/** Initial slope variance, (0.3 lb/day)² — 2 lb/wk of "no idea yet". */
export const KALMAN_P0_SLOPE = 0.09;
/** Menses water offset: 0.45 kg (Kanellakis 2023), in lb. */
export const KALMAN_CYCLE_OFFSET_LB = 0.99;
/** Between-cycle spread of that offset, lb — enters R on flagged days. */
export const KALMAN_CYCLE_OFFSET_SD_LB = 0.35;

const REJECT_Z = 3.5;
const REJECT_LB = 8;
const RESET_AFTER = 3;
const ADAPT_AFTER = 10;
const ADAPT_WINDOW = 30;
/** 20 000 days ≈ 55 years — a hard stop against a malformed date loop. */
const DAY_GUARD = 20000;
/** z for a 90% two-sided interval (1.6449). */
const Z90 = normalQuantile(0.95) ?? 1.6449;

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
  /**
   * Rate suppressed above this slope sd in lb/wk (default 0.6). The filter
   * itself has no use for it — `kalmanRate` takes it as its own argument — but
   * it lives here so a caller can keep one options object and pass
   * `opts.rateSdCap` to both.
   */
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

/** Row-major 2×2: `[m₀₀, m₀₁, m₁₀, m₁₁]`. */
type Mat2 = [number, number, number, number];
type Vec2 = [number, number];

/** A usable scale weight: a finite, positive number of pounds. */
function isWeighIn(w: unknown): w is number {
  return typeof w === 'number' && Number.isFinite(w) && w > 0;
}

/** `F P Fᵀ + Q` for `F = [[1,1],[0,1]]`, `Q = diag(qL, qS)`. */
function predictCov(P: Mat2, qL: number, qS: number): Mat2 {
  const [p00, p01, p10, p11] = P;
  return [p00 + p01 + p10 + p11 + qL, p01 + p11, p10 + p11, p11 + qS];
}

/**
 * Joseph-form covariance update for `H = [1, 0]`:
 * `P = (I − KH) P⁻ (I − KH)ᵀ + K R Kᵀ`, symmetrised afterwards so a rounding
 * asymmetry can never grow across 3 000 days.
 */
function josephCov(Ppred: Mat2, R: number): Mat2 {
  const [p00, p01, p10, p11] = Ppred;
  const s = p00 + R;
  if (!(s > 0)) return Ppred;
  const k0 = p00 / s;
  const k1 = p10 / s;
  const g = 1 - k0;
  // A = (I − KH) P⁻
  const a00 = g * p00;
  const a01 = g * p01;
  const a10 = p10 - k1 * p00;
  const a11 = p11 - k1 * p01;
  // A (I − KH)ᵀ + K R Kᵀ
  const b00 = a00 * g + R * k0 * k0;
  const b01 = -a00 * k1 + a01 + R * k0 * k1;
  const b10 = a10 * g + R * k1 * k0;
  const b11 = -a10 * k1 + a11 + R * k1 * k1;
  const off = (b01 + b10) / 2;
  return [Math.max(0, b00), off, off, Math.max(0, b11)];
}

function round(v: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}

function sd(v: number): number {
  return Math.sqrt(Math.max(0, v));
}

/**
 * Filter `records` (any order) up to `through`, or to the last record when
 * `through` is omitted. Days before the first weigh-in produce no points.
 *
 * The window matches `computeEwmaTrend`'s exactly — `max(last weigh-in,
 * through)` — so a bedtime logged for tomorrow gets no Kalman state (R7-13)
 * while a weigh-in dated after `through` still does: it is real data.
 */
export function computeKalmanTrend(
  records: DailyRecord[],
  through?: ISODate,
  opts?: KalmanOpts,
): KalmanResult {
  const qL = num(opts?.qLevel, KALMAN_Q_LEVEL, 0);
  const qS = num(opts?.qSlope, KALMAN_Q_SLOPE, 0);
  const rDefault = num(opts?.measurementVar, KALMAN_R_DEFAULT, 1e-6);
  const rFloor = num(opts?.measurementVarFloor, KALMAN_R_FLOOR, 0);
  const adaptAfter = Math.max(2, Math.floor(num(opts?.adaptAfter, ADAPT_AFTER, 2)));
  const adaptWindow = Math.max(adaptAfter, Math.floor(num(opts?.adaptWindow, ADAPT_WINDOW, 2)));
  const rejectZ = num(opts?.rejectZ, REJECT_Z, 0.5);
  const rejectLb = num(opts?.rejectLb, REJECT_LB, 0.5);
  const resetAfter = Math.max(2, Math.floor(num(opts?.resetAfter, RESET_AFTER, 2)));
  const cycleOn = opts?.cycle?.enabled === true;
  const cycleOffset = cycleOn ? num(opts?.cycle?.offsetLb, KALMAN_CYCLE_OFFSET_LB, 0) : 0;
  const cycleSd = cycleOn ? num(opts?.cycle?.offsetSdLb, KALMAN_CYCLE_OFFSET_SD_LB, 0) : 0;

  const sorted = [...records].sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  if (sorted.length === 0) return emptyResult();
  const byDate = new Map<ISODate, DailyRecord>();
  for (const r of sorted) byDate.set(r.d, r);

  const firstRec = sorted.find((r) => isWeighIn(r.w));
  if (!firstRec) return emptyResult();
  let lastWeighIn = firstRec.d;
  for (const r of sorted) if (isWeighIn(r.w)) lastWeighIn = r.d;
  const end = through || sorted[sorted.length - 1].d;
  const last = end > lastWeighIn ? end : lastWeighIn;
  if (last < firstRec.d) return emptyResult();

  const points: KalmanPoint[] = [];
  const moments: KalmanMoment[] = [];
  const innovations: number[] = [];
  /** Pending same-sign rejections: index into `points`, offset-free reading, sign. */
  let pendingRejects: { i: number; w: number; sign: number }[] = [];
  let R = rDefault;
  let nAccepted = 1;
  let nRejected = 0;

  // Anchor on the first weigh-in: it seeds the state rather than updating it,
  // so it has no innovation and cannot be "rejected".
  let x: Vec2 = [firstRec.w as number, 0];
  let P: Mat2 = [rDefault, 0, 0, KALMAN_P0_SLOPE];
  points.push({
    d: firstRec.d,
    level: x[0],
    levelSd: sd(P[0]),
    slope: x[1],
    slopeSd: sd(P[3]),
    predicted: false,
    z: null,
  });
  moments.push({ d: firstRec.d, x: [...x], P: [...P], xPred: [...x], PPred: [...P] });

  let cur = addDays(firstRec.d, 1);
  let guard = 0;
  while (cur <= last && guard++ < DAY_GUARD) {
    const xPred: Vec2 = [x[0] + x[1], x[1]];
    const PPred = predictCov(P, qL, qS);
    x = xPred;
    P = PPred;

    const rec = byDate.get(cur);
    const menses = cycleOn && rec?.mens === true;
    const rEff = R + (menses ? cycleSd * cycleSd : 0);
    let z: number | null = null;
    let suspect = false;
    let accepted = false;
    let reAnchored = false;

    if (rec && isWeighIn(rec.w)) {
      // The cycle offset lives in the measurement, not the level: subtracting
      // it here keeps the level (and therefore every rate) free of cycle water.
      const yAdj = rec.w - (menses ? cycleOffset : 0);
      const nu = yAdj - x[0];
      const s = P[0] + rEff;
      z = s > 0 ? nu / Math.sqrt(s) : 0;
      const absGate = Math.max(rejectLb, 4 * Math.sqrt(rEff));
      if (Math.abs(z) > rejectZ || Math.abs(nu) > absGate) {
        suspect = true;
        nRejected++;
        // "Same sign" is the sign of the innovation each reading was rejected
        // on: a +6 followed by a −6 is noise, not a step, and must not count
        // towards a re-anchor.
        const sign = nu >= 0 ? 1 : -1;
        if (pendingRejects.length > 0 && pendingRejects[0].sign !== sign) pendingRejects = [];
        pendingRejects.push({ i: points.length, w: yAdj, sign });
        if (pendingRejects.length >= resetAfter) {
          // Three same-sign rejections in a row is a real step, not three
          // typos: re-anchor on their median and clear the suspicion.
          const anchor = median(pendingRejects.map((p) => p.w));
          if (anchor !== null) {
            x = [anchor, x[1]];
            P = [rDefault, 0, 0, P[3]];
          }
          for (const p of pendingRejects) {
            const pt = points[p.i];
            if (pt) delete pt.suspect;
          }
          nRejected -= pendingRejects.length;
          nAccepted += pendingRejects.length;
          suspect = false;
          accepted = true;
          reAnchored = true;
          pendingRejects = [];
        }
      } else {
        const kGain0 = P[0] / (P[0] + rEff);
        const kGain1 = P[2] / (P[0] + rEff);
        P = josephCov(P, rEff);
        x = [x[0] + kGain0 * nu, x[1] + kGain1 * nu];
        innovations.push(nu);
        if (innovations.length > adaptWindow) innovations.shift();
        if (innovations.length >= adaptAfter) {
          const s2 = robustSd(innovations);
          if (s2 !== null && Number.isFinite(s2)) R = Math.max(rFloor, s2 * s2);
        }
        pendingRejects = [];
        nAccepted++;
        accepted = true;
      }
    }

    const pt: KalmanPoint = {
      d: cur,
      level: x[0],
      levelSd: sd(P[0]),
      slope: x[1],
      slopeSd: sd(P[3]),
      predicted: !accepted,
      z,
    };
    if (suspect) pt.suspect = true;
    points.push(pt);
    // A re-anchor is a discontinuity the model does not explain, so it is
    // recorded as its own prior (prediction = the re-anchored state). Without
    // that, the RTS pass would treat the 6 lb jump as an innovation and smear
    // it backwards across weeks of history that never saw it.
    moments.push({
      d: cur,
      x: [...x],
      P: [...P],
      xPred: reAnchored ? [...x] : [...xPred],
      PPred: reAnchored ? [...P] : [...PPred],
    });
    cur = addDays(cur, 1);
  }

  return {
    points,
    byDate: new Map(points.map((p) => [p.d, p])),
    measurementSd: Math.sqrt(R),
    nAccepted,
    nRejected,
    first: firstRec.d,
    moments,
    smoothed: false,
  };
}

function num(v: number | undefined, fallback: number, min: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= min ? v : fallback;
}

/**
 * RTS fixed-interval smoother. Returns a **new** result whose `points` carry
 * the smoothed level/slope and their (smaller) variances, with
 * `smoothed: true`. Input untouched — Trends draws the smoothed series while
 * decisions keep reading the filtered one.
 *
 *   C_k = P_k Fᵀ (P⁻_{k+1})⁻¹
 *   x̂_k = x_k + C_k (x̂_{k+1} − x⁻_{k+1})
 *   P̂_k = P_k + C_k (P̂_{k+1} − P⁻_{k+1}) C_kᵀ
 *
 * `predicted` / `suspect` / `z` are carried through unchanged: they describe
 * what was *logged* that day, which hindsight does not alter.
 */
export function smoothKalman(res: KalmanResult): KalmanResult {
  if (res.smoothed || res.points.length === 0) return res;
  const n = res.moments.length;
  if (n !== res.points.length) return res;

  const xs: Vec2[] = res.moments.map((m) => [...m.x] as Vec2);
  const Ps: Mat2[] = res.moments.map((m) => [...m.P] as Mat2);

  for (let k = n - 2; k >= 0; k--) {
    const next = res.moments[k + 1];
    const [q00, q01, q10, q11] = next.PPred;
    const det = q00 * q11 - q01 * q10;
    // A singular one-step covariance means the day carried no new information
    // to propagate backwards; leaving C = 0 keeps the filtered value.
    if (!Number.isFinite(det) || Math.abs(det) < 1e-12) continue;
    const i00 = q11 / det;
    const i01 = -q01 / det;
    const i10 = -q10 / det;
    const i11 = q00 / det;
    const [p00, p01, p10, p11] = Ps[k];
    // M = P_k Fᵀ, Fᵀ = [[1,0],[1,1]]
    const m00 = p00 + p01;
    const m01 = p01;
    const m10 = p10 + p11;
    const m11 = p11;
    // C = M · inv(PPred)
    const c00 = m00 * i00 + m01 * i10;
    const c01 = m00 * i01 + m01 * i11;
    const c10 = m10 * i00 + m11 * i10;
    const c11 = m10 * i01 + m11 * i11;
    const dx0 = xs[k + 1][0] - next.xPred[0];
    const dx1 = xs[k + 1][1] - next.xPred[1];
    xs[k] = [xs[k][0] + c00 * dx0 + c01 * dx1, xs[k][1] + c10 * dx0 + c11 * dx1];
    const d00 = Ps[k + 1][0] - q00;
    const d01 = Ps[k + 1][1] - q01;
    const d10 = Ps[k + 1][2] - q10;
    const d11 = Ps[k + 1][3] - q11;
    // C D Cᵀ
    const e00 = c00 * d00 + c01 * d10;
    const e01 = c00 * d01 + c01 * d11;
    const e10 = c10 * d00 + c11 * d10;
    const e11 = c10 * d01 + c11 * d11;
    const f00 = e00 * c00 + e01 * c01;
    const f01 = e00 * c10 + e01 * c11;
    const f10 = e10 * c00 + e11 * c01;
    const f11 = e10 * c10 + e11 * c11;
    const off = (p01 + f01 + (p10 + f10)) / 2;
    Ps[k] = [Math.max(0, p00 + f00), off, off, Math.max(0, p11 + f11)];
  }

  const points: KalmanPoint[] = res.points.map((p, i) => {
    const out: KalmanPoint = {
      d: p.d,
      level: xs[i][0],
      levelSd: sd(Ps[i][0]),
      slope: xs[i][1],
      slopeSd: sd(Ps[i][3]),
      predicted: p.predicted,
      z: p.z ?? null,
    };
    if (p.suspect) out.suspect = true;
    return out;
  });

  return {
    ...res,
    points,
    byDate: new Map(points.map((p) => [p.d, p])),
    moments: res.moments.map((m, i) => ({
      d: m.d,
      x: [...xs[i]] as Vec2,
      P: [...Ps[i]] as Mat2,
      xPred: [...m.xPred] as Vec2,
      PPred: [...m.PPred] as Mat2,
    })),
    smoothed: true,
  };
}

/**
 * Level per date as a plain map — deliberately the same shape
 * `computeEwmaTrend` returns, so `trendAt`/`weeklyRate` and every existing
 * consumer work against a Kalman trend with no changes. Rounded to 0.01 lb for
 * the same reason: the map is a display/compat surface, and `points` keeps the
 * full precision the maths needs.
 */
export function kalmanLevelMap(res: KalmanResult): Map<ISODate, number> {
  const out = new Map<ISODate, number>();
  for (const p of res.points) out.set(p.d, round(p.level, 2));
  return out;
}

/** The point on `d`, or the latest earlier one (a gap carries forward). */
export function kalmanAt(res: KalmanResult, d: ISODate): KalmanPoint | null {
  const exact = res.byDate.get(d);
  if (exact) return exact;
  let best: KalmanPoint | null = null;
  for (const p of res.points) {
    if (p.d <= d && (best === null || p.d > best.d)) best = p;
  }
  return best;
}

/**
 * Weekly rate at `asOf` with its 90% interval: `7·slope ± 1.645·7·√P₁₁`,
 * suppressed (`available: false`) while `7·√P₁₁ > rateSdCap` (0.6 lb/wk).
 * `bodyWeightLb` only scales `pctPerWk`.
 *
 * `rateSdCap` is a parameter (not read back off the result) so a caller that
 * filtered with a custom cap can pass the same one; it defaults to the
 * published constant.
 */
export function kalmanRate(
  res: KalmanResult,
  asOf: ISODate,
  bodyWeightLb: number,
  rateSdCap = KALMAN_RATE_SD_CAP,
): KalmanRate {
  const pt = kalmanAt(res, asOf);
  if (!pt) return { ...EMPTY_RATE };
  const cap = num(rateSdCap, KALMAN_RATE_SD_CAP, 1e-6);
  const rate = 7 * pt.slope;
  const rateSd = 7 * pt.slopeSd;
  if (!Number.isFinite(rate) || !Number.isFinite(rateSd)) return { ...EMPTY_RATE };
  if (rateSd > cap) {
    const need = weighInsToRate(momentAt(res, pt.d), res.measurementSd ** 2, cap);
    return {
      ...EMPTY_RATE,
      reason:
        need === null
          ? 'Rate unavailable — not enough weigh-ins yet'
          : `Rate unavailable — about ${need} more weigh-${need === 1 ? 'in' : 'ins'}`,
    };
  }
  const half = Z90 * rateSd;
  const bw = Number.isFinite(bodyWeightLb) && bodyWeightLb > 0 ? bodyWeightLb : null;
  return {
    lbPerWk: round(rate, 3),
    sdLbPerWk: round(rateSd, 3),
    lo90: round(rate - half, 3),
    hi90: round(rate + half, 3),
    pctPerWk: bw === null ? null : round((rate / bw) * 100, 3),
    available: true,
    reason: `Rate from ${res.nAccepted} weigh-${res.nAccepted === 1 ? 'in' : 'ins'}`,
  };
}

function momentAt(res: KalmanResult, d: ISODate): Mat2 {
  for (let i = res.moments.length - 1; i >= 0; i--) {
    if (res.moments[i].d === d) return res.moments[i].P;
  }
  return [KALMAN_R_DEFAULT, 0, 0, KALMAN_P0_SLOPE];
}

/**
 * How many more *daily* weigh-ins bring `7·√P₁₁` under `cap`, by running the
 * covariance recursion (which needs no data) forward. Null beyond 60 — past
 * that the honest answer is "not yet", not a number.
 */
function weighInsToRate(P: Mat2, R: number, cap: number, max = 60): number | null {
  let cov: Mat2 = [...P];
  for (let i = 1; i <= max; i++) {
    cov = josephCov(predictCov(cov, KALMAN_Q_LEVEL, KALMAN_Q_SLOPE), R);
    if (7 * sd(cov[3]) <= cap) return i;
  }
  return null;
}

/**
 * Probability the *true* rate lies outside a target band, from the rate's own
 * normal posterior: `pBelow = Φ((lo − r)/sd)`, `pAbove = 1 − Φ((hi − r)/sd)`.
 * §1b's intake tiers are gated on this (fine tier `p ≥ 0.7`, coarse `p ≥ 0.8`)
 * rather than on a point estimate crossing a line.
 *
 * Takes any `{ lbPerWk, sdLbPerWk }` so both `kalmanRate` and the per-block
 * expenditure rates can call it. `lo`/`hi` are signed lb/wk (a loss band is
 * negative), so `direction: 'below'` means *more negative than the band* —
 * losing faster than intended — and `'above'` means losing too slowly or
 * gaining. `weight.rateBandProb` builds the signed band from a %BW band.
 */
export function pOutsideBand(
  rate: { lbPerWk: number | null; sdLbPerWk: number | null } | null,
  lo: number,
  hi: number,
): BandProbability {
  const r = rate?.lbPerWk;
  const s = rate?.sdLbPerWk;
  if (
    typeof r !== 'number' ||
    !Number.isFinite(r) ||
    typeof s !== 'number' ||
    !Number.isFinite(s) ||
    s <= 0 ||
    !Number.isFinite(lo) ||
    !Number.isFinite(hi)
  ) {
    return { p: 0, pBelow: 0, pAbove: 0, direction: null };
  }
  const bLo = Math.min(lo, hi);
  const bHi = Math.max(lo, hi);
  const pBelow = normalCdf(bLo, r, s);
  const pAbove = 1 - normalCdf(bHi, r, s);
  const p = Math.min(1, Math.max(0, pBelow + pAbove));
  return {
    p,
    pBelow,
    pAbove,
    direction: pBelow >= pAbove ? 'below' : 'above',
  };
}

/**
 * Dates whose weigh-in the gate rejected — what the store stamps as `ws` and
 * what Trends draws hollow ("Looks like a typo — keep?").
 */
export function suspectWeighIns(res: KalmanResult): ISODate[] {
  return res.points.filter((p) => p.suspect).map((p) => p.d);
}
