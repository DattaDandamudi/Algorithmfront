"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { getAppContext, type AppContext } from "@/components/dashboard/context";
import { createAdminSupabase } from "@/lib/db/client";
import type { Json, TablesInsert, TablesUpdate } from "@/lib/db/types";
import { track } from "@/lib/events";
import { newInboundAddress, newWebhookSecret } from "@/lib/onboarding/lead-sources";
import { refineQuietWindow } from "@/lib/onboarding/schemas";
import { can } from "@/lib/plans";
import { normalizePhone } from "@/lib/telephony/client";

export type SettingsState = { ok?: string; error?: string; fieldErrors?: Record<string, string> } | null;

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
const phoneField = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (!v) return null;
    const n = normalizePhone(v);
    if (!n) {
      ctx.addIssue({ code: "custom", message: "Enter a valid US phone number" });
      return z.NEVER;
    }
    return n;
  });
const websiteField = z
  .string()
  .trim()
  .max(200)
  .transform((v, ctx) => {
    if (!v) return null;
    const candidate = /^https?:\/\//i.test(v) ? v : `https://${v}`;
    try {
      const u = new URL(candidate);
      if (!u.hostname.includes(".")) throw new Error("no tld");
      return u.toString().replace(/\/$/, "");
    } catch {
      ctx.addIssue({ code: "custom", message: "Enter a valid website (e.g. acme-hvac.com)" });
      return z.NEVER;
    }
  });

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const businessSchema = z.object({
  legal_name: z.string().trim().min(2, "Legal name is required").max(120),
  dba: z.string().trim().max(120).transform((v) => v || null),
  website: websiteField,
  address_line1: z.string().trim().max(160).transform((v) => v || null),
  city: z.string().trim().max(80).transform((v) => v || null),
  state: z
    .string()
    .trim()
    .toUpperCase()
    .transform((v) => v || null)
    .refine((v) => v === null || /^[A-Z]{2}$/.test(v), "Use the 2-letter state code"),
  zip: z
    .string()
    .trim()
    .transform((v) => v || null)
    .refine((v) => v === null || /^\d{5}(-\d{4})?$/.test(v), "ZIP must be 5 digits"),
  business_phone: phoneField,
  timezone: z.string().trim().refine(isValidTimeZone, "Pick a valid timezone"),
  trade: z.enum(["hvac", "plumbing", "electrical", "other"]),
  avg_ticket_usd: z.coerce.number().min(1, "Average ticket must be at least $1").max(100000),
  emergency_service: z.boolean(),
  on_call_phone: phoneField,
  service_center: z.string().trim().max(120).transform((v) => v || null),
  service_radius: z
    .string()
    .trim()
    .transform((v) => (v ? Number(v) : null))
    .refine((v) => v === null || (Number.isInteger(v) && v >= 1 && v <= 300), "Radius must be 1–300 miles"),
  service_zips: z
    .string()
    .transform((v) => v.split(/[\s,;]+/).map((z) => z.trim()).filter(Boolean))
    .refine((zips) => zips.every((z) => /^\d{5}$/.test(z)), "ZIPs must be 5 digits")
    .refine((zips) => zips.length <= 200, "At most 200 ZIP codes"),
});

const aiProfileSchema = z.object({
  tone: z.enum(["friendly", "professional", "plain"]),
  services: z.string().transform(lines).refine((a) => a.length <= 60, "Keep it under 60 services"),
  never_say: z.string().transform(lines).refine((a) => a.length <= 40, "Keep it under 40 rules"),
  brands: z.string().transform(lines).refine((a) => a.length <= 40, "Keep it under 40 brands"),
  price_ranges: z
    .string()
    .transform(lines)
    .transform((ls, ctx) => {
      const out: Record<string, string> = {};
      for (const l of ls) {
        const idx = l.indexOf(":");
        if (idx <= 0) {
          ctx.addIssue({ code: "custom", message: `Use “Service: starting at $X” on each line (problem: “${l.slice(0, 40)}”)` });
          return z.NEVER;
        }
        const k = l.slice(0, idx).trim().slice(0, 80);
        const v = l.slice(idx + 1).trim().slice(0, 80);
        if (k && v) out[k] = v;
      }
      return out;
    }),
});

// The texting window can be narrowed but never widened past the 8:00 AM – 9:00 PM the SMS Terms promise
// (bounds shared with onboarding step 6 via refineQuietWindow).
const hoursSchema = z
  .object({
    quiet_start: z.string().regex(timeRe, "Use HH:MM"),
    quiet_end: z.string().regex(timeRe, "Use HH:MM"),
    hours: z.record(z.enum(DAYS), z.tuple([z.string().regex(timeRe), z.string().regex(timeRe)]).nullable()),
  })
  .superRefine(refineQuietWindow);

const alertsSchema = z.object({
  alert_email: z.string().trim().toLowerCase().email("Enter a valid email"),
  alert_phone: phoneField.refine((v) => v !== null, "Alert phone is required"),
  weekly_report: z.boolean(),
});

const bookingSchema = z
  .object({
    mode: z.enum(["none", "external", "callcatch"]),
    booking_url: websiteField,
  })
  .refine((b) => b.mode !== "external" || b.booking_url, { message: "Paste your Jobber, Housecall Pro or Calendly link", path: ["booking_url"] });

function lines(v: string): string[] {
  return v
    .split(/\r?\n/)
    .map((s) => s.trim().slice(0, 160))
    .filter(Boolean);
}

function fieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of err.issues) {
    const key = String(i.path[0] ?? "form");
    if (!out[key]) out[key] = i.message;
  }
  return out;
}

function fail(err: unknown): SettingsState {
  // redirect() / notFound() thrown inside the try (e.g. by getAppContext) must reach Next, not the form.
  unstable_rethrow(err);
  return { error: err instanceof Error ? err.message : "Something went wrong. Please try again." };
}

/**
 * Every settings write runs as the real owner/staff user (never through an admin "view as").
 * `getAppContext()` proves membership through RLS (the account row is read with the user's own
 * client); the writes below then go through the service-role client scoped to that account id,
 * because `accounts` and `lead_sources` are not member-writable (see supabase/README.md: a
 * member-writable `accounts` would let anyone PATCH plan / status / alert_phone_verified).
 */
async function ownerContext(): Promise<AppContext> {
  const ctx = await getAppContext();
  if (ctx.impersonating) throw new Error("Read-only while viewing as an admin.");
  return ctx;
}

async function updateAccount(ctx: AppContext, patch: TablesUpdate<"accounts">): Promise<void> {
  const { error } = await createAdminSupabase().from("accounts").update(patch).eq("id", ctx.account.id);
  if (error) throw new Error(error.message);
}

function asObject(j: Json | null | undefined): Record<string, Json | undefined> {
  return j && typeof j === "object" && !Array.isArray(j) ? (j as Record<string, Json | undefined>) : {};
}

/** Merges keys into `accounts.ai_profile` (keeps onboarding metadata written by the wizard). */
async function patchAiProfile(ctx: AppContext, patch: Record<string, Json>): Promise<void> {
  const { data } = await createAdminSupabase().from("accounts").select("ai_profile").eq("id", ctx.account.id).maybeSingle();
  const merged = { ...asObject(data?.ai_profile), ...patch } as Json;
  await updateAccount(ctx, { ai_profile: merged });
}

function done(ctx: AppContext, tab: string, what: string): SettingsState {
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  void track("settings_saved", { tab }, { accountId: ctx.account.id, userId: ctx.user.id });
  return { ok: what };
}

export async function saveBusinessAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  try {
    const ctx = await ownerContext();
    const parsed = businessSchema.safeParse({
      legal_name: formData.get("legal_name") ?? "",
      dba: formData.get("dba") ?? "",
      website: formData.get("website") ?? "",
      address_line1: formData.get("address_line1") ?? "",
      city: formData.get("city") ?? "",
      state: formData.get("state") ?? "",
      zip: formData.get("zip") ?? "",
      business_phone: formData.get("business_phone") ?? "",
      timezone: formData.get("timezone") ?? "",
      trade: formData.get("trade"),
      avg_ticket_usd: formData.get("avg_ticket_usd") ?? "",
      emergency_service: formData.get("emergency_service") === "on",
      on_call_phone: formData.get("on_call_phone") ?? "",
      service_center: formData.get("service_center") ?? "",
      service_radius: formData.get("service_radius") ?? "",
      service_zips: formData.get("service_zips") ?? "",
    });
    if (!parsed.success) return { error: "Fix the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
    const b = parsed.data;
    await updateAccount(ctx, {
      legal_name: b.legal_name,
      dba: b.dba,
      website: b.website,
      address_line1: b.address_line1,
      city: b.city,
      state: b.state,
      zip: b.zip,
      business_phone: b.business_phone,
      timezone: b.timezone,
      trade: b.trade,
      avg_ticket_usd: b.avg_ticket_usd,
      emergency_service: b.emergency_service,
      on_call_phone: can(ctx.account, "after_hours_routing") ? b.on_call_phone : null,
      service_area: { center: b.service_center, radius_miles: b.service_radius, zips: b.service_zips } as Json,
    });
    return done(ctx, "business", "Business details saved.");
  } catch (err) {
    return fail(err);
  }
}

export async function saveAiProfileAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  try {
    const ctx = await ownerContext();
    const parsed = aiProfileSchema.safeParse({
      tone: formData.get("tone"),
      services: formData.get("services") ?? "",
      never_say: formData.get("never_say") ?? "",
      brands: formData.get("brands") ?? "",
      price_ranges: formData.get("price_ranges") ?? "",
    });
    if (!parsed.success) return { error: "Fix the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
    const p = parsed.data;
    await updateAccount(ctx, { tone: p.tone });
    await patchAiProfile(ctx, { services: p.services, never_say: p.never_say, brands: p.brands, price_ranges: p.price_ranges });
    return done(ctx, "ai", "AI profile saved. New conversations use it right away.");
  } catch (err) {
    return fail(err);
  }
}

export async function saveHoursAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  try {
    const ctx = await ownerContext();
    const hours: Record<string, [string, string] | null> = {};
    for (const d of DAYS) {
      hours[d] = formData.get(`${d}_open`) === "on" ? [String(formData.get(`${d}_start`) ?? ""), String(formData.get(`${d}_end`) ?? "")] : null;
    }
    const parsed = hoursSchema.safeParse({ quiet_start: formData.get("quiet_start") ?? "", quiet_end: formData.get("quiet_end") ?? "", hours });
    if (!parsed.success) return { error: "Check the times — use the pickers and make sure every open day has both an open and a close time.", fieldErrors: fieldErrors(parsed.error) };
    await updateAccount(ctx, { hours: parsed.data.hours as Json, quiet_start: `${parsed.data.quiet_start}:00`, quiet_end: `${parsed.data.quiet_end}:00` });
    return done(ctx, "hours", "Hours saved.");
  } catch (err) {
    return fail(err);
  }
}

export async function saveAlertsAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  try {
    const ctx = await ownerContext();
    const parsed = alertsSchema.safeParse({
      alert_email: formData.get("alert_email") ?? "",
      alert_phone: formData.get("alert_phone") ?? "",
      weekly_report: formData.get("weekly_report") === "on",
    });
    if (!parsed.success) return { error: "Fix the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
    const a = parsed.data;
    const phoneChanged = a.alert_phone !== ctx.account.alert_phone;
    await updateAccount(ctx, {
      alert_email: a.alert_email,
      alert_phone: a.alert_phone,
      // A new alert number must be re-verified by code (onboarding step 6) before texts go there.
      ...(phoneChanged ? { alert_phone_verified: false } : {}),
    });
    await patchAiProfile(ctx, { weekly_report_opt_out: !a.weekly_report });
    return done(ctx, "alerts", phoneChanged ? "Saved. Verify the new alert number from Onboarding → Alerts so SMS alerts reach it." : "Alert settings saved.");
  } catch (err) {
    return fail(err);
  }
}

export async function saveBookingAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  try {
    const ctx = await ownerContext();
    if (!can(ctx.account, "booking_handoff")) return { error: "Booking hand-off is a Pro feature. Upgrade under Billing." };
    const parsed = bookingSchema.safeParse({ mode: formData.get("mode"), booking_url: formData.get("booking_url") ?? "" });
    if (!parsed.success) return { error: "Fix the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
    const b = parsed.data;
    await updateAccount(ctx, { booking_url: b.mode === "external" ? b.booking_url : null });
    await patchAiProfile(ctx, { use_scheduling_page: b.mode === "callcatch" });
    return done(ctx, "booking", "Booking settings saved.");
  } catch (err) {
    return fail(err);
  }
}

// ---------------------------------------------------------------------------
// Lead sources
// ---------------------------------------------------------------------------

const sourceTypeSchema = z.enum(["resend_inbox", "webhook", "zapier"]);

export async function createLeadSourceAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  try {
    const ctx = await ownerContext();
    if (!can(ctx.account, "web_form_leads")) return { error: "Web-form and Meta lead intake is a Pro feature. Upgrade under Billing." };
    const type = sourceTypeSchema.safeParse(formData.get("type"));
    if (!type.success) return { error: "Unknown lead source type." };
    const admin = createAdminSupabase();
    // The inbound address is a fresh random token: the referral code is public (referral links,
    // weekly emails) and the inbound-email route routes solely on this address.
    const insert: TablesInsert<"lead_sources"> = {
      account_id: ctx.account.id,
      type: type.data,
      enabled: true,
      inbound_email: type.data === "resend_inbox" ? newInboundAddress() : null,
      webhook_secret: type.data === "resend_inbox" ? null : newWebhookSecret(),
    };
    if (type.data === "resend_inbox") {
      const { data: existing } = await admin.from("lead_sources").select("id").eq("account_id", ctx.account.id).eq("type", "resend_inbox").limit(1).maybeSingle();
      if (existing) return { error: "You already have an inbound email address." };
    }
    const { error } = await admin.from("lead_sources").insert(insert);
    if (error) throw new Error(error.message);
    void track("lead_source_created", { type: type.data }, { accountId: ctx.account.id, userId: ctx.user.id });
    revalidatePath("/settings");
    return { ok: type.data === "resend_inbox" ? "Inbound email address created — copy it from the list above." : "Webhook created — copy the secret into Zapier or your form tool." };
  } catch (err) {
    return fail(err);
  }
}

export async function regenerateSecretAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  try {
    const ctx = await ownerContext();
    const id = z.string().uuid().safeParse(formData.get("id"));
    if (!id.success) return { error: "Invalid lead source." };
    const admin = createAdminSupabase();
    const { data } = await admin.from("lead_sources").select("id, type").eq("id", id.data).eq("account_id", ctx.account.id).maybeSingle();
    if (!data || data.type === "resend_inbox") return { error: "Lead source not found." };
    const { error } = await admin.from("lead_sources").update({ webhook_secret: newWebhookSecret() }).eq("id", id.data).eq("account_id", ctx.account.id);
    if (error) throw new Error(error.message);
    revalidatePath("/settings");
    return { ok: "New secret generated. The old one stops working immediately — update Zapier." };
  } catch (err) {
    return fail(err);
  }
}

export async function toggleLeadSourceAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  try {
    const ctx = await ownerContext();
    const id = z.string().uuid().safeParse(formData.get("id"));
    const enabled = formData.get("enabled") === "true";
    if (!id.success) return { error: "Invalid lead source." };
    const { error } = await createAdminSupabase().from("lead_sources").update({ enabled }).eq("id", id.data).eq("account_id", ctx.account.id);
    if (error) throw new Error(error.message);
    revalidatePath("/settings");
    return { ok: enabled ? "Lead source enabled." : "Lead source paused." };
  } catch (err) {
    return fail(err);
  }
}
