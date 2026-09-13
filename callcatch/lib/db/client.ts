import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "./types";

export type Db = SupabaseClient<Database>;

function publicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set");
  }
  return { url, key };
}

/** Browser client lives in lib/db/browser.ts — this module imports next/headers and is server-only. */

/**
 * Server client bound to the current request's cookies.
 * Use in Server Components, Server Functions and Route Handlers that act as the signed-in user.
 * RLS applies. Cookie writes are best-effort (Server Components cannot set cookies).
 */
export async function createServerSupabase(): Promise<Db> {
  const { url, key } = publicConfig();
  const cookieStore = await cookies();
  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: the proxy refreshes sessions instead.
        }
      },
    },
  });
}

let adminSingleton: Db | null = null;

/**
 * Service-role client. Bypasses RLS. Server-only: webhooks, crons, provisioning.
 * NEVER import from a Client Component.
 */
export function createAdminSupabase(): Db {
  if (adminSingleton) return adminSingleton;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  adminSingleton = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminSingleton;
}
