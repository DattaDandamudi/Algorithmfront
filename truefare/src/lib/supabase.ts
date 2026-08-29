import type { SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Guest mode when env is absent — the app must run with zero config. */
export const isSupabaseConfigured = Boolean(url && anonKey);

let clientPromise: Promise<SupabaseClient> | null = null;

/**
 * Lazily import supabase-js so guest-mode bundles never pay for it.
 * Returns null when the environment isn't configured.
 */
export function getSupabase(): Promise<SupabaseClient> | null {
  if (!isSupabaseConfigured) return null;
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(url!, anonKey!)
    );
  }
  return clientPromise;
}
