import type { ThreadItem } from "./PhoneMock";

export type TradeSlug = "hvac" | "plumbing" | "electrical";

export type TradeContent = {
  slug: TradeSlug;
  name: string;
  /** e.g. "HVAC contractors" */
  audience: string;
  headline: string;
  sub: string;
  ticketRange: string;
  avgTicketUsd: number;
  /** Pain scenario for the trade page hero */
  scenario: string;
  qualificationQuestions: string[];
  businessName: string;
  thread: ThreadItem[];
  ownerAlert: string[];
  seasonalNote: string;
  metaDescription: string;
};

const STOP_LINE = "Reply STOP to opt out.";

export const TRADES: Record<TradeSlug, TradeContent> = {
  hvac: {
    slug: "hvac",
    name: "HVAC",
    audience: "HVAC contractors",
    headline: "The no-cool call you missed at 2 PM books with whoever texts back first.",
    sub: "CallCatch texts every missed call back in 10 seconds, asks what the system is doing and where the house is, and hands you a lead you can dispatch. No new number. Live in 10 minutes.",
    ticketRange: "$350 repair to $12,000 changeout",
    avgTicketUsd: 450,
    scenario:
      "July, 2:14 PM. You're in an attic with a condenser fan in your hands. The phone rings twice. By the time you're down the ladder, the homeowner has called the next company on the list.",
    qualificationQuestions: [
      "Is it not cooling, not heating, or making a noise?",
      "Does the fan run? Is the thermostat on?",
      "What's the address and the best window today?",
      "Brand and rough age of the unit (helps the tech load the truck)",
      "Is anyone in the home at risk from the heat?",
    ],
    businessName: "Summit Heating & Air",
    thread: [
      { kind: "event", text: "Missed call · 2:14 PM" },
      {
        kind: "out",
        text: "Hi, this is the automated assistant for Summit Heating & Air — sorry we missed your call! Mike is on a job. What's going on with your system? " + STOP_LINE,
        time: "2:14 PM · 9 seconds later",
      },
      { kind: "in", text: "AC stopped blowing cold this morning. Fan runs but it's warm air", time: "2:15 PM" },
      { kind: "out", text: "Got it — warm air with the fan running. What's the address, and is anyone home today between 1 and 5?", time: "2:15 PM" },
      { kind: "in", text: "4127 Alder Ct, Mesa. Home all day", time: "2:16 PM" },
      { kind: "out", text: "Perfect. I've sent this to Mike and he'll call you in a few minutes to confirm a window. Anything else he should know?", time: "2:16 PM" },
      { kind: "in", text: "It's a Carrier, about 12 years old", time: "2:17 PM" },
    ],
    ownerAlert: [
      "New lead · Sarah · (480) 555-0142",
      "4127 Alder Ct, Mesa — AC blowing warm, fan runs",
      "Home today 1–5 · Carrier, ~12 yrs",
    ],
    seasonalNote: "Peak season is when you miss the most calls. CallCatch works hardest in July and January.",
    metaDescription: "AI missed-call text-back for HVAC contractors. Every no-cool and no-heat call gets a text in 10 seconds, gets qualified, and lands on your phone. Keep your number. $79/mo.",
  },
  plumbing: {
    slug: "plumbing",
    name: "Plumbing",
    audience: "plumbers",
    headline: "The water heater that's leaking right now doesn't wait for you to finish under the sink.",
    sub: "CallCatch texts every missed call back in 10 seconds, finds out what's leaking and whether the water is off, and sends you a lead with the address. No new number. Live in 10 minutes.",
    ticketRange: "$250 drain clear to $6,500 repipe",
    avgTicketUsd: 400,
    scenario:
      "Tuesday, 11:40 AM. You're on your back under a vanity with a basin wrench. Two missed calls. One was a water heater replacement. It booked with the shop that answered — or texted.",
    qualificationQuestions: [
      "What's leaking or backed up, and is the water shut off?",
      "Is water actively coming out right now? (emergency routing)",
      "What's the address and the best window today?",
      "Gas or electric water heater? Tank or tankless?",
      "Is this a rental or your home? (who approves the work)",
    ],
    businessName: "Blue Ridge Plumbing",
    thread: [
      { kind: "event", text: "Missed call · 11:40 AM" },
      {
        kind: "out",
        text: "Hi, this is the automated assistant for Blue Ridge Plumbing — sorry we missed you, Dan's on a job. What's going on? If water is actively leaking, shut the supply valve first. " + STOP_LINE,
        time: "11:40 AM · 8 seconds later",
      },
      { kind: "in", text: "Water heater is leaking from the bottom. I turned the water off", time: "11:41 AM" },
      { kind: "out", text: "Good call on the valve. Gas or electric, and roughly how old? And what's the address?", time: "11:41 AM" },
      { kind: "in", text: "Gas, maybe 14 years. 88 Linden Ave, Asheville", time: "11:42 AM" },
      { kind: "out", text: "Thanks — that's likely a tank replacement. Dan will call you within a few minutes with today's options. Is someone home this afternoon?", time: "11:42 AM" },
      { kind: "in", text: "Yes, I'm here till 6", time: "11:43 AM" },
    ],
    ownerAlert: [
      "New lead · Priya · (828) 555-0177",
      "88 Linden Ave — gas WH leaking from base, ~14 yrs, water OFF",
      "Home till 6 · likely replacement",
    ],
    seasonalNote: "Frozen-pipe weeks and holiday drain calls are when the phone rings while you're already on a job.",
    metaDescription: "AI missed-call text-back for plumbers. Leaks, clogs and water heater calls get a text in 10 seconds, get qualified, and land on your phone. Keep your number. $79/mo.",
  },
  electrical: {
    slug: "electrical",
    name: "Electrical",
    audience: "electricians",
    headline: "Half the house lost power. They called you first — then the next electrician who actually replied.",
    sub: "CallCatch texts every missed call back in 10 seconds, asks what tripped and whether anything is hot or smoking, and sends you a lead with the address. No new number. Live in 10 minutes.",
    ticketRange: "$180 service call to $4,500 panel upgrade",
    avgTicketUsd: 380,
    scenario:
      "Thursday, 4:05 PM. You're in a panel with the main off and both hands busy. The phone buzzes in your pocket. That was a panel upgrade for an EV charger — and they want it this month.",
    qualificationQuestions: [
      "What's happening — no power, a tripping breaker, or a new install?",
      "Anything hot, buzzing or smelling like burning? (safety + emergency routing)",
      "What's the address and the best window?",
      "Panel age / amperage if they know it",
      "For installs: EV charger, generator, hot tub, remodel?",
    ],
    businessName: "Copper Line Electric",
    thread: [
      { kind: "event", text: "Missed call · 4:05 PM" },
      {
        kind: "out",
        text: "Hi, this is the automated assistant for Copper Line Electric — sorry we missed your call, Luis is in a panel right now. What's going on? If anything is hot, sparking or smells like burning, turn off the main and call 911. " + STOP_LINE,
        time: "4:05 PM · 9 seconds later",
      },
      { kind: "in", text: "Half the outlets in the kitchen are dead. Breaker looks fine, no burning smell", time: "4:06 PM" },
      { kind: "out", text: "Okay — that's often a tripped GFCI or a bad connection. What's the address, and when is someone home?", time: "4:06 PM" },
      { kind: "in", text: "2210 Harbor St, Tampa. Home after 5 today or anytime tomorrow", time: "4:07 PM" },
      { kind: "out", text: "Thanks. Luis will call you shortly to lock in a time. Anything else on the list while he's there?", time: "4:07 PM" },
      { kind: "in", text: "Actually yes, we want a Level 2 EV charger in the garage", time: "4:08 PM" },
    ],
    ownerAlert: [
      "New lead · Marcus · (813) 555-0119",
      "2210 Harbor St — kitchen outlets dead, breaker OK, no burn smell",
      "After 5 today / tomorrow · also wants L2 EV charger",
    ],
    seasonalNote: "Storm season and EV-charger demand both spike calls while you're already on a ladder.",
    metaDescription: "AI missed-call text-back for electricians. Outage, breaker and panel-upgrade calls get a text in 10 seconds, get qualified, and land on your phone. Keep your number. $79/mo.",
  },
};

export const TRADE_SLUGS = Object.keys(TRADES) as TradeSlug[];

export function isTradeSlug(v: string): v is TradeSlug {
  return v in TRADES;
}
