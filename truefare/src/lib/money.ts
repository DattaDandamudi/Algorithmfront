/** All money in TrueFare is integer cents. Formatting happens only at render. */

export function formatCents(cents: number, opts: { sign?: boolean } = {}): string {
  const sign = cents < 0 ? '-' : opts.sign ? '+' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  return `${sign}$${dollars}.${rem.toString().padStart(2, '0')}`;
}

/** Apply a percentage expressed in basis points to a cents amount. */
export function applyBps(cents: number, bps: number): number {
  return Math.round((cents * bps) / 10_000);
}

export function clampCents(cents: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, cents));
}

/**
 * Round a cents amount to a "psychological" menu ending (.49 / .79 / .99),
 * picking the nearest of the three. Used when materializing per-platform
 * menu prices from base price × markup.
 */
export function psychRound(cents: number): number {
  const dollars = Math.floor(cents / 100);
  const rem = cents % 100;
  const endings = [49, 79, 99];
  let best = endings[0];
  let bestDist = Infinity;
  for (const e of endings) {
    const dist = Math.abs(rem - e);
    if (dist < bestDist) {
      bestDist = dist;
      best = e;
    }
  }
  // If rounding down past the dollar boundary reads better (e.g. rem 05 → prev .99)
  const prevNinetyNine = dollars > 0 ? (dollars - 1) * 100 + 99 : 49;
  const candidate = dollars * 100 + best;
  return Math.abs(cents - prevNinetyNine) < Math.abs(cents - candidate)
    ? prevNinetyNine
    : candidate;
}
