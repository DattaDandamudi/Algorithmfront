import type { Platform } from '../catalog/types';
import type { ProviderQuote } from '../pricing/types';

export type CompareSort = 'cheapest' | 'fastest' | 'best';

export function okQuotes(quotes: (ProviderQuote | undefined)[]): ProviderQuote[] {
  return quotes.filter((q): q is ProviderQuote => q != null && q.status === 'ok');
}

export function winnerOf(
  quotes: (ProviderQuote | undefined)[],
  sort: CompareSort
): ProviderQuote | null {
  const ok = okQuotes(quotes);
  if (!ok.length) return null;
  return [...ok].sort(comparator(sort, ok))[0];
}

/** Spread between the cheapest and priciest platform for this cart. */
export function savingsSpread(quotes: (ProviderQuote | undefined)[]): number {
  const ok = okQuotes(quotes);
  if (ok.length < 2) return 0;
  const totals = ok.map((q) => q.total_cents);
  return Math.max(...totals) - Math.min(...totals);
}

export function comparator(
  sort: CompareSort,
  all: ProviderQuote[]
): (a: ProviderQuote, b: ProviderQuote) => number {
  if (sort === 'cheapest') return (a, b) => a.total_cents - b.total_cents;
  if (sort === 'fastest') return (a, b) => a.etaMinutes.min - b.etaMinutes.min;
  // best value: 0.7·price rank + 0.3·eta rank
  const priceRank = rankMap(all, (q) => q.total_cents);
  const etaRank = rankMap(all, (q) => q.etaMinutes.min);
  const score = (q: ProviderQuote) =>
    0.7 * (priceRank.get(q.platform) ?? 0) + 0.3 * (etaRank.get(q.platform) ?? 0);
  return (a, b) => score(a) - score(b);
}

function rankMap(
  quotes: ProviderQuote[],
  key: (q: ProviderQuote) => number
): Map<Platform, number> {
  const sorted = [...quotes].sort((a, b) => key(a) - key(b));
  return new Map(sorted.map((q, i) => [q.platform, i]));
}
