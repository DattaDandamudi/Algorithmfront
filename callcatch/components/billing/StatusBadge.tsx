import { CheckCircle2, CircleDashed, CircleOff, Clock3, PauseCircle, AlertTriangle } from "lucide-react";
import { STATUS_LABEL, STATUS_TONE, type SubscriptionUiStatus } from "@/lib/billing/plans-ui";
import { cn } from "@/lib/utils";

const TONE_CLASS = {
  success: "border-green-200 bg-green-50 text-green-800",
  info: "border-brand-200 bg-brand-50 text-brand-800",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  danger: "border-red-200 bg-red-50 text-red-800",
  neutral: "border-brand-100 bg-white text-brand-600",
} as const;

function Icon({ status }: { status: SubscriptionUiStatus }) {
  const cls = "h-3.5 w-3.5";
  switch (status) {
    case "active":
      return <CheckCircle2 className={cls} aria-hidden />;
    case "trialing":
      return <Clock3 className={cls} aria-hidden />;
    case "paused":
      return <PauseCircle className={cls} aria-hidden />;
    case "past_due":
    case "unpaid":
    case "incomplete":
      return <AlertTriangle className={cls} aria-hidden />;
    case "canceled":
    case "incomplete_expired":
      return <CircleOff className={cls} aria-hidden />;
    default:
      return <CircleDashed className={cls} aria-hidden />;
  }
}

export function StatusBadge({ status, label, className }: { status: SubscriptionUiStatus; label?: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold", TONE_CLASS[STATUS_TONE[status]], className)}>
      <Icon status={status} />
      {label ?? STATUS_LABEL[status]}
    </span>
  );
}
