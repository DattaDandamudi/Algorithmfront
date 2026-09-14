"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

const POLL_MS = 2500;
const MAX_POLLS = 12; // ~30 s, then hand the user a manual way forward

/**
 * Shown on /onboarding?checkout=success while Stripe's webhook has not yet written the
 * `subscriptions` row. Re-renders the server page every few seconds; once the row lands the
 * page renders the wizard instead of this.
 */
export function BillingPending({ checkoutHref }: { checkoutHref: string }) {
  const router = useRouter();
  const [polls, setPolls] = useState(0);
  const gaveUp = polls >= MAX_POLLS;

  useEffect(() => {
    if (gaveUp) return;
    const t = setTimeout(() => {
      setPolls((n) => n + 1);
      router.refresh();
    }, POLL_MS);
    return () => clearTimeout(t);
  }, [polls, gaveUp, router]);

  return (
    <div role="status" className="mx-auto max-w-lg rounded-2xl border border-brand-100 bg-white p-8 text-center shadow-sm">
      <Loader2 className="mx-auto h-6 w-6 animate-spin text-accent-500" aria-hidden />
      <h1 className="mt-4 text-xl font-bold tracking-tight text-brand-900">Finishing your billing setup…</h1>
      <p className="mt-2 text-sm text-brand-600">
        Stripe is confirming your payment method. This usually takes a few seconds; the wizard opens automatically when it lands.
      </p>
      {gaveUp ? (
        <div className="mt-6 flex flex-col items-center gap-3 text-sm">
          <p className="text-brand-700">Still waiting. If you completed checkout, your billing page will show it shortly.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <button type="button" onClick={() => setPolls(0)} className="rounded-xl border border-brand-200 px-4 py-2 font-semibold text-brand-800 hover:bg-brand-50">
              Check again
            </button>
            <Link href="/billing" className="rounded-xl bg-brand-900 px-4 py-2 font-semibold text-white hover:bg-brand-800">
              Open billing
            </Link>
            <Link href={checkoutHref} className="rounded-xl border border-brand-200 px-4 py-2 font-semibold text-brand-800 hover:bg-brand-50">
              Back to checkout
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
