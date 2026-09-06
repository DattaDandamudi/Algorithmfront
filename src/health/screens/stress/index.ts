/**
 * Public surface of the stress / energy / impact UI (Phase 2g).
 *
 * Every component here is presentational and prop-driven: nothing imports the
 * engine, nothing reads the clock, and each one renders a sensible state when
 * its context block is `undefined` or every field inside it is `null`. Today
 * (2b) uses `StressStrip` + `EnergyCard`; Trends (2c) uses `StressCard`,
 * `ResilienceCard` and `ImpactCard`.
 */
export { default as StressStrip, CHECK_IN_PROMPT, CHECK_IN_HINT, CHECK_IN_CTA, ILLNESS_NOTE } from './StressStrip';
export type { StressStripProps } from './StressStrip';

export { default as StressCard } from './StressCard';
export type { StressCardProps } from './StressCard';

export { default as SignalDots } from './SignalDots';
export type { SignalDotsProps } from './SignalDots';

export { default as ResilienceCard, AL_STYLE_NOTE } from './ResilienceCard';
export type { ResilienceCardProps } from './ResilienceCard';

export { default as EnergyCard } from './EnergyCard';
export type { EnergyCardProps } from './EnergyCard';

export { default as ImpactCard, MIN_DAYS_NOTE } from './ImpactCard';
export type { ImpactCardProps } from './ImpactCard';

export {
  ENERGY_CAPTION,
  HOOPER_MAX,
  HOOPER_MIN,
  IMPACT_CAVEAT,
  SIGNAL_LABEL,
  SIGNAL_UNIT,
  balanceBand,
  balanceLine,
  calibratingLine,
  ciBar,
  ciText,
  daysLine,
  effectValueText,
  energyGeometry,
  formatZ,
  hooperBandWord,
  hooperTotalText,
  resilienceBandWord,
  shrinkageLine,
  signalDirection,
  signalLabel,
  signalStateText,
  signalTone,
  signalValueText,
  signalsLine,
  strengthWord,
  stressBandWord,
  troughLine,
  unwrapMinutes,
  worseRunLine,
} from './format';
export type { CiBarGeometry, DatedBand, DatedPoint, EnergyGeometry, EnergyLayout, EnergyXTick, ToneWord } from './format';
