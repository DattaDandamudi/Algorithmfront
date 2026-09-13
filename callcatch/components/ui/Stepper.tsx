import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type StepperStep = { id: number; label: string; description?: string };

export type StepperProps = {
  steps: ReadonlyArray<StepperStep>;
  current: number;
  /** Highest step the user may jump to (inclusive). */
  maxReachable: number;
  onSelect?: (step: number) => void;
  className?: string;
};

/** Horizontal on desktop, compact pill row on mobile. Completed steps are clickable. */
export function Stepper({ steps, current, maxReachable, onSelect, className }: StepperProps) {
  return (
    <nav aria-label="Progress" className={className}>
      <ol className="flex items-center gap-1 sm:gap-0">
        {steps.map((step, idx) => {
          const done = step.id < current;
          const active = step.id === current;
          const reachable = step.id <= maxReachable && Boolean(onSelect);
          const last = idx === steps.length - 1;
          return (
            <li key={step.id} className={cn("flex items-center", !last && "flex-1")}>
              <button
                type="button"
                onClick={reachable ? () => onSelect?.(step.id) : undefined}
                disabled={!reachable}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "group flex items-center gap-2 rounded-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2",
                  reachable ? "cursor-pointer" : "cursor-default"
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition",
                    done && "border-success-500 bg-success-500 text-white",
                    active && "border-accent-500 bg-accent-500 text-white shadow-[0_0_0_4px_rgba(255,106,26,0.18)]",
                    !done && !active && "border-brand-200 bg-white text-brand-400"
                  )}
                >
                  {done ? <Check className="h-4 w-4" aria-hidden /> : step.id}
                </span>
                <span className={cn("hidden text-sm font-medium lg:block", active ? "text-brand-900" : done ? "text-brand-700" : "text-brand-400")}>
                  {step.label}
                </span>
                <span className="sr-only">
                  {step.label} — {done ? "completed" : active ? "current step" : "upcoming"}
                </span>
              </button>
              {!last ? <span aria-hidden className={cn("mx-2 h-0.5 flex-1 rounded-full sm:mx-3", step.id < current ? "bg-success-500" : "bg-brand-100")} /> : null}
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-sm font-medium text-brand-700 lg:hidden">
        Step {current} of {steps.length}: {steps.find((s) => s.id === current)?.label}
      </p>
    </nav>
  );
}
