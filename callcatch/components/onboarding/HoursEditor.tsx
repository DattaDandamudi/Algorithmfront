"use client";

import { DAYS, type Day, type Hours } from "@/lib/onboarding/schemas";
import { inputClass } from "@/components/ui/Input";
import { cn } from "@/lib/utils";

const LABEL: Record<Day, string> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };

export function HoursEditor({ value, onChange, error }: { value: Hours; onChange: (next: Hours) => void; error?: string | null }) {
  function setDay(day: Day, next: [string, string] | null) {
    onChange({ ...value, [day]: next });
  }
  function copyMondayToWeekdays() {
    const mon = value.mon;
    onChange({ ...value, tue: mon, wed: mon, thu: mon, fri: mon });
  }
  return (
    <fieldset className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <legend className="text-sm font-medium text-brand-900">Business hours</legend>
        <button type="button" onClick={copyMondayToWeekdays} className="text-xs font-medium text-brand-600 hover:text-brand-900">
          Copy Monday to weekdays
        </button>
      </div>
      <div className="overflow-hidden rounded-xl border border-brand-100">
        {DAYS.map((day) => {
          const v = value[day];
          const open = v !== null && v !== undefined;
          return (
            <div key={day} className={cn("grid grid-cols-[6.5rem_1fr] items-center gap-2 border-b border-brand-100 px-3 py-2 last:border-b-0 sm:grid-cols-[7rem_auto_1fr]", !open && "bg-brand-50/50")}>
              <label className="flex items-center gap-2 text-sm text-brand-900">
                <input type="checkbox" checked={open} onChange={(e) => setDay(day, e.target.checked ? ["08:00", "17:00"] : null)} className="h-4 w-4 accent-brand-700" aria-label={`${LABEL[day]} open`} />
                <span className="font-medium">{LABEL[day].slice(0, 3)}</span>
              </label>
              {open ? (
                <div className="col-span-1 flex items-center gap-2 sm:col-span-2">
                  <input type="time" value={v[0]} onChange={(e) => setDay(day, [e.target.value, v[1]])} aria-label={`${LABEL[day]} opens`} className={cn(inputClass, "w-auto py-1.5")} />
                  <span className="text-xs text-brand-400">to</span>
                  <input type="time" value={v[1]} onChange={(e) => setDay(day, [v[0], e.target.value])} aria-label={`${LABEL[day]} closes`} className={cn(inputClass, "w-auto py-1.5")} />
                </div>
              ) : (
                <span className="text-xs text-brand-400 sm:col-span-2">Closed</span>
              )}
            </div>
          );
        })}
      </div>
      {error ? (
        <p role="alert" className="text-xs font-medium text-danger-500">
          {error}
        </p>
      ) : null}
      <p className="text-xs text-brand-500">The AI tells after-hours callers when you open next; emergency routing (Pro) uses these too.</p>
    </fieldset>
  );
}
