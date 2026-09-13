/**
 * Reads onboarding state out of the `accounts` row. Progress and wizard-only data live inside
 * `accounts.ai_profile` (jsonb) under keys module c ignores (`parseAiProfile` reads only
 * services / never_say / brands / price_ranges): `onboarding_step`, `compliance`, `forwarding`,
 * `forwarding_test`, `alert_code`. No schema changes needed. Pure module (browser-safe).
 */
import type { AccountRow, Json, NumberRow } from "@/lib/db/types";
import {
  DEFAULT_HOURS,
  STEP_COUNT,
  type AiProfileInput,
  type BusinessInput,
  type Carrier,
  type ComplianceInput,
  type Hours,
  type OptInType,
  type Tone,
  DAYS,
  CARRIERS,
  TONES,
  TRADES,
} from "./schemas";

export type JsonObject = { [key: string]: Json | undefined };

export function asObject(v: Json | null | undefined): JsonObject {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as JsonObject) : {};
}

const str = (v: Json | undefined, fallback = ""): string => (typeof v === "string" ? v : fallback);
const num = (v: Json | undefined): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const strList = (v: Json | undefined): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : []);

export type ForwardingTestMeta = {
  attempt_id: string;
  started_at: string;
  call_sid: string | null;
  seen_at: string | null;
  /** ISO timestamps of recent POSTs — rate limiting. */
  sent_at: string[];
};

export type AlertCodeMeta = {
  phone: string;
  hash: string;
  expires_at: string;
  attempts: number;
  /** ISO timestamps of recent sends — rate limiting. */
  sent_at: string[];
};

export type OnboardingMeta = {
  /** Highest step the user has completed (0..6). */
  completedStep: number;
  compliance: Partial<ComplianceInput> | null;
  forwarding: { carrier: Carrier | null; attested: boolean; confirmed_at: string | null };
  forwardingTest: ForwardingTestMeta | null;
  alertCode: AlertCodeMeta | null;
};

export function parseOnboardingMeta(aiProfile: Json | null | undefined): OnboardingMeta {
  const p = asObject(aiProfile);
  const stepRaw = num(p.onboarding_step) ?? 0;
  const completedStep = Math.max(0, Math.min(STEP_COUNT, Math.floor(stepRaw)));

  const c = asObject(p.compliance);
  const samples = strList(c.sample_messages);
  const compliance: Partial<ComplianceInput> | null = Object.keys(c).length
    ? {
        contact_first_name: str(c.contact_first_name),
        contact_last_name: str(c.contact_last_name),
        use_case_summary: str(c.use_case_summary),
        sample_messages: [samples[0] ?? "", samples[1] ?? "", samples[2] ?? ""],
        opt_in_type: (c.opt_in_type === "WEB_FORM" ? "WEB_FORM" : "VERBAL") as OptInType,
        opt_in_description: str(c.opt_in_description),
        monthly_volume: num(c.monthly_volume) ?? 300,
      }
    : null;

  const f = asObject(p.forwarding);
  const carrierRaw = str(f.carrier);
  const forwarding = {
    carrier: (CARRIERS as ReadonlyArray<string>).includes(carrierRaw) ? (carrierRaw as Carrier) : null,
    attested: f.attested === true,
    confirmed_at: typeof f.confirmed_at === "string" ? f.confirmed_at : null,
  };

  const t = asObject(p.forwarding_test);
  const forwardingTest: ForwardingTestMeta | null =
    typeof t.attempt_id === "string" && typeof t.started_at === "string"
      ? {
          attempt_id: t.attempt_id,
          started_at: t.started_at,
          call_sid: typeof t.call_sid === "string" ? t.call_sid : null,
          seen_at: typeof t.seen_at === "string" ? t.seen_at : null,
          sent_at: strList(t.sent_at),
        }
      : null;

  const a = asObject(p.alert_code);
  const alertCode: AlertCodeMeta | null =
    typeof a.hash === "string" && typeof a.expires_at === "string" && typeof a.phone === "string"
      ? { phone: a.phone, hash: a.hash, expires_at: a.expires_at, attempts: num(a.attempts) ?? 0, sent_at: strList(a.sent_at) }
      : null;

  return { completedStep, compliance, forwarding, forwardingTest, alertCode };
}

export function parseHours(raw: Json | null | undefined): Hours {
  const obj = asObject(raw);
  if (Object.keys(obj).length === 0) return { ...DEFAULT_HOURS };
  const out = { ...DEFAULT_HOURS };
  for (const d of DAYS) {
    const v = obj[d];
    if (Array.isArray(v) && v.length >= 2 && typeof v[0] === "string" && typeof v[1] === "string") out[d] = [v[0], v[1]];
    else out[d] = null;
  }
  return out;
}

export function parseServiceArea(raw: Json | null | undefined): { center: string; radius_miles: number | null; zips: string[] } {
  const obj = asObject(raw);
  return {
    center: str(obj.center),
    radius_miles: num(obj.radius_miles),
    zips: strList(obj.zips),
  };
}

/** Public, serializable snapshot of the number row for the wizard. */
export type WizardNumber = {
  id: string;
  phone_number: string;
  type: "tollfree" | "local";
  verification_status: string;
  verification_sid: string | null;
  sms_enabled: boolean;
};

export function toWizardNumber(n: NumberRow | null | undefined): WizardNumber | null {
  if (!n) return null;
  return {
    id: n.id,
    phone_number: n.phone_number,
    type: n.type === "local" ? "local" : "tollfree",
    verification_status: n.verification_status,
    verification_sid: n.verification_sid,
    sms_enabled: n.sms_enabled,
  };
}

export type WizardInitialState = {
  accountId: string;
  plan: "starter" | "pro" | null;
  status: string;
  completedStep: number;
  business: BusinessInput;
  tone: Tone;
  aiProfile: AiProfileInput;
  compliance: Partial<ComplianceInput> | null;
  forwarding: OnboardingMeta["forwarding"];
  forwardingTest: { attempt_id: string; started_at: string; seen_at: string | null } | null;
  alerts: { alert_phone: string; alert_email: string; alert_phone_verified: boolean; quiet_start: string; quiet_end: string };
  number: WizardNumber | null;
  user: { email: string; fullName: string | null };
};

function hhmm(t: string | null | undefined, fallback: string): string {
  if (!t) return fallback;
  const m = t.match(/^(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : fallback;
}

export function buildWizardInitialState(
  account: AccountRow,
  number: NumberRow | null,
  user: { email: string; fullName: string | null }
): WizardInitialState {
  const meta = parseOnboardingMeta(account.ai_profile);
  const ai = asObject(account.ai_profile);
  const priceRangesObj = asObject(ai.price_ranges);
  const priceRanges = Object.entries(priceRangesObj)
    .filter((e): e is [string, string] => typeof e[1] === "string")
    .map(([label, value]) => ({ label, value }));
  const tradeRaw = account.trade ?? "";
  const toneRaw = account.tone ?? "";
  const sa = parseServiceArea(account.service_area);

  return {
    accountId: account.id,
    plan: account.plan === "pro" || account.plan === "starter" ? account.plan : null,
    status: account.status,
    completedStep: meta.completedStep,
    business: {
      legal_name: account.legal_name ?? "",
      dba: account.dba ?? "",
      website: account.website ?? "",
      address_line1: account.address_line1 ?? "",
      city: account.city ?? "",
      state: account.state ?? "",
      zip: account.zip ?? "",
      is_sole_prop: account.is_sole_prop,
      ein: account.ein ?? "",
      business_phone: account.business_phone ?? "",
      timezone: account.timezone ?? "",
      trade: (TRADES as ReadonlyArray<string>).includes(tradeRaw) ? (tradeRaw as BusinessInput["trade"]) : "hvac",
      service_area: { center: sa.center, radius_miles: sa.radius_miles ?? undefined, zips: sa.zips },
      hours: parseHours(account.hours),
      emergency_service: account.emergency_service,
      on_call_phone: account.on_call_phone ?? "",
    },
    tone: (TONES as ReadonlyArray<string>).includes(toneRaw) ? (toneRaw as Tone) : "friendly",
    aiProfile: {
      services: strList(ai.services),
      never_say: strList(ai.never_say),
      price_ranges: priceRanges,
      use_scheduling_page: ai.use_scheduling_page === true,
      booking_url: account.booking_url ?? "",
    },
    compliance: meta.compliance,
    forwarding: meta.forwarding,
    forwardingTest: meta.forwardingTest
      ? { attempt_id: meta.forwardingTest.attempt_id, started_at: meta.forwardingTest.started_at, seen_at: meta.forwardingTest.seen_at }
      : null,
    alerts: {
      alert_phone: account.alert_phone ?? "",
      alert_email: account.alert_email ?? user.email,
      alert_phone_verified: account.alert_phone_verified,
      quiet_start: hhmm(account.quiet_start, "08:00"),
      quiet_end: hhmm(account.quiet_end, "21:00"),
    },
    number: toWizardNumber(number),
    user,
  };
}

/** Which step the wizard should open on. */
export function currentStepFor(completedStep: number): number {
  return Math.min(STEP_COUNT, Math.max(1, completedStep + 1));
}

/** Area code of the business line, used for local-number search on the sole-prop path. */
export function areaCodeOf(e164: string | null | undefined): number | null {
  const m = (e164 ?? "").match(/^\+1(\d{3})\d{7}$/);
  return m ? Number(m[1]) : null;
}
