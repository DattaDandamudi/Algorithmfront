/**
 * Prompt material for the qualification engine: trade-specific qualification order and
 * tone variants, the cached business-profile block, the per-turn dynamic block, and the
 * hard-coded templates that never go through the model (first text-back, closing, safety,
 * nudge, refusal fallback). Keep the stable block free of anything time-dependent so the
 * prompt cache hits on every turn.
 */
import type { AccountRow, Json, LeadRow } from "@/lib/db/types";
import { env } from "@/lib/env";
import { STOP_DISCLOSURE } from "@/lib/telephony/consent";

export type Trade = "hvac" | "plumbing" | "electrical" | "other";
export type Tone = "friendly" | "professional" | "plain";

export type TradeProfile = {
  label: string;
  /** "your AC / heating system" — used in the first text-back. */
  thing: string;
  /** What the assistant is qualifying for. */
  qualificationOrder: string[];
  commonIssues: string[];
  clarifiers: string[];
  emergencyNotes: string;
};

export const TRADES: Record<Trade, TradeProfile> = {
  hvac: {
    label: "HVAC",
    thing: "heating or cooling",
    qualificationOrder: [
      "What's going on (no cooling / no heat / noise / leak / thermostat / tune-up / replacement quote)",
      "Service address or ZIP (to confirm the service area)",
      "How urgent (emergency / today / this week / flexible)",
      "Preferred time window (morning / afternoon / specific day)",
      "Name",
    ],
    commonIssues: ["AC not cooling", "no heat", "unit won't turn on", "loud noise", "water around the unit", "thermostat blank", "tune-up", "replacement quote"],
    clarifiers: ["Is the system running at all, or completely dead?", "Roughly how old is the unit?", "Is it the whole house or one area?"],
    emergencyNotes: "No heat with an infant or elderly person at home, gas smell, or a CO alarm is an emergency.",
  },
  plumbing: {
    label: "plumbing",
    thing: "plumbing",
    qualificationOrder: [
      "What's going on (leak / clog / no hot water / water heater / toilet / sewer / remodel)",
      "Service address or ZIP",
      "How urgent (active leak or flooding is an emergency)",
      "Preferred time window",
      "Name",
    ],
    commonIssues: ["active leak", "clogged drain", "no hot water", "water heater replacement", "toilet running/overflowing", "sewer backup", "low pressure"],
    clarifiers: ["Is water actively leaking right now?", "Have you shut off the water to that fixture?", "Gas or electric water heater?"],
    emergencyNotes: "Active flooding, burst pipe, sewage backup or gas smell near a water heater is an emergency.",
  },
  electrical: {
    label: "electrical",
    thing: "electrical",
    qualificationOrder: [
      "What's going on (no power / breaker tripping / outlet or switch / panel / lighting / EV charger / generator)",
      "Service address or ZIP",
      "How urgent (sparks, smoke or burning smell is an emergency)",
      "Preferred time window",
      "Name",
    ],
    commonIssues: ["partial power loss", "breaker keeps tripping", "dead outlet", "flickering lights", "panel upgrade", "EV charger install", "ceiling fan / lighting"],
    clarifiers: ["Is it one circuit or the whole house?", "Any burning smell or warm outlets?", "Do you know your panel brand?"],
    emergencyNotes: "Sparks, smoke, burning smell, a hot panel, or someone getting shocked is an emergency.",
  },
  other: {
    label: "home service",
    thing: "home",
    qualificationOrder: ["What's going on", "Service address or ZIP", "How urgent", "Preferred time window", "Name"],
    commonIssues: ["repair", "installation", "estimate", "maintenance"],
    clarifiers: ["Can you describe what you're seeing?", "Is this affecting the whole home or one area?"],
    emergencyNotes: "Gas smell, sparks, smoke, flooding, sewage or a CO alarm is an emergency.",
  },
};

export function tradeOf(value: string | null | undefined): Trade {
  return value === "hvac" || value === "plumbing" || value === "electrical" ? value : "other";
}

export function toneOf(value: string | null | undefined): Tone {
  if (value === "professional") return "professional";
  if (value === "plain" || value === "plain-spoken" || value === "plainspoken") return "plain";
  return "friendly";
}

const TONE_GUIDE: Record<Tone, string> = {
  friendly:
    "Tone: warm and friendly, like a helpful front-desk person who genuinely cares. Light empathy when something is broken. Contractions are fine.",
  professional:
    "Tone: courteous and professional. Clear, concise, no slang, no exclamation marks. Empathy stated simply.",
  plain: "Tone: plain-spoken and direct, the way a working contractor texts. Short sentences. No fluff, no corporate phrasing.",
};

export type AiProfile = {
  services: string[];
  never_say: string[];
  price_ranges: Record<string, string>;
  brands?: string[];
};

export function parseAiProfile(raw: Json | null | undefined): AiProfile {
  const out: AiProfile = { services: [], never_say: [], price_ranges: {} };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const obj = raw as Record<string, Json | undefined>;
  const strList = (v: Json | undefined): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((s) => s.trim()) : [];
  out.services = strList(obj.services);
  out.never_say = strList(obj.never_say);
  out.brands = strList(obj.brands);
  const pr = obj.price_ranges;
  if (pr && typeof pr === "object" && !Array.isArray(pr)) {
    for (const [k, v] of Object.entries(pr)) {
      if (typeof v === "string" && v.trim()) out.price_ranges[k] = v.trim();
      else if (typeof v === "number") out.price_ranges[k] = `$${v}`;
    }
  }
  return out;
}

export function businessNameOf(account: Pick<AccountRow, "dba" | "legal_name">): string {
  return (account.dba || account.legal_name || "the office").trim();
}

function hoursText(raw: Json): string {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "not provided";
  const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const labels: Record<string, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
  const obj = raw as Record<string, Json | undefined>;
  const parts: string[] = [];
  for (const d of days) {
    const v = obj[d];
    if (Array.isArray(v) && v.length >= 2 && typeof v[0] === "string" && typeof v[1] === "string") parts.push(`${labels[d]} ${v[0]}–${v[1]}`);
    else if (v === null || v === undefined) parts.push(`${labels[d]} closed`);
  }
  return parts.length ? parts.join(", ") : "not provided";
}

function serviceAreaText(raw: Json): string {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "not provided";
  const obj = raw as Record<string, Json | undefined>;
  const bits: string[] = [];
  if (typeof obj.center === "string") bits.push(`around ${obj.center}`);
  if (typeof obj.radius_miles === "number") bits.push(`${obj.radius_miles} mile radius`);
  if (Array.isArray(obj.zips)) {
    const zips = obj.zips.filter((z): z is string => typeof z === "string");
    if (zips.length) bits.push(`ZIPs: ${zips.slice(0, 40).join(", ")}${zips.length > 40 ? "…" : ""}`);
  }
  return bits.length ? bits.join("; ") : "not provided";
}

/**
 * Minimal, stable description of the business the engine needs. Built from `accounts`
 * for real customers and from DEMO_PROFILE for the public demo line.
 */
export type BusinessProfile = {
  businessName: string;
  trade: Trade;
  tone: Tone;
  city: string | null;
  state: string | null;
  hours: string;
  serviceArea: string;
  emergencyService: boolean;
  hasOnCall: boolean;
  bookingUrl: string | null;
  ai: AiProfile;
  avgTicketUsd: number;
  isDemo: boolean;
};

export function profileFromAccount(account: AccountRow): BusinessProfile {
  return {
    businessName: businessNameOf(account),
    trade: tradeOf(account.trade),
    tone: toneOf(account.tone),
    city: account.city,
    state: account.state,
    hours: hoursText(account.hours),
    serviceArea: serviceAreaText(account.service_area),
    emergencyService: account.emergency_service,
    hasOnCall: Boolean(account.on_call_phone),
    bookingUrl: account.booking_url,
    ai: parseAiProfile(account.ai_profile),
    avgTicketUsd: Number(account.avg_ticket_usd) || 450,
    isDemo: false,
  };
}

/** Fixed business used by the public demo line (/api/demo/call). */
export const DEMO_PROFILE: BusinessProfile = {
  businessName: "Summit Air Heating & Cooling",
  trade: "hvac",
  tone: "friendly",
  city: "Austin",
  state: "TX",
  hours: "Mon–Fri 7:30–18:00, Sat 8:00–14:00, Sun closed",
  serviceArea: "Austin, TX and a 25 mile radius",
  emergencyService: true,
  hasOnCall: true,
  bookingUrl: null,
  ai: {
    services: ["AC repair", "AC replacement", "furnace repair", "furnace tune-up", "heat pump install", "thermostat install"],
    never_say: ["Do not quote an exact price", "Do not promise a same-day slot"],
    price_ranges: { diagnostic_visit: "$89 (waived with repair)", furnace_tune_up: "$129" },
    brands: ["Carrier", "Trane", "Lennox"],
  },
  avgTicketUsd: 485,
  isDemo: true,
};

export const MAX_AI_TURNS = 8;
export const DEMO_MAX_AI_TURNS = 3;
export const MAX_SMS_CHARS = 300;

/** Stable system block (cached with cache_control ephemeral). No timestamps, no per-turn data. */
export function buildBusinessProfileBlock(p: BusinessProfile): string {
  const trade = TRADES[p.trade];
  const priceLines = Object.entries(p.ai.price_ranges).map(([k, v]) => `- ${k.replace(/_/g, " ")}: starting at ${v}`);
  const location = [p.city, p.state].filter(Boolean).join(", ");
  return [
    `You are the text-message front desk for ${p.businessName}, a ${trade.label} contractor${location ? ` in ${location}` : ""}. A customer called and nobody could pick up, or they sent in a lead; you are texting them back so the owner can call with everything they need.`,
    "",
    "GOALS, IN ORDER (one question per message, skip anything already answered):",
    ...trade.qualificationOrder.map((q, i) => `${i + 1}. ${q}`),
    "",
    "HOW TO WRITE:",
    "- This is SMS. One or two short sentences, under 300 characters, no markdown, no bullet lists, no emojis.",
    "- Acknowledge what they said in a few words, then ask the single next question.",
    "- You are an assistant, not a technician: never diagnose, never give repair instructions.",
    `- ${TONE_GUIDE[p.tone]}`,
    "",
    "HARD RULES (the software enforces these too):",
    "- Never quote a price, estimate, hourly rate or fee. If asked, say the owner will go over pricing when they call" +
      (priceLines.length ? ", except you may repeat the published starting prices below verbatim." : "."),
    "- Never promise an arrival time, a same-day slot or a specific technician. Say the owner will confirm timing.",
    "- Never discuss competitors, warranties, refunds or legal matters.",
    "- If the customer says STOP or asks not to be texted, say okay and stop.",
    "- If they mention a gas smell, sparks, smoke, flooding, sewage, a CO alarm, or no heat with a baby or elderly person, treat it as an emergency: call the escalate_to_owner tool with the reason and keep the reply to safety and 'the owner is being called now'.",
    `- ${trade.emergencyNotes}`,
    "",
    "TOOLS: call save_lead_fields whenever you learn a new detail (name, address, ZIP, issue, urgency, window). Call mark_qualified once you have the issue, the address or ZIP, and the urgency. Call mark_booked only if the customer explicitly confirms a booking. Call send_booking_link when the customer asks to book and a booking link exists. Call escalate_to_owner when the customer asks for a human, is upset, has an emergency, or asks something outside your goals. Then reply in plain text.",
    "",
    "BUSINESS FACTS:",
    `- Business name: ${p.businessName}`,
    `- Services: ${p.ai.services.length ? p.ai.services.join(", ") : trade.commonIssues.join(", ")}`,
    p.ai.brands && p.ai.brands.length ? `- Brands serviced: ${p.ai.brands.join(", ")}` : null,
    `- Hours: ${p.hours}`,
    `- Service area: ${p.serviceArea}`,
    `- Emergency / after-hours service: ${p.emergencyService ? "yes" : "no"}${p.hasOnCall ? " (on-call technician available)" : ""}`,
    `- Booking link: ${p.bookingUrl ? p.bookingUrl : "none — the owner schedules by phone"}`,
    priceLines.length ? "- Published starting prices (you may repeat these, nothing else):" : "- Published starting prices: none",
    ...priceLines,
    p.ai.never_say.length ? "- Owner's never-say list:" : null,
    ...p.ai.never_say.map((s) => `  - ${s}`),
    "",
    "Common issues for this trade: " + trade.commonIssues.join("; ") + ".",
    "Useful clarifiers: " + trade.clarifiers.join(" ") ,
    p.isDemo
      ? "\nDEMO MODE: this is CallCatch's public demo line. The person texting is a contractor trying the product, playing the role of a homeowner. Qualify them exactly as you would a real homeowner; do not mention that this is a demo."
      : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

export type DynamicContext = {
  localTimeLabel: string;
  quietHoursLabel: string;
  withinHours: boolean;
  turnCount: number;
  maxTurns: number;
  lead: Partial<Pick<LeadRow, "name" | "address" | "zip" | "issue" | "urgency" | "preferred_window" | "status">> | null;
  voicemailSummary: string | null;
  emergencyAlreadyHandled: boolean;
  contactName: string | null;
};

/** Per-turn block (not cached): time, quiet hours, what's already known. */
export function buildDynamicBlock(ctx: DynamicContext): string {
  const known: string[] = [];
  const lead = ctx.lead;
  if (lead?.name || ctx.contactName) known.push(`name: ${lead?.name ?? ctx.contactName}`);
  if (lead?.issue) known.push(`issue: ${lead.issue}`);
  if (lead?.address) known.push(`address: ${lead.address}`);
  if (lead?.zip) known.push(`ZIP: ${lead.zip}`);
  if (lead?.urgency) known.push(`urgency: ${lead.urgency}`);
  if (lead?.preferred_window) known.push(`preferred window: ${lead.preferred_window}`);
  return [
    `Current local time: ${ctx.localTimeLabel}. Texting window: ${ctx.quietHoursLabel} (${ctx.withinHours ? "currently inside the window" : "currently outside the window; the customer's reply arrived anyway"}).`,
    `This is assistant turn ${ctx.turnCount + 1} of ${ctx.maxTurns}. ${ctx.maxTurns - ctx.turnCount <= 2 ? "Wrap up: get the last missing detail and tell them the owner will call." : ""}`,
    known.length ? `Already known (do not ask again): ${known.join("; ")}.` : "Nothing is known yet beyond their phone number.",
    lead?.status === "qualified" ? "The lead is already marked qualified." : null,
    lead?.status === "booked" ? "The lead is already marked booked." : null,
    ctx.voicemailSummary ? `Voicemail they left when they called: "${ctx.voicemailSummary}"` : null,
    ctx.emergencyAlreadyHandled ? "An emergency was already flagged in this thread and the owner has been called; keep replies short and reassuring." : null,
  ]
    .filter((l): l is string => l !== null)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Templates that never go through the model
// ---------------------------------------------------------------------------

function firstName(name: string | null | undefined): string | null {
  if (!name) return null;
  const f = name.trim().split(/\s+/)[0];
  return f && f.length <= 20 ? f : null;
}

/** First text-back after a missed call (spec §6.5 / task): business name + trade-specific question + STOP. */
export function firstTextbackTemplate(p: BusinessProfile, contactName?: string | null): string {
  const trade = TRADES[p.trade];
  const hi = firstName(contactName) ? `Hi ${firstName(contactName)}, this is ${p.businessName}.` : `Hi, this is ${p.businessName}.`;
  const ask =
    p.tone === "plain"
      ? `what's going on with your ${trade.thing}?`
      : p.tone === "professional"
        ? `how can we help with your ${trade.thing} today?`
        : `what's going on with your ${trade.thing}?`;
  return `${hi} Sorry we missed your call — ${ask} ${STOP_DISCLOSURE}`;
}

/** A caller with an open thread called again: short re-engagement instead of the full first message. */
export function repeatTextbackTemplate(p: BusinessProfile): string {
  return `${p.businessName}: Sorry we missed you again — reply here with what you need and we'll get right on it. ${STOP_DISCLOSURE}`;
}

/** First message to a web-form / Meta lead (Pro): acknowledge the form and ask the next missing detail. */
export function leadFormFirstMessage(
  p: BusinessProfile,
  lead: { name?: string | null; issue?: string | null; zip?: string | null; address?: string | null }
): string {
  const trade = TRADES[p.trade];
  const name = firstName(lead.name);
  const hi = name ? `Hi ${name}, this is ${p.businessName}.` : `Hi, this is ${p.businessName}.`;
  const issue = lead.issue ? lead.issue.replace(/\s+/g, " ").trim().slice(0, 80) : null;
  const ack = issue ? `Thanks for reaching out about "${issue}".` : `Thanks for reaching out.`;
  const next =
    !lead.issue
      ? `What's going on with your ${trade.thing}?`
      : !(lead.zip || lead.address)
        ? "What's the service address or ZIP?"
        : "How soon do you need someone — today, this week, or flexible?";
  return `${hi} ${ack} ${next} ${STOP_DISCLOSURE}`;
}

/** 20-minute nudge when the first text-back got no reply (max 1). */
export function nudgeTemplate(p: BusinessProfile): string {
  return `${p.businessName} here — still happy to help. Reply with a few words about what's going on and we'll get you scheduled. ${STOP_DISCLOSURE}`;
}

/** Sent after the 8th AI turn, and when the model is unavailable. */
export function closingTemplate(p: BusinessProfile): string {
  return `Thanks — I've got everything for ${p.businessName}. The owner will call you shortly to get this scheduled.`;
}

/** Refusal / API failure fallback (RUNBOOK §11). */
export function safeTemplate(p: BusinessProfile): string {
  return `Thanks — got it. ${p.businessName} will call you shortly. ${STOP_DISCLOSURE}`;
}

/** Emergency reply: safety line + "owner is being called now". No diagnosis, no ETA. */
export function emergencyTemplate(p: BusinessProfile, safety: string): string {
  return `${safety} We're calling ${p.businessName}'s ${p.hasOnCall ? "on-call tech" : "owner"} right now so they can reach you at this number.`;
}

/** Demo line: final message with the signup link. */
export function demoClosingTemplate(): string {
  return `That's the CallCatch demo — your callers get exactly this, in under 10 seconds, from your own number. Start your 14-day trial: ${env.appUrl()}/signup`;
}

/** Owner-facing one-liner of what the lead needs (used in alerts). */
export function leadSummaryLine(lead: Partial<LeadRow> | null | undefined): string {
  if (!lead) return "no details yet";
  const bits = [lead.issue, lead.address ?? lead.zip, lead.urgency ? `urgency: ${lead.urgency}` : null, lead.preferred_window ? `window: ${lead.preferred_window}` : null]
    .filter(Boolean)
    .map(String);
  return bits.length ? bits.join(" · ") : "no details yet";
}

// ---------------------------------------------------------------------------
// Post-filter: strip prices / ETAs the model must never invent, normalise for SMS
// ---------------------------------------------------------------------------

const MONEY_RE = /\$\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:k|K))?|\b\d[\d,]*(?:\.\d+)?\s?(?:dollars|bucks)\b/g;

function allowedAmounts(p: BusinessProfile): Set<string> {
  const set = new Set<string>();
  for (const v of Object.values(p.ai.price_ranges)) {
    for (const m of v.match(/\d[\d,]*(?:\.\d+)?/g) ?? []) set.add(m.replace(/,/g, ""));
  }
  return set;
}

function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
}

export type SanitizeOptions = {
  profile: BusinessProfile;
  isFirstOutbound: boolean;
  bookingUrlToInclude?: string | null;
};

/**
 * Cleans a model reply for SMS: removes markdown, drops sentences quoting unapproved dollar
 * amounts or arrival promises, enforces the first-message disclosure, caps length.
 */
export function sanitizeReply(raw: string, opts: SanitizeOptions): string {
  let text = raw
    .replace(/\*\*|__|`/g, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();

  const allowed = allowedAmounts(opts.profile);
  const sentences = splitSentences(text).filter((s) => {
    const money = s.match(MONEY_RE) ?? [];
    const badMoney = money.some((m) => {
      const digits = (m.match(/\d[\d,]*(?:\.\d+)?/) ?? [""])[0].replace(/,/g, "");
      return !allowed.has(digits);
    });
    if (badMoney) return false;
    if (/\b(be there|arrive|arriving|on (?:the|my|our) way|show up|get there)\b[^.!?]*\b(in|within|by|at)\s+\d/i.test(s)) return false;
    if (/\b(guarantee[ds]?|guaranteed)\b/i.test(s)) return false;
    return true;
  });
  text = sentences.join(" ").trim();
  if (!text) text = `The owner at ${opts.profile.businessName} will go over that with you when they call. What's the best time to reach you?`;

  if (opts.bookingUrlToInclude && !text.includes(opts.bookingUrlToInclude)) {
    text = `${text} Book here: ${opts.bookingUrlToInclude}`;
  }

  if (opts.isFirstOutbound) {
    if (!text.toLowerCase().includes(opts.profile.businessName.toLowerCase())) text = `${opts.profile.businessName}: ${text}`;
    if (!/\bstop\b/i.test(text)) text = `${text} ${STOP_DISCLOSURE}`;
  }

  const cap = opts.isFirstOutbound ? 460 : 420;
  if (text.length > cap) {
    const cut = text.slice(0, cap);
    const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
    text = (lastStop > 120 ? cut.slice(0, lastStop + 1) : cut).trim();
    if (opts.isFirstOutbound && !/\bstop\b/i.test(text)) text = `${text} ${STOP_DISCLOSURE}`;
  }
  return text;
}
