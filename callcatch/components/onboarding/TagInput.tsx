"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { Plus, X } from "lucide-react";
import { inputClass } from "@/components/ui/Input";
import { cn } from "@/lib/utils";

export function TagInput({
  label,
  hint,
  error,
  values,
  onChange,
  presets = [],
  placeholder,
  max = 40,
  validate,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  values: string[];
  onChange: (next: string[]) => void;
  presets?: string[];
  placeholder?: string;
  max?: number;
  /** Return an error string to reject a value. */
  validate?: (v: string) => string | null;
}) {
  const id = useId();
  const [draft, setDraft] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  function add(raw: string) {
    const parts = raw
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return;
    const next = [...values];
    for (const p of parts) {
      const err = validate?.(p) ?? null;
      if (err) {
        setLocalError(err);
        return;
      }
      if (!next.some((v) => v.toLowerCase() === p.toLowerCase()) && next.length < max) next.push(p);
    }
    setLocalError(null);
    onChange(next);
    setDraft("");
  }

  function remove(v: string) {
    onChange(values.filter((x) => x !== v));
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && !draft && values.length) {
      remove(values[values.length - 1]);
    }
  }

  const unusedPresets = presets.filter((p) => !values.some((v) => v.toLowerCase() === p.toLowerCase()));
  const shownError = error ?? localError;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-brand-900">
        {label}
      </label>
      <div className={cn(inputClass, "flex flex-wrap items-center gap-1.5 py-1.5", shownError && "border-danger-500")}>
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-lg bg-brand-100 px-2 py-1 text-xs font-medium text-brand-900">
            {v}
            <button type="button" onClick={() => remove(v)} aria-label={`Remove ${v}`} className="rounded p-0.5 text-brand-500 hover:bg-brand-200 hover:text-brand-900">
              <X className="h-3 w-3" aria-hidden />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          onBlur={() => draft && add(draft)}
          placeholder={values.length ? "" : placeholder}
          aria-describedby={hint ? `${id}-hint` : undefined}
          aria-invalid={shownError ? true : undefined}
          className="min-w-[8rem] flex-1 border-0 bg-transparent p-1 text-sm text-brand-900 placeholder:text-brand-300 focus:outline-none"
        />
      </div>
      {unusedPresets.length ? (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {unusedPresets.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => add(p)}
              className="inline-flex items-center gap-1 rounded-lg border border-dashed border-brand-200 px-2 py-1 text-xs text-brand-600 transition hover:border-brand-400 hover:bg-brand-50 hover:text-brand-900"
            >
              <Plus className="h-3 w-3" aria-hidden />
              {p}
            </button>
          ))}
        </div>
      ) : null}
      {hint && !shownError ? (
        <p id={`${id}-hint`} className="text-xs text-brand-500">
          {hint}
        </p>
      ) : null}
      {shownError ? (
        <p role="alert" className="text-xs font-medium text-danger-500">
          {shownError}
        </p>
      ) : null}
    </div>
  );
}
