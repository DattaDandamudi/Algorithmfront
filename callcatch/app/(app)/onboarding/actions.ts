"use server";

/**
 * Onboarding Server Functions — one autosave per wizard step plus Finish. Every action:
 *  1. requires a signed-in member of an account (service-role writes only after that check),
 *  2. re-validates the payload with the shared zod schema,
 *  3. updates `accounts` and bumps `ai_profile.onboarding_step`.
 */
import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { z } from "zod";
import type { AccountRow, Json, TablesUpdate } from "@/lib/db/types";
import type { Db } from "@/lib/db/client";
import { getBillingGate } from "@/lib/billing/status";
import { env } from "@/lib/env";
import { track } from "@/lib/events";
import { readAttribution } from "@/lib/meta/attribution";
import { sendCapiEvent } from "@/lib/meta/capi";
import { loadCustomerNumber, patchAiProfile, requireMemberAccount, type MemberContext } from "@/lib/onboarding/account";
import { ensureLeadSources } from "@/lib/onboarding/lead-sources";
import {
  aiProfileSchema,
  alertsSchema,
  businessSchema,
  complianceSchema,
  forwardingSchema,
  issuesToFieldErrors,
  numberStepSchema,
  type AiProfileInput,
  type BusinessInput,
  type ComplianceInput,
} from "@/lib/onboarding/schemas";
import { parseOnboardingMeta, toWizardNumber, type WizardNumber } from "@/lib/onboarding/state";
import { submitVerification } from "@/lib/onboarding/submit-verification";

export type StepResult = { ok: true; completedStep: number; number?: WizardNumber | null } | { ok: false; error?: string; fieldErrors?: Record<string, string> };

export type FinishResult = { ok: false; error: string; code: "unauthorized" | "incomplete" | "no_number" | "alert_phone" | "no_subscription" };

async function guard(): Promise<{ ok: true; ctx: MemberContext } | { ok: false; result: StepResult }> {
  const auth = await requireMemberAccount();
  if (!auth.ok) return { ok: false, result: { ok: false, error: auth.error } };
  if (auth.ctx.account.status === "cancelled") return { ok: false, result: { ok: false, error: "This account is cancelled." } };
  return auth;
}

function validate<S extends z.ZodTypeAny>(schema: S, input: unknown): { ok: true; data: z.output<S> } | { ok: false; result: StepResult } {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, result: { ok: false, fieldErrors: issuesToFieldErrors(parsed.error), error: "Fix the highlighted fields." } };
  return { ok: true, data: parsed.data };
}

async function bumpStep(db: Db, account: AccountRow, step: number): Promise<number> {
  const current = parseOnboardingMeta(account.ai_profile).completedStep;
  const next = Math.max(current, step);
  if (next !== current) await patchAiProfile(db, account.id, { onboarding_step: next });
  return next;
}

async function updateAccount(db: Db, accountId: string, patch: TablesUpdate<"accounts">): Promise<void> {
  const { error } = await db.from("accounts").update(patch).eq("id", accountId);
  if (error) throw new Error(error.message);
}

function failed(err: unknown): StepResult {
  const message = err instanceof Error ? err.message : "Something went wrong";
  console.error("[onboarding/actions]", message);
  return { ok: false, error: message };
}

export async function saveBusiness(input: BusinessInput): Promise<StepResult> {
  const g = await guard();
  if (!g.ok) return g.result;
  const v = validate(businessSchema, input);
  if (!v.ok) return v.result;
  const { db, account, user } = g.ctx;
  const b = v.data;
  try {
    await updateAccount(db, account.id, {
      legal_name: b.legal_name,
      dba: b.dba || null,
      website: b.website,
      address_line1: b.address_line1,
      city: b.city,
      state: b.state,
      zip: b.zip,
      ein: b.is_sole_prop ? null : b.ein,
      is_sole_prop: b.is_sole_prop,
      business_phone: b.business_phone,
      timezone: b.timezone,
      trade: b.trade,
      service_area: { center: b.service_area.center || null, radius_miles: b.service_area.radius_miles ?? null, zips: b.service_area.zips } as Json,
      hours: b.hours as Json,
      emergency_service: b.emergency_service,
      on_call_phone: account.plan === "pro" ? b.on_call_phone : null,
    });
    const completedStep = await bumpStep(db, account, 1);
    await track("onboarding_step_saved", { step: 1, sole_prop: b.is_sole_prop, trade: b.trade }, { accountId: account.id, userId: user.id });
    return { ok: true, completedStep };
  } catch (err) {
    return failed(err);
  }
}

export async function saveNumberStep(input: { tone: string }): Promise<StepResult> {
  const g = await guard();
  if (!g.ok) return g.result;
  const v = validate(numberStepSchema, input);
  if (!v.ok) return v.result;
  const { db, account, user } = g.ctx;
  try {
    const number = await loadCustomerNumber(db, account.id);
    if (!number) return { ok: false, error: "Your number hasn't been provisioned yet. Click “Get my number” first." };
    await updateAccount(db, account.id, { tone: v.data.tone });
    const completedStep = await bumpStep(db, account, 2);
    await track("onboarding_step_saved", { step: 2, tone: v.data.tone }, { accountId: account.id, userId: user.id });
    return { ok: true, completedStep, number: toWizardNumber(number) };
  } catch (err) {
    return failed(err);
  }
}

export async function saveAiProfile(input: AiProfileInput): Promise<StepResult> {
  const g = await guard();
  if (!g.ok) return g.result;
  const v = validate(aiProfileSchema, input);
  if (!v.ok) return v.result;
  const { db, account, user } = g.ctx;
  const p = v.data;
  try {
    const priceRanges: Record<string, string> = {};
    for (const { label, value } of p.price_ranges) priceRanges[label] = value;
    await patchAiProfile(db, account.id, {
      services: p.services,
      never_say: p.never_say,
      price_ranges: priceRanges,
      use_scheduling_page: p.use_scheduling_page,
    });
    await updateAccount(db, account.id, { booking_url: p.use_scheduling_page ? null : p.booking_url });
    const completedStep = await bumpStep(db, account, 3);
    await track("onboarding_step_saved", { step: 3, services: p.services.length, booking: p.use_scheduling_page ? "callcatch" : p.booking_url ? "external" : "none" }, { accountId: account.id, userId: user.id });
    return { ok: true, completedStep };
  } catch (err) {
    return failed(err);
  }
}

export async function saveCompliance(input: ComplianceInput): Promise<StepResult> {
  const g = await guard();
  if (!g.ok) return g.result;
  const v = validate(complianceSchema, input);
  if (!v.ok) return v.result;
  const { db, account, user } = g.ctx;
  try {
    await patchAiProfile(db, account.id, { compliance: v.data as Json });
    const completedStep = await bumpStep(db, account, 4);
    await track("onboarding_step_saved", { step: 4, opt_in_type: v.data.opt_in_type, monthly_volume: v.data.monthly_volume }, { accountId: account.id, userId: user.id });
    return { ok: true, completedStep };
  } catch (err) {
    return failed(err);
  }
}

export async function saveForwarding(input: { carrier: string; attested: boolean }): Promise<StepResult> {
  const g = await guard();
  if (!g.ok) return g.result;
  const v = validate(forwardingSchema, input);
  if (!v.ok) return v.result;
  const { db, account, user } = g.ctx;
  try {
    const meta = parseOnboardingMeta(account.ai_profile);
    const confirmed = Boolean(meta.forwarding.confirmed_at || meta.forwardingTest?.seen_at);
    if (!confirmed && !v.data.attested) return { ok: false, error: "Run the forwarding test, or confirm you've set up forwarding manually." };
    await patchAiProfile(db, account.id, {
      forwarding: { carrier: v.data.carrier, attested: v.data.attested, confirmed_at: meta.forwarding.confirmed_at ?? meta.forwardingTest?.seen_at ?? null } as Json,
    });
    const completedStep = await bumpStep(db, account, 5);
    await track("onboarding_step_saved", { step: 5, carrier: v.data.carrier, tested: confirmed, attested: v.data.attested }, { accountId: account.id, userId: user.id });
    return { ok: true, completedStep };
  } catch (err) {
    return failed(err);
  }
}

export async function saveAlerts(input: { alert_phone: string; alert_email: string; quiet_start: string; quiet_end: string }): Promise<StepResult> {
  const g = await guard();
  if (!g.ok) return g.result;
  const v = validate(alertsSchema, input);
  if (!v.ok) return v.result;
  const { db, account, user } = g.ctx;
  try {
    const samePhone = account.alert_phone === v.data.alert_phone;
    await updateAccount(db, account.id, {
      alert_email: v.data.alert_email,
      alert_phone: v.data.alert_phone,
      alert_phone_verified: samePhone ? account.alert_phone_verified : false,
      quiet_start: v.data.quiet_start,
      quiet_end: v.data.quiet_end,
    });
    await track("onboarding_step_saved", { step: 6 }, { accountId: account.id, userId: user.id });
    return { ok: true, completedStep: parseOnboardingMeta(account.ai_profile).completedStep };
  } catch (err) {
    return failed(err);
  }
}

/**
 * Finish: submit carrier verification, flip the account to pending_verification, fire analytics,
 * then redirect to the dashboard. Verification submission failures don't block finishing —
 * the number stays `not_submitted` and can be re-submitted from the dashboard/admin.
 *
 * Billing gate: an account only leaves `onboarding` (and only gets a carrier registration that will
 * switch on metered SMS + AI) with an entitled subscription — trialing / active / past_due. Without
 * one the wizard sends the owner to /billing/checkout instead.
 */
export async function finishOnboarding(): Promise<FinishResult> {
  const auth = await requireMemberAccount();
  if (!auth.ok) return { ok: false, error: auth.error, code: "unauthorized" };
  const { db, account, user } = auth.ctx;

  const missing: string[] = [];
  if (!account.legal_name || !account.business_phone || !account.address_line1) missing.push("business details");
  if (!account.tone) missing.push("greeting tone");
  if (!parseOnboardingMeta(account.ai_profile).compliance) missing.push("compliance block");
  if (!account.alert_email) missing.push("alert email");
  if (missing.length) return { ok: false, error: `Please complete: ${missing.join(", ")}.`, code: "incomplete" };
  if (!account.alert_phone || !account.alert_phone_verified) return { ok: false, error: "Verify your alert phone with the 6-digit code first.", code: "alert_phone" };
  const number = await loadCustomerNumber(db, account.id);
  if (!number) return { ok: false, error: "Your CallCatch number hasn't been provisioned yet (step 2).", code: "no_number" };

  const gate = await getBillingGate(account.id, db);
  if (!gate.allowed) {
    await track("onboarding_finish_blocked", { reason: gate.reason, subscription_status: gate.subscription?.status ?? null }, { accountId: account.id, userId: user.id });
    return { ok: false, error: "Set up billing before going live — complete checkout under Billing, then press Finish again.", code: "no_subscription" };
  }

  await ensureLeadSources(db, account.id);

  const submission = await submitVerification(account, user);
  if (!submission.ok) {
    console.error("[onboarding/finish] verification submission failed", { accountId: account.id, error: submission.error });
    await track("verification_submit_failed", { code: submission.code, error: submission.error }, { accountId: account.id, userId: user.id });
  }

  if (account.status === "onboarding") await updateAccount(db, account.id, { status: "pending_verification" });
  await bumpStep(db, account, 6);

  const eventId = randomUUID();
  const store = await cookies();
  const h = await headers();
  const attribution = readAttribution(store);
  await track(
    "onboarding_completed",
    { event_id: eventId, verification_submitted: submission.ok, verification_path: submission.ok ? submission.path : null, sole_prop: account.is_sole_prop, plan: account.plan },
    { accountId: account.id, userId: user.id }
  );
  await sendCapiEvent({
    eventName: "CompleteRegistration",
    eventId,
    email: user.email ?? account.alert_email,
    phone: account.alert_phone,
    fbc: attribution.fbc ?? null,
    fbp: attribution.fbp ?? null,
    clientIp: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent"),
    sourceUrl: `${env.appUrl()}/onboarding`,
    externalId: account.id,
    customData: { plan: account.plan ?? "starter", status: "pending_verification", content_name: "onboarding" },
  });

  redirect(`/dashboard?welcome=1&e=${eventId}${submission.ok ? "" : "&verification=pending_submit"}`);
}

/** Lets the wizard refresh the number card after provisioning without a full reload. */
export async function refreshNumber(): Promise<WizardNumber | null> {
  const auth = await requireMemberAccount();
  if (!auth.ok) return null;
  return toWizardNumber(await loadCustomerNumber(auth.ctx.db, auth.ctx.account.id));
}
