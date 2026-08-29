import { getDataStore } from '../../lib/datastore';
import { dataStoreReady } from '../../lib/datastore/ready';
import type { EventType } from '../../lib/datastore/types';

/**
 * Fire-and-forget behavioral signal. Every event feeds the taste profile
 * (and, when Supabase is connected, the cross-user trending view).
 * Waits for the auth layer to pick the right store first, so a signed-in
 * user's early clicks never land in the guest store.
 */
export function logEvent(itemId: string, restaurantId: string, type: EventType): void {
  const at = new Date().toISOString();
  void dataStoreReady
    .then(() => getDataStore().logEvent({ itemId, restaurantId, type, at }))
    .catch(() => {});
}
