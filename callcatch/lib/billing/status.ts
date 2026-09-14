import { createAdminSupabase, type Db } from "@/lib/db/client";
import type { SubscriptionRow } from "@/lib/db/types";

/** Subscription statuses that entitle an account to provisioning and service. */
export const ENTITLED_STATUSES = new Set(["trialing", "active", "past_due"]);

export type BillingGate = {
  allowed: boolean;
  reason: "no_subscription" | "status_not_entitled" | "ok";
  subscription: SubscriptionRow | null;
};

/**
 * Single source of truth for "has this account paid (or started a card-on-file trial)?".
 * Used by onboarding (number purchase, verification submission, go-live) and by the app shell
 * to send unpaid accounts to /billing/checkout. Never trust accounts.plan/status for this.
 */
export async function getBillingGate(accountId: string, db: Db = createAdminSupabase()): Promise<BillingGate> {
  const { data } = await db.from("subscriptions").select("*").eq("account_id", accountId).maybeSingle();
  if (!data) return { allowed: false, reason: "no_subscription", subscription: null };
  if (!ENTITLED_STATUSES.has(data.status)) return { allowed: false, reason: "status_not_entitled", subscription: data };
  return { allowed: true, reason: "ok", subscription: data };
}

export async function hasEntitledSubscription(accountId: string, db?: Db): Promise<boolean> {
  return (await getBillingGate(accountId, db)).allowed;
}
