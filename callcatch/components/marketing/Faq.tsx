import { ChevronDown } from "lucide-react";

export type FaqItem = { q: string; a: string };

/** No-JS accordion using <details>; each item is a heading for screen readers. */
export function Faq({ items }: { items: FaqItem[] }) {
  return (
    <div className="divide-y divide-brand-100 rounded-2xl border border-brand-100 bg-white">
      {items.map((item) => (
        <details key={item.q} className="group px-5 py-4 open:bg-brand-50/40">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-base font-semibold text-brand-900 [&::-webkit-details-marker]:hidden">
            <span>{item.q}</span>
            <ChevronDown className="h-5 w-5 shrink-0 text-brand-500 transition group-open:rotate-180" aria-hidden="true" />
          </summary>
          <p className="mt-3 text-sm leading-relaxed text-brand-800 sm:text-base">{item.a}</p>
        </details>
      ))}
    </div>
  );
}

export const LANDING_FAQ: FaqItem[] = [
  {
    q: "Do I have to change my phone number?",
    a: "No. You keep the number on your truck and your ads. You turn on conditional call forwarding on your existing line (Verizon *71, AT&T *61, T-Mobile **61, or a portal setting for Google Voice, RingCentral and Grasshopper) so that only the calls you don't answer come to CallCatch. Answer normally and nothing changes.",
  },
  {
    q: "When does the text-back actually turn on?",
    a: "Your text-back turns on when carriers verify your number, typically 3–10 business days after you finish onboarding. We submit the verification for you. From day 0 you still get missed-call alerts, voicemail transcripts and email summaries, and your trial clock and first charge don't start until the texts are live.",
  },
  {
    q: "Is this legal? What about spam rules?",
    a: "We only text people who contacted your business first: they called you, or they submitted your web form with an SMS disclosure. The first text identifies your business and says it's an automated assistant, STOP is honored instantly, HELP returns support info, and automated messages go out between 8 AM and 9 PM in the caller's local time. Each business gets its own carrier-verified number; we never share numbers between customers.",
  },
  {
    q: "Can I take over a conversation?",
    a: "Yes. Every thread lives in a shared inbox. The moment you reply from the inbox or the alert link, the AI pauses on that thread and you're texting as your business. You can hand it back with one tap.",
  },
  {
    q: "I'm a sole proprietor without an EIN. Can I use it?",
    a: "Yes. Toll-free verification requires an EIN, so we put you on a local number registered under the sole-proprietor path instead. Same text-back, same inbox; approval usually takes a few days.",
  },
  {
    q: "What does the caller actually get?",
    a: "A greeting on the call (\"Sorry we missed you — we'll text you in a few seconds. Leave a message after the tone or hang up.\"), then a text from your business within about 10 seconds. The assistant asks what's going on, the address, how urgent it is and a good window, then tells them you'll call. You get an alert with all of it and a one-tap call-back button.",
  },
  {
    q: "Do I need Jobber, Housecall Pro or new software?",
    a: "No. CallCatch is the front door, not the office. On Pro you can add your Jobber, Housecall Pro or Calendly booking link and the assistant will send it when the caller is ready to book. Otherwise you call them back like you always have.",
  },
  {
    q: "What if it doesn't work for my shop?",
    a: "Cancel any time in the customer portal, no contract. If you're not happy in the first 30 days after your first charge, email us and we refund it in full. You can also pause for up to 2 months in the slow season instead of cancelling.",
  },
];

export const PRICING_FAQ: FaqItem[] = [
  {
    q: "When am I charged?",
    a: "On the free trial: never, until carriers verify your number and your text-back is live. We then start your 14-day trial; if you don't cancel before it ends, your card is charged for the plan you picked. Monthly plans renew monthly; annual plans renew yearly.",
  },
  {
    q: "What counts as a conversation?",
    a: "One caller (one phone number) texting with your business within a 24-hour window, however many messages are exchanged. A caller who comes back three days later starts a new conversation. Starter includes 150 a month, Pro includes 500; extra conversations are billed at $0.25 (Starter) or $0.20 (Pro) at the end of the month.",
  },
  {
    q: "Is the done-for-you setup worth it?",
    a: "If you'd rather not touch settings, yes: it's a 20-minute call where we submit carrier verification, write your greeting and AI profile, test forwarding on your line and verify your alert phone. It's $149 once on monthly plans and free on annual.",
  },
  {
    q: "Can I switch plans or pause?",
    a: "Yes, both from the customer portal. Upgrades take effect immediately and are prorated. You can pause for up to 2 months (no charge, texting off) and resume without re-verifying your number.",
  },
  {
    q: "What's the refund policy?",
    a: "30-day money-back on any first payment, no questions asked. Renewals aren't refundable, but you can cancel any time so you're never charged for a period you don't want.",
  },
  {
    q: "Are there carrier or messaging fees on top?",
    a: "No. Carrier pass-through fees, the phone number, the verification filing, voicemail transcription and the AI are all included in the plan price.",
  },
];
