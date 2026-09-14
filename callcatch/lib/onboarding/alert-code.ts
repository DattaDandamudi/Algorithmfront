/**
 * 6-digit alert-phone verification codes. The code is never stored: only an HMAC (keyed with
 * INTERNAL_API_SECRET, falling back to the Supabase service key) plus expiry live in
 * `accounts.ai_profile.alert_code`, so a member reading their own row can't recover the code.
 */
import { createHmac, randomInt } from "node:crypto";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/utils";
import type { AlertCodeMeta } from "./state";

export const ALERT_CODE_TTL_MS = 10 * 60 * 1000;
/** Per-account burst limit (BUILD_CONTRACTS: 5 sends / 10 min). */
export const ALERT_CODE_MAX_SENDS = 5;
export const ALERT_CODE_SEND_WINDOW_MS = 10 * 60 * 1000;
/** Absolute per-account cap: no account can make our notification number send more codes than this per day. */
export const ALERT_CODE_MAX_SENDS_PER_DAY = 10;
/** Per-destination cap across ALL accounts, so one number cannot be spammed from many free signups. */
export const ALERT_CODE_MAX_SENDS_PER_TARGET_HOUR = 3;
/** Global cap per instance of the product (a runaway abuser trips this before carriers do). */
export const ALERT_CODE_MAX_SENDS_GLOBAL_HOUR = 300;
export const ALERT_CODE_MAX_ATTEMPTS = 6;
export const DAY_MS = 24 * 60 * 60 * 1000;
export const HOUR_MS = 60 * 60 * 1000;

function secret(): string {
  return env.get("INTERNAL_API_SECRET") ?? env.required("SUPABASE_SERVICE_ROLE_KEY");
}

export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashCode(accountId: string, phone: string, code: string): string {
  return createHmac("sha256", secret()).update(`${accountId}|${phone}|${code}`).digest("hex");
}

export type CodeCheck = { ok: true } | { ok: false; reason: "no_code" | "expired" | "too_many_attempts" | "mismatch" };

export function checkCode(accountId: string, meta: AlertCodeMeta | null, code: string, now = Date.now()): CodeCheck {
  if (!meta) return { ok: false, reason: "no_code" };
  if (Date.parse(meta.expires_at) < now) return { ok: false, reason: "expired" };
  if (meta.attempts >= ALERT_CODE_MAX_ATTEMPTS) return { ok: false, reason: "too_many_attempts" };
  return safeEqual(hashCode(accountId, meta.phone, code), meta.hash) ? { ok: true } : { ok: false, reason: "mismatch" };
}

export function codeSmsBody(code: string): string {
  return `${code} is your CallCatch verification code. It expires in 10 minutes. This is the number your missed-call alerts will come from.`;
}
