"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Loader2, ShieldCheck, Sparkles, Wrench } from "lucide-react";
import type { ActionState } from "@/app/(app)/billing/actions";
import { startCheckoutAction } from "@/app/(app)/billing/actions";
import { MONEY_BACK_DAYS, PLANS, SETUP_FEE_USD, TRIAL_DAYS, type BillingInterval, type PlanId } from "@/lib/plans";
import { annualSavingsUsd, dueTodayUsd, monthlyEquivalentUsd, recurringPriceUsd, setupFeeApplies, type CheckoutPath } from "@/lib/billing/plans-ui";
import { formatUsd } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { btn, Notice } from "@/components/billing/ui";

type Props = {
  initialPlan: PlanId;
  initialInterval: BillingInterval;
  path: CheckoutPath;
  initialSetupFee: boolean;
  refCode?: string;
  canceled?: boolean;
};

const PLAN_HIGHLIGHTS: Record<PlanId, string[]> = {
  starter: ["1 toll-free number", "150 conversations / mo", "Missed-call text-back + AI qualification", "Owner alerts, shared inbox, voicemail transcription", "Weekly calls-recovered email"],
  pro: ["2 numbers", "500 conversations / mo", "Everything in Starter", "Web-form + Meta lead instant replies", "Booking hand-off + after-hours routing", "Weekly report by email, SMS and PDF"],
};

export function CheckoutForm({ initialPlan, initialInterval, path, initialSetupFee, refCode, canceled }: Props) {
  const [plan, setPlan] = useState<PlanId>(initialPlan);
  const [interval, setInterval] = useState<BillingInterval>(initialInterval);
  const [setupFee, setSetupFee] = useState<boolean>(initialSetupFee);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(startCheckoutAction, null);

  const wantsSetup = setupFeeApplies(interval) && setupFee;
  const recurring = recurringPriceUsd(plan, interval);
  const dueToday = useMemo(() => dueTodayUsd(plan, interval, path, setupFee), [plan, interval, path, setupFee]);
  const per = interval === "year" ? "year" : "month";

  return (
    <form action={formAction} className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <input type="hidden" name="plan" value={plan} />
      <input type="hidden" name="interval" value={interval} />
      <input type="hidden" name="path" value={path} />
      {refCode ? <input type="hidden" name="ref" value={refCode} /> : null}

      {/* Left: plan + interval */}
      <div className="space-y-5">
        {canceled ? (
          <Notice tone="warning">
            Checkout was canceled — nothing was charged. Pick up where you left off below, or{" "}
            <Link href="/onboarding" className="font-semibold underline">
              go back to onboarding
            </Link>
            .
          </Notice>
        ) : null}
        {state?.error ? <Notice tone="error">{state.error}</Notice> : null}

        <fieldset>
          <legend className="text-sm font-semibold text-brand-900">Choose your plan</legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {(["starter", "pro"] as const).map((id) => {
              const p = PLANS[id];
              const selected = plan === id;
              return (
                <label
                  key={id}
                  className={cn(
                    "relative flex cursor-pointer flex-col rounded-2xl border p-4 transition focus-within:ring-2 focus-within:ring-accent-300",
                    selected ? "border-accent-500 bg-accent-50/60 shadow-sm" : "border-brand-100 bg-white hover:border-brand-300"
                  )}
                >
                  <input type="radio" name="plan_choice" value={id} checked={selected} onChange={() => setPlan(id)} className="sr-only" aria-label={`${p.name} plan`} />
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-base font-bold text-brand-900">
                      {id === "pro" ? <Sparkles className="h-4 w-4 text-accent-600" aria-hidden /> : <Wrench className="h-4 w-4 text-brand-500" aria-hidden />}
                      {p.name}
                    </span>
                    {id === "pro" ? <span className="rounded-full bg-brand-900 px-2 py-0.5 text-[11px] font-semibold text-white">Most popular</span> : null}
                  </div>
                  <p className="mt-2 text-2xl font-bold tabular-nums text-brand-900">
                    {formatUsd(monthlyEquivalentUsd(id, interval))}
                    <span className="text-sm font-medium text-brand-500">/mo</span>
                  </p>
                  <p className="text-xs text-brand-600">{interval === "year" ? `billed ${formatUsd(p.priceAnnualUsd)}/year` : "billed monthly, cancel any time"}</p>
                  <ul className="mt-3 space-y-1.5 text-sm text-brand-700">
                    {PLAN_HIGHLIGHTS[id].map((h) => (
                      <li key={h} className="flex items-start gap-2">
                        <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-success-500" aria-hidden />
                        {h}
                      </li>
                    ))}
                  </ul>
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-semibold text-brand-900">Billing</legend>
          <div className="mt-3 inline-flex rounded-xl border border-brand-200 bg-white p-1" role="radiogroup" aria-label="Billing interval">
            {(["month", "year"] as const).map((iv) => (
              <button
                key={iv}
                type="button"
                role="radio"
                aria-checked={interval === iv}
                onClick={() => setInterval(iv)}
                className={cn("rounded-lg px-4 py-2 text-sm font-semibold transition", interval === iv ? "bg-brand-900 text-white" : "text-brand-700 hover:bg-brand-50")}
              >
                {iv === "month" ? "Monthly" : `Annual — save ${formatUsd(annualSavingsUsd(plan))}`}
              </button>
            ))}
          </div>
        </fieldset>

        {setupFeeApplies(interval) ? (
          <label className={cn("flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition", setupFee ? "border-brand-400 bg-brand-50/60" : "border-brand-100 bg-white hover:border-brand-300")}>
            <input type="checkbox" name="setupFee" checked={setupFee} onChange={(e) => setSetupFee(e.target.checked)} className="mt-1 h-4 w-4 rounded border-brand-300 accent-accent-500" />
            <span>
              <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-brand-900">
                Done-for-you setup <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-brand-700 ring-1 ring-brand-200">{formatUsd(SETUP_FEE_USD)} one-time</span>
              </span>
              <span className="mt-1 block text-sm text-brand-600">
                We set up call forwarding with you on a 20-minute call, write your AI profile and greeting, submit carrier verification and test the whole loop. Waived on annual plans.
              </span>
            </span>
          </label>
        ) : (
          <p className="rounded-2xl border border-dashed border-brand-200 px-4 py-3 text-sm text-brand-600">Annual plans include done-for-you setup at no charge.</p>
        )}
      </div>

      {/* Right: order summary */}
      <aside className="h-fit rounded-2xl border border-brand-800 bg-brand-900 p-5 text-white sm:p-6 lg:sticky lg:top-6">
        <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-accent-300">Order summary</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-brand-100">
              CallCatch {PLANS[plan].name} · {interval === "year" ? "annual" : "monthly"}
            </dt>
            <dd className="font-semibold tabular-nums">
              {formatUsd(recurring)}/{per}
            </dd>
          </div>
          {wantsSetup ? (
            <div className="flex justify-between gap-4">
              <dt className="text-brand-100">Done-for-you setup (one-time)</dt>
              <dd className="font-semibold tabular-nums">{formatUsd(SETUP_FEE_USD)}</dd>
            </div>
          ) : null}
          {path === "trial" ? (
            <div className="flex justify-between gap-4">
              <dt className="text-brand-100">{TRIAL_DAYS}-day free trial</dt>
              <dd className="font-semibold text-success-500">−{formatUsd(recurring)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-4 border-t border-white/15 pt-3 text-base">
            <dt className="font-semibold">Due today</dt>
            <dd className="text-xl font-bold tabular-nums">{formatUsd(dueToday)}</dd>
          </div>
        </dl>

        <div className="mt-4 space-y-2 text-xs leading-relaxed text-brand-100">
          {path === "trial" ? (
            <p>
              Card required, charged <strong className="text-white">{formatUsd(recurring)}/{per}</strong> only after your {TRIAL_DAYS}-day trial. Your trial clock starts the day the carriers verify your number — not today — so you never pay for days your text-backs weren&apos;t live.
            </p>
          ) : (
            <p>
              Charged today. {interval === "month" ? "Your first full month starts the day your number is verified; we move the renewal date so you aren't paying for verification days." : "Your annual term starts the day your number is verified."}
            </p>
          )}
          <p className="flex items-start gap-1.5">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success-500" aria-hidden />
            {MONEY_BACK_DAYS}-day money-back guarantee on your first payment. Cancel or pause any time from your billing page.
          </p>
          {refCode ? (
            <p className="rounded-lg bg-white/10 px-3 py-2 text-white">
              Referral code <span className="font-mono font-semibold">{refCode}</span> applied: your second month is on us once your first invoice is paid.
            </p>
          ) : null}
        </div>

        <button type="submit" disabled={pending} className={cn(btn.primary, "mt-5 w-full py-3 text-base")}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {pending ? "Opening secure checkout…" : path === "trial" ? "Start free trial" : `Pay ${formatUsd(dueToday)} securely`}
          {!pending ? <ArrowRight className="h-4 w-4" aria-hidden /> : null}
        </button>
        <p className="mt-3 text-center text-[11px] text-brand-200">Secure checkout by Stripe. Promotion codes can be entered on the next screen.</p>
      </aside>
    </form>
  );
}
