import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { PLANS, TRIAL_DAYS } from "@/lib/plans";
import { GoogleButton, OrDivider } from "../_shared/GoogleButton";
import type { PlanParams } from "../_shared/next-path";
import { SignupForm } from "./SignupForm";

export const metadata: Metadata = { title: "Create your account", robots: { index: false } };

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function SignupPage(props: PageProps<"/signup">) {
  const sp = await props.searchParams;
  const plan: PlanParams = {
    plan: first(sp.plan) === "pro" ? "pro" : first(sp.plan) === "starter" ? "starter" : undefined,
    interval: first(sp.interval) === "year" ? "year" : first(sp.interval) === "month" ? "month" : undefined,
    path: first(sp.path) === "paynow" ? "paynow" : first(sp.path) === "trial" ? "trial" : undefined,
    ref: first(sp.ref)?.slice(0, 32),
    setup: first(sp.setup) === "1" ? "1" : undefined,
  };
  const error = first(sp.error)?.slice(0, 200);
  const chosen = plan.plan === "pro" || plan.plan === "starter" ? PLANS[plan.plan] : null;
  const isPayNow = plan.path === "paynow";

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-brand-900">{isPayNow ? "Set up CallCatch" : `Start your ${TRIAL_DAYS}-day free trial`}</h1>
        <p className="mt-1 text-sm text-brand-600">
          {chosen ? (
            <>
              <span className="font-semibold text-brand-800">{chosen.name}</span> · ${plan.interval === "year" ? `${chosen.priceAnnualUsd}/yr` : `${chosen.priceMonthlyUsd}/mo`}
              {isPayNow ? " · 30-day money-back" : " · card required, trial starts when your number verifies"}
            </>
          ) : (
            "Every missed call texts back in 10 seconds. No number change, 10-minute setup."
          )}
        </p>
      </div>
      <GoogleButton flow="signup" plan={plan} />
      <OrDivider />
      <SignupForm plan={plan} initialError={error} />
      <ul className="mt-6 grid gap-1.5 text-xs text-brand-600">
        {["Keep your existing business number", "Owner alerts from day one, before carrier verification", "Cancel any time from the billing portal"].map((t) => (
          <li key={t} className="flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-success-500" aria-hidden />
            {t}
          </li>
        ))}
      </ul>
      <p className="mt-6 text-center text-sm text-brand-600">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-accent-600 hover:text-accent-700">
          Sign in
        </Link>
      </p>
    </>
  );
}
