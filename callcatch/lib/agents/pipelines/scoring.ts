/**
 * Fit score 0-100 for a prospect. Documented rubric so the founder can tune it:
 *  +30 trade is hvac/plumbing/electrical (roofing +15, other 0)
 *  +20 review_count in 20..400 (the 2-15 tech band); 5..19 or 401..1000 → +8; unknown → +5
 *  +10 rating >= 4.0 (4.5+ → +12)
 *  +10 website present
 *  +10 phone present (callable)
 *  +10 runs_meta_ads / LSA (already pays for leads)
 *  +5 24/7 or emergency service mentioned
 *  +5 known FSM software (Jobber/HCP) → integration story; ServiceTitan → -10 (too big)
 *  -25 franchise/national brand words
 */
export type ScoreInput = {
  trade: string;
  review_count?: number | null;
  rating?: number | null;
  website?: string | null;
  phone?: string | null;
  runs_meta_ads?: boolean | null;
  uses_software?: string | null;
  business_name: string;
  notes?: Record<string, unknown> | null;
};

const FRANCHISE = /(one hour|mr\. ?rooter|roto-?rooter|aire ?serv|benjamin franklin|mister sparky|arsl?|service experts|horizon services|abc home|ars\/rescue|american residential services|lennox stores)/i;

export function scoreProspect(p: ScoreInput): number {
  let s = 0;
  if (["hvac", "plumbing", "electrical"].includes(p.trade)) s += 30;
  else if (p.trade === "roofing") s += 15;
  const rc = p.review_count ?? null;
  if (rc === null) s += 5;
  else if (rc >= 20 && rc <= 400) s += 20;
  else if ((rc >= 5 && rc < 20) || (rc > 400 && rc <= 1000)) s += 8;
  const r = p.rating ?? null;
  if (r !== null && r >= 4.5) s += 12;
  else if (r !== null && r >= 4.0) s += 10;
  if (p.website) s += 10;
  if (p.phone) s += 10;
  if (p.runs_meta_ads) s += 10;
  const notes = p.notes ?? {};
  if (notes["emergency"] === true || notes["open_24_7"] === true) s += 5;
  const sw = (p.uses_software ?? "").toLowerCase();
  if (/jobber|housecall/.test(sw)) s += 5;
  if (/servicetitan/.test(sw)) s -= 10;
  if (FRANCHISE.test(p.business_name)) s -= 25;
  return Math.max(0, Math.min(100, s));
}

export function dedupeKey(p: { business_name: string; phone?: string | null; state?: string | null }): string {
  return `${p.business_name.toLowerCase()}|${p.phone ?? ""}|${p.state ?? ""}`;
}
