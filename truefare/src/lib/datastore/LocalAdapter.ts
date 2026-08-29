import type {
  DataStore,
  OrderRecord,
  ProfileRecord,
  TrackedEvent,
  TrendingEntry,
} from './types';

const KEYS = {
  profile: 'tf:v1:profile-record',
  orders: 'tf:v1:orders',
  events: 'tf:v1:events',
} as const;

const ORDER_CAP = 100;
const EVENT_CAP = 500;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota/private-mode failures degrade silently — guest mode is best-effort.
  }
}

/** Guest mode: everything stays in this browser. */
export class LocalAdapter implements DataStore {
  readonly mode = 'local' as const;

  async getProfile(): Promise<ProfileRecord | null> {
    return read<ProfileRecord | null>(KEYS.profile, null);
  }

  async saveProfile(p: ProfileRecord): Promise<void> {
    write(KEYS.profile, p);
  }

  async listOrders(): Promise<OrderRecord[]> {
    return read<OrderRecord[]>(KEYS.orders, []);
  }

  async recordOrder(o: OrderRecord): Promise<void> {
    const orders = [o, ...(await this.listOrders())].slice(0, ORDER_CAP);
    write(KEYS.orders, orders);
  }

  async logEvent(e: TrackedEvent): Promise<void> {
    const events = [e, ...read<TrackedEvent[]>(KEYS.events, [])].slice(0, EVENT_CAP);
    write(KEYS.events, events);
  }

  async listRecentEvents(limit: number): Promise<TrackedEvent[]> {
    return read<TrackedEvent[]>(KEYS.events, []).slice(0, limit);
  }

  async getTrending(): Promise<TrendingEntry[] | null> {
    return null; // one browser can't know what's trending across users
  }
}
