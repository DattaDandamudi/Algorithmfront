import CheckoutPixel from "@/components/onboarding/CheckoutPixel";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { createAdminSupabase } from "@/lib/db/client";
import { loadCustomerNumber, userFullName } from "@/lib/onboarding/account";
import { buildWizardInitialState, currentStepFor } from "@/lib/onboarding/state";
import { Logo } from "@/components/marketing/Logo";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";

export const metadata: Metadata = { title: "Set up CallCatch", robots: { index: false } };

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function OnboardingPage(props: PageProps<"/onboarding">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const db = createAdminSupabase();

  // Membership check via RLS-scoped helper is done in requireMemberAccount for mutations; here we need the full row.
  const { data: membership } = await db.from("account_members").select("account_id").eq("user_id", user.id).limit(1).maybeSingle();
  if (!membership) {
    // The signup trigger creates the account; if it hasn't landed yet, bounce through login once.
    redirect("/login?next=%2Fonboarding&error=" + encodeURIComponent("Your account is still being created — sign in again in a moment."));
  }
  const { data: account } = await db.from("accounts").select("*").eq("id", membership.account_id).maybeSingle();
  if (!account) redirect("/login");
  if (account.status === "cancelled") redirect("/billing");

  const number = await loadCustomerNumber(db, account.id);
  const initial = buildWizardInitialState(account, number, { email: user.email ?? "", fullName: userFullName(user) });
  const checkoutSuccess = first(sp.checkout) === "success";
  const checkoutSessionId = first(sp.session_id) ?? "";
  let checkoutEvent: "StartTrial" | "Purchase" = "StartTrial";
  if (checkoutSuccess && checkoutSessionId) {
    const { data: sub } = await db.from("subscriptions").select("paid_now").eq("account_id", account.id).maybeSingle();
    if (sub?.paid_now) checkoutEvent = "Purchase";
  }
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
