// Server-only: uses node:crypto and the CAPI access token. Never import from Client Components.
import { createHash } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Meta Conversions API (server-side events).
 *
 * - PII (email/phone) is SHA-256 hashed after Meta's normalization rules.
 * - `eventId` must equal the `eventID` the browser Pixel fires for the same
 *   action so Meta deduplicates the pair.
 * - No-op (with a console.warn) when META_PIXEL_ID / META_CAPI_ACCESS_TOKEN are
 *   missing. Never throws: analytics must not break signup or webhooks.
 */

export type CapiEventName = "Lead" | "StartTrial" | "Purchase" | "Subscribe" | "Schedule" | "CompleteRegistration";

export type CapiEventInput = {
  eventName: CapiEventName;
  eventId: string;
  email?: string | null;
  phone?: string | null;
  fbc?: string | null;
  fbp?: string | null;
  clientIp?: string | null;
  userAgent?: string | null;
  sourceUrl?: string | null;
  value?: number | null;
  currency?: string | null;
  customData?: Record<string, string | number | boolean | null | undefined>;
  /** Unix seconds; defaults to now. */
  eventTime?: number;
  /** Optional external id (e.g. account id) — hashed before sending. */
  externalId?: string | null;
};

export type CapiResult =
  | { ok: true; eventsReceived: number; fbtraceId?: string }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped?: false; status?: number; error: string };

const GRAPH_VERSION = "v21.0";
const TIMEOUT_MS = 6000;

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Meta rule: trim, lowercase. */
export function normalizeEmail(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null;
}

/** Meta rule: digits only, with country code, no leading zeros/plus. US 10-digit numbers get a `1`. */
export function normalizePhoneForMeta(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  digits = digits.replace(/^0+/, "");
  if (digits.length === 10) digits = `1${digits}`;
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

function hashedEmail(email?: string | null): string[] | undefined {
  if (!email) return undefined;
  const norm = normalizeEmail(email);
  return norm ? [sha256(norm)] : undefined;
}

function hashedPhone(phone?: string | null): string[] | undefined {
  if (!phone) return undefined;
  const norm = normalizePhoneForMeta(phone);
  return norm ? [sha256(norm)] : undefined;
}

function pixelId(): string | undefined {
  return env.get("META_PIXEL_ID") ?? env.get("NEXT_PUBLIC_META_PIXEL_ID");
}

type UserData = {
  em?: string[];
  ph?: string[];
  external_id?: string[];
  fbc?: string;
  fbp?: string;
  client_ip_address?: string;
  client_user_agent?: string;
};

type CapiEvent = {
  event_name: CapiEventName;
  event_time: number;
  event_id: string;
  action_source: "website";
  event_source_url?: string;
  user_data: UserData;
  custom_data?: Record<string, string | number | boolean>;
};

function stripNullish(obj: Record<string, unknown>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[k] = v;
  }
  return out;
}

/** Builds the Graph API payload (exported for tests / inspection). */
export function buildCapiEvent(input: CapiEventInput): CapiEvent {
  const userData: UserData = {
    em: hashedEmail(input.email),
    ph: hashedPhone(input.phone),
    external_id: input.externalId ? [sha256(input.externalId.trim())] : undefined,
    fbc: input.fbc ?? undefined,
    fbp: input.fbp ?? undefined,
    client_ip_address: input.clientIp ?? undefined,
    client_user_agent: input.userAgent ?? undefined,
  };
  for (const key of Object.keys(userData) as Array<keyof UserData>) {
    if (userData[key] === undefined) delete userData[key];
  }

  const custom = stripNullish({
    ...(input.customData ?? {}),
    value: input.value ?? undefined,
    currency: input.value !== undefined && input.value !== null ? (input.currency ?? "USD") : input.currency ?? undefined,
  });

  const event: CapiEvent = {
    event_name: input.eventName,
    event_time: input.eventTime ?? Math.floor(Date.now() / 1000),
    event_id: input.eventId,
    action_source: "website",
    user_data: userData,
  };
  if (input.sourceUrl) event.event_source_url = input.sourceUrl;
  if (Object.keys(custom).length > 0) event.custom_data = custom;
  return event;
}

export async function sendCapiEvent(input: CapiEventInput): Promise<CapiResult> {
  const id = pixelId();
  const token = env.get("META_CAPI_ACCESS_TOKEN");
  if (!id || !token) {
    console.warn("[meta/capi] skipped: META_PIXEL_ID or META_CAPI_ACCESS_TOKEN not set", { event: input.eventName });
    return { ok: false, skipped: true, reason: "missing_env" };
  }
  if (!input.eventId) {
    console.warn("[meta/capi] skipped: eventId is required for dedup", { event: input.eventName });
    return { ok: false, skipped: true, reason: "missing_event_id" };
  }

  const body: { data: CapiEvent[]; test_event_code?: string } = { data: [buildCapiEvent(input)] };
  const testCode = env.get("META_CAPI_TEST_EVENT_CODE");
  if (testCode) body.test_event_code = testCode;

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(id)}/events?access_token=${encodeURIComponent(token)}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as {
      events_received?: number;
      fbtrace_id?: string;
      error?: { message?: string; code?: number; fbtrace_id?: string };
    };
    if (!res.ok) {
      const error = json.error?.message ?? `HTTP ${res.status}`;
      console.error("[meta/capi] rejected", { event: input.eventName, status: res.status, error, fbtrace: json.error?.fbtrace_id });
      return { ok: false, status: res.status, error };
    }
    return { ok: true, eventsReceived: json.events_received ?? 1, fbtraceId: json.fbtrace_id };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[meta/capi] request failed", { event: input.eventName, error });
    return { ok: false, error };
  }
}
