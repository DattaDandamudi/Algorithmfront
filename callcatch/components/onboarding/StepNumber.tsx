"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, PhoneCall, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Card";
import { saveNumberStep } from "@/app/(app)/onboarding/actions";
import { provisionNumber } from "@/lib/onboarding/client-api";
import { formatUsPhone, TONES, type Tone } from "@/lib/onboarding/schemas";
import { TONE_SAMPLES } from "@/lib/onboarding/us-data";
import { ChoiceCards, StepShell, Tip } from "./StepShell";
import type { Patch, WizardState } from "./OnboardingWizard";

export function StepNumber({ state, onPatch, onSaved, onBack }: { state: WizardState; onPatch: (p: Patch) => void; onSaved: (completedStep: number, patch: Patch) => void; onBack: () => void }) {
  const [tone, setTone] = useState<Tone>(state.tone);
  const [provisioning, setProvisioning] = useState(false);
  const [provisionError, setProvisionError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const attempted = useRef(false);
  const number = state.number;
  const soleProp = state.business.is_sole_prop;

  async function provision() {
    setProvisioning(true);
    setProvisionError(null);
    try {
      const res = await provisionNumber();
      onPatch({ number: res.number });
    } catch (err) {
      setProvisionError(err instanceof Error ? err.message : "Could not get a number");
    } finally {
      setProvisioning(false);
    }
  }

  useEffect(() => {
    if (!number && !attempted.current) {
      attempted.current = true;
      void provision();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount when no number exists
  }, []);

  function submit() {
    if (!number) {
      setError("We need a number before moving on.");
      return;
    }
    setError(null);
    start(async () => {
      const res = await saveNumberStep({ tone });
      if (!res.ok) {
        setError(res.error ?? "Could not save.");
        return;
      }
      onSaved(res.completedStep, { tone, number: res.number ?? number });
    });
  }

  const businessName = state.business.dba || state.business.legal_name || "your business";

  return (
    <StepShell
      eyebrow="Step 2 of 6"
      title="Your CallCatch number"
      description={soleProp ? "Sole-proprietor path: a local number registered as your own 10DLC brand." : "A toll-free number registered to your business. Missed calls forward here, and text-backs go out from it once carriers verify it."}
      error={error}
      onBack={onBack}
      onNext={submit}
      pending={pending}
      nextDisabled={!number}
      aside={
        <>
          <Tip title="Your customers keep calling the same number">
            <p>Nothing changes for them. Your carrier only forwards the calls you don&apos;t answer to this line.</p>
          </Tip>
          <Tip title="What happens before verification">
            <p>Callers hear your greeting and can leave a voicemail; you get an alert with the transcript. Text-backs switch on automatically the day the number verifies (usually 3–10 business days).</p>
          </Tip>
        </>
      }
    >
      <div className="rounded-2xl border border-brand-100 bg-brand-900 p-6 text-white">
        {number ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-300">{number.type === "local" ? "Local number" : "Toll-free number"}</p>
              <p className="mt-1 font-mono text-3xl font-bold tracking-tight">{formatUsPhone(number.phone_number)}</p>
              <p className="mt-1 text-sm text-brand-200">Registered to {businessName}</p>
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-xs font-medium text-brand-100">
              <ShieldCheck className="h-4 w-4 text-success-500" aria-hidden />
              {number.verification_status === "not_submitted" ? "Verification submitted on Finish" : `Verification: ${number.verification_status.replace("_", " ")}`}
            </div>
          </div>
        ) : provisioning ? (
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-accent-300" aria-hidden />
            <div>
              <p className="font-semibold">Picking a {soleProp ? "local" : "toll-free"} number…</p>
              <p className="text-sm text-brand-200">Reserving it and wiring up voice and SMS. A few seconds.</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">No number yet</p>
              <p className="text-sm text-brand-200">{provisionError ?? "Click to reserve one for your business."}</p>
            </div>
            <Button variant="primary" onClick={provision} leftIcon={<PhoneCall className="h-4 w-4" aria-hidden />}>
              Get my number
            </Button>
          </div>
        )}
      </div>
      {provisionError && number === null && !provisioning ? (
        <Alert tone="error">
          {provisionError}{" "}
          <button type="button" onClick={provision} className="inline-flex items-center gap-1 font-semibold underline underline-offset-2">
            <RefreshCw className="h-3 w-3" aria-hidden /> Try again
          </button>
        </Alert>
      ) : null}

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-semibold text-brand-900">Greeting tone</legend>
        <p className="-mt-1 text-xs text-brand-500">Sets the voice of the greeting callers hear and every text the AI sends.</p>
        <ChoiceCards name="tone" value={tone} onChange={setTone} options={TONES.map((t) => ({ value: t, label: TONE_SAMPLES[t].label, description: TONE_SAMPLES[t].blurb }))} />
        <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-500">Sample text-back</p>
          <p className="mt-1.5 text-sm text-brand-900">
            {TONE_SAMPLES[tone].sample.replace("AC", state.business.trade === "plumbing" ? "plumbing" : state.business.trade === "electrical" ? "electrical" : "AC")}{" "}
            <span className="text-brand-500">— {businessName}. Reply STOP to opt out.</span>
          </p>
        </div>
      </fieldset>
    </StepShell>
  );
}
