import type { AccountRow, Json } from "@/lib/db/types";
import { can } from "@/lib/plans";
import { formatPhone } from "@/lib/telephony/client";
import { saveBusinessAction } from "@/app/(app)/settings/actions";
import { ActionForm, FieldError } from "../ActionForm";
import { Card, CardTitle, Field, inputClass, selectClass } from "../primitives";
import { US_TIMEZONES } from "./lead-source-helpers";

function area(raw: Json): { center: string; radius: string; zips: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    return { center: "", radius: "", zips: "" };
  const o = raw as Record<string, Json | undefined>;
  return {
    center: typeof o.center === "string" ? o.center : "",
    radius: typeof o.radius_miles === "number" ? String(o.radius_miles) : "",
    zips: Array.isArray(o.zips)
      ? o.zips.filter((z): z is string => typeof z === "string").join(", ")
      : "",
  };
}

export function BusinessTab({
  account,
  readOnly,
}: {
  account: AccountRow;
  readOnly: boolean;
}) {
  const sa = area(account.service_area);
  const tz = account.timezone ?? "America/Chicago";
  const tzOptions = US_TIMEZONES.some((t) => t.id === tz)
    ? US_TIMEZONES
    : [{ id: tz, label: tz }, ...US_TIMEZONES];
  const pro = can(account, "after_hours_routing");

  return (
    <ActionForm action={saveBusinessAction} readOnly={readOnly}>
      <Card>
        <CardTitle sub="What callers hear and what the AI says about you. The legal name must match your EIN letter for carrier verification.">
          Business
        </CardTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Legal business name" htmlFor="legal_name">
            <input
              id="legal_name"
              name="legal_name"
              defaultValue={account.legal_name ?? ""}
              required
              className={inputClass}
            />
            <FieldError name="legal_name" />
          </Field>
          <Field
            label="DBA / brand name"
            htmlFor="dba"
            hint="What customers know you as. Used in texts."
          >
            <input
              id="dba"
              name="dba"
              defaultValue={account.dba ?? ""}
              className={inputClass}
            />
          </Field>
          <Field label="Website" htmlFor="website">
            <input
              id="website"
              name="website"
              defaultValue={account.website ?? ""}
              placeholder="acme-hvac.com"
              className={inputClass}
            />
            <FieldError name="website" />
          </Field>
          <Field
            label="Business phone (the line you forward)"
            htmlFor="business_phone"
          >
            <input
              id="business_phone"
              name="business_phone"
              type="tel"
              defaultValue={formatPhone(account.business_phone)}
              className={inputClass}
            />
            <FieldError name="business_phone" />
          </Field>
          <Field label="Trade" htmlFor="trade">
            <select
              id="trade"
              name="trade"
              defaultValue={account.trade ?? "hvac"}
              className={selectClass}
            >
              <option value="hvac">HVAC</option>
              <option value="plumbing">Plumbing</option>
              <option value="electrical">Electrical</option>
              <option value="other">Other home service</option>
            </select>
          </Field>
          <Field
            label="Timezone"
            htmlFor="timezone"
            hint="Drives quiet hours and the Monday 7am report."
          >
            <select
              id="timezone"
              name="timezone"
              defaultValue={tz}
              className={selectClass}
            >
              {tzOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <FieldError name="timezone" />
          </Field>
        </div>
      </Card>

      <Card>
        <CardTitle sub="Shown on your compliance record; never texted to customers.">
          Address
        </CardTitle>
        <div className="grid gap-4 sm:grid-cols-6">
          <Field
            label="Street address"
            htmlFor="address_line1"
            className="sm:col-span-6"
          >
            <input
              id="address_line1"
              name="address_line1"
              defaultValue={account.address_line1 ?? ""}
              className={inputClass}
            />
          </Field>
          <Field label="City" htmlFor="city" className="sm:col-span-3">
            <input
              id="city"
              name="city"
              defaultValue={account.city ?? ""}
              className={inputClass}
            />
          </Field>
          <Field label="State" htmlFor="state" className="sm:col-span-1">
            <input
              id="state"
              name="state"
              defaultValue={account.state ?? ""}
              maxLength={2}
              placeholder="TX"
              className={inputClass}
            />
            <FieldError name="state" />
          </Field>
          <Field label="ZIP" htmlFor="zip" className="sm:col-span-2">
            <input
              id="zip"
              name="zip"
              defaultValue={account.zip ?? ""}
              inputMode="numeric"
              className={inputClass}
            />
            <FieldError name="zip" />
          </Field>
        </div>
      </Card>

      <Card>
        <CardTitle sub="The AI politely declines jobs outside this area instead of booking them.">
          Service area
        </CardTitle>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Around (city or town)" htmlFor="service_center">
            <input
              id="service_center"
              name="service_center"
              defaultValue={sa.center}
              placeholder="Round Rock, TX"
              className={inputClass}
            />
          </Field>
          <Field label="Radius (miles)" htmlFor="service_radius">
            <input
              id="service_radius"
              name="service_radius"
              type="number"
              min={1}
              max={300}
              defaultValue={sa.radius}
              className={inputClass}
            />
            <FieldError name="service_radius" />
          </Field>
          <Field
            label="Or specific ZIP codes"
            htmlFor="service_zips"
            hint="Comma-separated."
          >
            <input
              id="service_zips"
              name="service_zips"
              defaultValue={sa.zips}
              placeholder="78664, 78681"
              className={inputClass}
            />
            <FieldError name="service_zips" />
          </Field>
        </div>
      </Card>

      <Card>
        <CardTitle sub="Used for the “estimated revenue recovered” number on your dashboard and weekly report.">
          Jobs & emergencies
        </CardTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Average ticket (USD)"
            htmlFor="avg_ticket_usd"
            hint="Typical invoice for a booked job. HVAC ≈ $450, plumbing ≈ $350, electrical ≈ $400."
          >
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-brand-400">
                $
              </span>
              <input
                id="avg_ticket_usd"
                name="avg_ticket_usd"
                type="number"
                min={1}
                step={1}
                defaultValue={Math.round(Number(account.avg_ticket_usd) || 450)}
                className={`${inputClass} pl-7`}
              />
            </div>
            <FieldError name="avg_ticket_usd" />
          </Field>
          <Field
            label="After-hours on-call number"
            htmlFor="on_call_phone"
            hint={
              pro
                ? "Emergencies outside hours ring this number."
                : "Pro plan: emergencies ring your on-call tech."
            }
          >
            <input
              id="on_call_phone"
              name="on_call_phone"
              type="tel"
              defaultValue={formatPhone(account.on_call_phone)}
              disabled={!pro}
              className={inputClass}
            />
            <FieldError name="on_call_phone" />
          </Field>
          <label className="flex items-start gap-3 rounded-xl border border-brand-100 bg-brand-50/50 p-3 text-sm sm:col-span-2">
            <input
              type="checkbox"
              name="emergency_service"
              defaultChecked={account.emergency_service}
              className="mt-0.5 h-4 w-4 rounded border-brand-300 text-accent-500 focus:ring-accent-300"
            />
            <span>
              <span className="font-medium text-brand-900">
                We offer emergency service
              </span>
              <span className="block text-xs text-brand-600">
                When on, the AI treats gas smells, sparks, flooding and no-heat
                calls as urgent and alerts you immediately.
              </span>
            </span>
          </label>
        </div>
      </Card>
    </ActionForm>
  );
}
