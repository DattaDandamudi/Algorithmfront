import { createAdminSupabase } from "@/lib/db/client";
import type { Json } from "@/lib/db/types";

export type EventName =
  | "signup"
  | "checkout_started"
  | "checkout_completed"
  | "onboarding_completed"
  | "number_provisioned"
  | "forwarding_tested"
  | "verification_submitted"
  | "verified"
  | "first_textback"
  | "first_lead"
  | "first_booked"
  | "trial_started"
  | "subscription_active"
  | "subscription_canceled"
  | "referral_rewarded"
  | (string & {});

/** Product analytics sink (events table). Never throws — analytics must not break requests. */
export async function track(
  name: EventName,
  props: Record<string, unknown> = {},
  ids: { accountId?: string | null; userId?: string | null } = {}
): Promise<void> {
  try {
    const db = createAdminSupabase();
    await db.from("events").insert({
      account_id: ids.accountId ?? null,
      user_id: ids.userId ?? null,
      name,
      props: props as Json,
      occurred_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[events] track failed", name, err);
  }
}
