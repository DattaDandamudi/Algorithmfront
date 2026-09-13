import type { AccountRow, Json } from "@/lib/db/types";
import { saveAiProfileAction } from "@/app/(app)/settings/actions";
import { ActionForm, FieldError } from "../ActionForm";
import { Card, CardTitle, Field, inputClass } from "../primitives";

function profile(raw: Json): {
  services: string;
  never_say: string;
  brands: string;
  price_ranges: string;
} {
  const o =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, Json | undefined>)
      : {};
  const list = (v: Json | undefined) =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string").join("\n")
      : "";
  const pr =
    o.price_ranges &&
    typeof o.price_ranges === "object" &&
    !Array.isArray(o.price_ranges)
      ? (o.price_ranges as Record<string, Json | undefined>)
      : {};
  return {
    services: list(o.services),
    never_say: list(o.never_say),
    brands: list(o.brands),
    price_ranges: Object.entries(pr)
      .map(
        ([k, v]) =>
          `${k}: ${typeof v === "number" ? `$${v}` : String(v ?? "")}`,
      )
      .join("\n"),
  };
}

const TONES = [
  {
    id: "friendly",
    label: "Friendly",
    sample:
      "Hey! Sorry we missed you — this is Summit Air. What's going on with your system?",
  },
  {
    id: "professional",
    label: "Professional",
    sample:
      "Thanks for calling Summit Air. We're with another customer — how can we help today?",
  },
  {
    id: "plain",
    label: "Plain-spoken",
    sample: "Summit Air here. Missed your call. What do you need?",
  },
];

export function AiProfileTab({
  account,
  readOnly,
}: {
  account: AccountRow;
  readOnly: boolean;
}) {
  const p = profile(account.ai_profile);
  const tone = account.tone ?? "friendly";
  const ta = `${inputClass} min-h-28 font-mono text-[13px] leading-relaxed`;
  return (
    <ActionForm action={saveAiProfileAction} readOnly={readOnly}>
      <Card>
        <CardTitle sub="How the text-back sounds. Every first message includes your business name and “Reply STOP to opt out”.">
          Tone
        </CardTitle>
        <div className="grid gap-3 sm:grid-cols-3">
          {TONES.map((t) => (
            <label
              key={t.id}
              className="flex cursor-pointer flex-col gap-2 rounded-xl border border-brand-200 p-3 has-[:checked]:border-accent-400 has-[:checked]:bg-accent-50"
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-brand-900">
                <input
                  type="radio"
                  name="tone"
                  value={t.id}
                  defaultChecked={tone === t.id}
                  className="h-4 w-4 border-brand-300 text-accent-500 focus:ring-accent-300"
                />
                {t.label}
              </span>
              <span className="text-xs text-brand-600">“{t.sample}”</span>
            </label>
          ))}
        </div>
      </Card>

      <Card>
        <CardTitle sub="One per line. The AI only offers what's listed and hands anything else to you.">
          Services you offer
        </CardTitle>
        <Field label="Services" htmlFor="services">
          <textarea
            id="services"
            name="services"
            defaultValue={p.services}
            rows={6}
            placeholder={
              "AC repair\nFurnace replacement\nDuct cleaning\nMaintenance plans"
            }
            className={ta}
          />
          <FieldError name="services" />
        </Field>
        <Field
          label="Brands you work on (optional)"
          htmlFor="brands"
          className="mt-4"
        >
          <textarea
            id="brands"
            name="brands"
            defaultValue={p.brands}
            rows={3}
            placeholder={"Carrier\nTrane\nLennox"}
            className={ta}
          />
          <FieldError name="brands" />
        </Field>
      </Card>

      <Card>
        <CardTitle sub="Hard rules. The AI never breaks these, even if the customer pushes.">
          Things never to say
        </CardTitle>
        <Field label="Never say" htmlFor="never_say">
          <textarea
            id="never_say"
            name="never_say"
            defaultValue={p.never_say}
            rows={5}
            placeholder={
              "No firm prices over text\nNever promise same-day service\nDon't diagnose — just gather details"
            }
            className={ta}
          />
          <FieldError name="never_say" />
        </Field>
      </Card>

      <Card>
        <CardTitle sub="Optional. Shown as “starting at”. Format each line as “Service: starting at $X”.">
          Typical price ranges
        </CardTitle>
        <Field label="Price ranges" htmlFor="price_ranges">
          <textarea
            id="price_ranges"
            name="price_ranges"
            defaultValue={p.price_ranges}
            rows={4}
            placeholder={
              "Diagnostic visit: $89\nWater heater replacement: starting at $1,400"
            }
            className={ta}
          />
          <FieldError name="price_ranges" />
        </Field>
      </Card>
    </ActionForm>
  );
}
