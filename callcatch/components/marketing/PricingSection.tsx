"use client";

import { useState } from "react";
import { Check, Minus, Sparkles } from "lucide-react";
import { MONEY_BACK_DAYS, PLANS, SETUP_FEE_USD, TRIAL_DAYS, type BillingInterval, type PlanId } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { TrackedLink } from "./TrackedLink";
import { buttonClasses } from "./ui";

function usd(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

type Row = { label: string; starter: string | boolean; pro: string | boolean };

/** Feature comparison from spec §2. Strings render as text, booleans as check/dash. */
export const COMPARISON_ROWS: Row[] = [
  { label: "Phone numbers", starter: "1 toll-free (or 1 local via 10DLC for sole props)", pro: "2 numbers" },
  { label: "Conversations per month", starter: `${PLANS.starter.includedConversations}, then $${PLANS.starter.overagePerConversationUsd.toFixed(2)} each`, pro: `${PLANS.pro.includedConversations}, then $${PLANS.pro.overagePerConversationUsd.toFixed(2)} each` },
  { label: "Missed-call text-back in 10 seconds", starter: true, pro: true },
  { label: "AI qualification (issue, address, urgency, window)", starter: true, pro: true },
  { label: "Owner alert SMS + email with one-tap \"Call now\"", starter: true, pro: true },
  { label: "Shared inbox with human takeover", starter: true, pro: true },
  { label: "Voicemail transcription + email summary", starter: true, pro: true },
  { label: "Weekly \"calls recovered / revenue saved\" report", starter: "Email", pro: "Email + SMS + PDF" },
  { label: "Web-form and email leads get an instant text", starter: false, pro: true },
  { label: "Meta Instant Form leads answered by text", starter: false, pro: "Within minutes" },
  { label: "Booking hand-off (Jobber, Housecall Pro, Calendly or CallCatch page)", starter: false, pro: true },
  { label: "After-hours emergency routing to your on-call tech", starter: false, pro: true },
  { label: "Meta Conversions API pass-back to your own ad account", starter: false, pro: "Month 2+" },
];

const PLAN_BULLETS: Record<PlanId, string[]> = {
  starter: [
    "1 toll-free number, forwarded from the line you already have",
    `${PLANS.starter.includedConversations} conversations/mo included`,
    "Text-back in 10 seconds + AI qualification",
    "Owner alerts by SMS and email, one-tap call back",
    "Shared inbox, take over any thread",
    "Voicemail transcription",
    "Monday \"calls recovered\" email",
  ],
  pro: [
    "Everything in Starter, 2 numbers",
    `${PLANS.pro.includedConversations} conversations/mo included`,
    "Web-form and Meta leads answered by text in minutes",
    "Booking hand-off to Jobber, Housecall Pro or Calendly",
    "After-hours emergency routing to your on-call tech",
    "Weekly report by email, SMS and PDF",
    "Meta Conversions API pass-back (month 2+)",
  ],
};

export function PricingSection({ showComparison = false, id = "pricing" }: { showComparison?: boolean; id?: string }) {
  const [interval, setInterval] = useState<BillingInterval>("month");
  const annual = interval === "year";

  return (
    <div id={id} className="scroll-mt-20">
      <div className="flex justify-center">
        <div role="radiogroup" aria-label="Billing interval" className="inline-flex items-center rounded-full border border-brand-200 bg-white p-1 text-sm font-medium shadow-sm">
          <button
            type="button"
            role="radio"
            aria-checked={!annual}
            onClick={() => setInterval("month")}
            className={cn("rounded-full px-4 py-2 transition", !annual ? "bg-brand-900 text-white" : "text-brand-700 hover:text-brand-900")}
          >
            Monthly
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={annual}
            onClick={() => setInterval("year")}
            className={cn("rounded-full px-4 py-2 transition", annual ? "bg-brand-900 text-white" : "text-brand-700 hover:text-brand-900")}
          >
            Annual <span className={cn("ml-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold", annual ? "bg-accent-500 text-white" : "bg-accent-100 text-accent-800")}>2 months free</span>
          </button>
        </div>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-2 lg:gap-8">
        {(["starter", "pro"] as PlanId[]).map((planId) => {
          const plan = PLANS[planId];
          const isPro = planId === "pro";
          const price = annual ? plan.priceAnnualUsd : plan.priceMonthlyUsd;
          const perMonthEquivalent = annual ? Math.round(plan.priceAnnualUsd / 12) : plan.priceMonthlyUsd;
          const href = `/signup?plan=${planId}&interval=${interval}&path=trial`;
          return (
            <article
              key={planId}
              className={cn(
                "relative flex flex-col rounded-3xl border bg-white p-6 shadow-sm sm:p-8",
                isPro ? "border-accent-300 ring-2 ring-accent-200" : "border-brand-100"
              )}
              aria-labelledby={`plan-${planId}-${id}`}
            >
              {isPro ? (
                <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full bg-accent-500 px-3 py-1 text-xs font-semibold text-white">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Most owners pick this on the onboarding call
                </span>
              ) : null}
              <h3 id={`plan-${planId}-${id}`} className="text-xl font-bold text-brand-900">
                {plan.name}
              </h3>
              <p className="mt-1 text-sm text-brand-700">{plan.tagline}</p>
              <p className="mt-6 flex items-baseline gap-1.5">
                <span className="text-5xl font-bold tabular-nums tracking-tight text-brand-900">{usd(price)}</span>
                <span className="text-sm font-medium text-brand-600">/{annual ? "year" : "month"}</span>
              </p>
              <p className="mt-1 text-sm text-brand-600">
                {annual ? (
                  <>
                    {usd(perMonthEquivalent)}/mo equivalent · <span className="font-medium text-success-500">setup included</span>
                  </>
                ) : (
                  <>Optional done-for-you setup: {usd(SETUP_FEE_USD)} once (we set it all up on a call)</>
                )}
              </p>
              <ul className="mt-6 space-y-2.5 text-sm text-brand-800">
                {PLAN_BULLETS[planId].map((b) => (
                  <li key={b} className="flex gap-2.5">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success-500" aria-hidden="true" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                <TrackedLink
                  href={href}
                  event="StartTrial"
                  dataEvent={`pricing_${planId}_${interval}_trial`}
                  params={{ content_category: "cta_click", plan: planId, interval, value: price, currency: "USD" }}
                  className={cn(isPro ? buttonClasses.primary : buttonClasses.secondaryDark, "w-full")}
                >
                  Start {TRIAL_DAYS}-day free trial
                </TrackedLink>
                <p className="mt-3 text-center text-xs text-brand-600">
                  Card required, not charged until your number is verified and texting is live. Cancel any time. {MONEY_BACK_DAYS}-day money-back on your first charge.
                </p>
              </div>
            </article>
          );
        })}
      </div>

      <div className="mx-auto mt-8 max-w-3xl rounded-2xl border border-dashed border-brand-200 bg-brand-50/60 p-5 text-sm text-brand-800">
        <p>
          <strong className="text-brand-900">Done-for-you setup — {usd(SETUP_FEE_USD)}, waived on annual.</strong> A 20-minute call where we submit your carrier verification, set your greeting and AI profile, test call forwarding on your line and verify your alert phone. You hang up live. Available on monthly plans as an add-on at checkout.
        </p>
        <p className="mt-2">
          <strong className="text-brand-900">Overage:</strong> a conversation is one caller&apos;s thread within a 24-hour window, however many texts it takes. Most owner-operators stay well inside the included amount.
        </p>
      </div>

      {showComparison ? <ComparisonTable /> : null}
    </div>
  );
}

export function ComparisonTable() {
  return (
    <div className="mt-14">
      <h3 className="text-center text-2xl font-bold text-brand-900">Compare plans</h3>

      {/* Phone layout: one card per feature (the 3-column table needs ~640px). */}
      <ul className="mt-6 space-y-3 sm:hidden" aria-label="Feature comparison of Starter and Pro plans">
        {[
          ...COMPARISON_ROWS,
          { label: "Annual (2 months free)", starter: `${usd(PLANS.starter.priceAnnualUsd)}/yr`, pro: `${usd(PLANS.pro.priceAnnualUsd)}/yr` },
          { label: "Done-for-you setup (optional)", starter: `${usd(SETUP_FEE_USD)} on monthly · waived on annual`, pro: `${usd(SETUP_FEE_USD)} on monthly · waived on annual` },
        ].map((row) => (
          <li key={row.label} className="rounded-2xl border border-brand-100 bg-white p-4">
            <p className="font-semibold text-brand-900">{row.label}</p>
            <dl className="mt-2 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-brand-500">Starter</dt>
                <dd className="mt-0.5 text-brand-800">
                  <CompactValue value={row.starter} />
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-accent-600">Pro</dt>
                <dd className="mt-0.5 text-brand-800">
                  <CompactValue value={row.pro} />
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>

      <div className="mt-6 hidden overflow-x-auto rounded-2xl border border-brand-100 bg-white sm:block">
        <table className="w-full min-w-[640px] text-left text-sm">
          <caption className="sr-only">Feature comparison of Starter and Pro plans</caption>
          <thead className="bg-brand-50 text-brand-900">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">
                Feature
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Starter · {usd(PLANS.starter.priceMonthlyUsd)}/mo
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Pro · {usd(PLANS.pro.priceMonthlyUsd)}/mo
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-100">
            {COMPARISON_ROWS.map((row) => (
              <tr key={row.label}>
                <th scope="row" className="px-4 py-3 font-medium text-brand-900">
                  {row.label}
                </th>
                <Cell value={row.starter} />
                <Cell value={row.pro} />
              </tr>
            ))}
            <tr>
              <th scope="row" className="px-4 py-3 font-medium text-brand-900">
                Annual (2 months free)
              </th>
              <td className="px-4 py-3 text-brand-800">{usd(PLANS.starter.priceAnnualUsd)}/yr</td>
              <td className="px-4 py-3 text-brand-800">{usd(PLANS.pro.priceAnnualUsd)}/yr</td>
            </tr>
            <tr>
              <th scope="row" className="px-4 py-3 font-medium text-brand-900">
                Done-for-you setup (optional)
              </th>
              <td className="px-4 py-3 text-brand-800">{usd(SETUP_FEE_USD)} on monthly · waived on annual</td>
              <td className="px-4 py-3 text-brand-800">{usd(SETUP_FEE_USD)} on monthly · waived on annual</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CompactValue({ value }: { value: string | boolean }) {
  if (typeof value === "string") return <>{value}</>;
  return value ? (
    <span className="inline-flex items-center gap-1 text-success-500">
      <Check className="h-4 w-4" aria-hidden="true" /> Included
    </span>
  ) : (
    <span className="text-brand-400">—</span>
  );
}

function Cell({ value }: { value: string | boolean }) {
  if (typeof value === "string") return <td className="px-4 py-3 text-brand-800">{value}</td>;
  return (
    <td className="px-4 py-3">
      {value ? (
        <span className="inline-flex items-center gap-1 text-success-500">
          <Check className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">Included</span>
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-brand-300">
          <Minus className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">Not included</span>
        </span>
      )}
    </td>
  );
}
