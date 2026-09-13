import { forwardRef, type ReactNode, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Field, inputClass } from "./Input";

export type SelectOption = { value: string; label: string; disabled?: boolean };

export type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> & {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  optional?: boolean;
  id?: string;
  options: ReadonlyArray<SelectOption>;
  placeholder?: string;
  wrapperClassName?: string;
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, optional, id, options, placeholder, wrapperClassName, className, ...rest },
  ref
) {
  return (
    <Field label={label} hint={hint} error={error} optional={optional} id={id} className={wrapperClassName}>
      {(a) => (
        <div className="relative">
          <select
            ref={ref}
            id={a.id}
            aria-describedby={a.describedBy}
            aria-invalid={a.invalid || undefined}
            className={cn(inputClass, "appearance-none pr-10", className)}
            {...rest}
          >
            {placeholder ? (
              <option value="" disabled>
                {placeholder}
              </option>
            ) : null}
            {options.map((o) => (
              <option key={o.value} value={o.value} disabled={o.disabled}>
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-400" aria-hidden />
        </div>
      )}
    </Field>
  );
});
