"use client";

import { useState, useTransition } from "react";
import { Building2, Flame, Droplets, Zap, Wrench, MapPin } from "lucide-react";
import { Input, Checkbox } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { saveBusiness } from "@/app/(app)/onboarding/actions";
import { businessSchema, issuesToFieldErrors, type BusinessInput, type Hours, type Trade } from "@/lib/onboarding/schemas";
import { STATE_TIMEZONE, US_STATES, US_TIMEZONES } from "@/lib/onboarding/us-data";
import { StepShell, Tip, ChoiceCards } from "./StepShell";
import { HoursEditor } from "./HoursEditor";
import { TagInput } from "./TagInput";
import type { Patch, WizardState } from "./OnboardingWizard";

type AreaMode = "radius" | "zips";

export function StepBusiness({ state, onSaved }: { state: WizardState; onSaved: (completedStep: number, patch: Patch) => void }) {
  const [form, setForm] = useState<BusinessInput>(state.business);
  const [areaMode, setAreaMode] = useState<AreaMode>(state.business.service_area.zips?.length && !state.business.service_area.radius_miles ? "zips" : "radius");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const isPro = state.plan === "pro";

  function set<K extends keyof BusinessInput>(key: K, value: BusinessInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => {
      if (!(key in e)) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });
  }

  function setState2(state2: string) {
    set("state", state2);
    if (!form.timezone && STATE_TIMEZONE[state2]) set("timezone", STATE_TIMEZONE[state2]);
  }

  function submit() {
    const candidate: BusinessInput = {
      ...form,
      service_area: areaMode === "radius" ? { center: form.service_area.center || `${form.city}, ${form.state}`, radius_miles: form.service_area.radius_miles ?? 25, zips: [] } : { center: "", radius_miles: null, zips: form.service_area.zips ?? [] },
      ein: form.is_sole_prop ? "" : form.ein,
    };
    const parsed = businessSchema.safeParse(candidate);
    if (!parsed.success) {
      setErrors(issuesToFieldErrors(parsed.error));
      setError("Fix the highlighted fields.");
      return;
    }
    setError(null);
    start(async () => {
      const res = await saveBusiness(candidate);
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        setError(res.error ?? "Could not save.");
        return;
      }
      onSaved(res.completedStep, { business: candidate });
    });
  }

  const tradeOptions: ReadonlyArray<{ value: Trade; label: string; description: string; icon: React.ReactNode }> = [
    { value: "hvac", label: "HVAC", description: "Heating & cooling", icon: <Flame className="h-4 w-4" aria-hidden /> },
    { value: "plumbing", label: "Plumbing", description: "Drains, leaks, water heaters", icon: <Droplets className="h-4 w-4" aria-hidden /> },
    { value: "electrical", label: "Electrical", description: "Panels, wiring, EV", icon: <Zap className="h-4 w-4" aria-hidden /> },
    { value: "other", label: "Other trade", description: "Roofing, garage, pest…", icon: <Wrench className="h-4 w-4" aria-hidden /> },
  ];

  return (
    <StepShell
      eyebrow="Step 1 of 6"
      title="Tell us about the business"
      description="Carriers verify every number against the legal business, so match your EIN letter exactly. Everything else shapes how the AI talks to your callers."
      error={error}
      onNext={submit}
      pending={pending}
      aside={
        <>
          <Tip title="Why the EIN?">
            <p>Since 2026 carriers require a business registration number to verify toll-free texting. No EIN yet? Tick sole proprietor and we&apos;ll register you on a local number instead.</p>
          </Tip>
          <Tip title="Which phone number?">
            <p>The line customers actually call — the one you&apos;ll forward from. We never replace it; we only catch what you miss.</p>
          </Tip>
        </>
      }
    >
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-1 flex items-center gap-2 text-sm font-semibold text-brand-900">
          <Building2 className="h-4 w-4 text-brand-500" aria-hidden /> Legal entity
        </legend>
        <Input label="Legal business name" hint="Exactly as on your EIN letter" value={form.legal_name} onChange={(e) => set("legal_name", e.target.value)} error={errors.legal_name} autoComplete="organization" />
        <Input label="DBA / brand name" optional hint="What customers know you as" value={form.dba} onChange={(e) => set("dba", e.target.value)} error={errors.dba} />
        <Input label="Website" hint="Facebook or Google Business page URL works" value={form.website} onChange={(e) => set("website", e.target.value)} error={errors.website} inputMode="url" placeholder="acme-hvac.com" wrapperClassName="sm:col-span-2" />
        <Input label="Street address" value={form.address_line1} onChange={(e) => set("address_line1", e.target.value)} error={errors.address_line1} autoComplete="street-address" wrapperClassName="sm:col-span-2" />
        <Input label="City" value={form.city} onChange={(e) => set("city", e.target.value)} error={errors.city} autoComplete="address-level2" />
        <div className="grid grid-cols-2 gap-3">
          <Select label="State" value={form.state} onChange={(e) => setState2(e.target.value)} options={US_STATES} placeholder="—" error={errors.state} autoComplete="address-level1" />
          <Input label="ZIP" value={form.zip} onChange={(e) => set("zip", e.target.value)} error={errors.zip} inputMode="numeric" autoComplete="postal-code" />
        </div>
        <div className="flex flex-col gap-3 sm:col-span-2">
          <Input
            label="EIN"
            hint="9 digits, e.g. 12-3456789"
            value={form.ein}
            onChange={(e) => set("ein", e.target.value)}
            error={errors.ein}
            inputMode="numeric"
            disabled={form.is_sole_prop}
            placeholder={form.is_sole_prop ? "Not needed on the sole-proprietor path" : "12-3456789"}
          />
          <Checkbox
            label="I'm a sole proprietor without an EIN"
            description="We'll register you as a sole-proprietor brand on a local number (10DLC). Same features, lower daily text cap."
            checked={form.is_sole_prop}
            onChange={(e) => set("is_sole_prop", e.target.checked)}
          />
        </div>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-1 text-sm font-semibold text-brand-900">Phone & timezone</legend>
        <Input label="Business phone (the one you forward from)" value={form.business_phone} onChange={(e) => set("business_phone", e.target.value)} error={errors.business_phone} type="tel" inputMode="tel" autoComplete="tel" placeholder="(555) 123-4567" />
        <Select label="Timezone" value={form.timezone} onChange={(e) => set("timezone", e.target.value)} options={US_TIMEZONES} placeholder="Pick a timezone" error={errors.timezone} />
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold text-brand-900">Trade</legend>
        <ChoiceCards name="trade" value={form.trade} onChange={(v) => set("trade", v)} options={tradeOptions} columns={4} />
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 flex items-center gap-2 text-sm font-semibold text-brand-900">
          <MapPin className="h-4 w-4 text-brand-500" aria-hidden /> Service area
        </legend>
        <ChoiceCards
          name="area_mode"
          value={areaMode}
          onChange={setAreaMode}
          columns={2}
          options={[
            { value: "radius", label: "Radius around a city", description: "e.g. 25 miles around Austin, TX" },
            { value: "zips", label: "Specific ZIP codes", description: "Paste a list, comma separated" },
          ]}
        />
        {areaMode === "radius" ? (
          <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
            <Input label="Center (city, state)" value={form.service_area.center ?? ""} onChange={(e) => set("service_area", { ...form.service_area, center: e.target.value })} placeholder={form.city && form.state ? `${form.city}, ${form.state}` : "Austin, TX"} error={errors["service_area.center"]} />
            <Input label="Radius (miles)" type="number" min={1} max={300} value={form.service_area.radius_miles ?? 25} onChange={(e) => set("service_area", { ...form.service_area, radius_miles: Number(e.target.value) || null })} error={errors["service_area.radius_miles"]} inputMode="numeric" />
          </div>
        ) : (
          <TagInput
            label="ZIP codes you serve"
            values={form.service_area.zips ?? []}
            onChange={(zips) => set("service_area", { ...form.service_area, zips })}
            placeholder="78701, 78702, 78703"
            validate={(z) => (/^\d{5}$/.test(z) ? null : `“${z}” isn't a 5-digit ZIP`)}
            error={errors["service_area.zips"]}
            max={200}
          />
        )}
      </fieldset>

      <HoursEditor value={form.hours as Hours} onChange={(h) => set("hours", h)} error={errors.hours} />

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-1 text-sm font-semibold text-brand-900">Emergencies</legend>
        <Checkbox label="We offer emergency / after-hours service" description="The AI will flag gas smells, flooding, sparks and no-heat calls as urgent." checked={form.emergency_service} onChange={(e) => set("emergency_service", e.target.checked)} className="sm:col-span-2" />
        {isPro ? (
          <Input label="After-hours on-call number" optional hint="Pro: emergencies ring this number when you're closed" value={form.on_call_phone ?? ""} onChange={(e) => set("on_call_phone", e.target.value)} error={errors.on_call_phone} type="tel" inputMode="tel" wrapperClassName="sm:col-span-2" />
        ) : (
          <p className="text-xs text-brand-500 sm:col-span-2">After-hours emergency routing to an on-call tech is available on Pro.</p>
        )}
      </fieldset>
    </StepShell>
  );
}
