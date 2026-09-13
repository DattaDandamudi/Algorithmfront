"use client";

import { useEffect } from "react";
import { trackPixel } from "@/lib/meta/pixel";

/**
 * Fires the browser-side Meta event for a completed Checkout with the SAME event_id the Stripe webhook
 * uses for the Conversions API (`checkout_<session id>`), so Meta deduplicates the pair.
 */
export default function CheckoutPixel({ sessionId, eventName, value }: { sessionId: string; eventName: "StartTrial" | "Purchase"; value?: number }) {
  useEffect(() => {
    if (!sessionId) return;
    const key = `cc_pixel_checkout_${sessionId}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "1");
    } catch {
      // storage unavailable: fire anyway, dedup happens server-side by event_id
    }
    trackPixel(eventName, value ? { value, currency: "USD" } : {}, `checkout_${sessionId}`);
  }, [sessionId, eventName, value]);
  return null;
}
