// Server-only: creates Stripe Checkout Sessions with the service-role DB client.
import { z } from "zod";
import { createAdminSupabase } from "@/lib/db/client";
import { env } from "@/lib/env";
import { track } from "@/lib/events";
import { stripePriceIdFor, TRIAL_DAYS, type BillingInterval, type PlanId } from "@/lib/plans";
import { setupFeeApplies, type CheckoutPath } from "@/lib/billing/plans-ui";
import { stripe } from "@/lib/billing/stripe";

export const checkoutInputSchema = z.object({
  plan: z.enum(["starter", "pro"]),
  interval: z.enum(["month", "year"]),
  path: z.enum(["trial", "paynow"]),
  setupFee: z.boolean().default(false),
  /** Referral code from `/signup?ref=CODE`; validated against `accounts.referral_code` (stored lowercase). */
  ref: z
    .string()
    .trim()
    .regex(/^[a-z0-9]{4,32}$/i)
    .transform((s) => s.toLowerCase())
    .optional(),
});
export type CheckoutInput = z.infer<typeof checkoutInputSchema>;

/** Referral codes are generated and stored lowercase; compare with the normalised form everywhere. */
export function normalizeReferralCode(raw: string | null | undefined): string | undefined {
  const code = raw?.trim().toLowerCase();
  return code && /^[a-z0-9]{4,32}$/.test(code) ? code : undefined;
}

/**
 * Subscription statuses that mean "this account already has a Stripe subscription we must not
 * duplicate". Everything except the two terminal states — a `paused`, `unpaid` or `incomplete`
 * subscription is still the customer's subscription (fix the card / resume it; never add a second one).
 */
export const LIVE_SUBSCRIPTION_STATUSES = new Set(["trialing", "active", "past_due", "paused", "unpaid", "incomplete"]);

export function isLiveSubscriptionStatus(status: string | null | undefined): boolean {
  return Boolean(status && LIVE_SUBSCRIPTION_STATUSES.has(status));
}

/** Thrown by `createCheckoutSession` when the account already has a live subscription. */
export class AlreadySubscribedError extends Error {
  readonly subscriptionId: string;
  readonly status: string;
  constructor(subscriptionId: string, status: string) {
    super("You already have a subscription. Change plans, resume or restart it from Billing instead of checking out again.");
    this.name = "AlreadySubscribedError";
    this.subscriptionId = subscriptionId;
    this.status = status;
  }
}

/** Thrown when a returning customer asks for a second free trial. */
export class TrialNotEligibleError extends Error {
  constructor() {
    super("Your free trial has already been used. Restart with pay-now — it comes with the 30-day money-back guarantee.");
    this.name = "TrialNotEligibleError";
  }
}

export type ExistingSubscription = { stripe_subscription_id: string; status: string };

/**
 * The account's `subscriptions` row (one per account), or null. Used by the checkout page and by
 * `createCheckoutSession` to refuse a second subscription / a second trial.
 */
export async function loadExistingSubscription(accountId: string): Promise<ExistingSubscription | null> {
  const db = createAdminSupabase();
  const { data, error } = await db.from("subscriptions").select("stripe_subscription_id, status").eq("account_id", accountId).maybeSingle();
  if (error) throw new Error(`subscriptions lookup failed: ${error.message}`);
  return data;
}

/**
 * Belt and braces against a stale/flip-flopped local row: ask Stripe whether the customer already
 * carries a non-terminal subscription. Returns the first one found, or null.
 */
async function findLiveStripeSubscription(customerId: string): Promise<{ id: string; status: string } | null> {
  const subs = await stripe().subscriptions.list({ customer: customerId, status: "all", limit: 10 });
  const live = subs.data.find((s) => isLiveSubscriptionStatus(s.status));
  return live ? { id: live.id, status: live.status } : null;
}

export type CreateCheckoutSessionInput = {
  accountId: string;
  userEmail: string;
  plan: PlanId;
  interval: BillingInterval;
  path: CheckoutPath;
  setupFee: boolean;
  /** Referral code (optional). */
  ref?: string | null;
  /** First-touch ad attribution to forward to the Stripe webhook → Meta CAPI. */
  attribution?: { fbc?: string; fbp?: string; utm_source?: string; utm_medium?: string; utm_campaign?: string } | null;
  /** Stable event id shared with the browser Pixel (`checkout_started`). */
  eventId?: string;
};

export type CreateCheckoutSessionResult = { id: string; url: string };

/**
 * Creates a subscription-mode Checkout Session.
 *
 * - trial path:  `trial_period_days = TRIAL_DAYS`, card required (`payment_method_collection: 'always'`).
 *                The trial clock is re-anchored to the verification date by `onVerified()`.
 * - pay-now path: no trial; first period charged now (30-day money-back). `onVerified()` moves the
 *                next renewal so the first *full* month starts on verification.
 * - monthly + setupFee: adds the one-time done-for-you setup price. Annual never carries a setup fee.
 * - Reuses `accounts.stripe_customer_id` when present so one business never gets two Stripe customers.
 * - Refuses to run when the account already has a live subscription (`AlreadySubscribedError`) —
 *   plan changes go through `changePlan` / the Customer Portal, never through a second Checkout —
 *   and refuses a second free trial for a returning customer (`TrialNotEligibleError`).
 */
export async function createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CreateCheckoutSessionResult> {
  const db = createAdminSupabase();
  const { data: account, error } = await db
    .from("accounts")
    .select("id, stripe_customer_id, legal_name, dba, referral_code")
    .eq("id", input.accountId)
    .maybeSingle();
  if (error) throw new Error(`accounts lookup failed: ${error.message}`);
  if (!account) throw new Error("Account not found");

  // One subscription per account. Our row first, then Stripe itself (the row can lag a webhook).
  const existing = await loadExistingSubscription(input.accountId);
  if (existing && isLiveSubscriptionStatus(existing.status)) {
    throw new AlreadySubscribedError(existing.stripe_subscription_id, existing.status);
  }
  if (account.stripe_customer_id) {
    const live = await findLiveStripeSubscription(account.stripe_customer_id);
    if (live) {
      console.error("[billing/checkout] live Stripe subscription not mirrored locally", { accountId: input.accountId, subscriptionId: live.id, status: live.status });
      throw new AlreadySubscribedError(live.id, live.status);
    }
  }
  // A returning customer (any prior subscription, e.g. canceled) never gets a second free trial;
  // the billing page already sends them to pay-now and the checkout page redirects, this is the backstop.
  if (input.path === "trial" && existing) throw new TrialNotEligibleError();

  const wantsSetupFee = input.setupFee && setupFeeApplies(input.interval);
  const appUrl = env.appUrl();

  const lineItems: Array<{ price: string; quantity: number }> = [
    { price: stripePriceIdFor(input.plan, input.interval), quantity: 1 },
  ];
  if (wantsSetupFee) {
    lineItems.push({ price: env.required("STRIPE_PRICE_SETUP_FEE"), quantity: 1 });
  }

  // Referral: only forward codes that belong to another account. Codes are stored lowercase.
  let refCode: string | undefined;
  const ref = normalizeReferralCode(input.ref);
  if (ref && ref !== (account.referral_code ?? "").toLowerCase()) {
    const { data: referrer } = await db
      .from("accounts")
      .select("id")
      .eq("referral_code", ref)
      .neq("id", input.accountId)
      .maybeSingle();
    if (referrer) refCode = ref;
    else console.warn("[billing/checkout] unknown referral code ignored", { accountId: input.accountId, ref });
  }

  const metadata: Record<string, string> = {
    account_id: input.accountId,
    plan: input.plan,
    interval: input.interval,
    path: input.path,
    setup_fee: wantsSetupFee ? "1" : "0",
  };
  if (refCode) metadata.ref = refCode;
  if (input.eventId) metadata.event_id = input.eventId;
  for (const [k, v] of Object.entries(input.attribution ?? {})) {
    if (typeof v === "string" && v) metadata[k] = v.slice(0, 500);
  }

  const businessName = account.dba || account.legal_name || undefined;
  const requireTos = env.bool("STRIPE_CHECKOUT_REQUIRE_TOS", false);

  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    line_items: lineItems,
    client_reference_id: input.accountId,
    ...(account.stripe_customer_id ? { customer: account.stripe_customer_id } : { customer_email: input.userEmail }),
    ...(account.stripe_customer_id ? { customer_update: { name: "auto" } } : {}),
    payment_method_collection: "always",
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    subscription_data: {
      metadata,
      ...(businessName ? { description: `CallCatch for ${businessName}` } : {}),
      ...(input.path === "trial" ? { trial_period_days: TRIAL_DAYS } : {}),
    },
    metadata,
    success_url: `${appUrl}/onboarding?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/billing/checkout?canceled=1&plan=${input.plan}&interval=${input.interval}&path=${input.path}`,
    // Requires a Terms of Service URL in Stripe Dashboard → Settings → Public details; opt in via env.
    ...(requireTos ? { consent_collection: { terms_of_service: "required" as const } } : {}),
    custom_text: {
      ...(requireTos
        ? { terms_of_service_acceptance: { message: `I agree to the [Terms of Service](${appUrl}/terms) and [Refund Policy](${appUrl}/refund).` } }
        : {}),
      submit: {
        message:
          input.path === "trial"
            ? `Your ${TRIAL_DAYS}-day trial clock starts when carriers verify your number. Cancel any time before then and you won't be charged.`
            : input.interval === "year"
              ? "30-day money-back guarantee on your first payment. Your number typically verifies in 3–10 business days; we credit those days back to your account."
              : "30-day money-back guarantee on your first payment. Your first full month starts the day your number is verified.",
      },
    },
  });

  if (!session.url) throw new Error("Stripe did not return a Checkout URL");

  await track(
    "checkout_started",
    {
      session_id: session.id,
      plan: input.plan,
      interval: input.interval,
      path: input.path,
      setup_fee: wantsSetupFee,
      ref: refCode ?? null,
      event_id: input.eventId ?? null,
    },
    { accountId: input.accountId }
  );

  return { id: session.id, url: session.url };
}
