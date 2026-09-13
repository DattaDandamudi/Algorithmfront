/**
 * Browser-side Supabase client for Client Components (realtime, client reads under RLS).
 * Kept in its own module so Client Components never import `next/headers` (see lib/db/client.ts).
 */
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

export type BrowserDb = SupabaseClient<Database>;

let singleton: BrowserDb | null = null;

export function createBrowserSupabase(): BrowserDb {
  if (singleton) return singleton;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set");
  }
  singleton = createBrowserClient<Database>(url, key);
  return singleton;
}
