"use client";

import { useEffect } from "react";
import {
  ATTRIBUTION_COOKIE,
  attributionCookieOptions,
  fbcFromFbclid,
  parseAttributionCookie,
  serializeAttribution,
  type Attribution,
} from "@/lib/meta/attribution";

function readCookie(name: string): string | undefined {
  try {
    const prefix = `${name}=`;
    const part = document.cookie.split("; ").find((c) => c.startsWith(prefix));
    return part ? part.slice(prefix.length) : undefined;
  } catch {
    return undefined;
  }
}

function writeCookie(name: string, value: string) {
  const o = attributionCookieOptions;
  const parts = [`${name}=${value}`, `Path=${o.path}`, `Max-Age=${o.maxAge}`, `SameSite=${o.sameSite === "lax" ? "Lax" : o.sameSite}`];
  if (o.secure) parts.push("Secure");
  try {
    document.cookie = parts.join("; ");
  } catch {
    // Cookies disabled: attribution is best-effort.
  }
}

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

/**
 * Captures first-touch attribution (UTMs, fbclid → fbc, referrer, landing path)
 * into a cookie on the first visit. Click ids from later visits overwrite the
 * old click (last-click for fbc), while landing_path/referrer stay first-touch.
 */
export function AttributionCapture() {
  useEffect(() => {
    const existing = parseAttributionCookie(readCookie(ATTRIBUTION_COOKIE));
    const url = new URL(window.location.href);
    const next: Attribution = { ...existing };
    let changed = false;

    for (const key of UTM_KEYS) {
      const v = url.searchParams.get(key);
      if (v && v !== next[key]) {
        next[key] = v;
        changed = true;
      }
    }
    const fbclid = url.searchParams.get("fbclid");
    if (fbclid && fbclid !== next.fbclid) {
      next.fbclid = fbclid;
      next.fbc = fbcFromFbclid(fbclid);
      changed = true;
    }
    if (!next.fbc) {
      const fbcCookie = readCookie("_fbc");
      if (fbcCookie) {
        next.fbc = fbcCookie;
        changed = true;
      }
    }
    const fbp = readCookie("_fbp");
    if (fbp && fbp !== next.fbp) {
      next.fbp = fbp;
      changed = true;
    }
    if (!next.landing_path) {
      next.landing_path = `${url.pathname}${url.search}`.slice(0, 512);
      changed = true;
    }
    if (!next.referrer && document.referrer) {
      try {
        const ref = new URL(document.referrer);
        if (ref.host !== url.host) {
          next.referrer = document.referrer.slice(0, 512);
          changed = true;
        }
      } catch {
        // ignore malformed referrer
      }
    }
    if (!next.first_seen_at) {
      next.first_seen_at = new Date().toISOString();
      changed = true;
    }
    if (changed) writeCookie(ATTRIBUTION_COOKIE, serializeAttribution(next));
  }, []);

  return null;
}
