"use client";

import { useMemo, useState, useTransition } from "react";
import { FileCheck2, RotateCcw } from "lucide-react";
import { Input, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { saveCompliance } from "@/app/(app)/onboarding/actions";
import { complianceSchema, issuesToFieldErrors, type ComplianceInput } from "@/lib/onboarding/schemas";
import { buildTollFreeVerificationPayload, defaultCompliance, defaultOptInDescription, generateSampleMessages, toMessageVolumeBucket, type TfvAccount } from "@/lib/onboarding/tfv";
import { ChoiceCards, StepShell, Tip } from "./StepShell";
import type { Patch, WizardState } from "./OnboardingWizard";

/** Reconstructs the account shape the TFV builder needs from wizard state (mirrors what the server reads from `accounts`). */
function accountFromState(state: WizardState): TfvAccount {
  const b = state.business;
  return {
    id: state.accountId,
    legal_name: b.legal_name || null,
    dba: b.dba || null,
    website: b.website || null,
    address_line1: b.address_line1 || null,
    city: b.city || null,
    state: b.state || null,
    zip: b.zip || null,
    ein: b.ein || null,
    is_sole_prop: b.is_sole_prop,
    trade: b.trade,
    business_phone: b.business_phone || null,
    alert_phone: state.alerts.alert_phone || null,
    alert_email: state.alerts.alert_email || null,
    plan: state.plan,
    emergency_service: b.emergency_service,
    ai_profile: { services: state.aiProfile.services, compliance: state.compliance ?? undefined },
  };
}

export function StepCompliance({ state, onSaved, onBack }: { state: WizardState; onSaved: (completedStep: number, patch: Patch) => void; onBack: () => void }) {
  const account = useMemo(() => accountFromState(state), [state]);
  const [form, setForm] = useState<ComplianceInput>(() => defaultCompliance(account, state.user));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const soleProp = state.business.is_sole_prop;

  function set<K extends keyof ComplianceInput>(key: K, value: ComplianceInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  function setSample(i: 0 | 1 | 2, v: string) {
    setForm((f) => {
      const next: [string, string, string] = [...f.sample_messages] as [string, string, string];
      next[i] = v;
      return { ...f, sample_messages: next };
    });
  }
  function regenerate() {
    const fresh = generateSampleMessages(account);
    setForm((f) => ({ ...f, sample_messages: fresh, opt_in_description: defaultOptInDescription(f.opt_in_type, account) }));
  }

  const preview = useMemo(() => {
    const parsed = complianceSchema.safeParse(form);
    if (!parsed.success) return { ok: false as const, error: "Complete the fields to preview the submission." };
    try {
      return { ok: true as const, payload: buildTollFreeVerificationPayload({ account, compliance: parsed.data, tollfreePhoneNumberSid: "PN… (assigned)", contactEmail: state.user.email, notificationEmail: "CallCatch compliance" }) };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : "Missing fields" };
    }
  }, [form, account, state.user.email]);

  function submit() {
    const parsed = complianceSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(issuesToFieldErrors(parsed.error));
      setError("Fix the highlighted fields.");
      return;
    }
    setError(null);
    start(async () => {
      const res = await saveCompliance(form);
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        setError(res.error ?? "Could not save.");
        return;
      }
      onSaved(res.completedStep, { compliance: form });
    });
  }

  return (
    <StepShell
      eyebrow="Step 4 of 6"
      title={soleProp ? "Carrier registration (sole proprietor)" : "Carrier verification"}
      description={
        soleProp
          ? "We register you as a 10DLC sole-proprietor brand and campaign with these details. Pre-filled from step 1 — review, edit, done."
          : "Carriers review every toll-free number before it can text. This is exactly what we submit on Finish — pre-filled from step 1, edit anything."
      }
      error={error}
      onBack={onBack}
      onNext={submit}
      pending={pending}
      aside={
        <>
          <Tip title="What gets approved fastest">
            <p>A summary that says customers start the conversation (they call you), a real website, and sample messages that name the business and include STOP.</p>
          </Tip>
          <Tip title="Timing">
            <p>{soleProp ? "Brand approval is minutes to days; campaign vetting 1–7 business days." : "Typically 3–10 business days. We poll Twilio every 30 minutes and email you the moment it's approved."}</p>
          </Tip>
        </>
      }
    >
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-1 text-sm font-semibold text-brand-900">Business contact</legend>
        <Input label="First name" value={form.contact_first_name} onChange={(e) => set("contact_first_name", e.target.value)} error={errors.contact_first_name} autoComplete="given-name" />
        <Input label="Last name" value={form.contact_last_name} onChange={(e) => set("contact_last_name", e.target.value)} error={errors.contact_last_name} autoComplete="family-name" />
      </fieldset>

      <Textarea label="Use-case description" hint="Category: Customer care / lead qualification. 40–1000 characters." rows={5} value={form.use_case_summary} onChange={(e) => set("use_case_summary", e.target.value)} error={errors.use_case_summary} />

      <fieldset className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <legend className="text-sm font-semibold text-brand-900">Three sample messages</legend>
          <button type="button" onClick={regenerate} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-900">
            <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Regenerate from my details
          </button>
        </div>
        {([0, 1, 2] as const).map((i) => (
          <Textarea key={i} label={["First text-back", "Qualification question", "Confirmation"][i]} rows={2} value={form.sample_messages[i]} onChange={(e) => setSample(i, e.target.value)} error={errors[`sample_messages.${i}`]} />
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-semibold text-brand-900">How customers opt in</legend>
        <ChoiceCards
          name="opt_in_type"
          value={form.opt_in_type}
          onChange={(v) => setForm((f) => ({ ...f, opt_in_type: v, opt_in_description: defaultOptInDescription(v, account) }))}
          columns={2}
          options={[
            { value: "VERBAL", label: "They call the business", description: "Missed callers get one text about their own call." },
            { value: "WEB_FORM", label: "Web form with SMS disclosure", description: "Pro: forms + calls. Add the disclosure to your form." },
          ]}
        />
        <Textarea label="Opt-in description" rows={4} value={form.opt_in_description} onChange={(e) => set("opt_in_description", e.target.value)} error={errors.opt_in_description} />
      </fieldset>

      <Select
        label="Estimated monthly messages"
        hint={`Submitted as the “${toMessageVolumeBucket(Number(form.monthly_volume) || 0)}” bucket.`}
        value={String(form.monthly_volume)}
        onChange={(e) => set("monthly_volume", Number(e.target.value))}
        options={[
          { value: "100", label: "Up to 100" },
          { value: "500", label: "About 500" },
          { value: "1500", label: "About 1,500" },
          { value: "5000", label: "About 5,000" },
          { value: "10000", label: "10,000+" },
        ]}
        error={errors.monthly_volume}
      />

      <details className="group rounded-2xl border border-brand-100 bg-brand-50/50 open:bg-white">
        <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-semibold text-brand-900">
          <FileCheck2 className="h-4 w-4 text-brand-500" aria-hidden /> Preview the exact submission
        </summary>
        <div className="border-t border-brand-100 px-4 py-3 text-xs">
          {preview.ok ? (
            <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[11rem_1fr]">
              {Object.entries(preview.payload).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="font-mono text-brand-500">{k}</dt>
                  <dd className="whitespace-pre-wrap break-words text-brand-900">{k === "businessRegistrationNumber" ? `••••• ${String(v).slice(-4)}` : Array.isArray(v) ? v.join(", ") : String(v)}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-brand-600">{preview.error}</p>
          )}
        </div>
      </details>
    </StepShell>
  );
}
