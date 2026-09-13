import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const inputClass =
  "block w-full rounded-xl border border-brand-200 bg-white px-3.5 py-2.5 text-base text-brand-900 placeholder:text-brand-300 shadow-[inset_0_1px_1px_rgba(11,31,58,0.03)] transition focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:cursor-not-allowed disabled:bg-brand-50 disabled:text-brand-500 sm:text-sm aria-[invalid=true]:border-danger-500 aria-[invalid=true]:focus:ring-red-200";

export type FieldProps = {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  optional?: boolean;
  id?: string;
  className?: string;
  children: (a11y: { id: string; describedBy?: string; invalid: boolean }) => ReactNode;
};

/** Label + hint + error wrapper. Wires aria-describedby / aria-invalid for the control. */
export function Field({ label, hint, error, optional, id: idProp, className, children }: FieldProps) {
  const auto = useId();
  const id = idProp ?? auto;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="flex items-baseline justify-between gap-2 text-sm font-medium text-brand-900">
        <span>{label}</span>
        {optional ? <span className="text-xs font-normal text-brand-400">Optional</span> : null}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint && !error ? (
        <p id={hintId} className="text-xs text-brand-500">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-xs font-medium text-danger-500">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  optional?: boolean;
  id?: string;
  wrapperClassName?: string;
  prefix?: ReactNode;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, optional, id, wrapperClassName, className, prefix, ...rest },
  ref
) {
  return (
    <Field label={label} hint={hint} error={error} optional={optional} id={id} className={wrapperClassName}>
      {(a) =>
        prefix ? (
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-sm text-brand-400">{prefix}</span>
            <input
              ref={ref}
              id={a.id}
              aria-describedby={a.describedBy}
              aria-invalid={a.invalid || undefined}
              className={cn(inputClass, "pl-10", className)}
              {...rest}
            />
          </div>
        ) : (
          <input ref={ref} id={a.id} aria-describedby={a.describedBy} aria-invalid={a.invalid || undefined} className={cn(inputClass, className)} {...rest} />
        )
      }
    </Field>
  );
});

export type TextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> & {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  optional?: boolean;
  id?: string;
  wrapperClassName?: string;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, optional, id, wrapperClassName, className, rows = 3, ...rest },
  ref
) {
  return (
    <Field label={label} hint={hint} error={error} optional={optional} id={id} className={wrapperClassName}>
      {(a) => (
        <textarea
          ref={ref}
          id={a.id}
          rows={rows}
          aria-describedby={a.describedBy}
          aria-invalid={a.invalid || undefined}
          className={cn(inputClass, "min-h-[2.75rem] resize-y leading-relaxed", className)}
          {...rest}
        />
      )}
    </Field>
  );
});

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "id"> & {
  label: ReactNode;
  description?: ReactNode;
  id?: string;
};

export function Checkbox({ label, description, id: idProp, className, ...rest }: CheckboxProps) {
  const auto = useId();
  const id = idProp ?? auto;
  return (
    <label htmlFor={id} className={cn("flex cursor-pointer items-start gap-3 rounded-xl border border-brand-100 bg-white px-3.5 py-3 transition hover:border-brand-200 has-[:checked]:border-brand-400 has-[:checked]:bg-brand-50/60", className)}>
      <input id={id} type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 rounded border-brand-300 accent-brand-700" {...rest} />
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-brand-900">{label}</span>
        {description ? <span className="text-xs text-brand-500">{description}</span> : null}
      </span>
    </label>
  );
}
