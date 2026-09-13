"use client";

import { useState, useTransition } from "react";
import { CalendarCheck, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { saveAiProfile } from "@/app/(app)/onboarding/actions";
import { aiProfileSchema, issuesToFieldErrors, type AiProfileInput } from "@/lib/onboarding/schemas";
import { NEVER_SAY_PRESETS, SERVICE_PRESETS } from "@/lib/onboarding/us-data";
import { ChoiceCards, StepShell, Tip } from "./StepShell";
import { TagInput } from "./TagInput";
import type { Patch, WizardState } from "./OnboardingWizard";

export function StepAiProfile({ state, onSaved, onBack }: { state: WizardState; onSaved: (completedStep: number, patch: Patch) => void; onBack: () => void }) {
  const [form, setForm] = useState<AiProfileInput>(state.aiProfile);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const isPro = state.plan === "pro";
  const bookingMode: "callcatch" | "external" | "none" = form.use_scheduling_page ? "callcatch" : form.booking_url ? "external" : "none";

  function set<K extends keyof AiProfileInput>(key: K, value: AiProfileInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function submit() {
    const parsed = aiProfileSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(issuesToFieldErrors(parsed.error));
      setError("Fix the highlighted fields.");
      return;
    }
    setError(null);
    start(async () => {
      const res = await saveAiProfile(form);
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        setError(res.error ?? "Could not save.");
        return;
      }
      onSaved(res.completedStep, { aiProfile: form });
    });
  }

  const priceRows = form.price_ranges;

  return (
    <StepShell
      eyebrow="Step 3 of 6"
      title="Teach the AI your business"
      description="The assistant qualifies callers — what's wrong, where, how urgent, when — and never invents prices or promises. Give it the guardrails."
      error={error}
      onBack={onBack}
      onNext={submit}
      pending={pending}
      aside={
        <>
          <Tip title="What the AI always does">
            <p>Identifies your business, asks the 5 qualification questions in order, includes STOP language, and hands off to you after 8 turns.</p>
          </Tip>
          <Tip title="What it never does">
            <p>Quotes firm prices, diagnoses over text, or texts anyone who didn&apos;t call or submit a form first.</p>
          </Tip>
        </>
      }
    >
      <TagInput
        label="Services you offer"
        hint="Pick from the list or type your own and press Enter."
        values={form.services}
        onChange={(v) => set("services", v)}
        presets={SERVICE_PRESETS[state.business.trade] ?? SERVICE_PRESETS.other}
        placeholder="AC repair, furnace install…"
        error={errors.services}
      />
      <TagInput
        label="Things the AI should never say"
        hint="Rules the assistant follows in every conversation."
        values={form.never_say}
        onChange={(v) => set("never_say", v)}
        presets={NEVER_SAY_PRESETS}
        placeholder="e.g. never mention financing"
        error={errors.never_say}
        max={20}
      />

      <fieldset className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <legend className="text-sm font-medium text-brand-900">
            Typical price ranges <span className="text-xs font-normal text-brand-400">Optional · shown as “starting at”</span>
          </legend>
          <Button variant="ghost" size="sm" onClick={() => set("price_ranges", [...priceRows, { label: "", value: "" }])} leftIcon={<Plus className="h-4 w-4" aria-hidden />} disabled={priceRows.length >= 20}>
            Add
          </Button>
        </div>
        {priceRows.length === 0 ? <p className="text-xs text-brand-500">Leave empty and the AI will say a tech confirms pricing on site.</p> : null}
        {priceRows.map((row, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
            <Input label={i === 0 ? "Service" : ""} aria-label="Service" value={row.label} onChange={(e) => set("price_ranges", priceRows.map((r, j) => (j === i ? { ...r, label: e.target.value } : r)))} placeholder="Diagnostic visit" error={errors[`price_ranges.${i}.label`]} />
            <Input label={i === 0 ? "Starting at" : ""} aria-label="Starting at" value={row.value} onChange={(e) => set("price_ranges", priceRows.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)))} placeholder="$89, waived with repair" error={errors[`price_ranges.${i}.value`]} />
            <Button variant="ghost" size="sm" aria-label="Remove price range" onClick={() => set("price_ranges", priceRows.filter((_, j) => j !== i))} className="mb-0.5">
              <Trash2 className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 flex items-center gap-2 text-sm font-semibold text-brand-900">
          <CalendarCheck className="h-4 w-4 text-brand-500" aria-hidden /> Booking hand-off {isPro ? "" : <span className="rounded-md bg-accent-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent-700">Pro</span>}
        </legend>
        <ChoiceCards
          name="booking"
          value={bookingMode}
          onChange={(v) => {
            if (v === "callcatch") setForm((f) => ({ ...f, use_scheduling_page: true, booking_url: "" }));
            else if (v === "external") setForm((f) => ({ ...f, use_scheduling_page: false }));
            else setForm((f) => ({ ...f, use_scheduling_page: false, booking_url: "" }));
          }}
          options={[
            { value: "none", label: "Owner confirms by text", description: "AI collects details, you pick the slot." },
            { value: "external", label: "Send my booking link", description: "Jobber, Housecall Pro, Calendly…" },
            { value: "callcatch", label: "CallCatch scheduling page", description: "Simple request-a-window page." },
          ]}
        />
        {bookingMode === "external" ? (
          <Input label="Booking link" value={form.booking_url} onChange={(e) => set("booking_url", e.target.value)} placeholder="https://clienthub.getjobber.com/…" inputMode="url" error={errors.booking_url} hint={isPro ? "Sent once a caller is qualified." : "Saved now; sent automatically when you upgrade to Pro."} />
        ) : null}
      </fieldset>
    </StepShell>
  );
}
