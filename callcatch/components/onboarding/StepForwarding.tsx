"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { CheckCircle2, Copy, Loader2, PhoneForwarded, PhoneOutgoing } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Alert } from "@/components/ui/Card";
import { saveForwarding } from "@/app/(app)/onboarding/actions";
import { CARRIER_INSTRUCTIONS, carrierById, renderDialCode } from "@/lib/onboarding/carriers";
import { pollForwardingTest, startForwardingTest, isBillingRequired, BILLING_REQUIRED_MESSAGE } from "@/lib/onboarding/client-api";
import { formatUsPhone, type Carrier } from "@/lib/onboarding/schemas";
import { StepShell, Tip } from "./StepShell";
import type { Patch, WizardState } from "./OnboardingWizard";

const POLL_MS = 3000;
const POLL_FOR_MS = 45_000;

type TestStatus = "idle" | "calling" | "seen" | "timeout" | "error";

function DialCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }
  return (
    <div className="flex items-center gap-2">
      <a href={`tel:${encodeURIComponent(code)}`} className="rounded-lg bg-brand-900 px-3 py-1.5 font-mono text-sm font-semibold text-white hover:bg-brand-800">
        {code}
      </a>
      <button type="button" onClick={copy} className="inline-flex items-center gap-1 rounded-lg border border-brand-200 px-2 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50" aria-label={`Copy ${code}`}>
        {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-success-500" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export function StepForwarding({ state, onPatch, onSaved, onBack }: { state: WizardState; onPatch: (p: Patch) => void; onSaved: (completedStep: number, patch: Patch) => void; onBack: () => void }) {
  const [carrier, setCarrier] = useState<Carrier>(state.forwarding.carrier ?? "verizon");
  const [attested, setAttested] = useState(state.forwarding.attested);
  const alreadyConfirmed = Boolean(state.forwarding.confirmed_at || state.forwardingTest?.seen_at);
  const [status, setStatus] = useState<TestStatus>(alreadyConfirmed ? "seen" : "idle");
  const [outbound, setOutbound] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const timers = useRef<{ interval?: number; timeout?: number }>({});
  const number = state.number;
  const instructions = carrierById(carrier);

  const stopPolling = useCallback(() => {
    if (timers.current.interval) window.clearInterval(timers.current.interval);
    if (timers.current.timeout) window.clearTimeout(timers.current.timeout);
    timers.current = {};
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  async function runTest() {
    setTestError(null);
    setOutbound(null);
    setStatus("calling");
    let attemptId: string;
    try {
      const res = await startForwardingTest();
      attemptId = res.attemptId;
      onPatch({ forwardingTest: { attempt_id: res.attemptId, started_at: res.startedAt, seen_at: null } });
    } catch (err) {
      setStatus("error");
      setTestError(isBillingRequired(err) ? BILLING_REQUIRED_MESSAGE : err instanceof Error ? err.message : "Could not place the test call");
      return;
    }
    stopPolling();
    timers.current.interval = window.setInterval(async () => {
      try {
        const r = await pollForwardingTest(attemptId);
        if (r.outboundStatus) setOutbound(r.outboundStatus);
        if (r.seen) {
          stopPolling();
          setStatus("seen");
          onPatch({ forwarding: { ...state.forwarding, carrier, confirmed_at: r.seenAt ?? new Date().toISOString() } });
        }
      } catch {
        /* transient; keep polling */
      }
    }, POLL_MS);
    timers.current.timeout = window.setTimeout(() => {
      stopPolling();
      setStatus((s) => (s === "seen" ? s : "timeout"));
    }, POLL_FOR_MS);
  }

  function submit() {
    if (status !== "seen" && !attested) {
      setError("Run the test until it turns green, or confirm you've set forwarding up manually.");
      return;
    }
    setError(null);
    start(async () => {
      const res = await saveForwarding({ carrier, attested });
      if (!res.ok) {
        setError(res.error ?? "Could not save.");
        return;
      }
      onSaved(res.completedStep, { forwarding: { carrier, attested, confirmed_at: state.forwarding.confirmed_at ?? (status === "seen" ? new Date().toISOString() : null) } });
    });
  }

  return (
    <StepShell
      eyebrow="Step 5 of 6"
      title="Forward missed calls to CallCatch"
      description="Conditional forwarding: your phone rings first, exactly as today. Only calls you don't answer (or reject) go to your CallCatch number."
      error={error}
      onBack={onBack}
      onNext={submit}
      pending={pending}
      aside={
        <>
          <Tip title="How the test works">
            <p>We call {formatUsPhone(state.business.business_phone) || "your business line"} from our number. Don&apos;t pick up. If forwarding is on, your carrier hands the ring to us in ~20 seconds and this page turns green.</p>
          </Tip>
          <Tip title="To turn it off later">
            <p>Dial the disable code ({instructions.disable?.join(" or ") ?? "see your provider portal"}). Nothing about your number changes.</p>
          </Tip>
        </>
      }
    >
      {!number ? <Alert tone="warning">Provision your number in step 2 first — forwarding needs a destination.</Alert> : null}

      <Select label="Who's your phone carrier?" value={carrier} onChange={(e) => setCarrier(e.target.value as Carrier)} options={CARRIER_INSTRUCTIONS.map((c) => ({ value: c.id, label: c.label }))} />

      <div className="rounded-2xl border border-brand-100 bg-white p-4 sm:p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-brand-900">
          <PhoneForwarded className="h-4 w-4 text-brand-500" aria-hidden /> {instructions.label} — forward when busy / no answer
        </div>
        {instructions.kind === "dial" && number ? (
          <div className="mt-3 flex flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-brand-500">Dial from the business phone</p>
            <div className="flex flex-wrap gap-2">
              {instructions.enable?.map((t) => (
                <DialCode key={t} code={renderDialCode(t, number.phone_number)} />
              ))}
            </div>
          </div>
        ) : null}
        <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-sm text-brand-700">
          {instructions.steps.map((s) => (
            <li key={s}>{s.replace("your CallCatch number", number ? formatUsPhone(number.phone_number) : "your CallCatch number")}</li>
          ))}
        </ol>
        {instructions.note ? <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-600">{instructions.note}</p> : null}
        {number ? (
          <p className="mt-3 text-xs text-brand-500">
            Destination number: <span className="font-mono font-semibold text-brand-900">{formatUsPhone(number.phone_number)}</span>
          </p>
        ) : null}
      </div>

      <div
        role="status"
        aria-live="polite"
        className={`rounded-2xl border p-5 transition ${
          status === "seen" ? "border-green-300 bg-green-50" : status === "calling" ? "border-accent-200 bg-accent-50" : status === "timeout" || status === "error" ? "border-amber-200 bg-amber-50" : "border-brand-100 bg-brand-50/60"
        }`}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            {status === "seen" ? (
              <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-success-500" aria-hidden />
            ) : status === "calling" ? (
              <Loader2 className="mt-0.5 h-6 w-6 shrink-0 animate-spin text-accent-600" aria-hidden />
            ) : (
              <PhoneOutgoing className="mt-0.5 h-6 w-6 shrink-0 text-brand-500" aria-hidden />
            )}
            <div>
              <p className="font-semibold text-brand-900">
                {status === "seen" && "Forwarding works — we got the call."}
                {status === "calling" && `Calling ${formatUsPhone(state.business.business_phone)}… let it ring.`}
                {status === "timeout" && "We didn't see the forwarded call."}
                {status === "error" && (testError ?? "The test call failed.")}
                {status === "idle" && "Test my forwarding"}
              </p>
              <p className="text-sm text-brand-600">
                {status === "seen" && "Every call you miss now lands at CallCatch. You can re-run the test any time."}
                {status === "calling" && `Watching for the forwarded leg for 45 seconds${outbound ? ` · outbound: ${outbound}` : ""}.`}
                {status === "timeout" && "Double-check the dial code went through (you should have heard a confirmation tone), then try again. If you answered the call, hang up and let the next one ring."}
                {status === "error" && "Check the business phone in step 1 and try again."}
                {status === "idle" && "We'll call your business line. Don't answer — the page turns green when the forward reaches us."}
              </p>
            </div>
          </div>
          <Button variant={status === "seen" ? "secondary" : "primary"} onClick={runTest} disabled={!number || status === "calling"} loading={status === "calling"} leftIcon={<PhoneOutgoing className="h-4 w-4" aria-hidden />}>
            {status === "seen" ? "Test again" : status === "timeout" || status === "error" ? "Retry test" : "Call my line"}
          </Button>
        </div>
      </div>

      {status !== "seen" ? (
        <Checkbox
          label="I've set up forwarding manually (VoIP portal / desk phone) and will test later"
          description="You can re-run the test from Settings any time. Without forwarding, CallCatch can't catch anything."
          checked={attested}
          onChange={(e) => setAttested(e.target.checked)}
        />
      ) : null}
    </StepShell>
  );
}
