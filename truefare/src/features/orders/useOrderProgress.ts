import { useEffect, useState } from 'react';
import { createRng } from '../../lib/rng';
import type { OrderRecord } from '../../lib/datastore/types';

export interface OrderStage {
  key: string;
  label: string;
  at: number; // progress fraction where this stage begins
}

export const ORDER_STAGES: OrderStage[] = [
  { key: 'confirmed', label: 'Order confirmed', at: 0 },
  { key: 'preparing', label: 'Kitchen is on it', at: 0.08 },
  { key: 'courier', label: 'Courier assigned', at: 0.35 },
  { key: 'pickup', label: 'Picked up', at: 0.5 },
  { key: 'enroute', label: 'Out for delivery', at: 0.6 },
  { key: 'delivered', label: 'Delivered', at: 0.95 },
];

const COURIERS = ['Maya', 'Jordan', 'Priya', 'Diego', 'Aisha', 'Theo', 'Nina', 'Sam'];
const VEHICLES = ['on a bike', 'on a scooter', 'in a car'];

export interface OrderProgress {
  /** 0–1 across the whole delivery. */
  progress: number;
  stageIndex: number;
  stage: OrderStage;
  delivered: boolean;
  /** Display countdown, scaled to the quoted ETA. */
  remainingMinutes: number;
  courier: { name: string; vehicle: string };
  /** Total simulated duration in ms (the delivery plays out in ~2.5–4 min). */
  totalMs: number;
}

export function orderProgressOf(order: OrderRecord, now: number): OrderProgress {
  const etaMid = Math.round((order.quote.etaMinutes.min + order.quote.etaMinutes.max) / 2);
  // 20-minute ETA plays out in ~150s; every extra ETA minute adds 3s.
  const totalMs = (150 + Math.max(0, Math.min(30, etaMid - 20)) * 3) * 1000;
  const elapsed = now - new Date(order.placedAt).getTime();
  const progress = Math.max(0, Math.min(1, elapsed / totalMs));
  let stageIndex = 0;
  for (let i = 0; i < ORDER_STAGES.length; i++) {
    if (progress >= ORDER_STAGES[i].at) stageIndex = i;
  }
  const delivered = progress >= 1;
  const rng = createRng(`courier:${order.id}`);
  return {
    progress,
    stageIndex,
    stage: ORDER_STAGES[stageIndex],
    delivered,
    remainingMinutes: delivered ? 0 : Math.max(1, Math.ceil((1 - progress) * etaMid)),
    courier: { name: rng.pick(COURIERS), vehicle: rng.pick(VEHICLES) },
    totalMs,
  };
}

/** Live-ticking progress; survives refresh because it's elapsed-time based. */
export function useOrderProgress(order: OrderRecord | undefined): OrderProgress | null {
  const [now, setNow] = useState(() => Date.now());
  const done = order ? orderProgressOf(order, now).delivered : true;

  useEffect(() => {
    if (!order || done) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [order, done]);

  return order ? orderProgressOf(order, now) : null;
}
