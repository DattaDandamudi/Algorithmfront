/** Only same-origin relative paths are accepted as `next` redirect targets (open-redirect guard). */
export function safeNextPath(raw: string | null | undefined, fallback = "/dashboard"): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  if (/[\r\n]/.test(raw)) return fallback;
  return raw;
}

export type PlanParams = { plan?: string; interval?: string; path?: string; ref?: string; setup?: string };

/** Builds the post-signup checkout URL from the pricing CTA params (unknown values fall back to defaults in module d's page). */
export function checkoutPathFor(p: PlanParams): string {
  const q = new URLSearchParams();
  q.set("plan", p.plan === "pro" ? "pro" : "starter");
  q.set("interval", p.interval === "year" ? "year" : "month");
  q.set("path", p.path === "paynow" ? "paynow" : "trial");
  if (p.setup === "1") q.set("setup", "1");
  if (p.ref && /^[a-z0-9]{4,32}$/i.test(p.ref)) q.set("ref", p.ref);
  return `/billing/checkout?${q.toString()}`;
}
