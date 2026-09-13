import type { Carrier } from "./schemas";

export type CarrierInstruction = {
  id: Carrier;
  label: string;
  kind: "dial" | "portal";
  /** Dial codes shown with the CallCatch number appended. `{n}` is replaced with the 10-digit number. */
  enable?: string[];
  disable?: string[];
  steps: string[];
  note?: string;
};

/**
 * Conditional call forwarding ("forward when busy / no answer") codes per carrier.
 * Conditional forwarding — not unconditional — keeps the owner's phone ringing first.
 */
export const CARRIER_INSTRUCTIONS: ReadonlyArray<CarrierInstruction> = [
  {
    id: "verizon",
    label: "Verizon",
    kind: "dial",
    enable: ["*71{n}"],
    disable: ["*73"],
    steps: [
      "Open the phone app on the line you forward from.",
      "Dial *71 followed by your CallCatch number and press call.",
      "Wait for the confirmation tone or message, then hang up.",
    ],
    note: "*71 forwards only when you're busy or don't answer. *72 would forward every call — don't use that.",
  },
  {
    id: "att",
    label: "AT&T",
    kind: "dial",
    enable: ["*61*{n}#", "**61*{n}#"],
    disable: ["#61#", "##61#"],
    steps: [
      "Dial *61* followed by your CallCatch number, then # and press call.",
      "If that fails, try **61* then your number, then # (older SIMs).",
      "You'll see a confirmation on screen. Hang up.",
    ],
    note: "AT&T rings you for about 20 seconds before forwarding. To change the delay, add **NN after the number (e.g. **61*18005551234**25#).",
  },
  {
    id: "tmobile",
    label: "T-Mobile",
    kind: "dial",
    enable: ["**61*{n}#"],
    disable: ["##61#"],
    steps: [
      "Dial **61* followed by your CallCatch number, then # and press call.",
      "Wait for the on-screen confirmation, then hang up.",
    ],
    note: "Also enables forwarding when your phone is off or out of coverage: **62*number# and **67*number# for busy.",
  },
  {
    id: "google_voice",
    label: "Google Voice",
    kind: "portal",
    steps: [
      "Open voice.google.com → Settings → Calls.",
      "Turn off “Get voicemail via message” if you'd like CallCatch to take voicemail.",
      "Under “Calls” → “Unanswered calls”, add your CallCatch number as the forwarding destination.",
      "Set the ring time to 20 seconds so the owner still gets a chance to answer.",
    ],
    note: "Google Voice forwards unanswered calls only from the web settings, not with dial codes.",
  },
  {
    id: "ringcentral",
    label: "RingCentral",
    kind: "portal",
    steps: [
      "Admin Portal → Phone System → Users → your extension → Call Handling.",
      "Under “Work hours” and “After hours”, set “If no one answers” to forward to an external number.",
      "Enter your CallCatch number and save. Repeat for the main company number if callers dial that.",
    ],
  },
  {
    id: "grasshopper",
    label: "Grasshopper",
    kind: "portal",
    steps: [
      "Grasshopper app → Settings → Call Forwarding (or Extensions → your extension).",
      "Add your CallCatch number as the last destination in the ring order.",
      "Set “If unanswered” to send calls to that number instead of Grasshopper voicemail.",
    ],
  },
  {
    id: "other",
    label: "Other / not sure",
    kind: "dial",
    enable: ["*71{n}", "**61*{n}#"],
    disable: ["*73", "##61#"],
    steps: [
      "Most US carriers use *71 (Verizon, Spectrum, US Cellular) or **61* (GSM carriers like AT&T, T-Mobile, Mint, Cricket).",
      "Try the first code; if it fails, try the second.",
      "VoIP providers (Ooma, Vonage, Nextiva, 8x8) have a “forward on no answer” setting in their portal.",
    ],
  },
];

export function carrierById(id: string | null | undefined): CarrierInstruction {
  return CARRIER_INSTRUCTIONS.find((c) => c.id === id) ?? CARRIER_INSTRUCTIONS[CARRIER_INSTRUCTIONS.length - 1];
}

/** "*71{n}" + "+18005551234" → "*7118005551234" */
export function renderDialCode(template: string, e164: string): string {
  const digits = e164.replace(/\D/g, "");
  return template.replace("{n}", digits);
}
