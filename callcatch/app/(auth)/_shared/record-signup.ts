// Server-only (uses next/headers + admin client); never import from Client Components.
import { cookies } from "next/headers";
import { getAccountForUser } from "@/lib/auth/session";
import { track } from "@/lib/events";
import { readAttribution } from "@/lib/meta/attribution";
import type { PlanParams } from "./next-path";

/** Tracks `signup` with first-touch attribution (password signup action + OAuth/confirm callback). */
export async function recordSignup(userId: string | null, email: string | null, plan: PlanParams, method: "password" | "google"): Promise<void> {
  if (!userId) return;
  const store = await cookies();
  const attribution = readAttribution(store);
  const account = await getAccountForUser(userId).catch(() => null);
  await track(
    "signup",
    { method, email, plan: plan.plan ?? null, interval: plan.interval ?? null, path: plan.path ?? null, ref: plan.ref ?? null, ...attribution },
    { userId, accountId: account?.id ?? null }
  );
}
