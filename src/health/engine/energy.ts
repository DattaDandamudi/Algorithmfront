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
 * **Process C** (circadian): the five-harmonic waveform from the Unified Model
 * of Performance, `a₁…a₅ = 0.97, 0.22, 0.07, 0.03, 0.001`, phase-anchored to
 * the **14-day median midsleep** rather than to clock time, so a late
 * chronotype's trough lands where theirs actually is.
 *
 * **Sleep inertia** decays over ~90 min after wake.
 *
 * **Caffeine** enters as a *multiplicative* factor: first-order absorption with
 * a ~40 min time to peak and a ~5 h elimination half-life, dose from the log
 * entry or a 95 mg default when only a time was logged. Bedtime caffeine
 * therefore raises predicted late-evening energy in the same run in which
 * `sleep.caffeineCheck` warns about it — the two modules describe one physiology.
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
 */
import type {
  AppSettings,
  DailyRecord,
  EnergyContext,
  HHMM,
  ISODate,
} from '../data/types';

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

/** Keeps stub parameters live for `noUnusedParameters`; delete with the TODOs. */
function pending(...args: unknown[]): void {
  void args;
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
  // TODO(phase-1h): implement per plan §1h.
  pending(records, settings, now, opts);
  return { ...EMPTY_ENERGY, forecast: [], drivers: [] };
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
  // TODO(phase-1h): implement per plan §1h.
  pending(times, atMinutes, doseMg);
  return 0;
}
