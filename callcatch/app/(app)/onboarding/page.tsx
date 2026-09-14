import CheckoutPixel from "@/components/onboarding/CheckoutPixel";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, LifeBuoy } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { requireUser } from "@/lib/auth/session";
import { getBillingGate, type BillingGate } from "@/lib/billing/status";
import { idOf, stripe } from "@/lib/billing/stripe";
import { syncSubscriptionById } from "@/lib/billing/sync";
import { createAdminSupabase, type Db } from "@/lib/db/client";
import type { AccountRow } from "@/lib/db/types";
import { loadCustomerNumber, userFullName } from "@/lib/onboarding/account";
import { buildWizardInitialState, currentStepFor } from "@/lib/onboarding/state";
import { Logo } from "@/components/marketing/Logo";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { signOutAction } from "@/components/dashboard/shell-actions";
import { SUPPORT_EMAIL } from "@/components/marketing/site";
import { BillingPending } from "./BillingPending";

export const metadata: Metadata = { title: "Set up CallCatch", robots: { index: false } };

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Checkout URL that keeps the plan the visitor picked at signup (stored in auth metadata by the signup action). */
function checkoutHrefFor(account: AccountRow, user: User): string {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const plan = account.plan === "pro" || meta.signup_plan === "pro" ? "pro" : "starter";
  const interval = meta.signup_interval === "year" ? "year" : "month";
  const path = meta.signup_path === "paynow" ? "paynow" : "trial";
  return `/billing/checkout?plan=${plan}&interval=${interval}&path=${path}`;
}

/** Subscription states an `onboarding` account can only leave by checking out again (vs. paused / unpaid, handled under /billing). */
const RECHECKOUT_STATUSES = new Set(["canceled", "incomplete", "incomplete_expired"]);

/**
 * Stripe sends the customer back here before its webhook necessarily ran. When we hold a session id
 * that belongs to this account, mirror the subscription ourselves (same idempotent upsert the webhook
 * uses) so the wizard opens without a wait. Returns true when a row exists afterwards.
 */
async function syncFromCheckoutSession(sessionId: string, accountId: string): Promise<boolean> {
  try {
    const session = await stripe().checkout.sessions.retrieve(sessionId);
    const owner = session.client_reference_id ?? session.metadata?.account_id ?? null;
    if (owner !== accountId || session.mode !== "subscription") return false;
    const subscriptionId = idOf(session.subscription);
    if (!subscriptionId) return false;
    const meta = session.metadata ?? {};
    const result = await syncSubscriptionById(subscriptionId, {
      accountId,
      paidNow: meta.path === "paynow",
      setupFeePaid: meta.setup_fee === "1" && session.payment_status === "paid",
    });
    return result !== null;
  } catch (err) {
    console.error("[onboarding] checkout session sync failed", { accountId, message: err instanceof Error ? err.message : String(err) });
    return false;
  }
}

function NoAccount({ email }: { email: string | null | undefined }) {
  return (
    <main className="mx-auto w-full max-w-md px-4 py-16 text-center sm:px-6">
      <div className="rounded-2xl border border-brand-100 bg-white p-8 shadow-sm">
        <LifeBuoy className="mx-auto h-8 w-8 text-accent-500" aria-hidden />
        <h1 className="mt-4 text-xl font-bold tracking-tight text-brand-900">No CallCatch account for this sign-in</h1>
        <p className="mt-2 text-sm text-brand-600">
          {email ? <span className="font-medium text-brand-800">{email}</span> : "This login"} is not attached to a CallCatch account — it may have been deleted at your request, or something went wrong while it was being created.
        </p>
        <div className="mt-6 flex flex-col items-center gap-3 text-sm">
          <Link href="/onboarding" className="rounded-xl bg-brand-900 px-4 py-2 font-semibold text-white hover:bg-brand-800">
            Try again
          </Link>
          <form action={signOutAction}>
            <button type="submit" className="rounded-xl border border-brand-200 px-4 py-2 font-semibold text-brand-800 hover:bg-brand-50">
              Sign out and start a new trial
            </button>
          </form>
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-brand-600 underline underline-offset-2 hover:text-brand-900">
            Contact support
          </a>
        </div>
      </div>
    </main>
  );
}

export default async function OnboardingPage(props: PageProps<"/onboarding">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const db: Db = createAdminSupabase();

  // Membership check via RLS-scoped helper is done in requireMemberAccount for mutations; here we need the full row.
  // A signed-in user without an account row (deleted at their request, or a cleaned-up test signup) must
  // get a page they can act on — redirecting to /login would bounce straight back here forever.
  const { data: membership } = await db.from("account_members").select("account_id").eq("user_id", user.id).limit(1).maybeSingle();
  const { data: account } = membership ? await db.from("accounts").select("*").eq("id", membership.account_id).maybeSingle() : { data: null };
  if (!account) return <NoAccount email={user.email} />;
  if (account.status === "cancelled") redirect("/billing");

  const checkoutSuccess = first(sp.checkout) === "success";
  const checkoutSessionId = first(sp.session_id) ?? "";
  const checkoutHref = checkoutHrefFor(account, user);

  // Billing gate: the wizard buys a Twilio number and submits carrier verification, so it is only
  // reachable with an entitled subscription (spec §3: signup → Checkout → onboarding).
  let gate: BillingGate = await getBillingGate(account.id, db);
  if (!gate.allowed && account.status === "onboarding") {
    if (checkoutSuccess && gate.reason === "no_subscription") {
      // Race with the Stripe webhook: try to mirror the session ourselves, else wait for the webhook.
      if (checkoutSessionId && (await syncFromCheckoutSession(checkoutSessionId, account.id))) {
        gate = await getBillingGate(account.id, db);
      }
      if (!gate.allowed) {
        return (
          <main className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6">
            <BillingPending checkoutHref={checkoutHref} />
          </main>
        );
      }
    } else if (gate.reason === "no_subscription" || RECHECKOUT_STATUSES.has(gate.subscription?.status ?? "")) {
      redirect(checkoutHref);
    } else {
      redirect("/billing");
    }
  }

  const number = await loadCustomerNumber(db, account.id);
  const initial = buildWizardInitialState(account, number, { email: user.email ?? "", fullName: userFullName(user) });
  const checkoutEvent: "StartTrial" | "Purchase" = checkoutSuccess && checkoutSessionId && gate.subscription?.paid_now ? "Purchase" : "StartTrial";
  const requestedStep = Number(first(sp.step));
  const startStep = Number.isInteger(requestedStep) && requestedStep >= 1 && requestedStep <= initial.completedStep + 1 ? requestedStep : currentStepFor(initial.completedStep);

  return (
    <div className="min-h-screen bg-[radial-gradient(70rem_36rem_at_50%_-12%,#d8e2f2_0%,#fbfaf7_55%)]">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 pt-6 sm:px-6">
        <Logo />
        <span className="text-xs font-medium text-brand-500">{user.email}</span>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 pb-16 pt-6 sm:px-6">
        {checkoutSuccess && checkoutSessionId ? <CheckoutPixel sessionId={checkoutSessionId} eventName={checkoutEvent} /> : null}
        {checkoutSuccess ? (
          <div role="status" className="mb-6 flex items-center gap-3 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-success-500" aria-hidden />
            <span>
              <span className="font-semibold">Billing is set.</span> Now let&apos;s get your front desk answering — about 10 minutes.
            </span>
          </div>
        ) : null}
        <OnboardingWizard initial={initial} startStep={startStep} />
      </main>
    </div>
  );
}
