import type { AccountRow, Json } from "@/lib/db/types";
import { saveHoursAction } from "@/app/(app)/settings/actions";
import { ActionForm, FieldError } from "../ActionForm";
import { Card, CardTitle, Field, inputClass } from "../primitives";
import { toTimeInput } from "../format";

const DAYS: { id: string; label: string }[] = [
  { id: "mon", label: "Monday" },
  { id: "tue", label: "Tuesday" },
  { id: "wed", label: "Wednesday" },
  { id: "thu", label: "Thursday" },
  { id: "fri", label: "Friday" },
  { id: "sat", label: "Saturday" },
  { id: "sun", label: "Sunday" },
];

function hoursOf(raw: Json): Record<string, [string, string] | null> {
  const out: Record<string, [string, string] | null> = {};
  const o =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, Json | undefined>)
      : {};
  for (const d of DAYS) {
    const v = o[d.id];
    out[d.id] =
      Array.isArray(v) && typeof v[0] === "string" && typeof v[1] === "string"
        ? [v[0], v[1]]
        : v === undefined && ["mon", "tue", "wed", "thu", "fri"].includes(d.id)
          ? ["08:00", "17:00"]
          : null;
  }
  return out;
}

export function HoursTab({
  account,
  readOnly,
}: {
  account: AccountRow;
  readOnly: boolean;
}) {
  const hours = hoursOf(account.hours);
  return (
    <ActionForm action={saveHoursAction} readOnly={readOnly}>
      <Card>
        <CardTitle sub="The AI tells callers when you're open and offers the next available window.">
          Business hours
        </CardTitle>
        <div className="divide-y divide-brand-100">
          {DAYS.map((d) => {
            const v = hours[d.id];
            return (
              <div
                key={d.id}
                className="grid grid-cols-[7.5rem_1fr] items-center gap-3 py-2.5 sm:grid-cols-[9rem_auto_1fr]"
              >
                <label className="flex items-center gap-2 text-sm font-medium text-brand-900">
                  <input
                    type="checkbox"
                    name={`${d.id}_open`}
                    defaultChecked={v !== null}
                    className="h-4 w-4 rounded border-brand-300 text-accent-500 focus:ring-accent-300"
                  />
                  {d.label}
                </label>
                <div className="flex flex-wrap items-center gap-2 text-sm text-brand-600 sm:col-span-2">
                  <label className="sr-only" htmlFor={`${d.id}_start`}>
                    {d.label} opens at
                  </label>
                  <input
                    id={`${d.id}_start`}
                    name={`${d.id}_start`}
                    type="time"
                    defaultValue={v?.[0] ?? "08:00"}
                    className={`${inputClass} w-32`}
                  />
                  <span>to</span>
                  <label className="sr-only" htmlFor={`${d.id}_end`}>
                    {d.label} closes at
                  </label>
                  <input
                    id={`${d.id}_end`}
                    name={`${d.id}_end`}
                    type="time"
                    defaultValue={v?.[1] ?? "17:00"}
                    className={`${inputClass} w-32`}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <FieldError name="hours" />
      </Card>

      <Card>
        <CardTitle sub="We only text customers inside this window (local time). Anything outside is queued and sent when the window opens — a TCPA safeguard. Owner alerts are not affected.">
          Texting window (quiet hours)
        </CardTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Start texting at" htmlFor="quiet_start">
            <input
              id="quiet_start"
              name="quiet_start"
              type="time"
              defaultValue={toTimeInput(account.quiet_start, "08:00")}
              className={inputClass}
            />
            <FieldError name="quiet_start" />
          </Field>
          <Field label="Stop texting at" htmlFor="quiet_end">
            <input
              id="quiet_end"
              name="quiet_end"
              type="time"
              defaultValue={toTimeInput(account.quiet_end, "21:00")}
              className={inputClass}
            />
            <FieldError name="quiet_end" />
          </Field>
        </div>
        <p className="mt-3 text-xs text-brand-500">
          Default 8:00 AM – 9:00 PM. Callers who text you first still get an
          answer within 15 minutes of their message.
        </p>
      </Card>
    </ActionForm>
  );
}
