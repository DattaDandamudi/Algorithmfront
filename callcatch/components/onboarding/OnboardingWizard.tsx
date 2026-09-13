"use client";

import { useCallback, useState } from "react";
import { Stepper } from "@/components/ui/Stepper";
import { STEP_COUNT } from "@/lib/onboarding/schemas";
import type { WizardInitialState } from "@/lib/onboarding/state";
import { StepBusiness } from "./StepBusiness";
import { StepNumber } from "./StepNumber";
import { StepAiProfile } from "./StepAiProfile";
import { StepCompliance } from "./StepCompliance";
import { StepForwarding } from "./StepForwarding";
import { StepAlerts } from "./StepAlerts";

export const STEPS = [
  { id: 1, label: "Business" },
  { id: 2, label: "Number" },
  { id: 3, label: "AI profile" },
  { id: 4, label: "Compliance" },
  { id: 5, label: "Forwarding" },
  { id: 6, label: "Alerts" },
] as const;

export type WizardState = WizardInitialState;
export type Patch = Partial<WizardState>;

export function OnboardingWizard({ initial, startStep }: { initial: WizardInitialState; startStep: number }) {
  const [state, setState] = useState<WizardState>(initial);
  const [step, setStep] = useState(Math.min(Math.max(startStep, 1), STEP_COUNT));

  const maxReachable = Math.min(STEP_COUNT, state.completedStep + 1);

  const apply = useCallback((patch: Patch) => setState((s) => ({ ...s, ...patch })), []);

  const advance = useCallback(
    (completedStep: number, patch: Patch = {}) => {
      setState((s) => ({ ...s, ...patch, completedStep: Math.max(s.completedStep, completedStep) }));
      setStep((cur) => Math.min(STEP_COUNT, cur + 1));
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    },
    []
  );

  const back = useCallback(() => {
    setStep((cur) => Math.max(1, cur - 1));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <Stepper steps={STEPS} current={step} maxReachable={maxReachable} onSelect={(s) => setStep(s)} />
      {step === 1 ? <StepBusiness state={state} onSaved={(completed, patch) => advance(completed, patch)} /> : null}
      {step === 2 ? <StepNumber state={state} onPatch={apply} onSaved={(completed, patch) => advance(completed, patch)} onBack={back} /> : null}
      {step === 3 ? <StepAiProfile state={state} onSaved={(completed, patch) => advance(completed, patch)} onBack={back} /> : null}
      {step === 4 ? <StepCompliance state={state} onSaved={(completed, patch) => advance(completed, patch)} onBack={back} /> : null}
      {step === 5 ? <StepForwarding state={state} onPatch={apply} onSaved={(completed, patch) => advance(completed, patch)} onBack={back} /> : null}
      {step === 6 ? <StepAlerts state={state} onPatch={apply} onBack={back} /> : null}
    </div>
  );
}
