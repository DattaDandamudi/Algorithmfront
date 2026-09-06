/**
 * Engine barrel — every pure, deterministic engine module in one import.
 *
 *   import { buildCoachContext, hrvStatus, weeklyExpenditure } from '../engine';
 *
 * Modules (spec section each implements):
 *   stats         numeric primitives — every uncertainty number comes from here
 *   weight        §6.1 EWMA trend, weekly rate, target band (display trend)
 *   kalman        §1a local linear trend + RTS smoother (decision trend)
 *   expenditure   §6.2 reverse-calculated TDEE & calorie adjustment
 *   baseline      §0  "vs your 30-day average" deltas & series helpers
 *   hrv           §6.3 ln(rMSSD) baseline, SWC, Garmin-style bands
 *   readiness     §1/§6.3 readiness ring & training conversion
 *   sleep         §6.4 sleep need, debt, consistency, countdown, caffeine
 *   tobacco       §6.6 counts, streak, own-physiology comparison
 *   nutrition     §6.5 day type, macros, pacing, fat floor, late eating, hydration, frequency
 *   adherence     §3  heatmap grid, streaks, range-toggle aggregation
 *   micronutrients §6.7 lab follow-ups (display-only)
 *   exerciseDb    §1e exercise library, default program, volume landmarks
 *   load          §1e session load, Banister, ACWR, VO₂max, muscle recovery
 *   strength      §1e e1RM, PRs, plateaus, weekly volume, progression, deloads
 *   stress        §1h check-in, overnight strain, illness flag, resilience
 *   energy        §1h two-process predicted-energy forecast
 *   impact        §1i N-of-1 behaviour effects (shrunk, BH-corrected)
 *   changepoint   §1i BOCPD regime detection
 *   insights      §7  insight cards, coach chips, empty states
 *   context       CoachContext builder (this is what screens should call)
 *
 * Export names are unique across modules (checked in CI by `tsc` — an
 * ambiguous `export *` is a compile error), so nothing here is aliased.
 * `engine/simFixtures.ts` is deliberately absent: it is test-only, and nothing
 * in the app bundle should be able to reach it.
 */
export * from './stats';
export * from './weight';
export * from './kalman';
export * from './expenditure';
export * from './baseline';
export * from './hrv';
export * from './readiness';
export * from './sleep';
export * from './tobacco';
export * from './nutrition';
export * from './adherence';
export * from './micronutrients';
export * from './exerciseDb';
export * from './load';
export * from './strength';
export * from './stress';
export * from './energy';
export * from './impact';
export * from './changepoint';
export * from './insights';
export * from './context';
