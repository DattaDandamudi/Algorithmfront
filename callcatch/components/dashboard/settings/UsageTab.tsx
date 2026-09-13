import Link from "next/link";
import { ArrowUpRight, Gauge } from "lucide-react";
import type { AccountRow, UsageMonthlyRow } from "@/lib/db/types";
import { getPlan } from "@/lib/plans";
import { formatUsd } from "@/lib/utils";
import { Card, CardTitle, btn } from "../primitives";
import { StatTile } from "../StatTile";

export function UsageTab({
  account,
  usage,
  liveConversations,
  period,
}: {
  account: AccountRow;
  usage: UsageMonthlyRow | null;
  liveConversations: number;
  period: string;
}) {
  const plan = getPlan(account.plan);
  const used = Math.max(usage?.conversations ?? 0, liveConversations);
  const pct = Math.min(
    100,
    Math.round((used / plan.includedConversations) * 100),
  );
  const overage = Math.max(0, used - plan.includedConversations);
  const monthLabel = new Date(`${period}T12:00:00Z`).toLocaleDateString(
    "en-US",
    { month: "long", year: "numeric", timeZone: "UTC" },
  );
  const nearing = pct >= 80;

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardTitle
          icon={<Gauge className="h-5 w-5" aria-hidden />}
          sub={`${monthLabel} · ${plan.name} plan includes ${plan.includedConversations} conversations, then $${plan.overagePerConversationUsd.toFixed(2)} each`}
          action={
            plan.id === "starter" ? (
              <Link href="/billing" className={btn.secondary}>
                Upgrade to Pro <ArrowUpRight className="h-4 w-4" aria-hidden />
              </Link>
            ) : null
          }
        >
          Conversations this month
        </CardTitle>
        <div className="flex items-end justify-between gap-3">
          <p className="text-3xl font-bold tabular-nums text-brand-900">
            {used}{" "}
            <span className="text-base font-medium text-brand-500">
              / {plan.includedConversations}
            </span>
          </p>
          <p
            className={`text-sm font-semibold ${nearing ? "text-accent-700" : "text-brand-600"}`}
          >
            {pct}% used
          </p>
        </div>
        <div
          className="mt-3 h-3 w-full overflow-hidden rounded-full bg-brand-100"
          role="progressbar"
          aria-valuenow={used}
          aria-valuemin={0}
          aria-valuemax={plan.includedConversations}
          aria-label="Conversations used this month"
        >
          <div
            className={`h-full rounded-full transition-all ${overage > 0 ? "bg-danger-500" : nearing ? "bg-accent-500" : "bg-brand-500"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-brand-500">
          {overage > 0
            ? `${overage} over the included amount — about ${formatUsd(overage * plan.overagePerConversationUsd)} in overage this month.`
            : nearing
              ? `Close to the limit. ${plan.id === "starter" ? "Pro includes 500 conversations and web-form leads." : "Overage is billed at the end of the month."}`
              : "A conversation is one customer thread started this month, no matter how many texts it takes."}
        </p>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile
          label="Texts sent"
          value={usage?.sms_segments_out ?? 0}
          hint="SMS segments out"
        />
        <StatTile
          label="Texts received"
          value={usage?.sms_segments_in ?? 0}
          hint="SMS segments in"
        />
        <StatTile
          label="Voice minutes"
          value={Number(usage?.voice_minutes ?? 0).toFixed(0)}
          hint="Greeting + voicemail"
        />
        <StatTile
          label="Numbers"
          value={`${plan.numbers}`}
          hint={plan.numbers > 1 ? "Included on Pro" : "1 toll-free or local"}
        />
      </div>

      <p className="text-xs text-brand-500">
        Usage rolls up nightly; the conversation count above also includes
        threads started today. Invoices and overage line items live under
        Billing.
      </p>
    </div>
  );
}
