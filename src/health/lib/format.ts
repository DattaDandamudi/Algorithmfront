/** Number formatting helpers. Keep UI numerals consistent (tabular-nums is applied via CSS). */

export const LB_PER_KG = 2.2046226218;

export function lbToKg(lb: number): number {
  return lb / LB_PER_KG;
}

export function kgToLb(kg: number): number {
  return kg * LB_PER_KG;
}

export function round(n: number, dp = 0): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

export function fmt(n: number | null | undefined, dp = 0, fallback = '—'): string {
  if (n === null || n === undefined || Number.isNaN(n)) return fallback;
  return n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

/** Signed delta with ▲/▼ glyph, e.g. "▲ 3 ms". */
export function fmtDelta(delta: number | null | undefined, dp = 0, unit = ''): string {
  if (delta === null || delta === undefined || Number.isNaN(delta)) return '—';
  if (Math.abs(delta) < 0.5 / 10 ** dp) return `• 0${unit ? ` ${unit}` : ''}`;
  const glyph = delta > 0 ? '▲' : '▼';
  return `${glyph} ${fmt(Math.abs(delta), dp)}${unit ? ` ${unit}` : ''}`;
}

export function fmtSigned(n: number | null | undefined, dp = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const s = fmt(Math.abs(n), dp);
  return n > 0 ? `+${s}` : n < 0 ? `−${s}` : s;
}

/** Weight in the user's unit. */
export function fmtWeight(lb: number | null | undefined, units: 'lb' | 'kg', dp = 1): string {
  if (lb === null || lb === undefined) return '—';
  return units === 'kg' ? `${fmt(lbToKg(lb), dp)} kg` : `${fmt(lb, dp)} lb`;
}

export function fmtHours(h: number | null | undefined): string {
  if (h === null || h === undefined || Number.isNaN(h)) return '—';
  const whole = Math.floor(h);
  const mins = Math.round((h - whole) * 60);
  if (mins === 60) return `${whole + 1}h 00m`;
  return `${whole}h ${mins < 10 ? '0' : ''}${mins}m`;
}

export function fmtMinutes(min: number | null | undefined): string {
  if (min === null || min === undefined || Number.isNaN(min)) return '—';
  const m = Math.round(min);
  if (Math.abs(m) < 60) return `${m} min`;
  const h = Math.floor(Math.abs(m) / 60);
  const r = Math.abs(m) % 60;
  return `${m < 0 ? '−' : ''}${h}h ${r < 10 ? '0' : ''}${r}m`;
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function mean(xs: number[]): number | null {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Sample standard deviation (n − 1). Returns null for n < 2. */
export function stddev(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = mean(xs) as number;
  const v = xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

export function uid(prefix = ''): string {
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return prefix ? `${prefix}_${rnd}` : rnd;
}
