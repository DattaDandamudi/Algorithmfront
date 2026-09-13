import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, H2, P, UL, SampleMessage } from "@/components/marketing/LegalPage";
import { COMPANY_LEGAL_NAME, QUIET_HOURS_LABEL, SUPPORT_EMAIL } from "@/components/marketing/site";

export const metadata: Metadata = {
  title: "SMS Terms",
  description: "CallCatch SMS program terms: what messages are sent, who receives them, how to opt out (STOP), how to get help (HELP), message frequency and quiet hours.",
  alternates: { canonical: "/sms-terms" },
};

export default function SmsTermsPage() {
  return (
    <LegalPage
      title="SMS Terms"
      summary="CallCatch sends text messages on behalf of home-service businesses to people who contacted that business first — by calling it or by submitting its lead form. Reply STOP to stop, HELP for help. Message and data rates may apply. Automated messages are sent between 8 AM and 9 PM in your local time zone."
    >
      <H2 id="program">1. Program description</H2>
      <P>
        CallCatch (operated by {COMPANY_LEGAL_NAME}, &ldquo;we&rdquo;, &ldquo;us&rdquo;) is a missed-call text-back and lead-response service used by HVAC, plumbing, electrical and other home-service contractors (each a &ldquo;Business&rdquo;). When a consumer calls a Business and the call is not answered, or submits the Business&apos;s web or ad lead form that contains an SMS disclosure, CallCatch sends a text message from the Business&apos;s own dedicated phone number to (a) acknowledge the missed call or form, (b) ask conversational questions about the service the consumer needs (for example: what the problem is, the service address, how urgent it is, and a convenient time window), and (c) confirm that the Business will call back or send a booking link. Messages may be composed by an automated assistant (AI) or written by a person at the Business.
      </P>
      <P>
        Each Business uses its own carrier-registered phone number. CallCatch never sends consumer messages from a number shared between Businesses, and never sends marketing, promotional or cold-outreach messages to consumers.
      </P>
      <P>
        CallCatch also operates (i) a <strong>demo line</strong> for prospective customers who call it to experience the service, and (ii) a <strong>notification number</strong> that sends account alerts (missed-call alerts, new-lead alerts, verification codes and weekly reports) to the owner or staff of a Business that has signed up for CallCatch.
      </P>

      <H2 id="consent">2. How consent is obtained (opt-in)</H2>
      <P>Consumers are only messaged after they initiate contact. Specifically, a consumer opts in by one of the following:</P>
      <UL
        items={[
          <>
            <strong>Calling the Business.</strong> The consumer places a call to the Business&apos;s advertised phone number. When the call is not answered, the caller hears a voice greeting stating that the Business missed the call and will text them in a few seconds. The consumer may hang up or leave a voicemail; either way the first text identifies the Business, states that it is an automated assistant, and includes opt-out instructions.
          </>,
          <>
            <strong>Submitting the Business&apos;s lead form.</strong> The consumer submits a website form, Meta (Facebook/Instagram) Instant Form or similar lead form belonging to the Business that includes a disclosure such as: &ldquo;By submitting this form you agree that [Business] may call or text you about your request. Message and data rates may apply. Reply STOP to opt out.&rdquo; Businesses are required by our Terms of Service to include this disclosure on any form connected to CallCatch.
          </>,
          <>
            <strong>Calling the CallCatch demo line.</strong> A prospective customer calls the demo number published on our website next to the words &ldquo;Call this number and don&apos;t answer when we call back.&rdquo; The demo sends a short sample conversation to the calling number only.
          </>,
          <>
            <strong>Signing up for a CallCatch account.</strong> Business owners and staff enter their mobile number in the CallCatch app to receive alerts, verify it with a one-time code, and can change or remove it at any time in Settings.
          </>,
        ]}
      />
      <P>Consent is not a condition of purchasing any goods or services. We store the date, time, phone number and originating channel of each opt-in as evidence of consent.</P>

      <H2 id="samples">3. Sample messages</H2>
      <SampleMessage label="Missed-call text-back (first message to a consumer)">
        {"Hi, this is the automated assistant for Summit Heating & Air — sorry we missed your call! Mike is on a job. What's going on with your system? Reply STOP to opt out."}
      </SampleMessage>
      <SampleMessage label="Qualification (conversational follow-up)">
        {"Got it — warm air with the fan running. What's the address, and is anyone home today between 1 and 5?"}
      </SampleMessage>
      <SampleMessage label="Hand-off / confirmation">
        {"Perfect. I've sent this to Mike and he'll call you in a few minutes to confirm a window. Anything else he should know?"}
      </SampleMessage>
      <SampleMessage label="Lead-form auto-reply (Pro plan)">
        {"Hi Dana, this is the automated assistant for Blue Ridge Plumbing. Thanks for your request about a leaking water heater — Dan will call you shortly. Is the water shut off? Reply STOP to opt out."}
      </SampleMessage>
      <SampleMessage label="Owner alert (to the Business's own staff, from the CallCatch notification number)">
        {"CallCatch: New lead — Sarah (480) 555-0142, 4127 Alder Ct: AC blowing warm, fan runs, home 1–5. Call now: tel:+14805550142 · Thread: https://app.callcatch.co/i/abc123. Reply STOP to stop alerts."}
      </SampleMessage>
      <SampleMessage label="Demo line">
        {"Hi! This is the CallCatch demo line — the automated assistant your customers would get. Pretend you're a homeowner: what's going on at the house? Reply STOP to opt out."}
      </SampleMessage>

      <H2 id="frequency">4. Message frequency</H2>
      <P>
        Message frequency varies by conversation. A typical missed-call conversation is 2 to 6 messages over a few hours. A consumer who has not replied receives at most one reminder message (for example, 20 minutes after the first text) and then nothing further unless they respond or contact the Business again. Business owners and staff receive alert messages when calls are missed or leads arrive, typically 1 to 20 per day depending on call volume, plus one weekly report.
      </P>

      <H2 id="hours">5. Quiet hours</H2>
      <P>
        Automated messages to consumers are sent only between <strong>{QUIET_HOURS_LABEL}</strong>, determined from the area code of the consumer&apos;s number and the Business&apos;s service area. A call missed outside those hours receives the text-back at 8:00 AM the next morning. Replies typed by a person at the Business are not subject to this restriction but are subject to the Business&apos;s own legal obligations.
      </P>

      <H2 id="stop">6. Opting out (STOP)</H2>
      <P>
        Reply <strong>STOP</strong>, <strong>STOPALL</strong>, <strong>UNSUBSCRIBE</strong>, <strong>CANCEL</strong>, <strong>END</strong> or <strong>QUIT</strong> to any message to stop receiving messages from that number. You will receive one final confirmation message (&ldquo;You&apos;ve been unsubscribed from [Business] texts. No more messages will be sent. Reply START to resubscribe.&rdquo;) and nothing further. Opt-outs are honored immediately and apply per Business number. To resume, reply <strong>START</strong> or <strong>UNSTOP</strong>. You can also opt out by emailing <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> with the phone number to remove.
      </P>

      <H2 id="help">7. Help (HELP)</H2>
      <P>
        Reply <strong>HELP</strong> to any message for assistance. You will receive: &ldquo;[Business] texts are powered by CallCatch. For help email {SUPPORT_EMAIL} or visit callcatch.co/sms-terms. Msg&amp;data rates may apply. Reply STOP to opt out.&rdquo; You can also contact us at <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
      </P>

      <H2 id="carriers">8. Carrier disclaimer and costs</H2>
      <P>
        Message and data rates may apply according to your mobile plan. Carriers are not liable for delayed or undelivered messages. Delivery is subject to effective transmission from your carrier and network availability. Supported carriers include all major US carriers (AT&amp;T, T-Mobile, Verizon, US Cellular and their MVNOs); coverage may vary.
      </P>

      <H2 id="ai">9. Automated messages and AI</H2>
      <P>
        Messages sent by CallCatch&apos;s automated assistant are generated by software, including a large language model, based on a profile the Business configured. The first message in every conversation states that it is an automated assistant. The assistant does not quote binding prices, make medical or safety determinations, or enter into contracts on the Business&apos;s behalf. For an emergency involving fire, gas smell, electrical sparking or flooding, call 911 or your utility first.
      </P>

      <H2 id="privacy">10. Privacy</H2>
      <P>
        Your phone number and the content of your messages are used only to respond to your request and to provide the service to the Business you contacted. <strong>No mobile information will be shared with third parties or affiliates for marketing or promotional purposes.</strong> Information sharing to subcontractors in support services, such as customer service, is permitted. All other use-case categories exclude text messaging originator opt-in data and consent; this information will not be shared with any third parties. See our{" "}
        <Link href="/privacy" className="underline">
          Privacy Policy
        </Link>
        .
      </P>

      <H2 id="changes">11. Changes and contact</H2>
      <P>
        We may update these SMS Terms; the date at the top reflects the latest version. Questions: <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. {COMPANY_LEGAL_NAME}, United States.
      </P>
    </LegalPage>
  );
}
