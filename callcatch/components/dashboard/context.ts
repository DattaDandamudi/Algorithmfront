import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { isAdminEmail, requireAccount } from "@/lib/auth/session";
import { createAdminSupabase, createServerSupabase, type Db } from "@/lib/db/client";
import type { AccountRow, NumberRow, VerificationStatus } from "@/lib/db/types";
import { ensureOnboarded } from "./gate";

/**
 * Admin "view as" cookie. Set only by the admin Server Function (`impersonateAction`) after an
 * `isAdminEmail` check, httpOnly, and honoured ONLY when the current user is still an admin.
 * When active, the dashboard pages read the target account with the service-role client and
 * every query is explicitly scoped by `account_id` (RLS does not apply to that client).
 * Write actions (settings, replies, lead updates) refuse to run while impersonating.
 */
export const ADMIN_VIEW_COOKIE = "cc_admin_view";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AppContext = {
  user: User;
  /** Full account row (the impersonated account when an admin is viewing as). */
  account: AccountRow;
  /** RLS client for the signed-in user, or the service-role client while impersonating. */
  db: Db;
  isAdmin: boolean;
  impersonating: boolean;
};

/** One load per request (layout + page share it). */
const loadAppContext = cache(async (): Promise<AppContext> => {
  const { user, account: summary } = await requireAccount();
  const isAdmin = isAdminEmail(user.email);
  const store = await cookies();
  const viewAs = store.get(ADMIN_VIEW_COOKIE)?.value;

  if (isAdmin && viewAs && UUID_RE.test(viewAs) && viewAs !== summary.id) {
    const admin = createAdminSupabase();
    const { data } = await admin.from("accounts").select("*").eq("id", viewAs).maybeSingle();
    if (data) {
      return { user, account: data, db: admin, isAdmin, impersonating: true };
    }
  }

  const db = await createServerSupabase();
  const { data: account } = await db.from("accounts").select("*").eq("id", summary.id).maybeSingle();
  if (!account) {
    // Membership exists but the row is unreadable (RLS misconfiguration) — treat as no account.
    redirect("/onboarding");
  }
  return { user, account, db, isAdmin, impersonating: false };
});

/**
 * Loads the signed-in user, their account and a database client for the dashboard pages.
 * Redirects to /login (signed out), /onboarding (no account, or still onboarding unless
 * `gate: false` or an admin is viewing the account).
 */
export async function getAppContext(opts: { gate?: boolean } = {}): Promise<AppContext> {
  const ctx = await loadAppContext();
  if (opts.gate !== false && !ctx.impersonating) ensureOnboarded(ctx.account);
  return ctx;
}

/** Customer numbers for an account (the first is the primary line). */
export async function loadNumbers(db: Db, accountId: string): Promise<NumberRow[]> {
  const { data } = await db
    .from("numbers")
    .select("*")
    .eq("account_id", accountId)
    .eq("purpose", "customer")
    .order("created_at", { ascending: true });
  return data ?? [];
}

/** Roll-up of the account's customer numbers into one verification state for banners/pills. */
export function overallVerification(numbers: Pick<NumberRow, "verification_status">[]): VerificationStatus {
  if (numbers.length === 0) return "not_submitted";
  const statuses = numbers.map((n) => n.verification_status as VerificationStatus);
  if (statuses.includes("verified")) return "verified";
  if (statuses.includes("rejected")) return "rejected";
  if (statuses.includes("in_review")) return "in_review";
  if (statuses.includes("pending")) return "pending";
  return "not_submitted";
}

export function businessName(account: Pick<AccountRow, "dba" | "legal_name">): string {
  return account.dba?.trim() || account.legal_name?.trim() || "Your business";
}
