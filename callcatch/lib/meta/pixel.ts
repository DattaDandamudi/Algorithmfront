/**
 * Browser-side Meta Pixel helpers. Safe to import anywhere: every function
 * no-ops when `fbq` is not loaded (pixel id unset, ad blocker, SSR).
 */

export type PixelStandardEvent =
  | "PageView"
  | "Lead"
  | "StartTrial"
  | "Purchase"
  | "Subscribe"
  | "Schedule"
  | "CompleteRegistration"
  | "InitiateCheckout"
  | "ViewContent"
  | "Contact";

export type PixelParams = Record<string, string | number | boolean | undefined>;

type Fbq = {
  (command: "init", pixelId: string): void;
  (command: "track", eventName: string, params?: PixelParams, options?: { eventID?: string }): void;
  (command: "trackCustom", eventName: string, params?: PixelParams, options?: { eventID?: string }): void;
  callMethod?: (...args: unknown[]) => void;
  queue?: unknown[];
  loaded?: boolean;
  version?: string;
  push?: Fbq;
};

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

function fbq(): Fbq | null {
  if (typeof window === "undefined") return null;
  return typeof window.fbq === "function" ? window.fbq : null;
}

/** RFC-4122 v4 uuid; the same id is sent to CAPI so Meta can dedupe Pixel + server events. */
export function newEventId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") crypto.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Fires a standard Pixel event with `eventID` for server-side dedup.
 * Returns the eventId used (generated when omitted) so callers can forward it.
 */
export function trackPixel(eventName: PixelStandardEvent, params: PixelParams = {}, eventId: string = newEventId()): string {
  const f = fbq();
  if (!f) return eventId;
  try {
    const clean: PixelParams = {};
    for (const [k, v] of Object.entries(params)) if (v !== undefined) clean[k] = v;
    f("track", eventName, clean, { eventID: eventId });
  } catch (err) {
    console.warn("[meta/pixel] track failed", err);
  }
  return eventId;
}

/** Fires a custom (non-standard) event. */
export function trackPixelCustom(eventName: string, params: PixelParams = {}, eventId: string = newEventId()): string {
  const f = fbq();
  if (!f) return eventId;
  try {
    f("trackCustom", eventName, params, { eventID: eventId });
  } catch (err) {
    console.warn("[meta/pixel] trackCustom failed", err);
  }
  return eventId;
}

export function pixelLoaded(): boolean {
  return fbq() !== null;
}
