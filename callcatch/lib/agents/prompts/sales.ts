/**
 * Outreach sequence templates (v1). The outreach agent personalizes these; the executor appends the
 * CAN-SPAM footer. Merge fields: {{business_name}}, {{first_name}}, {{city}}, {{review_count}},
 * {{missed_calls_estimate}}, {{demo_number}}, {{trial_url}}, {{founder_name}}.
 */
export type SequenceStep = { step: number; dayOffset: number; subjects: string[]; body: string; goal: string };

export const SEQUENCE_V1: SequenceStep[] = [
  {
    step: 1,
    dayOffset: 0,
    subjects: ["the calls {{business_name}} misses", "quick one about missed calls, {{first_name}}"],
    goal: "Earn a reply or a call to the demo line. One idea, one number, one ask.",
    body: `Hi {{first_name}},

I run CallCatch. We text back every call {{business_name}} misses within 10 seconds, ask the caller what's going on, where, and how urgent, and put a booking-ready lead in your texts. No new number, forwarding takes 10 minutes.

Contractors your size miss roughly {{missed_calls_estimate}} calls a month (27-62% of inbound calls go unanswered in the trades). At a $350 repair, one recovered call pays for a year.

Want to see it? Call {{demo_number}} from your cell and don't answer when we call back. You'll get the text your customers would get.

{{founder_name}}
CallCatch · $79/mo, no contract, 30-day money-back`,
  },
  {
    step: 2,
    dayOffset: 3,
    subjects: ["re: the calls {{business_name}} misses", "what the text-back actually says"],
    goal: "Show, don't tell: paste the real first text and the qualification flow.",
    body: `{{first_name}}, here's exactly what a caller gets when {{business_name}} can't pick up:

"Hi, this is the automated assistant for {{business_name}}. Sorry we missed your call - what's going on with your heating or cooling? Reply STOP to opt out."

Then it asks the address, how urgent, and a good time window, and you get: "Missed call from (555) 123-4567 - AC not cooling, 78704, wants today, tap to call back."

If you use Jobber or Housecall Pro: their text-back sends one sentence and stops. Ours books the job.

Demo line: {{demo_number}}. Or start a 14-day trial: {{trial_url}}

{{founder_name}}`,
  },
  {
    step: 3,
    dayOffset: 7,
    subjects: ["the math for {{business_name}}", "$79 vs one missed install"],
    goal: "ROI framing with their own numbers; offer the 20-minute done-for-you setup call.",
    body: `{{first_name}}, quick math with {{business_name}}'s numbers ({{review_count}} reviews suggests a steady phone):

- {{missed_calls_estimate}} missed calls a month, say 25% would have booked, $350 average ticket = real money left in voicemail every month.
- CallCatch is $79/month. Text-back, qualification, owner alerts, weekly "calls recovered" report.

I'll set it up with you on a 20-minute call: forwarding, greeting, your service list, alert phone. You hang up live.

Reply "call me" with a good time, or book here: {{booking_url}}

{{founder_name}}`,
  },
  {
    step: 4,
    dayOffset: 14,
    subjects: ["closing the loop", "should I stop emailing, {{first_name}}?"],
    goal: "Polite close; make it easy to say no; leave the door open.",
    body: `{{first_name}}, I'll stop here so I'm not clutter in your inbox.

If missed calls are a real leak at {{business_name}}, the demo line is always on: {{demo_number}}. If they're not, no worries at all.

Either way, thanks for the work you do. Every AC I've ever had fixed was by someone who picked up when it mattered.

{{founder_name}}`,
  },
];

export const CALL_SCRIPT_V1 = `[Business landline, 90 seconds]
"Hi, this is {{founder_name}} with CallCatch, a small software company. Is this the owner? ... Quick reason for the call: when your line goes to voicemail, we text the caller back in 10 seconds, ask what's wrong and where, and send you a lead you can call back. It's $79 a month, no contract. Can I show you in 30 seconds? Call your own number from your cell right now and don't pick up..."
Objections: already have an answering service -> "Keep it; we're the safety net for the calls they miss and nights." Robocalls -> "We only text people who called you first, and STOP is honored instantly." Price -> "One recovered $350 repair covers a year." Verification delay -> "Alerts and voicemail transcripts work day one; texting turns on when carriers verify your number, 3-10 business days, and you don't pay until then." "Send me info" -> "Sure - what's the best email? I'll include the demo line so you can hear it yourself."
Voicemail (<20s): "Hi, {{founder_name}} from CallCatch. We text back the calls you miss and book the job. Call {{demo_number}} and hang up when we call back to see it. My number is {{callback_number}}."`;

export function missedCallsEstimate(reviewCount: number | null | undefined): number {
  // Heuristic: review count ~ 1-2% of jobs/yr; missed calls ~ 25-40% of inbound. Conservative.
  if (!reviewCount || reviewCount < 10) return 15;
  if (reviewCount < 50) return 25;
  if (reviewCount < 150) return 40;
  if (reviewCount < 400) return 60;
  return 80;
}
