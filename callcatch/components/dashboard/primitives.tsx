import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Dependency-free primitives for the signed-in app (Tailwind v4 + brand tokens). */

export const btn = {
  primary:
    "inline-flex items-center justify-center gap-2 rounded-xl bg-accent-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 active:translate-y-px",
  secondary:
    "inline-flex items-center justify-center gap-2 rounded-xl border border-brand-200 bg-white px-4 py-2.5 text-sm font-semibold text-brand-900 transition hover:border-brand-300 hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
  ghost:
    "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-brand-800 transition hover:bg-brand-50 hover:text-brand-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 disabled:cursor-not-allowed disabled:opacity-60",
  danger:
    "inline-flex items-center justify-center gap-2 rounded-xl border border-danger-500/30 bg-white px-4 py-2.5 text-sm font-semibold text-danger-500 transition hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-danger-500/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
  small:
    "inline-flex items-center justify-center gap-1.5 rounded-lg border border-brand-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-brand-800 transition hover:border-brand-300 hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 disabled:cursor-not-allowed disabled:opacity-60",
} as const;

export const inputClass =
  "block w-full rounded-xl border border-brand-200 bg-white px-3.5 py-2.5 text-sm text-brand-900 shadow-[inset_0_1px_1px_rgba(11,31,58,0.04)] placeholder:text-brand-300 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:cursor-not-allowed disabled:bg-brand-50 disabled:text-brand-500";

export const selectClass = cn(inputClass, "pr-9 appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%234f75b5%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22%3E%3Cpath d=%22m6 9 6 6 6-6%22/%3E%3C/svg%3E')] bg-[length:16px_16px] bg-[position:right_0.75rem_center] bg-no-repeat");

export function Card({
  className,
  children,
  tone = "default",
  as: Tag = "section",
}: {
  className?: string;
  children: ReactNode;
  tone?: "default" | "navy" | "accent" | "muted";
  as?: "section" | "div" | "article";
}) {
  return (
    <Tag
      className={cn(
        "rounded-2xl border p-5 sm:p-6",
        tone === "navy" && "border-brand-800 bg-brand-900 text-white",
        tone === "accent" && "border-accent-200 bg-accent-50",
        tone === "muted" && "border-brand-100 bg-brand-50/60",
        tone === "default" && "border-brand-100 bg-white shadow-[0_1px_2px_rgba(11,31,58,0.04)]",
        className
      )}
    >
      {children}
    </Tag>
  );
}

export function CardTitle({ children, sub, icon, action }: { children: ReactNode; sub?: ReactNode; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        {icon ? <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">{icon}</div> : null}
        <div>
          <h2 className="text-base font-semibold text-brand-900">{children}</h2>
          {sub ? <p className="mt-0.5 text-sm text-brand-600">{sub}</p> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function Notice({ tone, children, className }: { tone: "success" | "error" | "info" | "warning"; children: ReactNode; className?: string }) {
  const cls =
    tone === "success"
      ? "border-green-200 bg-green-50 text-green-900"
      : tone === "error"
        ? "border-red-200 bg-red-50 text-red-900"
        : tone === "warning"
          ? "border-amber-200 bg-amber-50 text-amber-900"
          : "border-brand-100 bg-brand-50 text-brand-900";
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("rounded-xl border px-4 py-3 text-sm", cls, className)}>
      {children}
    </div>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-brand-800">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-brand-500">{hint}</p> : null}
    </div>
  );
}

export function PageHeader({ eyebrow, title, sub, action }: { eyebrow: string; title: ReactNode; sub?: ReactNode; action?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-600">{eyebrow}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-brand-900 sm:text-3xl">{title}</h1>
        {sub ? <p className="mt-1 text-sm text-brand-600">{sub}</p> : null}
      </div>
      {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
    </header>
  );
}
