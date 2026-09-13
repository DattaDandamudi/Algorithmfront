import Link from "next/link";
import { BadgeCheck, ShieldAlert } from "lucide-react";
import type { AccountRow, Json } from "@/lib/db/types";
import { formatPhone } from "@/lib/telephony/client";
import { saveAlertsAction } from "@/app/(app)/settings/actions";
import { ActionForm, FieldError } from "../ActionForm";
import { Card, CardTitle, Field, inputClass } from "../primitives";
import { StatusPill } from "../StatusPill";

function weeklyOptOut(raw: Json): boolean {
  const o =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, Json | undefined>)
      : {};
  return o.weekly_report_opt_out === true;
}

export function AlertsTab({
  account,
  readOnly,
}: {
  account: AccountRow;
  readOnly: boolean;
}) {
  return (
    <ActionForm action={saveAlertsAction} readOnly={readOnly}>
      <Card>
        <CardTitle sub="Where “Missed call from … — tap to call back” goes. Alerts come from CallCatch's own verified number, so they work even before your line is verified.">
          Owner alerts
        </CardTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Alert mobile (SMS)" htmlFor="alert_phone">
            <input
              id="alert_phone"
              name="alert_phone"
              type="tel"
              defaultValue={formatPhone(account.alert_phone)}
              required
              className={inputClass}
            />
            <FieldError name="alert_phone" />
            <div className="mt-1">
              {account.alert_phone_verified ? (
                <StatusPill tone="success">
                  <BadgeCheck className="h-3 w-3" aria-hidden /> Verified
                </StatusPill>
              ) : (
                <span className="inline-flex flex-wrap items-center gap-2">
                  <StatusPill tone="warning">
                    <ShieldAlert className="h-3 w-3" aria-hidden /> Not verified
                  </StatusPill>
                  <Link
                    href="/onboarding?step=6"
                    className="text-xs font-semibold text-brand-700 underline-offset-2 hover:underline"
                  >
                    Verify with a code
                  </Link>
                </span>
              )}
            </div>
          </Field>
          <Field
            label="Alert email"
            htmlFor="alert_email"
            hint="Voicemail transcripts, lead summaries and the Monday report."
          >
            <input
              id="alert_email"
              name="alert_email"
              type="email"
              defaultValue={account.alert_email ?? ""}
              required
              className={inputClass}
            />
            <FieldError name="alert_email" />
          </Field>
        </div>
      </Card>

      <Card>
        <CardTitle sub="Every Monday at 7am local: missed calls, texted back, replied, booked and estimated revenue recovered.">
          Weekly report
        </CardTitle>
        <label className="flex items-start gap-3 rounded-xl border border-brand-100 bg-brand-50/50 p-3 text-sm">
          <input
            type="checkbox"
            name="weekly_report"
            defaultChecked={!weeklyOptOut(account.ai_profile)}
            className="mt-0.5 h-4 w-4 rounded border-brand-300 text-accent-500 focus:ring-accent-300"
          />
          <span>
            <span className="font-medium text-brand-900">
              Email me the “calls recovered” report every Monday
            </span>
            <span className="block text-xs text-brand-600">
              Sent to your alert email. Turn it off any time.
            </span>
          </span>
        </label>
      </Card>
    </ActionForm>
  );
}
