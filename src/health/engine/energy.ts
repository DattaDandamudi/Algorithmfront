/**
 * §1h Predicted energy — a two-process forecast, not a measurement.
 *
 * Garmin's Body Battery, Fitbit's readiness gauge and Whoop's strain curve all
 * lean on **continuous** heart rate. We do not have it, so this module models
 * the day instead of measuring it, and every surface says so: the label is
 * "predicted energy", the chart is a line with a confidence band rather than a
 * battery icon (a battery implies a measurement), and the caption names the
 * model. That honesty is the feature — an unexplained gauge cannot be argued
 * with, and this one can.
 *
 * ## The model
 *
 * **Process S** (homeostatic sleep pressure), integrated over the last 14
 * nights of actual bed/wake times so the starting point reflects the week the
 * user actually had:
 *
 *   awake:  S(t) = 1 − (1 − S₀)·e^{−t/τ_r}      τ_r ≈ 18 h
 *   asleep: S(t) = S₀·e^{−t/τ_d}                τ_d ≈ 4.2 h
 *
 * Nights the user did not log are filled with their own median bed/wake times
 * rather than skipped, so a missing Tuesday cannot be read as 40 hours awake.
 *
 * **Process C** (circadian): the five-harmonic waveform from the Unified Model
 * of Performance, `a₁…a₅ = 0.97, 0.22, 0.07, 0.03, 0.001`, phase-anchored to
 * the **14-day median midsleep** rather than to clock time, so a late
 * chronotype's trough lands where theirs actually is.
 *
 *   C(t) = Σₖ aₖ · sin(2πk(t − p)/24)
 *
 * With these coefficients the waveform is asymmetric: it falls for 16 h and
 * rises for 8, its minimum sits 4 h before `p` and its maximum 4 h after. The
 * minimum is anchored `CIRCADIAN_TROUGH_OFFSET_H` (10.5 h) after median
 * midsleep, which puts it in the early afternoon (the documented post-lunch
 * dip) and puts `p` at midsleep + 14.5 h — 17:30 for a 23:00–07:00 sleeper,
 * inside the 16.8–18 h range the three-process and UMP literatures use. The
 * maximum then lands ~21:30, which is the evening wake-maintenance zone.
 *
 * The *combined* afternoon trough is not the circadian minimum: it is where the
 * circadian recovery finally outruns the still-rising sleep pressure,
 * `w_C·C′(t) = w_S·S′(t)`, ≈ 7.5–8 h after a normal wake. That interaction is
 * the whole point of a two-process model, and it is why this curve can be
 * argued with while a battery gauge cannot.
 *
 * **Sleep inertia** decays over ~90 min after wake (an exponential with a 30-min
 * time constant is ~95 % gone by then).
 *
 * **Caffeine** enters as a *multiplicative* factor: a one-compartment oral model
 * with first-order absorption (`ka` solved from the ~40 min time to peak) and a
 * ~5 h elimination half-life, dose from the log entry or a 95 mg default when
 * only a time was logged. Bedtime caffeine therefore raises predicted
 * late-evening energy in the same run in which `sleep.caffeineCheck` warns
 * about it — the two modules describe one physiology.
 *
 * Start-of-day capacity is scaled by `(100 − osi)/100` and yesterday's training
 * load, so a hard session or a bad night lowers the whole curve rather than
 * only its start.
 *
 * ## Output
 *
 * `forecast[]` at 15-minute steps from wake to bed, each point carrying its
 * `lo`/`hi`; `trough` (the afternoon dip and its clock time); `bedtimeReadyAt`;
 * `caffeineActiveMg` right now; a driver list ("4 h of sleep debt", "200 mg
 * caffeine at 14:30"); and a `confidence` that **widens as inputs go missing**.
 *
 * Sims (1h): the curve is monotone-decreasing in S between doses, peaks after
 * each dose, and its trough lands 6–9 h after wake in ≥ 90% of seeds.
 *
 * `now` is a **parameter**: nothing in `engine/` reads the clock.
 *
 * Sources
 *   Borbély 1982 / Daan, Beersma & Borbély 1984   the two-process model
 *   Rajaraman et al. 2008 (UMP)                   the five circadian harmonics
 *   Åkerstedt & Folkard 1997 (three-process)      p in the 16.8–18 h range
 *   Jewett et al. 1999                            sleep inertia over ~90 min
 *   Institute of Medicine 2001 / Benowitz 1990    caffeine t½ ≈ 5 h, tmax ≈ 40 min
 * Everything mapping those to a 0–100 "energy" number — the two process
 * weights, the raw→0–100 window, the caffeine gain, the capacity scaling and
 * the sleep-ready drop — is a **labelled heuristic**: there is no published
 * calibration from a two-process state to a consumer energy score, and any
 * product that implies otherwise (including Garmin's) is overclaiming.
 */
import type {
  AppSettings,
  DailyRecord,
  EnergyContext,
  EnergyPoint,
  HHMM,
  ISODate,
} from '../data/types';
import { addDays, diffDays, hhmmToMinutes, lastNDates, minutesToHHMM, minutesSinceNoon, minutesSinceNoonToHHMM } from '../lib/dates';
import { clamp, round } from '../lib/format';
import { median, quantile } from './stats';

/** Homeostatic rise time constant while awake, hours. */
export const TAU_RISE_H = 18;
/** Homeostatic decay time constant while asleep, hours. */
export const TAU_DECAY_H = 4.2;
/** Unified Model of Performance circadian harmonics a₁…a₅. */
export const CIRCADIAN_HARMONICS: readonly number[] = [0.97, 0.22, 0.07, 0.03, 0.001];
/** Sleep inertia decay after wake, minutes. */
export const SLEEP_INERTIA_MIN = 90;
/** Caffeine elimination half-life, hours (population mean; a heuristic here). */
export const CAFFEINE_HALF_LIFE_H = 5;
/** Time to peak plasma caffeine, minutes. */
export const CAFFEINE_ABSORPTION_MIN = 40;
/** Assumed dose when a caffeine time was logged without one, mg (≈ one coffee). */
export const CAFFEINE_DEFAULT_MG = 95;
/** Forecast resolution, minutes. */
export const FORECAST_STEP_MIN = 15;
/** Nights of bed/wake history the two processes are integrated over. */
export const ENERGY_HISTORY_NIGHTS = 14;

/**
 * Where the circadian waveform's own minimum sits relative to median midsleep,
 * hours. 10.5 h puts it in the early afternoon and puts the UMP phase parameter
 * `p` (4 h later) at 17:30 for a 23:00–07:00 sleeper. **Anchoring choice**, in
 * the range the literature uses.
 */
export const CIRCADIAN_TROUGH_OFFSET_H = 10.5;
/** The waveform's minimum is 4 h before its phase parameter `p`. */
const CIRCADIAN_MIN_BEFORE_PHASE_H = 4;

/** Weight on `1 − S` in the raw alertness sum. **Heuristic** (the unit scale). */
export const HOMEOSTATIC_WEIGHT = 1;
/**
 * Weight on the circadian waveform. **Heuristic.** At 0.28 the evening
 * wake-maintenance zone rises to just below the mid-morning peak, which is what
 * a normal sleeper reports; larger values make the evening the highest point of
 * the day and smaller ones erase the afternoon dip altogether.
 */
export const CIRCADIAN_WEIGHT = 0.28;
/** Depth of sleep inertia at the instant of waking, in raw units. **Heuristic.** */
export const SLEEP_INERTIA_DEPTH = 0.25;
/** Inertia time constant: a third of `SLEEP_INERTIA_MIN`, so ~95 % gone by 90 min. */
const INERTIA_TAU_MIN = SLEEP_INERTIA_MIN / 3;

/** Raw-sum values mapped to 0 and 100. **Heuristic** presentation scale. */
export const ENERGY_RAW_LO = 0.05;
export const ENERGY_RAW_HI = 0.95;

/** Caffeine: active mg that adds `CAFFEINE_GAIN` to the multiplier. **Heuristic.** */
export const CAFFEINE_REF_MG = 150;
export const CAFFEINE_GAIN = 0.3;
/** Ceiling on the caffeine multiplier — the alertness effect saturates. */
export const CAFFEINE_MAX_FACTOR = 1.35;

/** Capacity scaling: ±this much of the curve for an OSI of 0 vs 100. **Heuristic.** */
export const CAPACITY_OSI_GAIN = 0.25;
/** …and this much off for a maximal training day yesterday. **Heuristic.** */
export const CAPACITY_LOAD_GAIN = 0.15;
export const CAPACITY_MIN = 0.55;
export const CAPACITY_MAX = 1.1;

/** Sleep-ready = this far below the evening peak, as a fraction of it. */
export const BEDTIME_READY_DROP_FRAC = 0.1;
/** Minutes past the habitual bedtime the sleep gate is still searched for. */
const BEDTIME_SEARCH_EXTRA_MIN = 180;

/** Half-width of the band with every input present, points. **Heuristic.** */
export const ENERGY_BASE_HALF_WIDTH = 5;
/** Extra half-width per hour away from `now`. **Heuristic.** */
export const ENERGY_DRIFT_PER_H = 1.2;
/** The band never gets wider than this. */
export const ENERGY_MAX_HALF_WIDTH = 30;
/** Half-width cuts for the reported confidence. */
export const ENERGY_CONFIDENCE_CUTS = { high: 9, medium: 15 } as const;

/** Longest awake stretch the integrator will accept before it fills a night. */
const MAX_SLEEP_H = 16;

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const num = (v: unknown): number | null => (finite(v) ? v : null);

/**
 * The caller's "now", already split into a date and a clock time — the same
 * shape `context.ts` derives from its `now: Date` before entering the engine.
 */
export interface EnergyNow {
  d: ISODate;
  hhmm: HHMM;
}

export interface EnergyOpts {
  /** Forecast resolution; default `FORECAST_STEP_MIN`. */
  stepMin?: number;
  /** Overnight strain index for `now.d`, when it has already been computed. */
  osi?: number | null;
  /** Yesterday's training load, for the start-of-day scaling. */
  yesterdayLoad?: number | null;
}

const EMPTY_ENERGY: EnergyContext = {
  now: null,
  atWake: null,
  forecast: [],
  trough: null,
  bedtimeReadyAt: null,
  caffeineActiveMg: null,
  drivers: [],
  confidence: 'low',
};

// ---------------------------------------------------------------------------
// The two processes
// ---------------------------------------------------------------------------

/** Sleep pressure after `hours` awake from `s0`: `1 − (1 − s0)·e^{−h/τ_r}`. */
export function pressureAwake(s0: number, hours: number): number {
  if (!finite(s0) || !finite(hours) || hours <= 0) return clamp(finite(s0) ? s0 : 0, 0, 1);
  return clamp(1 - (1 - clamp(s0, 0, 1)) * Math.exp(-hours / TAU_RISE_H), 0, 1);
}

/** Sleep pressure after `hours` asleep from `s0`: `s0·e^{−h/τ_d}`. */
export function pressureAsleep(s0: number, hours: number): number {
  if (!finite(s0) || !finite(hours) || hours <= 0) return clamp(finite(s0) ? s0 : 0, 0, 1);
  return clamp(clamp(s0, 0, 1) * Math.exp(-hours / TAU_DECAY_H), 0, 1);
}

/**
 * The five-harmonic UMP circadian waveform at clock hour `t` for phase `p`,
 * both in hours. Range ≈ ±1.004; minimum at `p − 4 h`, maximum at `p + 4 h`.
 */
export function circadianC(clockHours: number, phaseH: number): number {
  if (!finite(clockHours) || !finite(phaseH)) return 0;
  const x = (2 * Math.PI * (clockHours - phaseH)) / 24;
  let sum = 0;
  for (let k = 1; k <= CIRCADIAN_HARMONICS.length; k++) sum += CIRCADIAN_HARMONICS[k - 1] * Math.sin(k * x);
  return sum;
}

/**
 * The 0–1 shape the forecast is built from, before capacity and caffeine:
 * `(w_S·(1 − S) + w_C·C − inertia − RAW_LO) / (RAW_HI − RAW_LO)`, clamped.
 *
 * Exported because it is the model: it is **strictly decreasing in `s`**, which
 * is the property `energy.sim.test.ts` asserts, and it lets a reader check the
 * curve by hand instead of trusting a gauge.
 */
export function energyShape(s: number, c: number, inertia = 0): number {
  const ss = finite(s) ? clamp(s, 0, 1) : 0.5;
  const cc = finite(c) ? c : 0;
  const ii = finite(inertia) ? Math.max(0, inertia) : 0;
  const raw = HOMEOSTATIC_WEIGHT * (1 - ss) + CIRCADIAN_WEIGHT * cc - ii;
  return clamp((raw - ENERGY_RAW_LO) / (ENERGY_RAW_HI - ENERGY_RAW_LO), 0, 1);
}

// ---------------------------------------------------------------------------
// Caffeine
// ---------------------------------------------------------------------------

const CAFFEINE_KE = Math.LN2 / CAFFEINE_HALF_LIFE_H;

/**
 * Absorption rate solved from the time to peak: `tmax = ln(ka/ke)/(ka − ke)`,
 * which is monotone decreasing in `ka`, so a bisection is exact enough and the
 * constant tracks `CAFFEINE_ABSORPTION_MIN` instead of being pasted in.
 */
function solveKa(tmaxH: number, ke: number): number {
  let lo = ke * 1.000001;
  let hi = 500;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const t = Math.log(mid / ke) / (mid - ke);
    if (t > tmaxH) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

const CAFFEINE_KA = solveKa(CAFFEINE_ABSORPTION_MIN / 60, CAFFEINE_KE);

/** One-compartment oral model: `D·(ka/(ka−ke))·(e^{−ke·t} − e^{−ka·t})`. */
function oralAmount(doseMg: number, hoursSince: number): number {
  if (!finite(doseMg) || doseMg <= 0 || !finite(hoursSince) || hoursSince < 0) return 0;
  const v =
    doseMg *
    (CAFFEINE_KA / (CAFFEINE_KA - CAFFEINE_KE)) *
    (Math.exp(-CAFFEINE_KE * hoursSince) - Math.exp(-CAFFEINE_KA * hoursSince));
  return finite(v) && v > 0 ? v : 0;
}

interface Dose {
  /** Minutes on the forecast's absolute axis. */
  at: number;
  mg: number;
  hhmm: HHMM;
}

function activeFromDoses(doses: readonly Dose[], atMinutes: number): number {
  let total = 0;
  for (const d of doses) {
    if (atMinutes < d.at) continue;
    total += oralAmount(d.mg, (atMinutes - d.at) / 60);
  }
  return total;
}

/**
 * Active caffeine in mg at `atMinutes` (minutes since midnight on the same
 * eating/waking day) given the day's logged times: first-order absorption
 * (peak at ~40 min) and a 5 h half-life. Exported separately because the
 * Energy card labels the current level and `sleep.caffeineCheck` needs the
 * same curve to reason about bedtime.
 */
export function caffeineActiveMg(
  times: readonly HHMM[] | undefined,
  atMinutes: number,
  doseMg = CAFFEINE_DEFAULT_MG,
): number {
  if (!Array.isArray(times) || times.length === 0 || !finite(atMinutes)) return 0;
  const doses: Dose[] = [];
  for (const t of times) {
    const m = hhmmToMinutes(t);
    if (m === null) continue;
    doses.push({ at: m, mg: finite(doseMg) && doseMg > 0 ? doseMg : CAFFEINE_DEFAULT_MG, hhmm: t });
  }
  return round(activeFromDoses(doses, atMinutes), 1);
}

// ---------------------------------------------------------------------------
// Nights
// ---------------------------------------------------------------------------

interface Night {
  /** The date the night's wake belongs to. */
  d: ISODate;
  /** Minutes on the absolute axis. */
  bedAbs: number;
  wakeAbs: number;
  /** Bed and wake clock minutes. */
  bedMin: number;
  wakeMin: number;
  /** False when the night was filled from the user's own medians. */
  logged: boolean;
}

/** Median of clock minutes, taken on the noon axis so bedtimes may wrap. */
function medianClock(mins: readonly number[]): number | null {
  if (mins.length === 0) return null;
  const noonAxis = mins.map((m) => minutesSinceNoon(minutesToHHMM(m))).filter((v): v is number => v !== null);
  const med = median(noonAxis);
  if (med === null) return null;
  return hhmmToMinutes(minutesSinceNoonToHHMM(med));
}

/** Bed clock minutes → the absolute bed time for a night waking on day index `i`. */
function bedAbsFor(dayIndex: number, bedMin: number): number {
  // A bedtime at or after noon belongs to the evening BEFORE the wake day.
  return bedMin >= 720 ? (dayIndex - 1) * 1440 + bedMin : dayIndex * 1440 + bedMin;
}

// ---------------------------------------------------------------------------
// Forecast
// ---------------------------------------------------------------------------

/**
 * Predicted-energy curve for the day containing `now`. Returns the empty
 * forecast (nulls, no points, `confidence: 'low'`) rather than a flat line
 * when there is no sleep history to anchor either process — a made-up curve is
 * worse than an absent one.
 */
export function energyForecast(
  records: DailyRecord[],
  settings: AppSettings,
  now: EnergyNow,
  opts?: EnergyOpts,
): EnergyContext {
  const profile = settings?.profile;
  const todayD = now?.d;
  if (typeof todayD !== 'string' || !profile) return { ...EMPTY_ENERGY, forecast: [], drivers: [] };

  const stepMin = Math.max(1, Math.floor(opts?.stepMin ?? FORECAST_STEP_MIN));
  const dates = lastNDates(todayD, ENERGY_HISTORY_NIGHTS);
  const base = dates[0];
  const idx = (d: ISODate) => diffDays(base, d);

  const byDate = new Map<ISODate, DailyRecord>();
  const loadRef: number[] = [];
  const refFrom = addDays(todayD, -60);
  for (const r of records ?? []) {
    if (typeof r?.d !== 'string') continue;
    if (r.d >= base && r.d <= todayD) byDate.set(r.d, r);
    if (r.d >= refFrom && r.d <= todayD) {
      const ld = num(r.ld);
      if (ld !== null && ld > 0) loadRef.push(ld);
    }
  }

  // -- 1. the nights ---------------------------------------------------------
  const logged: Night[] = [];
  for (const d of dates) {
    const r = byDate.get(d);
    if (!r) continue;
    const wakeMin = hhmmToMinutes(r.wk);
    const bedMin = hhmmToMinutes(r.bt);
    const i = idx(d);
    if (wakeMin !== null && bedMin !== null) {
      const wakeAbs = i * 1440 + wakeMin;
      const bedAbs = bedAbsFor(i, bedMin);
      const dur = (wakeAbs - bedAbs) / 60;
      if (dur > 0 && dur <= MAX_SLEEP_H) {
        logged.push({ d, bedAbs, wakeAbs, bedMin, wakeMin, logged: true });
        continue;
      }
    }
    // Fall back to hours slept against whichever clock time we do have.
    const slh = num(r.slh);
    if (slh !== null && slh > 0 && slh <= MAX_SLEEP_H) {
      const wm = wakeMin ?? hhmmToMinutes(profile.wakeTarget) ?? 7 * 60;
      const wakeAbs = i * 1440 + wm;
      const bedAbs = wakeAbs - slh * 60;
      logged.push({
        d,
        bedAbs,
        wakeAbs,
        bedMin: ((Math.round(bedAbs) % 1440) + 1440) % 1440,
        wakeMin: wm,
        logged: true,
      });
    }
  }

  if (logged.length === 0) return { ...EMPTY_ENERGY, forecast: [], drivers: [] };

  const medWake = medianClock(logged.map((n) => n.wakeMin)) ?? hhmmToMinutes(profile.wakeTarget) ?? 7 * 60;
  const medBed = medianClock(logged.map((n) => n.bedMin)) ?? hhmmToMinutes(profile.bedTarget) ?? 23 * 60;
  const medDurMin = median(logged.map((n) => n.wakeAbs - n.bedAbs)) ?? 8 * 60;

  // Fill every unlogged night from the user's own medians, so a gap in the log
  // is never integrated as a 40-hour day.
  const byNight = new Map<ISODate, Night>();
  for (const n of logged) byNight.set(n.d, n);
  const nights: Night[] = dates.map((d) => {
    const hit = byNight.get(d);
    if (hit) return hit;
    const i = idx(d);
    const wakeAbs = i * 1440 + medWake;
    return {
      d,
      bedAbs: bedAbsFor(i, medBed) > wakeAbs ? wakeAbs - medDurMin : bedAbsFor(i, medBed),
      wakeAbs,
      bedMin: medBed,
      wakeMin: medWake,
      logged: false,
    };
  });

  // -- 2. Process S over the whole history -----------------------------------
  // Seed at a mid value; 14 nights of alternating rise/decay wash it out (the
  // fixed point is reached to within 1e-3 after ~4 nights).
  let s = 0.35;
  for (let i = 0; i < nights.length; i++) {
    const n = nights[i];
    if (i > 0) {
      const awakeH = (n.bedAbs - nights[i - 1].wakeAbs) / 60;
      s = pressureAwake(s, Math.max(0, Math.min(30, awakeH)));
    }
    s = pressureAsleep(s, Math.max(0, Math.min(MAX_SLEEP_H, (n.wakeAbs - n.bedAbs) / 60)));
  }
  const sWake = s;

  const today = nights[nights.length - 1];
  const wakeAbs = today.wakeAbs;
  const todayLogged = today.logged;

  // -- 3. circadian phase from the 14-day median midsleep --------------------
  const midsleepMins = logged.map((n) => ((Math.round((n.bedAbs + n.wakeAbs) / 2) % 1440) + 1440) % 1440);
  const midsleepMin = medianClock(midsleepMins) ?? (medWake - medDurMin / 2 + 1440) % 1440;
  const phaseH = (midsleepMin / 60 + CIRCADIAN_TROUGH_OFFSET_H + CIRCADIAN_MIN_BEFORE_PHASE_H) % 24;

  // -- 4. today's bedtime ----------------------------------------------------
  let bedAbs = bedAbsFor(idx(todayD) + 1, medBed);
  if (bedAbs <= wakeAbs) bedAbs += 1440;
  if (bedAbs - wakeAbs > 20 * 60) bedAbs = wakeAbs + 20 * 60;
  if (bedAbs - wakeAbs < 8 * 60) bedAbs = wakeAbs + 8 * 60;

  // -- 5. caffeine doses (today's and yesterday's evening) -------------------
  const doses: Dose[] = [];
  for (const d of [addDays(todayD, -1), todayD]) {
    const r = byDate.get(d);
    if (!r || !Array.isArray(r.caf)) continue;
    const i = idx(d);
    for (const t of r.caf) {
      const m = hhmmToMinutes(t);
      if (m === null) continue;
      doses.push({ at: i * 1440 + m, mg: CAFFEINE_DEFAULT_MG, hhmm: t });
    }
  }
  doses.sort((a, b) => a.at - b.at);

  // -- 6. capacity -----------------------------------------------------------
  const osi = num(opts?.osi);
  const yesterdayLoad = num(opts?.yesterdayLoad) ?? num(byDate.get(addDays(todayD, -1))?.ld);
  const loadHi = quantile(loadRef, 0.9);
  const loadNorm =
    yesterdayLoad === null || loadHi === null || loadHi <= 0 ? null : clamp(yesterdayLoad / loadHi, 0, 1);
  const capacity = clamp(
    1 +
      (osi === null ? 0 : (CAPACITY_OSI_GAIN * (50 - osi)) / 50) -
      (loadNorm === null ? 0 : CAPACITY_LOAD_GAIN * loadNorm),
    CAPACITY_MIN,
    CAPACITY_MAX,
  );

  // -- 7. `now` on the absolute axis ----------------------------------------
  const nowMin = hhmmToMinutes(now.hhmm);
  let nowAbs = nowMin === null ? wakeAbs : idx(todayD) * 1440 + nowMin;
  // A clock time well before today's wake is the small hours of the NEXT day.
  if (nowAbs < wakeAbs - 120) nowAbs += 1440;

  // -- 8. the curve ----------------------------------------------------------
  const valueAt = (t: number): number => {
    const awakeH = Math.max(0, (t - wakeAbs) / 60);
    const sT = pressureAwake(sWake, awakeH);
    const clockH = ((((t % 1440) + 1440) % 1440) / 60);
    const c = circadianC(clockH, phaseH);
    const inertia = SLEEP_INERTIA_DEPTH * Math.exp(-(t - wakeAbs) / INERTIA_TAU_MIN);
    const shape = energyShape(sT, c, Math.max(0, inertia));
    const active = activeFromDoses(doses, t);
    const factor = Math.min(CAFFEINE_MAX_FACTOR, 1 + (CAFFEINE_GAIN * active) / CAFFEINE_REF_MG);
    return clamp(100 * capacity * shape * factor, 0, 100);
  };

  // Half-width: the base plus a penalty per missing input, widening with the
  // distance from `now`. This is the number that makes the chart honest.
  const nightsLogged = logged.length;
  let half = ENERGY_BASE_HALF_WIDTH;
  half += 8 * (1 - nightsLogged / ENERGY_HISTORY_NIGHTS);
  if (!todayLogged) half += 5;
  if (osi === null) half += 4;
  if (yesterdayLoad === null) half += 2;
  if (doses.length === 0) half += 2;
  const halfAt = (t: number): number =>
    Math.min(ENERGY_MAX_HALF_WIDTH, half + (ENERGY_DRIFT_PER_H * Math.abs(t - nowAbs)) / 60);

  const forecast: EnergyPoint[] = [];
  for (let t = wakeAbs; t <= bedAbs; t += stepMin) {
    const v = valueAt(t);
    const w = halfAt(t);
    forecast.push({
      hhmm: minutesToHHMM(((t % 1440) + 1440) % 1440),
      value: round(v, 1),
      lo: round(clamp(v - w, 0, 100), 1),
      hi: round(clamp(v + w, 0, 100), 1),
    });
  }

  // -- 9. trough: the lowest INTERIOR point of the waking day ----------------
  let trough: EnergyContext['trough'] = null;
  let troughIndex = -1;
  if (forecast.length >= 3) {
    let bi = 1;
    for (let i = 2; i < forecast.length - 1; i++) {
      if (forecast[i].value < forecast[bi].value) bi = i;
    }
    troughIndex = bi;
    trough = { hhmm: forecast[bi].hhmm, value: forecast[bi].value };
  }

  // -- 10. the sleep gate: the first sustained fall off the evening peak -----
  let bedtimeReadyAt: HHMM | null = null;
  {
    const end = bedAbs + BEDTIME_SEARCH_EXTRA_MIN;
    // The evening peak is the highest point after the afternoon trough.
    const troughAbs = troughIndex < 0 ? wakeAbs : wakeAbs + troughIndex * stepMin;
    let peak = -Infinity;
    let peakAt = troughAbs;
    for (let t = troughAbs; t <= end; t += stepMin) {
      const v = valueAt(t);
      if (v > peak) {
        peak = v;
        peakAt = t;
      }
    }
    const threshold = peak * (1 - BEDTIME_READY_DROP_FRAC);
    for (let t = peakAt; t <= end; t += stepMin) {
      if (valueAt(t) <= threshold) {
        bedtimeReadyAt = minutesToHHMM(((t % 1440) + 1440) % 1440);
        break;
      }
    }
  }

  // -- 11. drivers -----------------------------------------------------------
  const todayRec = byDate.get(todayD);
  const drivers: string[] = [];
  const debt = num(todayRec?.dbt);
  const slept = num(todayRec?.slh) ?? (today.wakeAbs - today.bedAbs) / 60;
  if (debt !== null && debt >= 30) drivers.push(`${round(debt / 60, 1)} h of sleep debt`);
  if (slept > 0) drivers.push(`slept ${round(slept, 1)} h`);
  if (osi !== null) drivers.push(`overnight strain ${round(osi)} of 100`);
  if (loadNorm !== null && loadNorm >= 0.7) drivers.push('hard training day yesterday');
  for (const dose of doses.filter((x) => x.at >= idx(todayD) * 1440).slice(0, 3)) {
    drivers.push(`${dose.mg} mg caffeine at ${dose.hhmm}`);
  }
  if (trough) drivers.push(`predicted dip around ${trough.hhmm}`);
  if (nightsLogged < ENERGY_HISTORY_NIGHTS) {
    drivers.push(`${nightsLogged} of ${ENERGY_HISTORY_NIGHTS} nights logged — the band is wider for it`);
  }

  const confidence: EnergyContext['confidence'] =
    half <= ENERGY_CONFIDENCE_CUTS.high ? 'high' : half <= ENERGY_CONFIDENCE_CUTS.medium ? 'medium' : 'low';

  return {
    now: round(valueAt(clamp(nowAbs, wakeAbs, bedAbs + BEDTIME_SEARCH_EXTRA_MIN)), 1),
    atWake: forecast.length > 0 ? forecast[0].value : null,
    forecast,
    trough,
    bedtimeReadyAt,
    caffeineActiveMg: round(activeFromDoses(doses, nowAbs), 1),
    drivers,
    confidence,
  };
}
