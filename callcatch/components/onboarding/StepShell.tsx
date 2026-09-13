"use client";

import type { ReactNode } from "react";
import { AlertCircle, ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Card";

export function StepShell({
  title,
  description,
  eyebrow,
  children,
  aside,
  error,
  onBack,
  onNext,
  nextLabel = "Save & continue",
  nextDisabled,
  pending,
  hideNext,
}: {
  title: string;
  description?: ReactNode;
  eyebrow?: string;
  children: ReactNode;
  aside?: ReactNode;
  error?: string | null;
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  pending?: boolean;
  hideNext?: boolean;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="rounded-3xl border border-brand-100 bg-white p-5 shadow-[0_12px_40px_-20px_rgba(11,31,58,0.25)] sm:p-8">
        <header className="mb-6">
          {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-600">{eyebrow}</p> : null}
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-brand-900">{title}</h1>
          {description ? <p className="mt-2 text-sm text-brand-600">{description}</p> : null}
        </header>
        <div className="flex flex-col gap-5">{children}</div>
        {error ? (
          <Alert tone="error" icon={<AlertCircle className="h-4 w-4" />} className="mt-6">
            {error}
          </Alert>
        ) : null}
        <footer className="mt-8 flex flex-col-reverse gap-3 border-t border-brand-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
          {onBack ? (
            <Button variant="ghost" onClick={onBack} leftIcon={<ArrowLeft className="h-4 w-4" aria-hidden />} disabled={pending}>
              Back
            </Button>
          ) : (
            <span />
          )}
          {!hideNext ? (
            <Button onClick={onNext} loading={pending} disabled={nextDisabled} size="lg" rightIcon={<ArrowRight className="h-4 w-4" aria-hidden />}>
              {nextLabel}
            </Button>
          ) : null}
        </footer>
      </section>
      {aside ? <aside className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">{aside}</aside> : null}
    </div>
  );
}

export function Tip({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-brand-100 bg-brand-50/70 p-4 text-sm text-brand-700">
      <p className="mb-1 font-semibold text-brand-900">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

export function ChoiceCards<T extends string>({
  name,
  value,
  onChange,
  options,
  columns = 3,
}: {
  name: string;
  value: T;
  onChange: (v: T) => void;
  options: ReadonlyArray<{ value: T; label: string; description?: string; icon?: ReactNode }>;
  columns?: 2 | 3 | 4;
}) {
  const cols = columns === 2 ? "sm:grid-cols-2" : columns === 4 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3";
  return (
    <div role="radiogroup" className={`grid gap-2 ${cols}`}>
      {options.map((o) => {
        const checked = o.value === value;
        return (
          <label
            key={o.value}
            className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition focus-within:ring-2 focus-within:ring-brand-300 ${
              checked ? "border-brand-500 bg-brand-50/70 shadow-[inset_0_0_0_1px_#2f5697]" : "border-brand-100 bg-white hover:border-brand-200"
            }`}
          >
            <input type="radio" name={name} value={o.value} checked={checked} onChange={() => onChange(o.value)} className="sr-only" />
            {o.icon ? <span className={`mt-0.5 ${checked ? "text-brand-700" : "text-brand-400"}`}>{o.icon}</span> : null}
            <span className="flex flex-col">
              <span className="text-sm font-semibold text-brand-900">{o.label}</span>
              {o.description ? <span className="text-xs text-brand-500">{o.description}</span> : null}
            </span>
          </label>
        );
      })}
    </div>
  );
}
