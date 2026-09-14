import { cache } from "react";
import { redirect } from "next/navigation";
import { getBillingGate, type BillingGate } from "@/lib/billing/status";

/**
 * Onboarding gate. Every page owned by the dashboard module calls this first: accounts that
 * have not finished the wizard are sent back to /onboarding (the wizard and /billing/** are
 * other modules' pages and are not gated).
 */
export function ensureOnboarded(account: { status: string }): void {
  if (account.status === "onboarding") redirect("/onboarding");
}

/** One billing lookup per request (layout + page + actions share it). */
const loadBillingGate = cache((accountId: string): Promise<BillingGate> => getBillingGate(accountId));

/**
 * Billing gate for the dashboard. An account with NO `subscriptions` row never completed Stripe
 * Checkout (spec: signup → Checkout → onboarding), so every gated page and Server Function sends it
 * to /billing/checkout. Accounts whose subscription lapsed later (paused / unpaid / canceled) are not
 * redirected: dunning and the Customer Portal own that state through `accounts.status`, and /billing
 * is where they resume.
 *
 * Loop-safety: /billing/** and /onboarding use `requireAccount()` / their own checks, never
 * `getAppContext()` with the gate on, so the redirect target is never itself gated.
 */
export async function ensureBillable(account: { id: string }, opts: { exempt?: boolean } = {}): Promise<BillingGate> {
  const gate = await loadBillingGate(account.id);
  if (!opts.exempt && gate.reason === "no_subscription") redirect("/billing/checkout");
  return gate;
}
