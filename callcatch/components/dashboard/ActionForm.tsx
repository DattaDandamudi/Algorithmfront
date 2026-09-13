"use client";

import { createContext, useActionState, useContext, type ReactNode } from "react";
import { Loader2, Save } from "lucide-react";
import { btn } from "./primitives";
import { cn } from "@/lib/utils";

export type FormState = { ok?: string; error?: string; fieldErrors?: Record<string, string> } | null;
export type FormAction = (prev: FormState, formData: FormData) => Promise<FormState>;

const FieldErrorsContext = createContext<Record<string, string>>({});

/**
 * Thin client wrapper around a Server Function: pending state, success / error banners, and a
 * context of field errors so server-rendered fields can drop in `<FieldError name="…" />`.
 */
export function ActionForm({
  action,
  children,
  submitLabel = "Save changes",
  readOnly = false,
  className,
  submitClassName,
  hideSubmit = false,
}: {
  action: FormAction;
  children: ReactNode;
  submitLabel?: string;
  readOnly?: boolean;
  className?: string;
  submitClassName?: string;
  hideSubmit?: boolean;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, null);
  const fieldErrors = state?.fieldErrors ?? {};
  return (
    <FieldErrorsContext.Provider value={fieldErrors}>
      <form action={formAction} className={cn("flex flex-col gap-5", className)} aria-busy={pending}>
        <fieldset disabled={readOnly || pending} className="contents">
          {children}
        </fieldset>
        {state?.error ? (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-900">
            {state.error}
          </p>
        ) : state?.ok ? (
          <p role="status" className="rounded-xl border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-900">
            {state.ok}
          </p>
        ) : null}
        {!hideSubmit ? (
          <div className="flex items-center justify-end gap-3">
            {readOnly ? <span className="text-xs text-brand-500">Read-only in admin view</span> : null}
            <button type="submit" disabled={readOnly || pending} className={cn(btn.primary, submitClassName)}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
              {pending ? "Saving…" : submitLabel}
            </button>
          </div>
        ) : null}
      </form>
    </FieldErrorsContext.Provider>
  );
}

/** Shows the server-side validation message for one field of the enclosing ActionForm. */
export function FieldError({ name }: { name: string }) {
  const errors = useContext(FieldErrorsContext);
  const message = errors[name];
  if (!message) return null;
  return (
    <p role="alert" className="text-xs text-red-600">
      {message}
    </p>
  );
}
