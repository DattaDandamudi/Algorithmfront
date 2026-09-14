import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowLeft, Lock } from "lucide-react";
import { z } from "zod";
import { requireAccount } from "@/lib/auth/session";
import { MONEY_BACK_DAYS, TRIAL_DAYS } from "@/lib/plans";
import { isLiveSubscriptionStatus, loadExistingSubscription, normalizeReferralCode } from "@/lib/billing/checkout";
import { REFERRAL_COOKIE } from "@/lib/billing/referrals";
import { CheckoutForm } from "@/components/billing/CheckoutForm";
import { Notice } from "@/components/billing/ui";

export const metadata: Metadata = { title: "Checkout — CallCatch" };
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  plan: z.enum(["starter", "pro"]).catch("starter"),
  interval: z.enum(["month", "year"]).catch("month"),
  path: z.enum(["trial", "paynow"]).catch("trial"),
  setup: z.enum(["1", "0"]).optional().catch(undefined),
  canceled: z.string().optional().catch(undefined),
  trial_used: z.string().optional().catch(undefined),
  ref: z
    .string()
    .trim()
    .regex(/^[a-z0-9]{4,32}$/i)
    .transform((s) => s.toLowerCase())
    .optional()
    .catch(undefined),
});

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function CheckoutPage(props: PageProps<"/billing/checkout">) {
  const { account } = await requireAccount();
  const raw = await props.searchParams;
  const params = paramsSchema.parse({
    plan: first(raw.plan),
    interval: first(raw.interval),
    path: first(raw.path),
    setup: first(raw.setup),
    canceled: first(raw.canceled),
    trial_used: first(raw.trial_used),
    ref: first(raw.ref),
  });

  // Never render Checkout for an account that already has a subscription: a second Checkout would
  // create a second Stripe subscription (double billing). Plan changes and restarts live on /billing.
  // This also covers proxy.ts's `/signup?plan=…` → `/billing/checkout` redirect for signed-in users,
  // the Stripe cancel_url and the browser Back button after a completed checkout.
  const existing = await loadExistingSubscription(account.id);
  if (existing && isLiveSubscriptionStatus(existing.status)) {
    redirect(`/billing?already_subscribed=1&plan=${params.plan}`);
  }
  // A returning customer (canceled / expired subscription) restarts with pay-now, never a second trial.
  if (existing && params.path === "trial") {
    const q = new URLSearchParams({ plan: params.plan, interval: params.interval, path: "paynow", trial_used: "1" });
    if (params.setup === "1") q.set("setup", "1");
    if (params.ref) q.set("ref", params.ref);
    redirect(`/billing/checkout?${q.toString()}`);
  }
  const trialAvailable = !existing;

  const store = await cookies();
  const cookieRef = normalizeReferralCode(store.get(REFERRAL_COOKIE)?.value);
  const refCode = params.ref ?? (cookieRef && cookieRef !== (account.referral_code ?? "").toLowerCase() ? cookieRef : undefined);
  const businessName = account.dba || account.legal_name;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link href="/billing" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:text-brand-900">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Billing
        </Link>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-500">
          <Lock className="h-3.5 w-3.5" aria-hidden />
          Secure checkout by Stripe
        </span>
      </div>

      <header className="mb-8 max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-600">{params.path === "trial" ? `${TRIAL_DAYS}-day free trial` : "Pay now · 30-day money-back"}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-brand-900 sm:text-4xl">{businessName ? `Set up billing for ${businessName}` : "Set up your CallCatch plan"}</h1>
        <p className="mt-3 text-base text-brand-700">
          {params.path === "trial"
            ? "Add a card, pick a plan, and you're in. Your trial clock only starts once the carriers verify your number, so you get the free days when text-backs are actually live."
            : "You'll be charged today and covered by a 30-day money-back guarantee. Your number typically verifies in 3–10 business days: on monthly plans your first full month starts the day it's verified; on annual plans we credit those verification days back to your account."}
        </p>
        {params.trial_used === "1" ? (
          <div className="mt-4">
            <Notice tone="info">Your free trial has already been used, so this restart is pay-now — with the {MONEY_BACK_DAYS}-day money-back guarantee.</Notice>
          </div>
        ) : null}
      </header>

      <CheckoutForm
        initialPlan={params.plan}
        initialInterval={params.interval}
        path={params.path}
        initialSetupFee={params.setup === "1"}
        refCode={refCode}
        canceled={params.canceled === "1"}
      />

      <p className="mt-8 text-center text-xs text-brand-500">
        {params.path === "trial" ? (
          <>
            Prefer to skip the trial and start today?{" "}
            <Link href={`/billing/checkout?plan=${params.plan}&interval=${params.interval}&path=paynow`} className="font-semibold underline">
              Pay now with a 30-day money-back guarantee
            </Link>
            .
          </>
        ) : trialAvailable ? (
          <>
            Want to try it first?{" "}
            <Link href={`/billing/checkout?plan=${params.plan}&interval=${params.interval}&path=trial`} className="font-semibold underline">
              Start a {TRIAL_DAYS}-day free trial instead
            </Link>
            .
          </>
        ) : null}
      </p>
    </main>
  );
}
