import type { CartItem, Dietary, MembershipId, MetroId, Platform } from '../../features/catalog/types';
import type { ProviderQuote } from '../../features/pricing/types';

export interface OrderAddress {
  label: string; // "Home", "Work"
  line1: string;
  city: string;
}

export interface OrderRecord {
  id: string;
  restaurantId: string;
  platform: Platform;
  items: CartItem[];
  /** Frozen quote snapshot — the exact math the user agreed to. */
  quote: ProviderQuote;
  totalCents: number;
  metroId: MetroId;
  rulesVersion: string;
  placedAt: string; // ISO
  address: OrderAddress;
}

export type EventType =
  | 'view'
  | 'open'
  | 'search_click'
  | 'add_to_cart'
  | 'compare_view'
  | 'handoff'
  | 'order';

export interface TrackedEvent {
  itemId: string;
  restaurantId: string;
  type: EventType;
  at: string; // ISO
}

export interface ProfileRecord {
  displayName: string;
  metroId: MetroId;
  dietary: Dietary[];
  memberships: MembershipId[];
}

export interface TrendingEntry {
  itemId: string;
  score: number;
}

/**
 * The persistence seam. LocalAdapter keeps everything in this browser
 * (guest mode); SupabaseAdapter syncs the same records to fd_* tables.
 * Consumers never know which is behind the interface.
 */
export interface DataStore {
  readonly mode: 'local' | 'supabase';
  getProfile(): Promise<ProfileRecord | null>;
  saveProfile(p: ProfileRecord): Promise<void>;
  listOrders(): Promise<OrderRecord[]>;
  recordOrder(o: OrderRecord): Promise<void>;
  logEvent(e: TrackedEvent): Promise<void>;
  listRecentEvents(limit: number): Promise<TrackedEvent[]>;
  /** Cross-user trending; null ⇒ caller falls back to seeded editorial. */
  getTrending(): Promise<TrendingEntry[] | null>;
}
