import { useQueries } from '@tanstack/react-query';
import { ALL_PLATFORMS, type Platform } from '../catalog/types';
import { getQuoteProvider } from './SimulationQuoteProvider';
import type { ProviderQuote, QuoteRequest } from './types';

export interface PlatformQuoteState {
  platform: Platform;
  quote: ProviderQuote | undefined;
  isLoading: boolean;
  isError: boolean;
}

/**
 * One independent query per platform, keyed on everything that changes a
 * price — so membership/tip/metro toggles automatically re-quote, and
 * each card resolves as soon as its promise lands.
 */
export function useQuotes(req: QuoteRequest | null, refreshKey = 0) {
  const provider = getQuoteProvider();
  const cartKey = req
    ? `${req.restaurantId}|${req.items.map((i) => `${i.itemId}x${i.qty}`).join(',')}`
    : 'empty';

  const queries = useQueries({
    queries: ALL_PLATFORMS.map((platform) => ({
      queryKey: [
        'quote',
        platform,
        cartKey,
        req?.metroId,
        [...(req?.memberships ?? [])].sort().join('+'),
        req?.tipPercent,
        req?.daypart,
        refreshKey,
      ],
      queryFn: () => provider.quotePlatform(req!, platform),
      enabled: req != null && req.items.length > 0,
      staleTime: 60_000,
    })),
  });

  const states: PlatformQuoteState[] = ALL_PLATFORMS.map((platform, i) => ({
    platform,
    quote: queries[i].data,
    isLoading: queries[i].isLoading || queries[i].isFetching,
    isError: queries[i].isError,
  }));

  return {
    states,
    allSettled: states.every((s) => !s.isLoading),
  };
}
