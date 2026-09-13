/**
 * Server-only helpers shared by the onboarding Server Functions and Route Handlers.
 * Membership is always checked against `account_members` before the admin client touches a row.
 */
import type { User } from "@supabase/supabase-js";
import { createAdminSupabase, type Db } from "@/lib/db/client";
import type { AccountRow, Json, NumberRow } from "@/lib/db/types";
import { getSessionForApi } from "@/lib/auth/session";
import { asObject, type JsonObject } from "./state";

export type MemberContext = { user: User; account: AccountRow; db: Db };

export type ApiFailure = { ok: false; status: 401 | 403 | 404; error: string };

/** Loads the caller's account with the service-role client after verifying membership via RLS. */
export async function requireMemberAccount(): Promise<{ ok: true; ctx: MemberContext } | ApiFailure> {
  const session = await getSessionForApi();
  if (!session.ok) return { ok: false, status: 401, error: "Sign in required" };
  if (!session.account) return { ok: false, status: 404, error: "No account for this user yet" };
  const db = createAdminSupabase();
  const { data: account, error } = await db.from("accounts").select("*").eq("id", session.account.id).maybeSingle();
  if (error || !account) return { ok: false, status: 404, error: "Account not found" };
  return { ok: true, ctx: { user: session.user, account, db } };
}

export async function loadCustomerNumber(db: Db, accountId: string): Promise<NumberRow | null> {
  const { data } = await db
    .from("numbers")
    .select("*")
    .eq("account_id", accountId)
    .eq("purpose", "customer")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

/**
 * Read-modify-write of `accounts.ai_profile`. Keys set to `undefined` are removed.
 * Returns the merged object.
 */
export async function patchAiProfile(db: Db, accountId: string, patch: JsonObject): Promise<JsonObject> {
  const { data } = await db.from("accounts").select("ai_profile").eq("id", accountId).maybeSingle();
  const current = asObject(data?.ai_profile);
  const merged: JsonObject = { ...current };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete merged[k];
    else merged[k] = v;
  }
  const { error } = await db.from("accounts").update({ ai_profile: merged as Json }).eq("id", accountId);
  if (error) throw new Error(`ai_profile update failed: ${error.message}`);
  return merged;
}

export function userFullName(user: User): string | null {
  const meta = user.user_metadata ?? {};
  const v = meta.full_name ?? meta.name;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export function jsonError(status: number, error: string, extra: Record<string, Json> = {}): Response {
  return Response.json({ ok: false, error, ...extra }, { status });
}
