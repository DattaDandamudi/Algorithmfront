// Server-only (uses next/headers + admin client); never import from Client Components.
import { cookies } from "next/headers";
import { createAdminSupabase } from "@/lib/db/client";
import { track } from "@/lib/events";
import { readAttribution } from "@/lib/meta/attribution";
import type { PlanParams } from "./next-path";

/**
 * Tracks `signup` with first-touch attribution (password signup action + OAuth/confirm callback).
 *
 * The account is resolved with the service-role client, not the request's RLS client: in the
 * /auth/callback Route Handler the freshly exchanged session lives only on the outgoing response,
 * so an RLS query there runs as anon and finds nothing (every Google / email-confirm signup would be
 * recorded with account_id = null). The signup trigger inserts `account_members` synchronously, so
 * the row exists by the time the session exchange returns.
 */
export async function recordSignup(userId: string | null, email: string | null, plan: PlanParams, method: "password" | "google"): Promise<void> {
  if (!userId) return;
  const store = await cookies();
  const attribution = readAttribution(store);
  let accountId: string | null = null;
  try {
    const { data } = await createAdminSupabase().from("account_members").select("account_id").eq("user_id", userId).limit(1).maybeSingle();
    accountId = data?.account_id ?? null;
  } catch (err) {
    console.error("[auth] recordSignup account lookup failed", err instanceof Error ? err.message : err);
  }
  await track(
    "signup",
    { method, email, plan: plan.plan ?? null, interval: plan.interval ?? null, path: plan.path ?? null, ref: plan.ref ?? null, ...attribution },
    { userId, accountId }
  );
}
