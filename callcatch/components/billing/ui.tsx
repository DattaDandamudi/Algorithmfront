import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Small, dependency-free primitives shared by the billing screens (Tailwind v4 + brand tokens). */

export const btn = {
  primary:
    "inline-flex items-center justify-center gap-2 rounded-xl bg-accent-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 active:translate-y-px",
  secondary:
    "inline-flex items-center justify-center gap-2 rounded-xl border border-brand-200 bg-white px-4 py-2.5 text-sm font-semibold text-brand-900 transition hover:border-brand-300 hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
  ghost:
    "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-brand-800 transition hover:bg-brand-50 hover:text-brand-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 disabled:cursor-not-allowed disabled:opacity-60",
  danger:
    "inline-flex items-center justify-center gap-2 rounded-xl border border-danger-500/30 bg-white px-4 py-2.5 text-sm font-semibold text-danger-500 transition hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-danger-500/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
} as const;

export function Card({ className, children, tone = "default" }: { className?: string; children: ReactNode; tone?: "default" | "navy" | "accent" }) {
  return (
    <section
      className={cn(
        "rounded-2xl border p-5 sm:p-6",
        tone === "navy" && "border-brand-800 bg-brand-900 text-white",
        tone === "accent" && "border-accent-200 bg-accent-50",
        tone === "default" && "border-brand-100 bg-white shadow-[0_1px_2px_rgba(11,31,58,0.04)]",
        className
      )}
    >
      {children}
    </section>
  );
}

export function CardTitle({ children, sub, icon }: { children: ReactNode; sub?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      {icon ? <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">{icon}</div> : null}
      <div>
        <h2 className="text-base font-semibold text-brand-900">{children}</h2>
        {sub ? <p className="mt-0.5 text-sm text-brand-600">{sub}</p> : null}
      </div>
    </div>
  );
}

export function Notice({ tone, children }: { tone: "success" | "error" | "info" | "warning"; children: ReactNode }) {
  const cls =
    tone === "success"
      ? "border-green-200 bg-green-50 text-green-900"
      : tone === "error"
        ? "border-red-200 bg-red-50 text-red-900"
        : tone === "warning"
          ? "border-amber-200 bg-amber-50 text-amber-900"
          : "border-brand-100 bg-brand-50 text-brand-900";
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("rounded-xl border px-4 py-3 text-sm", cls)}>
      {children}
    </div>
  );
}

export function KeyValue({ label, value, hint }: { label: ReactNode; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl bg-brand-50/60 px-4 py-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-brand-500">{label}</dt>
      <dd className="text-base font-semibold text-brand-900">{value}</dd>
      {hint ? <p className="text-xs text-brand-600">{hint}</p> : null}
    </div>
  );
}
