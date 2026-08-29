import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Dietary, MembershipId, MetroId } from '../catalog/types';

export type Theme = 'light' | 'dark' | 'system';

interface ProfileState {
  metroId: MetroId;
  memberships: MembershipId[];
  hasAmazonPrime: boolean; // Grubhub+ is free with Prime
  dietary: Dietary[];
  theme: Theme;
  displayName: string;
  setMetro: (metro: MetroId) => void;
  toggleMembership: (m: MembershipId) => void;
  setAmazonPrime: (v: boolean) => void;
  toggleDietary: (d: Dietary) => void;
  setTheme: (t: Theme) => void;
  setDisplayName: (name: string) => void;
  /** Bulk-apply the account's remote profile after sign-in hydration. */
  hydrateFromRemote: (p: {
    displayName: string;
    metroId: MetroId;
    dietary: Dietary[];
    memberships: MembershipId[];
  }) => void;
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set) => ({
      metroId: 'sf',
      memberships: [],
      hasAmazonPrime: false,
      dietary: [],
      theme: 'system',
      displayName: '',
      setMetro: (metroId) => set({ metroId }),
      toggleMembership: (m) =>
        set((s) => ({
          memberships: s.memberships.includes(m)
            ? s.memberships.filter((x) => x !== m)
            : [...s.memberships, m],
        })),
      setAmazonPrime: (hasAmazonPrime) =>
        set((s) => ({
          hasAmazonPrime,
          // Prime includes Grubhub+ at $0 — reflect it in effective memberships.
          memberships:
            hasAmazonPrime && !s.memberships.includes('grubhub_plus')
              ? [...s.memberships, 'grubhub_plus']
              : s.memberships,
        })),
      toggleDietary: (d) =>
        set((s) => ({
          dietary: s.dietary.includes(d)
            ? s.dietary.filter((x) => x !== d)
            : [...s.dietary, d],
        })),
      setTheme: (theme) => set({ theme }),
      setDisplayName: (displayName) => set({ displayName }),
      hydrateFromRemote: (p) =>
        set({
          displayName: p.displayName,
          metroId: p.metroId,
          dietary: p.dietary,
          memberships: p.memberships,
        }),
    }),
    { name: 'tf:v1:profile' }
  )
);

/** Effective memberships (Prime grants Grubhub+). */
export function effectiveMemberships(s: {
  memberships: MembershipId[];
  hasAmazonPrime: boolean;
}): MembershipId[] {
  const set = new Set(s.memberships);
  if (s.hasAmazonPrime) set.add('grubhub_plus');
  return [...set];
}
