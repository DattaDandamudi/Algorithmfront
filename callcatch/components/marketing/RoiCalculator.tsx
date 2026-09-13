"use client";

import { useId, useMemo, useState } from "react";
import { Calculator } from "lucide-react";
import { PLANS } from "@/lib/plans";

const WEEKS_PER_MONTH = 4.33;

function usd(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

type Props = {
  defaultMissedPerWeek?: number;
  defaultCloseRatePct?: number;
  defaultTicketUsd?: number;
};

/**
 * Missed calls/week × close rate × average ticket → revenue at stake per month.
 * Defaults follow the spec's ad math (10 missed/week, $450 ticket).
 */
export function RoiCalculator({ defaultMissedPerWeek = 10, defaultCloseRatePct = 35, defaultTicketUsd = 450 }: Props) {
  const [missed, setMissed] = useState(defaultMissedPerWeek);
  const [close, setClose] = useState(defaultCloseRatePct);
  const [ticket, setTicket] = useState(defaultTicketUsd);
  const idBase = useId();

  const { monthlyAtStake, jobsPerMonth, jobsToBreakEven } = useMemo(() => {
    const jobs = missed * WEEKS_PER_MONTH * (close / 100);
    const revenue = jobs * ticket;
    return {
      monthlyAtStake: revenue,
      jobsPerMonth: jobs,
      jobsToBreakEven: Math.max(1, Math.ceil(PLANS.starter.priceMonthlyUsd / Math.max(ticket, 1))),
    };
  }, [missed, close, ticket]);

  return (
    <div className="grid gap-6 rounded-3xl border border-brand-100 bg-white p-6 shadow-sm sm:p-8 lg:grid-cols-[1.1fr_1fr]">
      <div className="space-y-6">
        <div className="flex items-center gap-2 text-brand-900">
          <Calculator className="h-5 w-5 text-accent-600" aria-hidden="true" />
          <h3 className="text-lg font-semibold">What do missed calls cost you?</h3>
        </div>
        <Field
          id={`${idBase}-missed`}
          label="Calls you miss per week"
          hint="Check your carrier's missed-call log for one week"
          value={missed}
          min={1}
          max={60}
          step={1}
          onChange={setMissed}
          display={`${missed}`}
        />
        <Field
          id={`${idBase}-close`}
          label="Of those, how many would book?"
          hint="Most shops close 30–50% of inbound calls they actually answer"
          value={close}
          min={5}
          max={80}
          step={5}
          onChange={setClose}
          display={`${close}%`}
        />
        <Field
          id={`${idBase}-ticket`}
          label="Average ticket"
          hint="Repairs $180–$450, replacements $4k–$12k. Use your blended average."
          value={ticket}
          min={100}
          max={3000}
          step={25}
          onChange={setTicket}
          display={usd(ticket)}
        />
      </div>
      <div className="flex flex-col justify-between rounded-2xl bg-brand-900 p-6 text-white">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-300">Revenue at stake</p>
          <p className="mt-2 text-4xl font-bold tabular-nums tracking-tight sm:text-5xl" aria-live="polite">
            {usd(monthlyAtStake)}
            <span className="text-base font-medium text-brand-200"> / month</span>
          </p>
          <p className="mt-3 text-sm text-brand-100">
            That&apos;s about <strong className="text-white">{jobsPerMonth.toFixed(1)} jobs a month</strong> going to whoever picks up — or texts back — first.
          </p>
        </div>
        <dl className="mt-6 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-white/10 p-3">
            <dt className="text-brand-200">Starter plan</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">{usd(PLANS.starter.priceMonthlyUsd)}/mo</dd>
          </div>
          <div className="rounded-xl bg-white/10 p-3">
            <dt className="text-brand-200">Pays for itself with</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">
              {jobsToBreakEven} {jobsToBreakEven === 1 ? "job" : "jobs"}
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-[11px] leading-relaxed text-brand-300">
          Estimate only. Uses 4.33 weeks per month. CallCatch does not guarantee bookings or revenue; results depend on your call volume, response and pricing.
        </p>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  value,
  min,
  max,
  step,
  onChange,
  display,
}: {
  id: string;
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (n: number) => void;
  display: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-semibold text-brand-900">
          {label}
        </label>
        <output htmlFor={id} className="text-sm font-semibold tabular-nums text-accent-700">
          {display}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 h-2 w-full cursor-pointer appearance-none rounded-full bg-brand-100 accent-accent-500"
      />
      <p className="mt-1 text-xs text-brand-600">{hint}</p>
    </div>
  );
}
