import Link from "next/link";
import { CalendarCheck, Lock } from "lucide-react";
import type { AccountRow, Json } from "@/lib/db/types";
import { can } from "@/lib/plans";
import { saveBookingAction } from "@/app/(app)/settings/actions";
import { ActionForm, FieldError } from "../ActionForm";
import { Card, CardTitle, Field, Notice, btn, inputClass } from "../primitives";

function schedulingPageEnabled(raw: Json): boolean {
  const o =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, Json | undefined>)
      : {};
  return o.use_scheduling_page === true;
}

export function BookingTab({
  account,
  readOnly,
}: {
  account: AccountRow;
  readOnly: boolean;
}) {
  const pro = can(account, "booking_handoff");
  const mode = account.booking_url
    ? "external"
    : schedulingPageEnabled(account.ai_profile)
      ? "callcatch"
      : "none";
  return (
    <div className="flex flex-col gap-5">
      {!pro ? (
        <Notice tone="warning">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2">
              <Lock className="h-4 w-4" aria-hidden /> Booking hand-off is
              included in <strong>Pro</strong>. On Starter, the AI collects the
              details and tells the caller you&apos;ll confirm a time.
            </span>
            <Link href="/billing" className={btn.primary}>
              Upgrade to Pro
            </Link>
          </div>
        </Notice>
      ) : null}
      <ActionForm action={saveBookingAction} readOnly={readOnly || !pro}>
        <Card>
          <CardTitle
            icon={<CalendarCheck className="h-5 w-5" aria-hidden />}
            sub="Once a lead is qualified, the AI can send a link so the customer books themselves."
          >
            Booking hand-off
          </CardTitle>
          <div className="flex flex-col gap-3">
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-brand-200 p-3 has-[:checked]:border-accent-400 has-[:checked]:bg-accent-50">
              <input
                type="radio"
                name="mode"
                value="external"
                defaultChecked={mode === "external"}
                className="mt-1 h-4 w-4 border-brand-300 text-accent-500 focus:ring-accent-300"
              />
              <span className="flex-1">
                <span className="block text-sm font-semibold text-brand-900">
                  Send my booking link
                </span>
                <span className="block text-xs text-brand-600">
                  Jobber, Housecall Pro, ServiceTitan, Calendly — any public
                  scheduling URL.
                </span>
                <span className="mt-2 block">
                  <Field label="Booking URL" htmlFor="booking_url">
                    <input
                      id="booking_url"
                      name="booking_url"
                      defaultValue={account.booking_url ?? ""}
                      placeholder="https://clienthub.getjobber.com/booking/…"
                      className={inputClass}
                    />
                    <FieldError name="booking_url" />
                  </Field>
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-brand-200 p-3 has-[:checked]:border-accent-400 has-[:checked]:bg-accent-50">
              <input
                type="radio"
                name="mode"
                value="callcatch"
                defaultChecked={mode === "callcatch"}
                className="mt-1 h-4 w-4 border-brand-300 text-accent-500 focus:ring-accent-300"
              />
              <span>
                <span className="block text-sm font-semibold text-brand-900">
                  Use the CallCatch scheduling page
                </span>
                <span className="block text-xs text-brand-600">
                  The AI offers windows from your business hours and confirms by
                  text. You get the booking as a lead marked “booked”.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-brand-200 p-3 has-[:checked]:border-accent-400 has-[:checked]:bg-accent-50">
              <input
                type="radio"
                name="mode"
                value="none"
                defaultChecked={mode === "none"}
                className="mt-1 h-4 w-4 border-brand-300 text-accent-500 focus:ring-accent-300"
              />
              <span>
                <span className="block text-sm font-semibold text-brand-900">
                  No self-booking — I&apos;ll call to confirm
                </span>
                <span className="block text-xs text-brand-600">
                  The AI gathers the details and tells the customer you&apos;ll
                  be in touch shortly.
                </span>
              </span>
            </label>
          </div>
        </Card>
      </ActionForm>
    </div>
  );
}
