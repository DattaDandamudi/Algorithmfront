/**
 * Plan catalog and gating. Source of truth for prices shown on the site and
 * limits enforced by the core loop. Stripe price IDs live in env vars.
 */
export type PlanId = "starter" | "pro";
export type BillingInterval = "month" | "year";

export type PlanFeature =
  | "missed_call_textback"
  | "ai_qualification"
  | "owner_alerts"
  | "shared_inbox"
  | "voicemail_transcription"
  | "weekly_report"
  | "web_form_leads"
  | "meta_leads"
  | "booking_handoff"
  | "after_hours_routing"
  | "capi_passback"
  | "second_number";

export type Plan = {
  id: PlanId;
  name: string;
  priceMonthlyUsd: number;
  priceAnnualUsd: number;
  setupFeeUsd: number;
  includedConversations: number;
  overagePerConversationUsd: number;
  numbers: number;
  features: PlanFeature[];
  tagline: string;
};

export const SETUP_FEE_USD = 149;
export const TRIAL_DAYS = 14;
export const MONEY_BACK_DAYS = 30;

export const PLANS: Record<PlanId, Plan> = {
  starter: {
    id: "starter",
    name: "Starter",
    priceMonthlyUsd: 79,
    priceAnnualUsd: 790,
    setupFeeUsd: SETUP_FEE_USD,
    includedConversations: 150,
    overagePerConversationUsd: 0.25,
    numbers: 1,
    tagline: "Every missed call texts back and gets qualified.",
    features: [
      "missed_call_textback",
      "ai_qualification",
      "owner_alerts",
      "shared_inbox",
      "voicemail_transcription",
      "weekly_report",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceMonthlyUsd: 149,
    priceAnnualUsd: 1490,
    setupFeeUsd: SETUP_FEE_USD,
    includedConversations: 500,
    overagePerConversationUsd: 0.2,
    numbers: 2,
    tagline: "Every lead — calls, web forms and Meta forms — answered in seconds.",
    features: [
      "missed_call_textback",
      "ai_qualification",
      "owner_alerts",
      "shared_inbox",
      "voicemail_transcription",
      "weekly_report",
      "web_form_leads",
      "meta_leads",
      "booking_handoff",
      "after_hours_routing",
      "capi_passback",
      "second_number",
    ],
  },
};

export function getPlan(id: PlanId | string | null | undefined): Plan {
  return (id && PLANS[id as PlanId]) || PLANS.starter;
}

/** Feature gate. Accepts anything with a `plan` field (account row or summary). */
export function can(account: { plan?: PlanId | string | null } | null | undefined, feature: PlanFeature): boolean {
  return getPlan(account?.plan).features.includes(feature);
}

export function stripePriceIdFor(plan: PlanId, interval: BillingInterval): string {
  const key = `STRIPE_PRICE_${plan.toUpperCase()}_${interval === "year" ? "ANNUAL" : "MONTHLY"}`;
  const v = process.env[key];
  if (!v) throw new Error(`Missing ${key}`);
  return v;
}
