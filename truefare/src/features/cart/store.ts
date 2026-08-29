import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CartItem } from '../catalog/types';

interface PendingAdd {
  restaurantId: string;
  itemId: string;
}

interface CartState {
  restaurantId: string | null;
  items: CartItem[];
  /** Set when adding from a different restaurant — drives the replace modal. */
  pendingReplace: PendingAdd | null;
  add: (restaurantId: string, itemId: string) => boolean; // false ⇒ needs replace confirm
  confirmReplace: () => void;
  cancelReplace: () => void;
  increment: (itemId: string) => void;
  decrement: (itemId: string) => void;
  remove: (itemId: string) => void;
  clear: () => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      restaurantId: null,
      items: [],
      pendingReplace: null,

      add: (restaurantId, itemId) => {
        const { restaurantId: current, items } = get();
        if (current && current !== restaurantId && items.length > 0) {
          set({ pendingReplace: { restaurantId, itemId } });
          return false;
        }
        set((s) => {
          const existing = s.items.find((i) => i.itemId === itemId);
          return {
            restaurantId,
            items: existing
              ? s.items.map((i) =>
                  i.itemId === itemId ? { ...i, qty: i.qty + 1 } : i
                )
              : [...s.items, { itemId, qty: 1 }],
          };
        });
        return true;
      },

      confirmReplace: () => {
        const pending = get().pendingReplace;
        if (!pending) return;
        set({
          restaurantId: pending.restaurantId,
          items: [{ itemId: pending.itemId, qty: 1 }],
          pendingReplace: null,
        });
      },

      cancelReplace: () => set({ pendingReplace: null }),

      increment: (itemId) =>
        set((s) => ({
          items: s.items.map((i) => (i.itemId === itemId ? { ...i, qty: i.qty + 1 } : i)),
        })),

      decrement: (itemId) =>
        set((s) => {
          const items = s.items
            .map((i) => (i.itemId === itemId ? { ...i, qty: i.qty - 1 } : i))
            .filter((i) => i.qty > 0);
          return { items, restaurantId: items.length ? s.restaurantId : null };
        }),

      remove: (itemId) =>
        set((s) => {
          const items = s.items.filter((i) => i.itemId !== itemId);
          return { items, restaurantId: items.length ? s.restaurantId : null };
        }),

      clear: () => set({ restaurantId: null, items: [] }),
    }),
    { name: 'tf:v1:cart', partialize: (s) => ({ restaurantId: s.restaurantId, items: s.items }) }
  )
);

export const cartCount = (items: CartItem[]) => items.reduce((n, i) => n + i.qty, 0);
