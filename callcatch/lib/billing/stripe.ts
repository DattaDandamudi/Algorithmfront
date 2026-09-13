// Server-only: holds the Stripe secret key. Never import from Client Components.
import Stripe from "stripe";
import { env } from "@/lib/env";

let singleton: Stripe | null = null;

/**
 * Stripe client singleton (lazy so builds succeed without STRIPE_SECRET_KEY).
 *
 * The API version is pinned to the SDK's own default (`Stripe.API_VERSION`,
 * `2026-08-26.dahlia` for stripe@22.6.2) so the request/response shapes match
 * the installed TypeScript types exactly. Bump the SDK and the pin moves with it.
 */
export function stripe(): Stripe {
  if (singleton) return singleton;
  singleton = new Stripe(env.required("STRIPE_SECRET_KEY"), {
    apiVersion: Stripe.API_VERSION,
    typescript: true,
    maxNetworkRetries: 2,
    appInfo: { name: "CallCatch", url: env.appUrl() },
  });
  return singleton;
}

/** Stripe's Unix-seconds helpers. */
export function toUnix(d: Date): number {
  return Math.floor(d.getTime() / 1000);
}

export function fromUnix(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined) return null;
  return new Date(seconds * 1000).toISOString();
}

/** Returns the id whether Stripe gave us an expanded object or a bare id string. */
export function idOf(ref: string | { id: string } | null | undefined): string | null {
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id;
}

export type { Stripe };
