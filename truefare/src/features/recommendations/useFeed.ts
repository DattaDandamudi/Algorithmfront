import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getDataStore } from '../../lib/datastore';
import { currentDaypart } from '../../lib/time';
import { useCatalog } from '../catalog/useCatalog';
import { useCartStore } from '../cart/store';
import { useProfileStore } from '../profile/store';
import { buildFeed, type FeedRowData } from './feed';
import { buildProfile } from './profile';
import { seededTrending, type ScoreContext } from './score';
import { useSessionStore } from './sessionStore';

export function useFeed(): { rows: FeedRowData[]; isWarm: boolean } {
  const catalog = useCatalog();
  const dietary = useProfileStore((s) => s.dietary);
  const cartItems = useCartStore((s) => s.items);
  const viewedItemIds = useSessionStore((s) => s.viewedItemIds);

  const { data: events } = useQuery({
    queryKey: ['events'],
    queryFn: () => getDataStore().listRecentEvents(200),
    staleTime: 30_000,
  });

  const { data: remoteTrending } = useQuery({
    queryKey: ['trending'],
    queryFn: () => getDataStore().getTrending(),
    staleTime: 5 * 60_000,
  });

  const profile = useMemo(
    () => buildProfile(events ?? [], catalog),
    [events, catalog]
  );

  const rows = useMemo(() => {
    const hourStamp = Math.floor(Date.now() / 3_600_000);
    const trending = remoteTrending?.length
      ? new Map(remoteTrending.map((t) => [t.itemId, t.score]))
      : seededTrending(
          catalog.items.map((i) => i.id),
          (id) => catalog.itemsById.get(id)?.popularity ?? 0,
          hourStamp
        );
    const sessionTags = new Set<string>();
    for (const id of viewedItemIds.slice(0, 5)) {
      catalog.itemsById.get(id)?.tags.forEach((t) => sessionTags.add(t));
    }
    const cartCuisines = new Set<string>();
    for (const ci of cartItems) {
      const item = catalog.itemsById.get(ci.itemId);
      const r = item ? catalog.restaurantsById.get(item.restaurantId) : undefined;
      if (r) cartCuisines.add(r.cuisine);
    }
    const ctx: ScoreContext = {
      daypart: currentDaypart(),
      trending,
      sessionTags,
      cartCuisines,
      dietary,
    };
    return buildFeed(catalog, profile, ctx);
  }, [catalog, profile, remoteTrending, viewedItemIds, cartItems, dietary]);

  return { rows, isWarm: profile.eventCount >= 5 };
}
