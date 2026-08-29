import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { OrderAddress } from '../../lib/datastore/types';

export interface SavedPayment {
  masked: string; // "•••• 4242"
  brand: string; // "Visa"
}

interface CheckoutState {
  address: OrderAddress | null;
  payment: SavedPayment | null;
  setAddress: (a: OrderAddress) => void;
  setPayment: (p: SavedPayment | null) => void;
}

export const useCheckoutStore = create<CheckoutState>()(
  persist(
    (set) => ({
      address: null,
      payment: null,
      setAddress: (address) => set({ address }),
      setPayment: (payment) => set({ payment }),
    }),
    { name: 'tf:v1:checkout' }
  )
);
