import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type CardTone = "default" | "navy" | "accent" | "muted";

export function Card({ className, children, tone = "default", as: Tag = "section" }: { className?: string; children: ReactNode; tone?: CardTone; as?: "section" | "div" | "article" }) {
  return (
    <Tag
      className={cn(
        "rounded-2xl border p-5 sm:p-6",
        tone === "default" && "border-brand-100 bg-white shadow-[0_1px_2px_rgba(11,31,58,0.04)]",
        tone === "navy" && "border-brand-800 bg-brand-900 text-white",
        tone === "accent" && "border-accent-200 bg-accent-50",
        tone === "muted" && "border-brand-100 bg-brand-50/60",
        className
      )}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({ title, sub, icon, action }: { title: ReactNode; sub?: ReactNode; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        {icon ? <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">{icon}</div> : null}
        <div>
          <h2 className="text-base font-semibold text-brand-900">{title}</h2>
          {sub ? <p className="mt-0.5 text-sm text-brand-600">{sub}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}

export type AlertTone = "success" | "error" | "info" | "warning";

export function Alert({ tone, title, children, icon, className }: { tone: AlertTone; title?: ReactNode; children?: ReactNode; icon?: ReactNode; className?: string }) {
  const cls =
    tone === "success"
      ? "border-green-200 bg-green-50 text-green-900"
      : tone === "error"
        ? "border-red-200 bg-red-50 text-red-900"
        : tone === "warning"
          ? "border-amber-200 bg-amber-50 text-amber-900"
          : "border-brand-100 bg-brand-50 text-brand-900";
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex gap-3 rounded-xl border px-4 py-3 text-sm", cls, className)}>
      {icon ? <span className="mt-0.5 shrink-0" aria-hidden>{icon}</span> : null}
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={title ? "mt-0.5" : undefined}>{children}</div> : null}
      </div>
    </div>
  );
}
