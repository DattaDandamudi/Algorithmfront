import Link from "next/link";
import { Eye, ShieldAlert } from "lucide-react";
import { StatusPill, verificationPill } from "./StatusPill";
import { stopImpersonatingAction } from "./shell-actions";

export function TopBar({
  businessName,
  verification,
  planLabel,
  impersonating,
  email,
}: {
  businessName: string;
  verification: string;
  planLabel: string;
  impersonating: boolean;
  email: string | null;
}) {
  const pill = verificationPill(verification);
  return (
    <div className="sticky top-0 z-30 border-b border-brand-100 bg-background/90 backdrop-blur">
      <div className="flex h-16 items-center gap-3 pl-16 pr-4 sm:pr-6 lg:pl-6">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-brand-900">{businessName}</p>
          <p className="truncate text-xs text-brand-500">
            {planLabel} plan{email ? ` · ${email}` : ""}
          </p>
        </div>
        <Link href={verification === "verified" ? "/dashboard" : "/onboarding?step=5"} className="shrink-0" title="Toll-free verification status">
          <StatusPill tone={pill.tone}>
            <Eye className="h-3 w-3" aria-hidden />
            <span className="hidden sm:inline">{pill.label}</span>
            <span className="sm:hidden">{verification === "verified" ? "Live" : verification === "rejected" ? "Rejected" : "Pending"}</span>
          </StatusPill>
        </Link>
      </div>
      {impersonating ? (
        <div className="flex flex-wrap items-center justify-between gap-2 bg-amber-100 px-4 py-1.5 text-xs font-medium text-amber-900 sm:px-6">
          <span className="inline-flex items-center gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5" aria-hidden /> Admin view: you are looking at <strong>{businessName}</strong>. Edits are disabled.
          </span>
          <form action={stopImpersonatingAction}>
            <button type="submit" className="rounded-md bg-amber-900 px-2 py-1 text-[11px] font-semibold text-white hover:bg-amber-800">
              Stop viewing as
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
