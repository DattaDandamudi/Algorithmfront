/**
 * First-touch ad attribution stored in a small cookie so server code (signup,
 * checkout, Stripe webhook) can attach `fbc`/`fbp`/UTMs to Meta CAPI events.
 *
 * This module is intentionally isomorphic: no `server-only`, no Node APIs, so
 * the client-side `AttributionCapture` component and Server Functions can share
 * the same parse/serialize logic.
 */

export const ATTRIBUTION_COOKIE = "cc_attr";

/** 90 days: Meta's click attribution window is ≤ 28 days; keep some slack for long sales cycles. */
export const ATTRIBUTION_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

export type Attribution = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  fbclid?: string;
  /** Meta click id in cookie format: `fb.1.<timestamp_ms>.<fbclid>` */
  fbc?: string;
  /** Meta browser id (`_fbp` cookie set by the Pixel) */
  fbp?: string;
  landing_path?: string;
  referrer?: string;
  first_seen_at?: string;
};

const ATTRIBUTION_KEYS: ReadonlyArray<keyof Attribution> = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "fbclid",
  "fbc",
  "fbp",
  "landing_path",
  "referrer",
  "first_seen_at",
];

/**
 * Cookie options shared by the client writer and any server writer.
 * Not `httpOnly` because the browser component writes it (no secrets inside).
 */
export const attributionCookieOptions = {
  path: "/",
  maxAge: ATTRIBUTION_MAX_AGE_SECONDS,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  httpOnly: false,
};

/** Minimal structural type satisfied by Next's `cookies()` store and by `RequestCookies`. */
export type CookieReader = {
  get(name: string): { value: string } | undefined;
};

const MAX_FIELD_LENGTH = 512;

function clean(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim();
  if (!v) return undefined;
  return v.length > MAX_FIELD_LENGTH ? v.slice(0, MAX_FIELD_LENGTH) : v;
}

/** Parses the cookie value (URI-encoded JSON). Tolerates garbage — returns `{}`. */
export function parseAttributionCookie(raw: string | null | undefined): Attribution {
  if (!raw) return {};
  try {
    const decoded = decodeURIComponent(raw);
    const obj: unknown = JSON.parse(decoded);
    if (!obj || typeof obj !== "object") return {};
    const out: Attribution = {};
    for (const key of ATTRIBUTION_KEYS) {
      const v = clean((obj as Record<string, unknown>)[key]);
      if (v) out[key] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/** Serializes for `document.cookie` / `cookieStore.set`. */
export function serializeAttribution(attr: Attribution): string {
  const compact: Attribution = {};
  for (const key of ATTRIBUTION_KEYS) {
    const v = clean(attr[key]);
    if (v) compact[key] = v;
  }
  return encodeURIComponent(JSON.stringify(compact));
}

/** Builds Meta's `fbc` value from a `fbclid` query param. */
export function fbcFromFbclid(fbclid: string, nowMs: number = Date.now()): string {
  return `fb.1.${nowMs}.${fbclid}`;
}

/**
 * Reads attribution for the current request. Merges our cookie with the
 * Pixel's own `_fbp`/`_fbc` cookies so callers get the most complete picture.
 *
 * Usage (server): `readAttribution(await cookies())`.
 */
export function readAttribution(cookieStore: CookieReader): Attribution {
  const attr = parseAttributionCookie(cookieStore.get(ATTRIBUTION_COOKIE)?.value);
  const fbp = clean(cookieStore.get("_fbp")?.value);
  const fbcCookie = clean(cookieStore.get("_fbc")?.value);
  if (fbp && !attr.fbp) attr.fbp = fbp;
  if (!attr.fbc) {
    if (fbcCookie) attr.fbc = fbcCookie;
    else if (attr.fbclid) attr.fbc = fbcFromFbclid(attr.fbclid);
  }
  return attr;
}
