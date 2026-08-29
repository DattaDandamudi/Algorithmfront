import { create } from 'zustand';

interface SessionSignals {
  viewedItemIds: string[]; // last 20, most recent first — ephemeral
  markViewed: (itemId: string) => void;
}

/** In-memory session signals; deliberately not persisted. */
export const useSessionStore = create<SessionSignals>((set) => ({
  viewedItemIds: [],
  markViewed: (itemId) =>
    set((s) => ({
      viewedItemIds: [itemId, ...s.viewedItemIds.filter((i) => i !== itemId)].slice(0, 20),
    })),
}));
