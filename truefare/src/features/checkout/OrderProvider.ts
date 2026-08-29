import { getDataStore } from '../../lib/datastore';
import type { OrderAddress, OrderRecord } from '../../lib/datastore/types';
import type { CartItem, MetroId, Platform } from '../catalog/types';
import { ProviderNotConfiguredError } from '../pricing/QuoteProvider';
import type { ProviderQuote } from '../pricing/types';

export interface PlaceOrderRequest {
  restaurantId: string;
  platform: Platform;
  items: CartItem[];
  quote: ProviderQuote; // the frozen, re-quoted price the user accepted
  metroId: MetroId;
  address: OrderAddress;
}

/**
 * The checkout seam, mirroring the pricing seam: SimulationOrderProvider
 * records the order locally and the tracking screen plays it out;
 * MealMeOrderProvider maps to MealMe's Create Order with place_order=true
 * — same interface, zero UI changes to go live.
 */
export interface OrderProvider {
  readonly id: 'simulation' | 'mealme';
  placeOrder(req: PlaceOrderRequest): Promise<OrderRecord>;
}

export class SimulationOrderProvider implements OrderProvider {
  readonly id = 'simulation' as const;

  async placeOrder(req: PlaceOrderRequest): Promise<OrderRecord> {
    const order: OrderRecord = {
      id: `ord-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      restaurantId: req.restaurantId,
      platform: req.platform,
      items: req.items,
      quote: req.quote,
      totalCents: req.quote.total_cents,
      metroId: req.metroId,
      rulesVersion: req.quote.meta.rulesVersion,
      placedAt: new Date().toISOString(),
      address: req.address,
    };
    const store = getDataStore();
    await store.recordOrder(order);
    await Promise.all(
      req.items.map((i) =>
        store.logEvent({
          itemId: i.itemId,
          restaurantId: req.restaurantId,
          type: 'order',
          at: order.placedAt,
        })
      )
    );
    return order;
  }
}

export class MealMeOrderProvider implements OrderProvider {
  readonly id = 'mealme' as const;

  constructor(readonly apiKey?: string) {}

  async placeOrder(req: PlaceOrderRequest): Promise<OrderRecord> {
    void req;
    // Real implementation: POST MealMe Create Order with place_order=true
    // (docs.mealme.ai/docs/create-order) via a backend proxy holding the
    // Id-Token, then map the response into an OrderRecord.
    throw new ProviderNotConfiguredError(
      this.id,
      'in-app checkout via MealMe requires an API key and backend proxy'
    );
  }
}

let active: OrderProvider | null = null;

export function getOrderProvider(): OrderProvider {
  if (!active) active = new SimulationOrderProvider();
  return active;
}

export function setOrderProvider(provider: OrderProvider): void {
  active = provider;
}
