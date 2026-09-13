"use client";

import { useState, useTransition } from "react";
import { BellRing, CheckCircle2, MessageSquareText, Moon, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Card";
import { finishOnboarding, saveAlerts } from "@/app/(app)/onboarding/actions";
import { checkAlertCode, sendAlertCode } from "@/lib/onboarding/client-api";
import { alertsSchema, formatUsPhone, issuesToFieldErrors, normalizeUsPhone } from "@/lib/onboarding/schemas";
import { StepShell, Tip } from "./StepShell";
import type { Patch, WizardState } from "./OnboardingWizard";

export function StepAlerts({ state, onPatch, onBack }: { state: WizardState; onPatch: (p: Patch) => void; onBack: () => void }) {
  const [form, setForm] = useState({ ...state.alerts });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [codeState, setCodeState] = useState<{ phase: "idle" | "sending" | "sent" | "checking" | "verified"; message?: string; error?: string }>(
    state.alerts.alert_phone_verified ? { phase: "verified" } : { phase: "idle" }
  );
  const [pending, start] = useTransition();
  const [finishing, setFinishing] = useState(false);

  const verifiedPhone = state.alerts.alert_phone_verified ? state.alerts.alert_phone : null;
  const phoneNormalized = normalizeUsPhone(form.alert_phone);
  const isVerified = codeState.phase === "verified" && verifiedPhone !== null && phoneNormalized === verifiedPhone;

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function sendCode() {
    if (!phoneNormalized) {
      setErrors((e) => ({ ...e, alert_phone: "Enter a valid US mobile number" }));
      return;
    }
    setErrors((e) => ({ ...e, alert_phone: "" }));
    setCodeState({ phase: "sending" });
    try {
      const res = await sendAlertCode(phoneNormalized);
      setCodeState({ phase: "sent", message: `Code sent to ${formatUsPhone(res.phone)}. Expires in 10 minutes.` });
      onPatch({ alerts: { ...state.alerts, alert_phone: res.phone, alert_phone_verified: false } });
    } catch (err) {
      setCodeState({ phase: "idle", error: err instanceof Error ? err.message : "Could not send the code" });
    }
  }

  async function verifyCode() {
    if (!/^\d{6}$/.test(code)) {
      setCodeState((s) => ({ ...s, error: "Enter the 6-digit code" }));
      return;
    }
    setCodeState({ phase: "checking" });
    try {
      const res = await checkAlertCode(code);
      setCodeState({ phase: "verified" });
      setForm((f) => ({ ...f, alert_phone: res.phone, alert_phone_verified: true }));
      onPatch({ alerts: { ...state.alerts, alert_phone: res.phone, alert_phone_verified: true } });
    } catch (err) {
      setCodeState({ phase: "sent", error: err instanceof Error ? err.message : "That code didn't work" });
    }
  }

  function finish() {
    const parsed = alertsSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(issuesToFieldErrors(parsed.error));
      setError("Fix the highlighted fields.");
      return;
    }
    if (!isVerified) {
      setError("Verify your mobile number with the 6-digit code so alerts reach you.");
      return;
    }
    setError(null);
    setFinishing(true);
    start(async () => {
      const saved = await saveAlerts(form);
      if (!saved.ok) {
        setFinishing(false);
        setErrors(saved.fieldErrors ?? {});
        setError(saved.error ?? "Could not save.");
        return;
      }
      const res = await finishOnboarding();
      // finishOnboarding redirects on success; reaching here means it returned an error.
      setFinishing(false);
      setError(res.error);
    });
  }

  return (
    <StepShell
      eyebrow="Step 6 of 6"
      title="Where should alerts go?"
      description="When a call is missed you get a text within seconds — caller, voicemail transcript, and a one-tap call back. Verify the number so we know it's yours."
      error={error}
      onBack={onBack}
      onNext={finish}
      nextLabel="Finish setup"
      pending={pending || finishing}
      aside={
        <>
          <Tip title="Alerts come from our number">
            <p>Save the number that texts you the code as “CallCatch”. Alerts work from day one — before carrier verification.</p>
          </Tip>
          <Tip title="Quiet hours">
            <p>The AI never texts customers outside these hours (default 8am–9pm local); replies are queued until morning. Emergencies still alert you immediately.</p>
          </Tip>
          <Tip title="What happens on Finish">
            <p>We submit your carrier verification, and your dashboard opens. Text-backs switch on automatically when it&apos;s approved.</p>
          </Tip>
        </>
      }
    >
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 flex items-center gap-2 text-sm font-semibold text-brand-900">
          <BellRing className="h-4 w-4 text-brand-500" aria-hidden /> Owner mobile for SMS alerts
        </legend>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <Input
            label="Mobile number"
            value={form.alert_phone}
            onChange={(e) => {
              set("alert_phone", e.target.value);
              if (codeState.phase !== "idle") setCodeState({ phase: "idle" });
            }}
            error={errors.alert_phone || undefined}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="(555) 987-6543"
            disabled={isVerified}
          />
          {isVerified ? (
            <span className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-green-50 px-3 text-sm font-semibold text-green-800">
              <CheckCircle2 className="h-4 w-4 text-success-500" aria-hidden /> Verified
            </span>
          ) : (
            <Button variant="secondary" onClick={sendCode} loading={codeState.phase === "sending"} leftIcon={<MessageSquareText className="h-4 w-4" aria-hidden />}>
              {codeState.phase === "sent" || codeState.phase === "checking" ? "Resend code" : "Text me a code"}
            </Button>
          )}
        </div>
        {codeState.error ? <Alert tone="error">{codeState.error}</Alert> : null}
        {(codeState.phase === "sent" || codeState.phase === "checking") && !isVerified ? (
          <div className="rounded-2xl border border-accent-200 bg-accent-50 p-4">
            <p className="text-sm text-brand-800">{codeState.message}</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-[12rem_auto] sm:items-end">
              <Input label="6-digit code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="123456" className="font-mono tracking-[0.3em]" />
              <Button onClick={verifyCode} loading={codeState.phase === "checking"} disabled={code.length !== 6}>
                Verify
              </Button>
            </div>
          </div>
        ) : null}
        {isVerified ? (
          <button type="button" onClick={() => { setCodeState({ phase: "idle" }); onPatch({ alerts: { ...state.alerts, alert_phone_verified: false } }); }} className="self-start text-xs font-medium text-brand-600 hover:text-brand-900">
            Use a different number
          </button>
        ) : null}
      </fieldset>

      <Input label="Alert email" hint="Voicemail transcripts, the weekly report and verification updates." value={form.alert_email} onChange={(e) => set("alert_email", e.target.value)} error={errors.alert_email} type="email" inputMode="email" autoComplete="email" />

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 flex items-center gap-2 text-sm font-semibold text-brand-900">
          <Moon className="h-4 w-4 text-brand-500" aria-hidden /> Quiet hours (customer texts)
        </legend>
        <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
          <Input label="Texts start at" type="time" value={form.quiet_start} onChange={(e) => set("quiet_start", e.target.value)} error={errors.quiet_start} />
          <Input label="Texts stop at" type="time" value={form.quiet_end} onChange={(e) => set("quiet_end", e.target.value)} error={errors.quiet_end} />
        </div>
        <p className="text-xs text-brand-500">Local time ({state.business.timezone || "your timezone"}). Carrier rules require 8am–9pm at the widest.</p>
      </fieldset>

      <div className="flex items-start gap-3 rounded-2xl border border-brand-100 bg-brand-50/60 p-4 text-sm text-brand-700">
        <PartyPopper className="mt-0.5 h-5 w-5 shrink-0 text-accent-600" aria-hidden />
        <p>
          <span className="font-semibold text-brand-900">Almost there.</span> Finish submits {state.business.is_sole_prop ? "your sole-proprietor registration" : "your toll-free verification"} for{" "}
          <span className="font-mono">{state.number ? formatUsPhone(state.number.phone_number) : "your number"}</span> and opens your dashboard.
        </p>
      </div>
    </StepShell>
  );
}
