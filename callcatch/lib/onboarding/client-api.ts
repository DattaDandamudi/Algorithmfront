/** Browser-side fetch wrappers for the onboarding Route Handlers (typed, throw on failure). */
import type { WizardNumber } from "./state";

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }, cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; code?: string } & T;
  if (!res.ok || body.ok === false) throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status, body.code);
  return body;
}

export function provisionNumber(): Promise<{ ok: true; created: boolean; number: WizardNumber }> {
  return call("/api/onboarding/provision-number", { method: "POST" });
}

export function startForwardingTest(): Promise<{ ok: true; attemptId: string; startedAt: string; callSid: string | null }> {
  return call("/api/onboarding/test-forwarding", { method: "POST" });
}

export function pollForwardingTest(attemptId: string): Promise<{ ok: true; seen: boolean; seenAt?: string; outboundStatus: string | null; forwardedFrom?: string | null }> {
  return call(`/api/onboarding/test-forwarding?attemptId=${encodeURIComponent(attemptId)}`, { method: "GET" });
}

export function sendAlertCode(phone: string): Promise<{ ok: true; sent: true; expiresAt: string; phone: string }> {
  return call("/api/onboarding/verify-alert-phone", { method: "POST", body: JSON.stringify({ action: "send", phone }) });
}

export function checkAlertCode(code: string): Promise<{ ok: true; verified: true; phone: string }> {
  return call("/api/onboarding/verify-alert-phone", { method: "POST", body: JSON.stringify({ action: "check", code }) });
}

export function submitVerification(): Promise<{ ok: true; already: boolean; path: "tollfree" | "sole_prop"; number: WizardNumber | null }> {
  return call("/api/onboarding/submit-verification", { method: "POST" });
}

/** True when a Route Handler refused because the account has no entitled subscription (402 billing_required). */
export function isBillingRequired(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 402 || err.code === "billing_required");
}

export const BILLING_REQUIRED_MESSAGE = "Complete checkout first — open Billing → Checkout, then come back to this step.";
