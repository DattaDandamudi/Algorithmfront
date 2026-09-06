/**
 * §1 hero "Readiness" ring + §6.3 training conversion.
 *
 * Source priority (spec: "defer to WHOOP recovery when present, else HRV band"):
 *   1. 'whoop' — today's record has `rec`: score = rec, banded 67/34 like WHOOP.
 *   2. 'hrv'   — HrvStatus has a range: today's ln(rMSSD) is mapped onto 0–100 by
 *                its position in the SWC band so the bands line up with WHOOP's:
 *                  below lower SWC  → 10–33  (33 just under, 10 one SD below)
 *                  within the band  → 34–66  (linear, lower edge → upper edge)
 *                  above upper SWC  → 67–85  (85 one SD above)
 *                                     ± up to 10 for RHR ≥ 3 bpm below / above
 *                                     its 28-day baseline (3 bpm → 5, ≥ 6 bpm → 10)
 *                then clamped to 0–100 and banded 67/34.
 *   3. 'none'  — no signal: score null, band 'neutral'.
 *
 * Forcing rule (spec "Thresholds that should change behaviour"): WHOOP recovery
 * < 34 % OR HRV band 'low' (below the lower SWC) → band red / "Light day",
 * whatever the source. The score itself is never altered — it is the data.
 *
 * Pure & deterministic; never throws, never NaN.
 */
import type { Band, BaselineDelta, DailyRecord, ISODate, Profile, Readiness } from '../data/types';
import { clamp, fmt, fmtSigned } from '../lib/format';
import { baselineDelta } from './baseline';
import { hrvStatus, type HrvStatus } from './hrv';

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

/** RHR must move at least this much vs its 28-day baseline to adjust the HRV score. */
export const RHR_ADJUST_MIN_BPM = 3;
/** At this many bpm the RHR adjustment reaches its ±10 cap. */
export const RHR_ADJUST_FULL_BPM = 6;
export const RHR_ADJUST_MAX = 10;
/** RHR baseline window (§1: "RHR (bpm) vs 28-day baseline"). */
export const RHR_BASELINE_DAYS = 28;

export function bandOf(score: number | null): Band {
  if (score === null || !Number.isFinite(score)) return 'neutral';
  if (score >= BAND_THRESHOLDS.green) return 'green';
  if (score >= BAND_THRESHOLDS.yellow) return 'yellow';
  return 'red';
}

/**
 * Score adjustment from resting HR vs baseline: lower RHR is a recovery sign
 * (+), elevated RHR a fatigue sign (−). 0 inside ±3 bpm; linear to ±10 at 6 bpm.
 */
export function rhrAdjustment(deltaBpm: number | null): number {
  if (deltaBpm === null || !Number.isFinite(deltaBpm) || Math.abs(deltaBpm) < RHR_ADJUST_MIN_BPM) return 0;
  const mag = clamp(Math.abs(deltaBpm) / RHR_ADJUST_FULL_BPM, 0, 1) * RHR_ADJUST_MAX;
  return deltaBpm < 0 ? mag : -mag;
}

/**
 * Map an HRV status (and RHR delta) onto the 0–100 readiness scale described
 * in the module header. Null when there is no SWC range yet.
 */
export function hrvScore(hrv: HrvStatus, rhr: BaselineDelta | null): number | null {
  if (hrv.band === 'insufficient') return null;
  const v = hrv.todayLn ?? hrv.mean7Ln;
  const lo = hrv.swcLowerLn;
  const hi = hrv.swcUpperLn;
  if (v === null || lo === null || hi === null) return null;
  const width = hi - lo; // = SD (≥ 0)
  let score: number;
  if (v < lo) {
    const deficit = width > 0 ? clamp((lo - v) / width, 0, 1) : 1;
    score = 33 - 23 * deficit;
  } else if (v > hi) {
    const excess = width > 0 ? clamp((v - hi) / width, 0, 1) : 1;
    score = 67 + 18 * excess + rhrAdjustment(rhr ? rhr.delta : null);
  } else {
    const t = width > 0 ? (v - lo) / width : 0.5;
    score = 34 + 32 * t;
  }
  return Math.round(clamp(score, 0, 100));
}

function isScore(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export interface ReadinessOpts {
  /** Pre-computed HRV status (saves recomputing when the caller already has it). */
  hrv?: HrvStatus;
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
  const rec = today && isScore(today.rec) ? clamp(today.rec, 0, 100) : null;

  let source: Readiness['source'];
  let score: number | null;
  if (rec !== null) {
    source = 'whoop';
    score = Math.round(rec);
  } else {
    const s = hrvScore(hrv, rhr);
    source = s === null ? 'none' : 'hrv';
    score = s;
  }

  const forcedByRec = rec !== null && rec < BAND_THRESHOLDS.yellow;
  const forcedByHrv = hrv.band === 'low';
  let band = bandOf(score);
  if (forcedByRec || forcedByHrv) band = 'red';

  return {
    score,
    band,
    source,
    verdict: VERDICT_COPY[band],
    training: TRAINING_COPY[band],
    detail: buildDetail(today, hrv, rhr, source, forcedByRec, forcedByHrv),
    // Only present when the forcing rule changed the band the score alone would give.
    ...((forcedByRec || forcedByHrv) && bandOf(score) !== 'red' ? { forced: true } : {}),
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
  source: Readiness['source'],
  forcedByRec: boolean,
  forcedByHrv: boolean,
): string {
  const parts: string[] = [];
  if (source === 'whoop' && today && isScore(today.rec)) parts.push(`WHOOP recovery ${fmt(today.rec)}%`);
  if (hrv.todayMs !== null) {
    parts.push(`HRV ${fmt(hrv.todayMs)} ms${hrv.mean7Ms !== null ? ` (baseline ${fmt(hrv.mean7Ms)})` : ''}`);
  } else if (hrv.mean7Ms !== null) {
    parts.push(`HRV 7-day mean ${fmt(hrv.mean7Ms)} ms (none logged today)`);
  }
  if (rhr.today !== null) {
    parts.push(`RHR ${fmt(rhr.today)}${rhr.delta !== null ? ` (${fmtSigned(rhr.delta)} vs baseline)` : ''}`);
  }
  if (today && isScore(today.slh)) {
    parts.push(`slept ${fmt(today.slh, 1)} h${isScore(today.sln) ? ` of ${fmt(today.sln, 1)} h need` : ''}`);
  }
  if (forcedByRec) parts.push('recovery under 34% forces a light day');
  else if (forcedByHrv) parts.push('HRV below your normal range forces a light day');
  if (!hrv.baselineEstablished) parts.push(`HRV baseline still forming (${hrv.daysOfData} days)`);
  if (!parts.length) return `${VERDICT_COPY.neutral}.`;
  const s = `${parts.join(', ')}.`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
