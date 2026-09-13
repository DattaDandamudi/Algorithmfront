import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type PillTone = "neutral" | "info" | "success" | "warning" | "danger" | "accent";

const TONES: Record<PillTone, string> = {
  neutral: "bg-brand-50 text-brand-700 ring-brand-200",
  info: "bg-blue-50 text-blue-800 ring-blue-200",
  success: "bg-green-50 text-green-800 ring-green-200",
  warning: "bg-amber-50 text-amber-900 ring-amber-200",
  danger: "bg-red-50 text-red-800 ring-red-200",
  accent: "bg-accent-50 text-accent-800 ring-accent-200",
};

export function StatusPill({ tone = "neutral", children, dot = true, className, title }: { tone?: PillTone; children: ReactNode; dot?: boolean; className?: string; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset", TONES[tone], className)}>
      {dot ? <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current opacity-70" /> : null}
      {children}
    </span>
  );
}

/** Mappings for the enum-ish text columns. */
export function verificationPill(status: string): { tone: PillTone; label: string } {
  switch (status) {
    case "verified":
      return { tone: "success", label: "Verified · texting on" };
    case "in_review":
      return { tone: "info", label: "In carrier review" };
    case "pending":
      return { tone: "warning", label: "Verification pending" };
    case "rejected":
      return { tone: "danger", label: "Verification rejected" };
    default:
      return { tone: "neutral", label: "Not submitted" };
  }
}

export function conversationPill(status: string): { tone: PillTone; label: string } {
  switch (status) {
    case "qualified":
      return { tone: "info", label: "Qualified" };
    case "booked":
      return { tone: "success", label: "Booked" };
    case "lost":
      return { tone: "danger", label: "Lost" };
    case "closed":
      return { tone: "neutral", label: "Closed" };
    default:
      return { tone: "accent", label: "Open" };
  }
}

export function leadPill(status: string): { tone: PillTone; label: string } {
  switch (status) {
    case "qualified":
      return { tone: "info", label: "Qualified" };
    case "booked":
      return { tone: "success", label: "Booked" };
    case "lost":
      return { tone: "danger", label: "Lost" };
    default:
      return { tone: "accent", label: "New" };
  }
}

export function urgencyPill(urgency: string | null | undefined): { tone: PillTone; label: string } | null {
  switch (urgency) {
    case "emergency":
      return { tone: "danger", label: "Emergency" };
    case "today":
      return { tone: "warning", label: "Today" };
    case "this_week":
      return { tone: "info", label: "This week" };
    case "flexible":
      return { tone: "neutral", label: "Flexible" };
    default:
      return null;
  }
}

export function accountStatusPill(status: string): { tone: PillTone; label: string } {
  switch (status) {
    case "live":
      return { tone: "success", label: "Live" };
    case "pending_verification":
      return { tone: "warning", label: "Pending verification" };
    case "paused":
      return { tone: "info", label: "Paused" };
    case "cancelled":
      return { tone: "danger", label: "Cancelled" };
    default:
      return { tone: "neutral", label: "Onboarding" };
  }
}

export function subscriptionPill(status: string | null | undefined): { tone: PillTone; label: string } {
  switch (status) {
    case "active":
      return { tone: "success", label: "Active" };
    case "trialing":
      return { tone: "info", label: "Trialing" };
    case "past_due":
    case "unpaid":
      return { tone: "danger", label: "Past due" };
    case "paused":
      return { tone: "warning", label: "Paused" };
    case "canceled":
      return { tone: "danger", label: "Canceled" };
    case "incomplete":
    case "incomplete_expired":
      return { tone: "warning", label: "Incomplete" };
    default:
      return { tone: "neutral", label: "No subscription" };
  }
}
