/**
 * Shared, pure helpers for the stress / energy / impact cards (Phase 2g).
 *
 * Everything here is presentational: band → *word* mappings (SPEC §0 — a
 * colour never carries state on its own, so every tone ships with a label),
 * number formatters, and the curve/bar geometry the hand-rolled SVGs need.
 * No clock reads — the components are driven entirely by the props the engine
 * fills, so they render from `undefined` and from all-null fields alike.
 *
 * It does import two things from the engine, and both are load-bearing rather
 * than convenient: `SIGNAL_STRAIN_SIGN`, without which the direction of an
 * overnight signal cannot be stated (`StressSignal.z` is on the strain axis,
 * so HRV's sign is flipped relative to the reading), and the impact module's
 * own evidence predicates, so the badge on an effect row is decided by the
 * same code that produced the estimate rather than by a second opinion here.
 *
 * Copy rules that live here on purpose (they are reviewed as copy, not as
 * code): the overnight index is a *strain* index and never a diagnosis; the
 * energy curve is *predicted* by the two-process sleep model and never
 * described as measured; behaviour effects are *associations* with intervals.
 */
import type { Band, BehaviourEffect, CheckInItem, EnergyPoint, HHMM, ResilienceBand, StressBand, StressSignal } from '../../data/types';
import { isConsistentEffect, rawDifference } from '../../engine/impact';
import { SIGNAL_STRAIN_SIGN } from '../../engine/stress';
import { formatClock, hhmmToMinutes, minutesToHHMM } from '../../lib/dates';
import { clamp, fmt } from '../../lib/format';
import type { Tone } from '../../ui';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

// ---------------------------------------------------------------------------
// Band → word (never a bare colour)
// ---------------------------------------------------------------------------

export interface ToneWord {
  label: string;
  tone: Tone;
}

const STRESS_BAND: Record<StressBand, ToneWord> = {
  none: { label: 'Typical night', tone: 'green' },
  minor: { label: 'Some overnight strain', tone: 'yellow' },
  major: { label: 'High overnight strain', tone: 'red' },
};

const NO_STRESS_BAND: ToneWord = { label: 'Not enough nights yet', tone: 'neutral' };

/** Overnight strain band → its word + tone. `null` reads "not enough nights yet". */
export function stressBandWord(band: StressBand | null | undefined): ToneWord {
  return band ? (STRESS_BAND[band] ?? NO_STRESS_BAND) : NO_STRESS_BAND;
}

const HOOPER_BAND: Record<Band, ToneWord> = {
  green: { label: 'Feeling good', tone: 'green' },
  yellow: { label: 'Feeling off', tone: 'yellow' },
  red: { label: 'Feeling rough', tone: 'red' },
  neutral: { label: 'No check-ins yet', tone: 'neutral' },
};

/** Hooper check-in band → its word + tone. */
export function hooperBandWord(band: Band | null | undefined): ToneWord {
  return band ? (HOOPER_BAND[band] ?? HOOPER_BAND.neutral) : HOOPER_BAND.neutral;
}

const RESILIENCE_BAND: Record<ResilienceBand, ToneWord> = {
  limited: { label: 'Limited', tone: 'red' },
  adequate: { label: 'Adequate', tone: 'yellow' },
  solid: { label: 'Solid', tone: 'green' },
  strong: { label: 'Strong', tone: 'green' },
  exceptional: { label: 'Exceptional', tone: 'green' },
};

const NO_RESILIENCE_BAND: ToneWord = { label: 'Still learning', tone: 'neutral' };

/** Load-vs-recovery balance band → its word + tone. */
export function resilienceBandWord(band: ResilienceBand | null | undefined): ToneWord {
  return band ? (RESILIENCE_BAND[band] ?? NO_RESILIENCE_BAND) : NO_RESILIENCE_BAND;
}

// ---------------------------------------------------------------------------
// Overnight signals
// ---------------------------------------------------------------------------

/** Fallback names, used only when the engine did not fill `signal.label`. */
export const SIGNAL_LABEL: Record<StressSignal['key'], string> = {
  hrv: 'HRV',
  rhr: 'Resting HR',
  rr: 'Respiratory rate',
  skt: 'Skin temperature',
  spo: 'Blood oxygen',
  debt: 'Sleep debt',
};

export const SIGNAL_UNIT: Partial<Record<StressSignal['key'], string>> = {
  hrv: 'ms',
  rhr: 'bpm',
  rr: 'rpm',
  skt: '°C',
  spo: '%',
  debt: 'min',
};

export function signalLabel(signal: StressSignal): string {
  return signal.label || SIGNAL_LABEL[signal.key] || signal.key;
}

/**
 * The leading line of the whole stack: the outlier COUNT, not the fused score
 * (risk register — a single number reads as a medical finding, a count does
 * not). Reads correctly at 0 signals and at 0 outliers.
 */
export function signalsLine(deviating: number, available: number): string {
  if (!Number.isFinite(available) || available <= 0) return 'No overnight signals yet';
  const n = clamp(Math.round(deviating), 0, Math.round(available));
  if (n === 0) return `All ${Math.round(available)} overnight signals inside your range`;
  return `${n} of ${Math.round(available)} overnight signals outside your range`;
}

/** "+1.8" / "−0.4" / "—" — a signed z, for anywhere an axis is already named. */
export function formatZ(z: number | null | undefined): string {
  if (z === null || z === undefined || !Number.isFinite(z)) return '—';
  const s = fmt(Math.abs(z), 1);
  return z > 0 ? `+${s}` : z < 0 ? `−${s}` : '0.0';
}

/**
 * `StressSignal.z` is on the **strain axis** — positive is always *more strain*,
 * so HRV and blood oxygen (which fall under strain) arrive with their sign
 * flipped relative to the reading. Every line of copy below is about the
 * READING, so it starts here: `SIGNAL_STRAIN_SIGN` turns the strain z back into
 * the metric's own z, where positive means the number was above the user's
 * normal. (For HRV that z is on ln rMSSD — the axis the engine standardises on
 * — so the direction is exact and the magnitude is in log SDs.)
 */
export function signalMetricZ(signal: StressSignal): number | null {
  const z = signal.z;
  if (z === null || z === undefined || !Number.isFinite(z)) return null;
  return (SIGNAL_STRAIN_SIGN[signal.key] ?? 1) * z;
}

/** The reading's direction against the personal baseline — never the strain axis. */
export function signalDirection(signal: StressSignal): 'above' | 'below' | 'at' | 'unknown' {
  const z = signalMetricZ(signal);
  if (z === null) return 'unknown';
  if (z > 0.05) return 'above';
  if (z < -0.05) return 'below';
  return 'at';
}

/** Screen-reader / chip text for one signal — never colour-only. */
export function signalStateText(signal: StressSignal): string {
  if (signalMetricZ(signal) === null) return 'No reading';
  return signal.deviating ? 'Outside your range' : 'Inside your range';
}

/**
 * "2.2 SD below your normal" — how far the READING sat from the user's own
 * normal, and which way. Said in words rather than as a bare signed z, because
 * a signed number is only readable if you already know which axis it is on.
 */
export function signalZText(signal: StressSignal): string {
  const z = signalMetricZ(signal);
  if (z === null) return '—';
  const dir = signalDirection(signal);
  if (dir === 'at') return 'at your normal';
  return `${fmt(Math.abs(z), 1)} SD ${dir} your normal`;
}

/**
 * "flags from 1.3 SD below" — the outlier rule spelled out **one-sidedly**, in
 * the direction that actually flags. The engine's test is `z_strain ≥
 * threshold`, so for HRV and blood oxygen only a fall can flag and only a rise
 * can flag for the others; "±1.3" would claim an interval that does not exist.
 */
export function signalThresholdText(signal: StressSignal): string {
  if (!isNum(signal.threshold)) return '';
  const dir = (SIGNAL_STRAIN_SIGN[signal.key] ?? 1) === -1 ? 'below' : 'above';
  return `flags from ${fmt(signal.threshold, 1)} SD ${dir}`;
}

export function signalTone(signal: StressSignal): Tone {
  if (signal.z === null || signal.z === undefined || !Number.isFinite(signal.z)) return 'neutral';
  return signal.deviating ? 'yellow' : 'green';
}

/** "48 ms" / "—" — the reading with its unit (unit omitted when unknown). */
export function signalValueText(signal: StressSignal): string {
  if (signal.value === null || signal.value === undefined || !Number.isFinite(signal.value)) return '—';
  const unit = SIGNAL_UNIT[signal.key];
  const dp = signal.key === 'skt' ? 1 : 0;
  return unit ? `${fmt(signal.value, dp)} ${unit}` : fmt(signal.value, dp);
}

// ---------------------------------------------------------------------------
// Check-in
// ---------------------------------------------------------------------------

/** Hooper total is 4–28 with 1 = best on every item, so lower is better. */
export const HOOPER_MIN = 4;
export const HOOPER_MAX = 28;

export interface CheckInItemMeta {
  key: CheckInItem;
  label: string;
  /** Worded anchor at 1 and at 7 — a bare "1–7" means nothing to a reader. */
  low: string;
  high: string;
  /** A word for every step, so the current pick is always spoken, never just numbered. */
  words: readonly [string, string, string, string, string, string, string];
  /** Accessible group name for the scale. */
  aria: string;
}

/**
 * The four Hooper items (Hooper & Mackinnon 1995). Every item runs 1 = best to
 * 7 = worst, which is why the total is "lower is better" everywhere.
 */
export const CHECK_IN_META: Record<CheckInItem, CheckInItemMeta> = {
  qs: {
    key: 'qs',
    label: 'Sleep quality',
    low: 'Very restful',
    high: 'Very restless',
    words: ['Very restful', 'Restful', 'Fairly restful', 'Average', 'Fairly restless', 'Restless', 'Very restless'],
    aria: 'Sleep quality, 1 very restful to 7 very restless',
  },
  qf: {
    key: 'qf',
    label: 'Fatigue',
    low: 'Very fresh',
    high: 'Very tired',
    words: ['Very fresh', 'Fresh', 'Fairly fresh', 'Average', 'Fairly tired', 'Tired', 'Very tired'],
    aria: 'Fatigue, 1 very fresh to 7 very tired',
  },
  qt: {
    key: 'qt',
    label: 'Stress',
    low: 'Very relaxed',
    high: 'Very stressed',
    words: ['Very relaxed', 'Relaxed', 'Fairly relaxed', 'Average', 'Fairly stressed', 'Stressed', 'Very stressed'],
    aria: 'Stress, 1 very relaxed to 7 very stressed',
  },
  qo: {
    key: 'qo',
    label: 'Muscle soreness',
    low: 'No soreness',
    high: 'Very sore',
    words: ['No soreness', 'Barely sore', 'Slightly sore', 'Average', 'Fairly sore', 'Sore', 'Very sore'],
    aria: 'Muscle soreness, 1 no soreness to 7 very sore',
  },
};

/** Canonical order — the order the questions are asked in. */
export const CHECK_IN_ORDER: readonly CheckInItem[] = ['qs', 'qf', 'qt', 'qo'];

/** Settings may ask for a subset, in any order; render them in the canonical one. */
export function orderedCheckInItems(items: readonly CheckInItem[] | undefined): CheckInItem[] {
  const asked = new Set(items ?? []);
  return CHECK_IN_ORDER.filter((k) => asked.has(k));
}

/** The word for one 1–7 answer ("Fairly tired"); empty string when unanswered. */
export function checkInWord(key: CheckInItem, value: number | null | undefined): string {
  if (!isNum(value)) return '';
  const i = Math.round(clamp(value, 1, 7)) - 1;
  return CHECK_IN_META[key].words[i] ?? '';
}

/**
 * Hooper total over the asked items. Null unless every asked item has an
 * answer — a partial total would not be comparable day to day.
 */
export function hooperTotal(values: Partial<Record<CheckInItem, number | null | undefined>>, items: readonly CheckInItem[] = CHECK_IN_ORDER): number | null {
  let sum = 0;
  for (const k of items) {
    const v = values[k];
    if (!isNum(v)) return null;
    sum += Math.round(clamp(v, 1, 7));
  }
  return items.length ? sum : null;
}

export function hooperTotalText(total: number | null | undefined): string {
  if (total === null || total === undefined || !Number.isFinite(total)) return '—';
  return `${fmt(total)} of ${HOOPER_MAX}`;
}

/** "3 days worse than usual" — the DALDA-style run. Empty string below the 3-day rule. */
export function worseRunLine(worseRun: number | null | undefined): string {
  const n = Number.isFinite(worseRun) ? Math.round(worseRun as number) : 0;
  if (n < 3) return '';
  return `${n} days in a row worse than your usual — ease off and give recovery a week.`;
}

/** "still learning your normal (9 of 14 nights)" while the reference window is short. */
export function calibratingLine(nRef: number | null | undefined, needed = 14): string {
  const n = Number.isFinite(nRef) ? Math.max(0, Math.round(nRef as number)) : 0;
  return `Still learning your normal (${n} of ${needed} nights).`;
}

// ---------------------------------------------------------------------------
// Resilience
// ---------------------------------------------------------------------------

export interface DatedPoint {
  d: string;
  value: number | null;
}

export interface DatedBand {
  d: string;
  lo: number | null;
  hi: number | null;
}

/**
 * The balance band is literally the gap between the two EWMA curves, so the
 * band the card asserts can be checked against the curves that produced it.
 * A day with only one curve gets no band (never a half-open wash).
 */
export function balanceBand(load: DatedPoint[] | undefined, recovery: DatedPoint[] | undefined): DatedBand[] {
  if (!load?.length || !recovery?.length) return [];
  const rec = new Map(recovery.map((p) => [p.d, p.value]));
  const out: DatedBand[] = [];
  for (const p of load) {
    const r = rec.get(p.d);
    if (!isNum(p.value) || !isNum(r)) continue;
    out.push({ d: p.d, lo: Math.min(p.value, r), hi: Math.max(p.value, r) });
  }
  return out;
}

/** "Load is running 12 above recovery" / "…12 below…" / "in step". */
export function balanceLine(balance: number | null | undefined, dp = 0): string {
  if (!isNum(balance)) return 'Balance needs both curves.';
  const v = fmt(Math.abs(balance), dp);
  if (Math.abs(balance) < 0.5 / 10 ** dp) return 'Load and recovery are in step.';
  return balance > 0 ? `Load is running ${v} above recovery.` : `Recovery is running ${v} above load.`;
}

// ---------------------------------------------------------------------------
// Energy — curve geometry for the hand-rolled SVG
// ---------------------------------------------------------------------------

export const ENERGY_CAPTION =
  'Predicted from the two-process sleep model (homeostatic pressure since wake × circadian rhythm) — a forecast from your sleep and caffeine times, not a measurement.';

export interface EnergyLayout {
  width: number;
  height: number;
  padTop: number;
  padBottom: number;
  padLeft: number;
  padRight: number;
}

export interface EnergyXTick {
  x: number;
  label: string;
}

export interface EnergyGeometry {
  /** Minutes since midnight, unwrapped so a forecast crossing midnight still increases. */
  minutes: number[];
  xs: number[];
  /** 2 px line through the predicted values. */
  linePath: string;
  /** Closed area between `lo` and `hi` — the confidence band. */
  bandPath: string;
  domain: [number, number];
  yTicks: number[];
  xTicks: EnergyXTick[];
  y(value: number): number;
  /** Pixel x for a clock time, or null when it falls outside the forecast window. */
  xAt(hhmm: HHMM | null | undefined): number | null;
}

/** Unwrap clock minutes so an overnight forecast is monotonically increasing. */
export function unwrapMinutes(points: Array<{ hhmm: HHMM }>): number[] {
  const out: number[] = [];
  let prev: number | null = null;
  for (const p of points) {
    const raw = hhmmToMinutes(p.hhmm);
    if (raw === null) {
      out.push(prev === null ? 0 : prev);
      continue;
    }
    let m = raw;
    while (prev !== null && m < prev) m += 1440;
    out.push(m);
    prev = m;
  }
  return out;
}

/**
 * Geometry for the predicted-energy curve. Pure: same points + layout → same
 * paths, so the curve maths is unit-tested rather than eyeballed.
 */
export function energyGeometry(points: EnergyPoint[], layout: EnergyLayout): EnergyGeometry | null {
  const usable = points.filter((p) => isNum(p.value));
  if (usable.length < 2) return null;

  const minutes = unwrapMinutes(usable);
  const t0 = minutes[0];
  const t1 = minutes[minutes.length - 1];
  const span = t1 - t0;
  const { width, height, padLeft, padRight, padTop, padBottom } = layout;
  const plotW = Math.max(1, width - padLeft - padRight);
  const plotH = Math.max(1, height - padTop - padBottom);
  const xOf = (m: number) => (span <= 0 ? padLeft : padLeft + ((m - t0) / span) * plotW);
  const xs = minutes.map(xOf);

  // Energy is a 0–100 prediction; the drawn window is padded but never leaves
  // that range, so a flat evening cannot be exaggerated into a cliff.
  const drawn: number[] = [];
  for (const p of usable) {
    drawn.push(p.value);
    if (isNum(p.lo)) drawn.push(p.lo);
    if (isNum(p.hi)) drawn.push(p.hi);
  }
  const lo = clamp(Math.floor((Math.min(...drawn) - 8) / 10) * 10, 0, 90);
  const hi = clamp(Math.ceil((Math.max(...drawn) + 8) / 10) * 10, lo + 10, 100);
  const domain: [number, number] = [lo, hi];
  const y = (v: number) => padTop + plotH - ((clamp(v, lo, hi) - lo) / (hi - lo)) * plotH;

  const yTicks: number[] = [];
  const stepCount = 4;
  const stepSize = (hi - lo) / stepCount;
  for (let i = 0; i <= stepCount; i++) yTicks.push(Math.round(lo + i * stepSize));

  const px = (n: number) => Math.round(n * 100) / 100;
  const linePath = usable.map((p, i) => `${i === 0 ? 'M' : 'L'}${px(xs[i])} ${px(y(p.value))}`).join(' ');

  // Band: forward along `hi`, back along `lo`. Points without an interval fall
  // back to the value itself so the wash pinches to the line instead of gapping.
  const upper = usable.map((p, i) => `${i === 0 ? 'M' : 'L'}${px(xs[i])} ${px(y(isNum(p.hi) ? p.hi : p.value))}`).join(' ');
  const lowerPts = [...usable].reverse();
  const lowerXs = [...xs].reverse();
  const lower = lowerPts.map((p, i) => `L${px(lowerXs[i])} ${px(y(isNum(p.lo) ? p.lo : p.value))}`).join(' ');
  const bandPath = `${upper} ${lower} Z`;

  // x ticks every 3 h on the clock, inside the drawn window.
  const xTicks: EnergyXTick[] = [];
  const first = Math.ceil(t0 / 180) * 180;
  for (let m = first; m <= t1; m += 180) xTicks.push({ x: xOf(m), label: formatClock(minutesToHHMM(m)) });

  const xAt = (hhmm: HHMM | null | undefined): number | null => {
    const raw = hhmmToMinutes(hhmm ?? null);
    if (raw === null) return null;
    let m = raw;
    while (m < t0) m += 1440;
    if (m > t1) return null;
    return xOf(m);
  };

  return { minutes, xs, linePath, bandPath, domain, yTicks, xTicks, y, xAt };
}

/** "Afternoon dip around 3:00 pm (42 out of 100)". */
export function troughLine(trough: { hhmm: HHMM; value: number } | null | undefined): string {
  if (!trough || !isNum(trough.value)) return '';
  return `Afternoon dip around ${formatClock(trough.hhmm)} (${fmt(trough.value)} out of 100)`;
}

// ---------------------------------------------------------------------------
// Impact — confidence-interval bars
// ---------------------------------------------------------------------------

export const IMPACT_CAVEAT =
  'Association, not cause. These are differences between your own days with and without the behaviour — something else you did on those days could explain them.';

export interface CiBarGeometry {
  /** 0–100 % positions inside the bar track. */
  loPct: number;
  hiPct: number;
  pointPct: number;
  zeroPct: number;
  /** The interval spans zero → the effect is not distinguishable from none. */
  crossesZero: boolean;
  domain: [number, number];
}

/**
 * One effect's bar, scaled to its OWN interval and centred on zero — effects
 * are in different units (ms, minutes, %), so a shared scale would invite a
 * comparison the numbers do not support. Zero always sits at 50 %.
 */
export function ciBar(deltaMean: number, lo95: number, hi95: number): CiBarGeometry | null {
  if (!isNum(deltaMean) || !isNum(lo95) || !isNum(hi95)) return null;
  const lo = Math.min(lo95, hi95, deltaMean);
  const hi = Math.max(lo95, hi95, deltaMean);
  const reach = Math.max(Math.abs(lo), Math.abs(hi));
  const half = reach > 0 ? reach * 1.15 : 1;
  const domain: [number, number] = [-half, half];
  const pct = (v: number) => clamp(((v + half) / (2 * half)) * 100, 0, 100);
  return {
    loPct: pct(lo),
    hiPct: pct(hi),
    pointPct: pct(deltaMean),
    zeroPct: 50,
    crossesZero: lo95 <= 0 && hi95 >= 0,
    domain,
  };
}

/** "+14 min" / "−3 ms" — the shrunk difference in means, signed. */
export function effectValueText(effect: Pick<BehaviourEffect, 'deltaMean'>, unit = '', dp = 1): string {
  if (!isNum(effect.deltaMean)) return '—';
  const s = fmt(Math.abs(effect.deltaMean), dp);
  const sign = effect.deltaMean > 0 ? '+' : effect.deltaMean < 0 ? '−' : '';
  return `${sign}${s}${unit ? ` ${unit}` : ''}`;
}

/** "95% CI −1.2 to +6.4" — the interval spelled out, never a bare bar. */
export function ciText(lo95: number | null | undefined, hi95: number | null | undefined, dp = 1): string {
  if (!isNum(lo95) || !isNum(hi95)) return '—';
  const s = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(v), dp)}`;
  return `95% CI ${s(lo95)} to ${s(hi95)}`;
}

/** "12 days with · 41 without" — the counts behind the estimate. */
export function daysLine(nYes: number | null | undefined, nNo: number | null | undefined): string {
  const y = Number.isFinite(nYes) ? Math.round(nYes as number) : 0;
  const n = Number.isFinite(nNo) ? Math.round(nNo as number) : 0;
  return `${y} ${y === 1 ? 'day' : 'days'} with · ${n} without`;
}

/** How strongly the estimate was pulled toward the published prior. */
export function shrinkageLine(shrunkToPrior: number | null | undefined): string {
  if (!isNum(shrunkToPrior)) return '';
  const pct = Math.round(clamp(shrunkToPrior, 0, 1) * 100);
  if (pct <= 0) return '';
  return `${pct}% of this estimate comes from published averages, not your data.`;
}

/**
 * The badge on an effect row — "confirmed" is deliberately not used, and
 * neither is "consistent" unless the row's own three numbers agree.
 *
 * The q-value is computed on the **unshrunk** difference (a prior must not
 * manufacture significance) while the number, the direction word and the
 * interval on the row are the **shrunk posterior**. Reading the badge off the q
 * alone therefore lets a green "Consistent signal" land on an interval that
 * spans zero, or on an estimate pointing the opposite way to the days that
 * produced the q. `isConsistentEffect` requires all three to line up; when only
 * the q clears, the row says the evidence is mixed and `strengthCaveat` says
 * which way.
 */
export function strengthWord(effect: BehaviourEffect | null | undefined): ToneWord {
  if (!effect || !isNum(effect.qValue)) return { label: 'Not yet testable', tone: 'neutral' };
  if (effect.qValue <= 0.05) {
    return isConsistentEffect(effect)
      ? { label: 'Consistent signal', tone: 'green' }
      : { label: 'Mixed evidence', tone: 'yellow' };
  }
  if (effect.qValue <= 0.2) return { label: 'Suggestive only', tone: 'yellow' };
  return { label: 'No clear signal', tone: 'neutral' };
}

/**
 * What the badge is holding back, in words: the interval that still contains
 * "no difference", and — the case a zero-crossing interval does not cover — an
 * estimate that shrinkage pulled to the other side of zero from the user's own
 * days. Empty when the row's numbers agree with each other.
 */
export function strengthCaveat(effect: BehaviourEffect | null | undefined): string {
  if (!effect) return '';
  const parts: string[] = [];
  if (isNum(effect.lo95) && isNum(effect.hi95) && effect.lo95 <= 0 && effect.hi95 >= 0) {
    parts.push('the interval includes zero, so "no difference" is still on the table');
  }
  const raw = rawDifference(effect);
  if (isNum(raw) && isNum(effect.deltaMean) && raw * effect.deltaMean < 0) {
    parts.push(
      `your own days went the other way (${effect.deltaMean > 0 ? 'lower' : 'higher'} on those days) before the published average pulled the estimate across zero`,
    );
  }
  return parts.join(' · ');
}
