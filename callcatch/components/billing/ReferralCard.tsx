"use client";

import { useState } from "react";
import { Check, Copy, Gift } from "lucide-react";
import type { ReferralSummary } from "@/lib/billing/referrals";
import { formatUsd } from "@/lib/utils";
import { btn, Card, CardTitle } from "@/components/billing/ui";

export function ReferralCard({ referral }: { referral: ReferralSummary }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(referral.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the input below is selectable.
    }
  }

  return (
    <Card>
      <CardTitle icon={<Gift className="h-4 w-4" aria-hidden />} sub={`Give a contractor a free month, get ${formatUsd(referral.creditUsd)} off your next invoice.`}>
        Refer a contractor
      </CardTitle>
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="referral-link">
          Your referral link
        </label>
        <input
          id="referral-link"
          readOnly
          value={referral.link}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded-xl border border-brand-200 bg-brand-50/60 px-3 py-2.5 font-mono text-sm text-brand-900"
        />
        <button type="button" onClick={copy} className={btn.secondary} aria-live="polite">
          {copied ? <Check className="h-4 w-4 text-success-500" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
        <div className="rounded-xl bg-brand-50/60 px-2 py-3">
          <dt className="text-xs text-brand-500">Your code</dt>
          <dd className="font-mono text-sm font-semibold text-brand-900">{referral.code ?? "—"}</dd>
        </div>
        <div className="rounded-xl bg-brand-50/60 px-2 py-3">
          <dt className="text-xs text-brand-500">Signed up</dt>
          <dd className="text-sm font-semibold text-brand-900">{referral.pending + referral.rewarded}</dd>
        </div>
        <div className="rounded-xl bg-brand-50/60 px-2 py-3">
          <dt className="text-xs text-brand-500">Credits earned</dt>
          <dd className="text-sm font-semibold text-brand-900">{formatUsd(referral.rewarded * referral.creditUsd)}</dd>
        </div>
      </dl>
      <p className="mt-4 text-xs leading-relaxed text-brand-600">
        How it works: they sign up with your link, and the day their first invoice is paid we add a {formatUsd(referral.creditUsd)} credit to your account (applied automatically to your next invoice) and give them {formatUsd(referral.creditUsd)} off their next month. No limit on referrals.
      </p>
    </Card>
  );
}
