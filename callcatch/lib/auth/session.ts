import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/db/client";
import { env } from "@/lib/env";

/** Minimal account shape every module can rely on; module a's Row type is a superset. */
export type AccountSummary = {
  id: string;
  owner_user_id: string;
  legal_name: string | null;
  dba: string | null;
  plan: "starter" | "pro" | null;
  status: "onboarding" | "pending_verification" | "live" | "paused" | "cancelled";
  timezone: string | null;
  alert_email: string | null;
  alert_phone: string | null;
  stripe_customer_id: string | null;
  referral_code: string | null;
};

export async function getUser(): Promise<User | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

/** Redirects to /login when signed out. Use in Server Components / Server Functions. */
export async function requireUser(): Promise<User> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

/** The account the user belongs to (owner or staff), or null. */
export async function getAccountForUser(userId: string): Promise<AccountSummary | null> {
  const supabase = await createServerSupabase();
  const { data: membership } = await supabase
    .from("account_members")
    .select("account_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (!membership) return null;
  const { data: account } = await supabase
    .from("accounts")
    .select(
      "id, owner_user_id, legal_name, dba, plan, status, timezone, alert_email, alert_phone, stripe_customer_id, referral_code"
    )
    .eq("id", membership.account_id)
    .maybeSingle();
  return (account as AccountSummary | null) ?? null;
}

/** Requires a signed-in user with an account; redirects to /onboarding when there is none. */
export async function requireAccount(): Promise<{ user: User; account: AccountSummary }> {
  const user = await requireUser();
  const account = await getAccountForUser(user.id);
  if (!account) redirect("/onboarding");
  return { user, account };
}

/** For Route Handlers: returns 401-shaped result instead of redirecting. */
export async function getSessionForApi(): Promise<
  { ok: true; user: User; account: AccountSummary | null } | { ok: false; status: 401 }
> {
  const user = await getUser();
  if (!user) return { ok: false, status: 401 };
  const account = await getAccountForUser(user.id);
  return { ok: true, user, account };
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return env.adminEmails().includes(email.toLowerCase());
}
