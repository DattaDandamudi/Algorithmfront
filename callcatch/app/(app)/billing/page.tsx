import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BarChart3, CalendarClock, CreditCard, PauseCircle, Receipt, ShieldCheck, Sparkles, XCircle } from "lucide-react";
import { requireAccount } from "@/lib/auth/session";
import { getPlan, MONEY_BACK_DAYS, TRIAL_DAYS } from "@/lib/plans";
import { formatDate, intervalLabel, recurringPriceUsd, intervalSuffix, VERIFICATION_ANCHOR_COPY } from "@/lib/billing/plans-ui";
import { getBillingSummary } from "@/lib/billing/summary";
import { formatUsd } from "@/lib/utils";
import { ChangePlanForm } from "@/components/billing/ChangePlanForm";
import { PauseControls } from "@/components/billing/PauseControls";
import { PortalButton } from "@/components/billing/PortalButton";
import { ReferralCard } from "@/components/billing/ReferralCard";
import { StatusBadge } from "@/components/billing/StatusBadge";
import { btn, Card, CardTitle, KeyValue, Notice } from "@/components/billing/ui";
import { UsageMeter } from "@/components/billing/UsageMeter";

export const metadata: Metadata = { title: "Billing — CallCatch" };
export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const { account } = await requireAccount();
  const s = await getBillingSummary(account);
  const plan = getPlan(s.plan);
  const tz = account.timezone;
  const hasSub = Boolean(s.subscription) && s.status !== "none" && s.status !== "canceled" && s.status !== "incomplete_expired";
  const isPaused = s.status === "paused";
  const isTrial = s.status === "trialing";
  const canManage = hasSub && !isPaused && s.status !== "incomplete";

  const nextDateLabel = isTrial ? "Trial ends" : isPaused ? "Resumes" : s.cancelAtPeriodEnd ? "Access ends" : "Next renewal";
  const nextDate = isTrial ? s.trialEnd : isPaused ? s.pauseUntil : s.currentPeriodEnd;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-600">Billing</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-brand-900">Plan &amp; usage</h1>
          <p className="mt-1 text-sm text-brand-600">{account.dba || account.legal_name || "Your business"}</p>
        </div>
        {s.hasStripeCustomer ? (
          <PortalButton flow="home" variant="secondary">
            <CreditCard className="h-4 w-4" aria-hidden />
            Manage billing
          </PortalButton>
        ) : null}
      </header>

      {!hasSub ? (
        <Card tone="accent" className="mb-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-brand-900">{s.status === "canceled" ? "Your subscription is canceled" : "No active subscription"}</h2>
              <p className="mt-1 text-sm text-brand-700">
                {s.status === "canceled"
                  ? "Text-backs are off. Restart any time — your number, profile and inbox are kept."
                  : `Start a ${TRIAL_DAYS}-day free trial or pay now with a ${MONEY_BACK_DAYS}-day money-back guarantee.`}
              </p>
            </div>
            <Link href={`/billing/checkout?plan=${s.plan}&interval=month&path=${s.status === "canceled" ? "paynow" : "trial"}`} className={btn.primary}>
              {s.status === "canceled" ? "Restart subscription" : "Choose a plan"}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </Card>
      ) : null}

      {s.status === "past_due" || s.status === "unpaid" ? (
        <div className="mb-6">
          <Notice tone="error">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>
                Your last payment failed. Update your card to keep text-backs running — we retry automatically, and nothing is deleted.
              </span>
              <PortalButton flow="payment_method" variant="primary">
                Update payment method
              </PortalButton>
            </div>
          </Notice>
        </div>
      ) : null}

      {s.cancelAtPeriodEnd && hasSub ? (
        <div className="mb-6">
          <Notice tone="warning">
            Your subscription is set to cancel on {formatDate(s.currentPeriodEnd, tz)}. Changed your mind? Reactivate from <strong>Manage billing</strong> before then.
          </Notice>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          {/* Current plan */}
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-bold text-brand-900">CallCatch {plan.name}</h2>
                  <StatusBadge status={s.status} />
                </div>
                <p className="mt-1 text-sm text-brand-600">{plan.tagline}</p>
              </div>
              {hasSub ? (
                <p className="text-right">
                  <span className="text-2xl font-bold tabular-nums text-brand-900">{formatUsd(recurringPriceUsd(plan.id, s.interval))}</span>
                  <span className="text-sm text-brand-500">{intervalSuffix(s.interval)}</span>
                  <span className="block text-xs text-brand-500">{intervalLabel(s.interval)} billing</span>
                </p>
              ) : null}
            </div>

            {hasSub ? (
              <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                <KeyValue
                  label={nextDateLabel}
                  value={formatDate(nextDate, tz)}
                  hint={
                    isTrial
                      ? s.verified
                        ? `Then ${formatUsd(recurringPriceUsd(plan.id, s.interval))}${intervalSuffix(s.interval)} on the card on file.`
                        : "Provisional — resets to a full 14 days the day your number is verified."
                      : s.paidNow && !s.verified && s.interval === "month"
                        ? "Moves to one month after verification once carriers approve your number."
                        : undefined
                  }
                />
                <KeyValue
                  label="Number verification"
                  value={s.verified ? "Verified — text-backs live" : "In carrier review"}
                  hint={s.verified ? undefined : "Toll-free verification usually takes 3–10 business days."}
                />
              </dl>
            ) : null}

            <div className="mt-5 flex items-start gap-3 rounded-xl border border-brand-100 bg-brand-50/60 p-4">
              <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" aria-hidden />
              <div className="text-sm text-brand-700">
                <p className="font-semibold text-brand-900">Your clock starts when carriers verify your number</p>
                <p className="mt-1">{VERIFICATION_ANCHOR_COPY}</p>
              </div>
            </div>

            {s.subscription?.setup_fee_paid ? (
              <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-brand-600">
                <ShieldCheck className="h-3.5 w-3.5 text-success-500" aria-hidden />
                Done-for-you setup included
              </p>
            ) : null}
          </Card>

          {/* Usage */}
          <Card>
            <CardTitle icon={<BarChart3 className="h-4 w-4" aria-hidden />} sub="Live count — refreshes as conversations come in.">
              Usage this month
            </CardTitle>
            <UsageMeter usage={s.usage} planName={plan.name} />
          </Card>

          {/* Plan change */}
          {hasSub ? (
            <Card>
              <CardTitle icon={<Sparkles className="h-4 w-4" aria-hidden />}>{plan.id === "pro" ? "Change plan" : "Upgrade to Pro"}</CardTitle>
              <ChangePlanForm currentPlan={plan.id} interval={s.interval} disabled={!canManage} />
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          {/* Pause */}
          {hasSub ? (
            <Card>
              <CardTitle icon={<PauseCircle className="h-4 w-4" aria-hidden />}>{isPaused ? "Paused" : "Pause for the slow season"}</CardTitle>
              <PauseControls paused={isPaused} pauseUntil={s.pauseUntil} disabled={!canManage} />
            </Card>
          ) : null}

          {/* Invoices / cancel */}
          {s.hasStripeCustomer ? (
            <Card>
              <CardTitle icon={<Receipt className="h-4 w-4" aria-hidden />} sub="Invoices, receipts, card on file and cancellation live in the secure Stripe portal.">
                Invoices &amp; payment
              </CardTitle>
              <div className="flex flex-wrap gap-2">
                <PortalButton flow="home" variant="secondary">
                  <Receipt className="h-4 w-4" aria-hidden />
                  View invoices
                </PortalButton>
                <PortalButton flow="payment_method" variant="secondary">
                  <CreditCard className="h-4 w-4" aria-hidden />
                  Update card
                </PortalButton>
                {hasSub && !s.cancelAtPeriodEnd ? (
                  <PortalButton flow="cancel" variant="danger">
                    <XCircle className="h-4 w-4" aria-hidden />
                    Cancel subscription
                  </PortalButton>
                ) : null}
              </div>
              <p className="mt-4 text-xs leading-relaxed text-brand-500">
                {MONEY_BACK_DAYS}-day money-back on your first payment, no refunds on renewals, cancel any time — see the{" "}
                <Link href="/refund" className="underline">
                  refund policy
                </Link>
                . Thinking about canceling for the winter? Pausing keeps your number and verification.
              </p>
            </Card>
          ) : null}

          <ReferralCard referral={s.referral} />
        </div>
      </div>
    </main>
  );
}
