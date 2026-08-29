import { useQuery } from '@tanstack/react-query';
import { getDataStore } from '../../lib/datastore';
import type { OrderRecord } from '../../lib/datastore/types';

export function useOrders() {
  const { data } = useQuery({
    queryKey: ['orders'],
    queryFn: () => getDataStore().listOrders(),
    staleTime: 10_000,
  });
  return data ?? [];
}

export function useOrder(id: string | undefined): OrderRecord | undefined {
  const orders = useOrders();
  return id ? orders.find((o) => o.id === id) : undefined;
}
