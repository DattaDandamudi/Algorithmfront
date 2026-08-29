import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { getSupabase, isSupabaseConfigured } from '../../lib/supabase';
import { getDataStore, setDataStore } from '../../lib/datastore';
import { markDataStoreReady } from '../../lib/datastore/ready';
import { LocalAdapter } from '../../lib/datastore/LocalAdapter';
import { SupabaseAdapter } from '../../lib/datastore/SupabaseAdapter';
import { useProfileStore } from '../profile/store';

interface AuthValue {
  configured: boolean;
  session: Session | null;
  loading: boolean;
  /** True once the remote profile has been read (or there is none to read). */
  profileReady: boolean;
  mergeAvailable: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<string | null>;
  signInWithGoogle: () => Promise<string | null>;
  signOut: () => Promise<void>;
  /** Returns the number of records that failed to import (0 = clean). */
  runMerge: () => Promise<number>;
  dismissMerge: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

/** Merge bookkeeping is per-account — a second account gets its own offer. */
const migratedKey = (userId: string) => `tf:v1:migrated:${userId}`;

function localHasActivity(): boolean {
  try {
    return (
      (localStorage.getItem('tf:v1:orders') ?? '[]') !== '[]' ||
      (localStorage.getItem('tf:v1:events') ?? '[]') !== '[]'
    );
  } catch {
    return false;
  }
}

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return true; // storage unavailable ⇒ never offer a merge we can't track
  }
}

function writeFlag(key: string): void {
  try {
    localStorage.setItem(key, '1');
  } catch {
    /* best effort */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [profileReady, setProfileReady] = useState(!isSupabaseConfigured);
  const [mergeAvailable, setMergeAvailable] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    const promise = getSupabase();
    if (!promise) {
      markDataStoreReady(); // guest mode: LocalAdapter is final
      return;
    }
    let cancelled = false;
    let unsub: (() => void) | undefined;
    promise.then((sb) => {
      if (cancelled) return; // never subscribe after cleanup
      setClient(sb);
      sb.auth.getSession().then(({ data }) => {
        if (cancelled) return;
        setSession(data.session);
        setLoading(false);
      });
      const { data } = sb.auth.onAuthStateChange((_event, next) => setSession(next));
      unsub = () => data.subscription.unsubscribe();
      if (cancelled) unsub();
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);

  // Swap the persistence seam whenever the session changes, and hydrate
  // the local preference store FROM the account before anything writes
  // back — otherwise this device's defaults clobber the remote profile.
  useEffect(() => {
    // While Supabase is configured but the initial session is still
    // unresolved, hold event logging (see dataStoreReady).
    if (isSupabaseConfigured && loading) return;

    let stale = false;
    (async () => {
      if (client && session) {
        const adapter = new SupabaseAdapter(client, session.user.id);
        setDataStore(adapter);
        setProfileReady(false);
        try {
          const remote = await adapter.getProfile();
          if (!stale && remote) {
            useProfileStore.getState().hydrateFromRemote(remote);
          }
        } catch {
          /* reads fail soft; sync effect stays gated until ready */
        }
        if (!stale) {
          setProfileReady(true);
          setMergeAvailable(!readFlag(migratedKey(session.user.id)) && localHasActivity());
        }
      } else {
        setDataStore(new LocalAdapter());
        setProfileReady(true);
        setMergeAvailable(false);
      }
      markDataStoreReady();
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['trending'] });
    })();
    return () => {
      stale = true;
    };
  }, [client, session, loading, queryClient]);

  const runMerge = useCallback(async (): Promise<number> => {
    const local = new LocalAdapter();
    const remote = getDataStore();
    if (remote.mode !== 'supabase' || !session) return 0;
    const [orders, events] = await Promise.all([
      local.listOrders(),
      local.listRecentEvents(500),
    ]);
    let failed = 0;
    for (const order of orders) {
      await remote.recordOrder(order).catch(() => failed++);
    }
    for (const event of events) {
      await remote.logEvent(event).catch(() => failed++);
    }
    // Only mark done on a clean import — a partial one can be retried.
    if (failed === 0) {
      writeFlag(migratedKey(session.user.id));
      setMergeAvailable(false);
    }
    queryClient.invalidateQueries({ queryKey: ['orders'] });
    queryClient.invalidateQueries({ queryKey: ['events'] });
    return failed;
  }, [queryClient, session]);

  const dismissMerge = useCallback(() => {
    if (session) writeFlag(migratedKey(session.user.id));
    setMergeAvailable(false);
  }, [session]);

  const value = useMemo<AuthValue>(
    () => ({
      configured: isSupabaseConfigured,
      session,
      loading,
      profileReady,
      mergeAvailable,
      signIn: async (email, password) => {
        if (!client) return 'Supabase is not configured';
        const { error } = await client.auth.signInWithPassword({ email, password });
        return error?.message ?? null;
      },
      signUp: async (email, password) => {
        if (!client) return 'Supabase is not configured';
        const { error } = await client.auth.signUp({ email, password });
        return error?.message ?? null;
      },
      signInWithGoogle: async () => {
        if (!client) return 'Supabase is not configured';
        const { error } = await client.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: window.location.origin },
        });
        return error?.message ?? null;
      },
      signOut: async () => {
        await client?.auth.signOut();
      },
      runMerge,
      dismissMerge,
    }),
    [client, session, loading, profileReady, mergeAvailable, runMerge, dismissMerge]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
