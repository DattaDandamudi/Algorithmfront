import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface RecentSearchState {
  recent: string[];
  paletteOpen: boolean;
  addRecent: (q: string) => void;
  removeRecent: (q: string) => void;
  clearRecent: () => void;
  setPaletteOpen: (open: boolean) => void;
}

/** Recent searches (LRU 10, case-insensitive dedupe) + palette open state. */
export const useSearchStore = create<RecentSearchState>()(
  persist(
    (set) => ({
      recent: [],
      paletteOpen: false,
      addRecent: (q) => {
        const trimmed = q.trim();
        if (trimmed.length < 2) return;
        set((s) => ({
          recent: [
            trimmed,
            ...s.recent.filter((r) => r.toLowerCase() !== trimmed.toLowerCase()),
          ].slice(0, 10),
        }));
      },
      removeRecent: (q) => set((s) => ({ recent: s.recent.filter((r) => r !== q) })),
      clearRecent: () => set({ recent: [] }),
      setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
    }),
    { name: 'tf:v1:recent-searches', partialize: (s) => ({ recent: s.recent }) }
  )
);
