"use client";

import { useActionState } from "react";
import { ArrowUpRight, Loader2 } from "lucide-react";
import type { ActionState } from "@/app/(app)/billing/actions";
import { changePlanAction } from "@/app/(app)/billing/actions";
import { PLANS, type BillingInterval, type PlanId } from "@/lib/plans";
import { recurringPriceUsd } from "@/lib/billing/plans-ui";
import { formatUsd } from "@/lib/utils";
import { btn, Notice } from "@/components/billing/ui";

export function ChangePlanForm({ currentPlan, interval, disabled }: { currentPlan: PlanId; interval: BillingInterval; disabled?: boolean }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(changePlanAction, null);
  const target: PlanId = currentPlan === "pro" ? "starter" : "pro";
  const per = interval === "year" ? "yr" : "mo";
  const upgrading = target === "pro";

  return (
    <form action={formAction} className="space-y-3">
      {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
      {state?.ok ? <Notice tone="success">{state.ok}</Notice> : null}
      <input type="hidden" name="plan" value={target} />
      {upgrading ? (
        <p className="text-sm text-brand-700">
          Pro adds web-form and Meta lead replies, booking hand-off, after-hours on-call routing, a second number and 500 conversations a month for{" "}
          <strong className="text-brand-900">
            {formatUsd(recurringPriceUsd("pro", interval))}/{per}
          </strong>
          . You&apos;re charged only the prorated difference for the rest of this period.
        </p>
      ) : (
        <p className="text-sm text-brand-700">
          Switch to {PLANS.starter.name} ({formatUsd(recurringPriceUsd("starter", interval))}/{per}). Pro features turn off immediately; the difference is credited against your next invoice.
        </p>
      )}
      <button type="submit" disabled={disabled || pending} className={upgrading ? btn.primary : btn.secondary}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ArrowUpRight className="h-4 w-4" aria-hidden />}
        {upgrading ? "Upgrade to Pro" : "Switch to Starter"}
      </button>
    </form>
  );
}
