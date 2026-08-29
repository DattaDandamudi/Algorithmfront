import { getDataStore } from '../../lib/datastore';
import type { EventType } from '../../lib/datastore/types';

/**
 * Fire-and-forget behavioral signal. Every event feeds the taste profile
 * (and, when Supabase is connected, the cross-user trending view).
 */
export function logEvent(itemId: string, restaurantId: string, type: EventType): void {
  void getDataStore()
    .logEvent({ itemId, restaurantId, type, at: new Date().toISOString() })
    .catch(() => {});
}
