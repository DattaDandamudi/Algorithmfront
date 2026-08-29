import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  DataStore,
  OrderRecord,
  ProfileRecord,
  TrackedEvent,
  TrendingEntry,
} from './types';

/**
 * Same records as LocalAdapter, persisted to the fd_* tables (owner-scoped
 * RLS). Thin column mapping only — behavior differences live nowhere.
 */
export class SupabaseAdapter implements DataStore {
  readonly mode = 'supabase' as const;

  constructor(
    private client: SupabaseClient,
    private userId: string
  ) {}

  async getProfile(): Promise<ProfileRecord | null> {
    const { data } = await this.client
      .from('fd_profiles')
      .select('display_name, metro_id, dietary, memberships')
      .eq('id', this.userId)
      .maybeSingle();
    if (!data) return null;
    return {
      displayName: data.display_name ?? '',
      metroId: data.metro_id,
      dietary: data.dietary ?? [],
      memberships: data.memberships ?? [],
    };
  }

  async saveProfile(p: ProfileRecord): Promise<void> {
    await this.client.from('fd_profiles').upsert({
      id: this.userId,
      display_name: p.displayName,
      metro_id: p.metroId,
      dietary: p.dietary,
      memberships: p.memberships,
      updated_at: new Date().toISOString(),
    });
  }

  async listOrders(): Promise<OrderRecord[]> {
    const { data } = await this.client
      .from('fd_orders')
      .select('*')
      .order('placed_at', { ascending: false })
      .limit(100);
    return (data ?? []).map((row) => ({
      id: row.id,
      restaurantId: row.restaurant_id,
      platform: row.platform,
      items: row.items,
      quote: row.quote,
      totalCents: row.total_cents,
      metroId: row.metro_id,
      rulesVersion: row.rules_version,
      placedAt: row.placed_at,
      address: row.address,
    }));
  }

  async recordOrder(o: OrderRecord): Promise<void> {
    await this.client.from('fd_orders').insert({
      id: o.id,
      user_id: this.userId,
      restaurant_id: o.restaurantId,
      platform: o.platform,
      items: o.items,
      quote: o.quote,
      total_cents: o.totalCents,
      metro_id: o.metroId,
      rules_version: o.rulesVersion,
      placed_at: o.placedAt,
      address: o.address,
    });
  }

  async logEvent(e: TrackedEvent): Promise<void> {
    await this.client.from('fd_events').insert({
      user_id: this.userId,
      item_id: e.itemId,
      restaurant_id: e.restaurantId,
      event_type: e.type,
      created_at: e.at,
    });
  }

  async listRecentEvents(limit: number): Promise<TrackedEvent[]> {
    const { data } = await this.client
      .from('fd_events')
      .select('item_id, restaurant_id, event_type, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    return (data ?? []).map((row) => ({
      itemId: row.item_id,
      restaurantId: row.restaurant_id,
      type: row.event_type,
      at: row.created_at,
    }));
  }

  async getTrending(): Promise<TrendingEntry[] | null> {
    const { data, error } = await this.client.rpc('fd_get_trending');
    if (error || !data?.length) return null;
    const max = Math.max(...data.map((r: { score: number }) => r.score));
    return data.map((r: { item_id: string; score: number }) => ({
      itemId: r.item_id,
      score: max > 0 ? r.score / max : 0,
    }));
  }
}
