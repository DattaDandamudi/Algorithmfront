import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8", className)}>{children}</div>;
}

export function Section({ id, className, children }: { id?: string; className?: string; children: ReactNode }) {
  return (
    <section id={id} className={cn("scroll-mt-20 py-14 sm:py-20", className)}>
      {children}
    </section>
  );
}

export function Eyebrow({ children, tone = "accent" }: { children: ReactNode; tone?: "accent" | "light" }) {
  return (
    <p className={cn("text-xs font-semibold uppercase tracking-[0.18em]", tone === "light" ? "text-accent-300" : "text-accent-600")}>
      {children}
    </p>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  sub,
  align = "center",
  tone = "dark",
}: {
  eyebrow?: string;
  title: ReactNode;
  sub?: ReactNode;
  align?: "center" | "left";
  tone?: "dark" | "light";
}) {
  return (
    <div className={cn("max-w-3xl", align === "center" ? "mx-auto text-center" : "text-left")}>
      {eyebrow ? (
        <div className="mb-3">
          <Eyebrow tone={tone === "light" ? "light" : "accent"}>{eyebrow}</Eyebrow>
        </div>
      ) : null}
      <h2 className={cn("text-3xl font-bold tracking-tight sm:text-4xl", tone === "light" ? "text-white" : "text-brand-900")}>{title}</h2>
      {sub ? <p className={cn("mt-4 text-base sm:text-lg", tone === "light" ? "text-brand-100" : "text-brand-700")}>{sub}</p> : null}
    </div>
  );
}

export const buttonClasses = {
  primary:
    "inline-flex items-center justify-center gap-2 rounded-xl bg-accent-500 px-5 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-accent-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2 active:translate-y-px",
  secondaryLight:
    "inline-flex items-center justify-center gap-2 rounded-xl border border-white/25 bg-white/10 px-5 py-3 text-base font-semibold text-white backdrop-blur transition hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-900",
  secondaryDark:
    "inline-flex items-center justify-center gap-2 rounded-xl border border-brand-200 bg-white px-5 py-3 text-base font-semibold text-brand-900 transition hover:border-brand-300 hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2",
  ghostDark:
    "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-brand-800 transition hover:bg-brand-50 hover:text-brand-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300",
} as const;
