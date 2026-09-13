import type { UsageSnapshot } from "@/lib/billing/usage";
import { formatUsd } from "@/lib/utils";
import { cn } from "@/lib/utils";

function monthLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
}

export function UsageMeter({ usage, planName }: { usage: UsageSnapshot; planName: string }) {
  const pct = usage.included > 0 ? Math.min(100, Math.round((usage.conversations / usage.included) * 100)) : 0;
  const over = usage.overage > 0;
  const near = !over && pct >= 80;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-brand-600">{monthLabel(usage.period)}</p>
        <p className="text-sm font-medium text-brand-900">
          <span className="text-2xl font-bold tabular-nums">{usage.conversations.toLocaleString()}</span>
          <span className="text-brand-500"> / {usage.included.toLocaleString()} conversations included in {planName}</span>
        </p>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={usage.included}
        aria-valuenow={Math.min(usage.conversations, usage.included)}
        aria-label="Conversations used this month"
        className="mt-3 h-3 w-full overflow-hidden rounded-full bg-brand-100"
      >
        <div className={cn("h-full rounded-full transition-all", over ? "bg-accent-500" : near ? "bg-warning-500" : "bg-brand-500")} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-brand-600 sm:grid-cols-4">
        <div>
          <p className="font-semibold text-brand-900">{usage.smsSegmentsOut.toLocaleString()}</p>
          <p>texts sent</p>
        </div>
        <div>
          <p className="font-semibold text-brand-900">{usage.smsSegmentsIn.toLocaleString()}</p>
          <p>texts received</p>
        </div>
        <div>
          <p className="font-semibold text-brand-900">{usage.voiceMinutes.toFixed(0)}</p>
          <p>voice minutes</p>
        </div>
        <div>
          <p className={cn("font-semibold", over ? "text-accent-700" : "text-brand-900")}>{over ? formatUsd(usage.estimatedOverageUsd) : "$0"}</p>
          <p>est. overage</p>
        </div>
      </div>
      <p className="mt-3 text-xs text-brand-500">
        A conversation is one contact thread per missed call or lead. Beyond your included amount, extra conversations are {`$${usage.overageUnitUsd.toFixed(2)}`} each, billed on your next invoice.
        {near ? " You're close to the limit — Pro includes 500." : null}
      </p>
    </div>
  );
}
