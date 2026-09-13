import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function StatTile({
  label,
  value,
  hint,
  icon,
  tone = "default",
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: "default" | "accent";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-2xl border p-4 sm:p-5",
        tone === "accent" ? "border-accent-200 bg-accent-50" : "border-brand-100 bg-white shadow-[0_1px_2px_rgba(11,31,58,0.04)]",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={cn("text-xs font-semibold uppercase tracking-wide", tone === "accent" ? "text-accent-700" : "text-brand-500")}>{label}</span>
        {icon ? <span className={cn("shrink-0", tone === "accent" ? "text-accent-600" : "text-brand-300")}>{icon}</span> : null}
      </div>
      <div className="text-2xl font-bold tabular-nums tracking-tight text-brand-900 sm:text-3xl">{value}</div>
      {hint ? <div className={cn("text-xs", tone === "accent" ? "text-accent-800" : "text-brand-500")}>{hint}</div> : null}
    </div>
  );
}
