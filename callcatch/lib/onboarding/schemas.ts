/**
 * Zod schemas for the six onboarding steps. Pure module (no server imports) so the wizard
 * validates client-side with the same rules the Server Functions enforce.
 */
import { z } from "zod";

export const TRADES = ["hvac", "plumbing", "electrical", "other"] as const;
export type Trade = (typeof TRADES)[number];

export const TONES = ["friendly", "professional", "plain"] as const;
export type Tone = (typeof TONES)[number];

export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Day = (typeof DAYS)[number];

export const OPT_IN_TYPES = ["VERBAL", "WEB_FORM"] as const;
export type OptInType = (typeof OPT_IN_TYPES)[number];

export const CARRIERS = ["verizon", "att", "tmobile", "google_voice", "ringcentral", "grasshopper", "other"] as const;
export type Carrier = (typeof CARRIERS)[number];

export const STEP_COUNT = 6;

/** E.164 normalizer for US numbers (pure copy of lib/telephony's, usable in the browser). */
export function normalizeUsPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return /^\+1\d{10}$/.test(digits) ? digits : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export function formatUsPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

const trimmed = (max: number, min = 0) =>
  z
    .string()
    .trim()
    .min(min, min > 0 ? (min === 1 ? "Required" : `At least ${min} characters`) : undefined)
    .max(max, `Keep it under ${max} characters`);

export const phoneSchema = z
  .string()
  .trim()
  .min(1, "Required")
  .transform((v, ctx) => {
    const n = normalizeUsPhone(v);
    if (!n) {
      ctx.addIssue({ code: "custom", message: "Enter a valid US phone number" });
      return z.NEVER;
    }
    return n;
  });

export const optionalPhoneSchema = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (!v) return null;
    const n = normalizeUsPhone(v);
    if (!n) {
      ctx.addIssue({ code: "custom", message: "Enter a valid US phone number" });
      return z.NEVER;
    }
    return n;
  });

/** Accepts "acme.com", "www.acme.com", "https://acme.com" → canonical https URL. */
export const websiteSchema = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (!v) return null;
    const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
    try {
      const u = new URL(withScheme);
      if (!u.hostname.includes(".")) throw new Error("no tld");
      return u.toString().replace(/\/$/, "");
    } catch {
      ctx.addIssue({ code: "custom", message: "Enter a valid website (e.g. acme-hvac.com)" });
      return z.NEVER;
    }
  });

export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24h HH:MM");

export const hoursSchema = z.record(
  z.enum(DAYS),
  z.tuple([timeSchema, timeSchema]).nullable()
);
export type Hours = z.infer<typeof hoursSchema>;

export const DEFAULT_HOURS: Hours = {
  mon: ["08:00", "17:00"],
  tue: ["08:00", "17:00"],
  wed: ["08:00", "17:00"],
  thu: ["08:00", "17:00"],
  fri: ["08:00", "17:00"],
  sat: null,
  sun: null,
};

export const serviceAreaSchema = z
  .object({
    center: trimmed(120).optional().default(""),
    radius_miles: z.number().int().min(1).max(300).nullable().optional(),
    zips: z
      .array(z.string().trim().regex(/^\d{5}$/, "ZIPs must be 5 digits"))
      .max(200)
      .default([]),
  })
  .refine((a) => (a.radius_miles && a.center) || a.zips.length > 0, {
    message: "Give a radius around your city or at least one ZIP code",
    path: ["zips"],
  });
export type ServiceArea = z.infer<typeof serviceAreaSchema>;

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const businessSchema = z
  .object({
    legal_name: trimmed(120, 2),
    dba: trimmed(120),
    website: websiteSchema,
    address_line1: trimmed(120, 3),
    city: trimmed(80, 2),
    state: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "2-letter state"),
    zip: z.string().trim().regex(/^\d{5}(-\d{4})?$/, "5-digit ZIP"),
    is_sole_prop: z.boolean(),
    ein: z
      .string()
      .trim()
      .transform((v) => v.replace(/\D/g, ""))
      .refine((v) => v === "" || v.length === 9, "EIN is 9 digits"),
    business_phone: phoneSchema,
    timezone: z.string().refine(isValidTimeZone, "Pick a timezone"),
    trade: z.enum(TRADES),
    service_area: serviceAreaSchema,
    hours: hoursSchema,
    emergency_service: z.boolean(),
    on_call_phone: optionalPhoneSchema,
  })
  .superRefine((b, ctx) => {
    if (!b.is_sole_prop && !b.ein) {
      ctx.addIssue({ code: "custom", path: ["ein"], message: "EIN is required for toll-free verification. No EIN? Tick “I'm a sole proprietor”." });
    }
    if (b.website === null && !b.is_sole_prop) {
      ctx.addIssue({ code: "custom", path: ["website"], message: "Carriers require a website (a Facebook or Google Business page URL is fine)." });
    }
  });
export type BusinessInput = z.input<typeof businessSchema>;
export type BusinessData = z.output<typeof businessSchema>;

export const numberStepSchema = z.object({
  tone: z.enum(TONES),
});
export type NumberStepData = z.output<typeof numberStepSchema>;

export const priceRangeSchema = z.object({
  label: trimmed(60, 1),
  value: trimmed(60, 1),
});

export const aiProfileSchema = z.object({
  services: z.array(trimmed(80, 1)).min(1, "Pick at least one service").max(40),
  never_say: z.array(trimmed(160, 1)).max(20),
  price_ranges: z.array(priceRangeSchema).max(20),
  use_scheduling_page: z.boolean(),
  booking_url: websiteSchema,
});
export type AiProfileInput = z.input<typeof aiProfileSchema>;
export type AiProfileData = z.output<typeof aiProfileSchema>;

export const complianceSchema = z.object({
  contact_first_name: trimmed(60, 1),
  contact_last_name: trimmed(60, 1),
  use_case_summary: trimmed(1000, 40),
  sample_messages: z.tuple([trimmed(320, 20), trimmed(320, 20), trimmed(320, 20)]),
  opt_in_type: z.enum(OPT_IN_TYPES),
  opt_in_description: trimmed(1000, 40),
  monthly_volume: z.number().int().min(10).max(1_000_000),
});
export type ComplianceInput = z.input<typeof complianceSchema>;
export type ComplianceData = z.output<typeof complianceSchema>;

export const forwardingSchema = z.object({
  carrier: z.enum(CARRIERS),
  /** The owner attests forwarding is on even if the automated test didn't land (e.g. VoIP portals). */
  attested: z.boolean(),
});
export type ForwardingData = z.output<typeof forwardingSchema>;

/**
 * Texting-window bounds. The Terms of Service (§4) and SMS Terms (§5) promise consumers that
 * automated texts only go out between 8:00 AM and 9:00 PM local time and that owners cannot
 * disable that; owners may narrow the window but never widen it. Must match QUIET_HOURS_LABEL in
 * components/marketing/site.ts.
 */
export const QUIET_FLOOR_MIN = 8 * 60; // 08:00
export const QUIET_CEIL_MIN = 21 * 60; // 21:00
export const QUIET_FLOOR_LABEL = "8:00 AM";
export const QUIET_CEIL_LABEL = "9:00 PM";

export function timeToMinutes(t: string): number {
  return Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
}

/** Shared refinement for quiet_start / quiet_end (onboarding step 6 + Settings → Hours). */
export function refineQuietWindow(a: { quiet_start: string; quiet_end: string }, ctx: z.RefinementCtx): void {
  const s = timeToMinutes(a.quiet_start);
  const e = timeToMinutes(a.quiet_end);
  if (s < QUIET_FLOOR_MIN) ctx.addIssue({ code: "custom", path: ["quiet_start"], message: `Texting can't start before ${QUIET_FLOOR_LABEL} (SMS terms)` });
  if (e > QUIET_CEIL_MIN) ctx.addIssue({ code: "custom", path: ["quiet_end"], message: `Texting can't run past ${QUIET_CEIL_LABEL} (SMS terms)` });
  if (e <= s) ctx.addIssue({ code: "custom", path: ["quiet_end"], message: "Stop time must be after start time" });
}

export const alertsSchema = z
  .object({
    alert_phone: phoneSchema,
    alert_email: z.string().trim().toLowerCase().email("Enter a valid email"),
    quiet_start: timeSchema,
    quiet_end: timeSchema,
  })
  .superRefine(refineQuietWindow);
export type AlertsData = z.output<typeof alertsSchema>;

export const verifyAlertPhoneBody = z.discriminatedUnion("action", [
  z.object({ action: z.literal("send"), phone: phoneSchema }),
  z.object({ action: z.literal("check"), code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code") }),
]);

export const testForwardingQuery = z.object({ attemptId: z.string().uuid() });

/** Flattens zod issues to `{ "field.path": "message" }` for form display. */
export function issuesToFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "_";
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
