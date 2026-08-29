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
import { LocalAdapter } from '../../lib/datastore/LocalAdapter';
import { SupabaseAdapter } from '../../lib/datastore/SupabaseAdapter';

interface AuthValue {
  configured: boolean;
  session: Session | null;
  loading: boolean;
  mergeAvailable: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<string | null>;
  signInWithGoogle: () => Promise<string | null>;
  signOut: () => Promise<void>;
  runMerge: () => Promise<void>;
  dismissMerge: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

const MIGRATED_KEY = 'tf:v1:migrated';

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [mergeAvailable, setMergeAvailable] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    const promise = getSupabase();
    if (!promise) return;
    let unsub: (() => void) | undefined;
    promise.then((sb) => {
      setClient(sb);
      sb.auth.getSession().then(({ data }) => {
        setSession(data.session);
        setLoading(false);
      });
      const { data } = sb.auth.onAuthStateChange((_event, next) => setSession(next));
      unsub = () => data.subscription.unsubscribe();
    });
    return () => unsub?.();
  }, []);

  // Swap the persistence seam whenever the session changes.
  useEffect(() => {
    if (client && session) {
      setDataStore(new SupabaseAdapter(client, session.user.id));
      let migrated = false;
      try {
        migrated = localStorage.getItem(MIGRATED_KEY) === '1';
      } catch {
        migrated = true;
      }
      setMergeAvailable(!migrated && localHasActivity());
    } else {
      setDataStore(new LocalAdapter());
      setMergeAvailable(false);
    }
    queryClient.invalidateQueries({ queryKey: ['orders'] });
    queryClient.invalidateQueries({ queryKey: ['events'] });
    queryClient.invalidateQueries({ queryKey: ['trending'] });
  }, [client, session, queryClient]);

  const runMerge = useCallback(async () => {
    // One-time, idempotent: copy guest records up, keep local data intact.
    const local = new LocalAdapter();
    const remote = getDataStore();
    if (remote.mode !== 'supabase') return;
    const [orders, events] = await Promise.all([
      local.listOrders(),
      local.listRecentEvents(500),
    ]);
    for (const order of orders) {
      await remote.recordOrder(order).catch(() => {});
    }
    for (const event of events) {
      await remote.logEvent(event).catch(() => {});
    }
    try {
      localStorage.setItem(MIGRATED_KEY, '1');
    } catch {
      /* best effort */
    }
    setMergeAvailable(false);
    queryClient.invalidateQueries({ queryKey: ['orders'] });
    queryClient.invalidateQueries({ queryKey: ['events'] });
  }, [queryClient]);

  const dismissMerge = useCallback(() => {
    try {
      localStorage.setItem(MIGRATED_KEY, '1');
    } catch {
      /* best effort */
    }
    setMergeAvailable(false);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      configured: isSupabaseConfigured,
      session,
      loading,
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
    [client, session, loading, mergeAvailable, runMerge, dismissMerge]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
