"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAccount } from "@/lib/auth/session";
import { readAttribution } from "@/lib/meta/attribution";
import { AlreadySubscribedError, checkoutInputSchema, createCheckoutSession, normalizeReferralCode, TrialNotEligibleError } from "@/lib/billing/checkout";
import { changePlan, createPortalSession, pauseSubscription, resumeSubscription, pauseMonthsSchema, type PortalFlow } from "@/lib/billing/manage";
import { REFERRAL_COOKIE } from "@/lib/billing/referrals";

export type ActionState = { error?: string; ok?: string } | null;

function message(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong. Please try again.";
}

/** Checkout form → Stripe. Redirects to the hosted Checkout page on success. */
export async function startCheckoutAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, account } = await requireAccount();
  const parsed = checkoutInputSchema.safeParse({
    plan: formData.get("plan"),
    interval: formData.get("interval"),
    path: formData.get("path"),
    setupFee: formData.get("setupFee") === "on" || formData.get("setupFee") === "1",
    ref: (formData.get("ref") as string | null) || undefined,
  });
  if (!parsed.success) return { error: "Please choose a valid plan and billing option." };
  if (!user.email) return { error: "Your account has no email address; add one before checking out." };

  const store = await cookies();
  const attribution = readAttribution(store);
  const ref = parsed.data.ref ?? normalizeReferralCode(store.get(REFERRAL_COOKIE)?.value);

  let redirectTo: string | null = null;
  try {
    const session = await createCheckoutSession({
      accountId: account.id,
      userEmail: user.email,
      plan: parsed.data.plan,
      interval: parsed.data.interval,
      path: parsed.data.path,
      setupFee: parsed.data.setupFee,
      ref,
      attribution: { fbc: attribution.fbc, fbp: attribution.fbp, utm_source: attribution.utm_source, utm_medium: attribution.utm_medium, utm_campaign: attribution.utm_campaign },
      eventId: randomUUID(),
    });
    redirectTo = session.url;
  } catch (err) {
    if (err instanceof AlreadySubscribedError) {
      // Plan changes / restarts happen on /billing (changePlan, portal); never a second subscription.
      redirectTo = `/billing?already_subscribed=1&plan=${parsed.data.plan}`;
    } else if (err instanceof TrialNotEligibleError) {
      redirectTo = `/billing/checkout?plan=${parsed.data.plan}&interval=${parsed.data.interval}&path=paynow&trial_used=1`;
    } else {
      console.error("[billing/checkout] failed", err);
      return { error: message(err) };
    }
  }
  // redirect() throws; keep it outside the try/catch.
  redirect(redirectTo);
}

const portalFlowSchema = z.enum(["home", "cancel", "payment_method", "update_plan"]).default("home");

/** Opens the Stripe Customer Portal (optionally deep-linked to cancel / card update). */
export async function openPortalAction(formData: FormData): Promise<void> {
  const { account } = await requireAccount();
  const flow: PortalFlow = portalFlowSchema.parse(formData.get("flow") ?? "home");
  const url = await createPortalSession(account.id, flow);
  redirect(url);
}

export async function pauseAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { account } = await requireAccount();
  const parsed = pauseMonthsSchema.safeParse(formData.get("months"));
  if (!parsed.success) return { error: "Choose 1 or 2 months." };
  try {
    const { resumesAt } = await pauseSubscription(account.id, parsed.data);
    revalidatePath("/billing");
    return { ok: `Paused. Billing and text-backs resume on ${new Date(resumesAt).toLocaleDateString("en-US", { month: "long", day: "numeric" })}.` };
  } catch (err) {
    console.error("[billing/pause] failed", err);
    return { error: message(err) };
  }
}

export async function resumeAction(): Promise<ActionState> {
  const { account } = await requireAccount();
  try {
    await resumeSubscription(account.id);
    revalidatePath("/billing");
    return { ok: "Welcome back — billing and text-backs are on again." };
  } catch (err) {
    console.error("[billing/resume] failed", err);
    return { error: message(err) };
  }
}

const planSchema = z.enum(["starter", "pro"]);

/** Upgrade/downgrade in place; falls back to Checkout when there is no subscription yet. */
export async function changePlanAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { account } = await requireAccount();
  const parsed = planSchema.safeParse(formData.get("plan"));
  if (!parsed.success) return { error: "Unknown plan." };
  let result: Awaited<ReturnType<typeof changePlan>>;
  try {
    result = await changePlan(account.id, parsed.data);
  } catch (err) {
    console.error("[billing/changePlan] failed", err);
    return { error: message(err) };
  }
  if (!result) redirect(`/billing/checkout?plan=${parsed.data}&interval=month&path=paynow`);
  revalidatePath("/billing");
  return { ok: `You're on ${parsed.data === "pro" ? "Pro" : "Starter"} now. ${parsed.data === "pro" ? "Web-form leads, booking hand-off and after-hours routing are unlocked." : "Pro features are turned off."}` };
}
