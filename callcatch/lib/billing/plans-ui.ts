/**
 * Presentation helpers for billing UI. Isomorphic (no secrets, no Node APIs):
 * safe to import from Client Components.
 */
import { getPlan, MONEY_BACK_DAYS, PLANS, SETUP_FEE_USD, TRIAL_DAYS, type BillingInterval, type PlanId } from "@/lib/plans";

export type CheckoutPath = "trial" | "paynow";

export type SubscriptionUiStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "paused"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "unpaid"
  | "none";

export const PLAN_IDS: readonly PlanId[] = ["starter", "pro"];
export const INTERVALS: readonly BillingInterval[] = ["month", "year"];
export const CHECKOUT_PATHS: readonly CheckoutPath[] = ["trial", "paynow"];

export function isPlanId(v: unknown): v is PlanId {
  return v === "starter" || v === "pro";
}
export function isInterval(v: unknown): v is BillingInterval {
  return v === "month" || v === "year";
}
export function isCheckoutPath(v: unknown): v is CheckoutPath {
  return v === "trial" || v === "paynow";
}

export function planLabel(plan: PlanId | string | null | undefined): string {
  return getPlan(plan).name;
}

export function intervalLabel(interval: BillingInterval | string | null | undefined): string {
  return interval === "year" ? "Annual" : "Monthly";
}

export function intervalSuffix(interval: BillingInterval | string | null | undefined): string {
  return interval === "year" ? "/yr" : "/mo";
}

/** Recurring price for a plan + interval, in whole dollars. */
export function recurringPriceUsd(plan: PlanId, interval: BillingInterval): number {
  const p = PLANS[plan];
  return interval === "year" ? p.priceAnnualUsd : p.priceMonthlyUsd;
}

/** Effective monthly cost (annual ÷ 12) for comparison copy. */
export function monthlyEquivalentUsd(plan: PlanId, interval: BillingInterval): number {
  return interval === "year" ? Math.round(PLANS[plan].priceAnnualUsd / 12) : PLANS[plan].priceMonthlyUsd;
}

/** Dollars saved per year vs paying monthly. */
export function annualSavingsUsd(plan: PlanId): number {
  return PLANS[plan].priceMonthlyUsd * 12 - PLANS[plan].priceAnnualUsd;
}

/** Setup fee only applies to monthly plans (waived on annual). */
export function setupFeeApplies(interval: BillingInterval): boolean {
  return interval === "month";
}

export function setupFeeUsd(interval: BillingInterval, wantsSetup: boolean): number {
  return setupFeeApplies(interval) && wantsSetup ? SETUP_FEE_USD : 0;
}

/** What the card is charged the moment Checkout completes. */
export function dueTodayUsd(plan: PlanId, interval: BillingInterval, path: CheckoutPath, wantsSetup: boolean): number {
  const setup = setupFeeUsd(interval, wantsSetup);
  if (path === "trial") return setup; // recurring price starts after the trial
  return recurringPriceUsd(plan, interval) + setup;
}

export const STATUS_LABEL: Record<SubscriptionUiStatus, string> = {
  trialing: "Free trial",
  active: "Active",
  past_due: "Payment past due",
  paused: "Paused",
  canceled: "Canceled",
  incomplete: "Payment incomplete",
  incomplete_expired: "Checkout expired",
  unpaid: "Unpaid",
  none: "No subscription",
};

export type StatusTone = "success" | "info" | "warning" | "danger" | "neutral";

export const STATUS_TONE: Record<SubscriptionUiStatus, StatusTone> = {
  trialing: "info",
  active: "success",
  past_due: "danger",
  paused: "warning",
  canceled: "neutral",
  incomplete: "warning",
  incomplete_expired: "neutral",
  unpaid: "danger",
  none: "neutral",
};

export function toUiStatus(status: string | null | undefined): SubscriptionUiStatus {
  switch (status) {
    case "trialing":
    case "active":
    case "past_due":
    case "paused":
    case "canceled":
    case "incomplete":
    case "incomplete_expired":
    case "unpaid":
      return status;
    default:
      return "none";
  }
}

export function formatDate(iso: string | Date | null | undefined, timeZone?: string | null): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: timeZone ?? undefined,
  }).format(d);
}

/** First day of the month (UTC) as `YYYY-MM-01`, the `usage_monthly.period` key. */
export function periodKey(d: Date = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

export function prevPeriodKey(d: Date = new Date()): string {
  return periodKey(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)));
}

export function periodStartIso(period: string): string {
  return `${period}T00:00:00.000Z`;
}

export function periodEndIso(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m, 1)).toISOString();
}

export const TRIAL_COPY = `${TRIAL_DAYS}-day free trial`;
export const MONEY_BACK_COPY = `${MONEY_BACK_DAYS}-day money-back guarantee on your first payment`;
export const VERIFICATION_ANCHOR_COPY =
  "Your billing clock starts when the carriers verify your number, not when you sign up. Toll-free verification takes 3–10 business days; until then you still get voicemail transcription, owner alerts and the inbox for free.";
