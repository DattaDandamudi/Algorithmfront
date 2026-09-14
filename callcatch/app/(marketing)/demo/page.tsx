import { DEMO_GREETING } from "@/lib/telephony/demoCopy";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, MessageSquareText, PhoneCall, PhoneMissed, ShieldCheck, UserRound } from "lucide-react";
import { TRIAL_DAYS } from "@/lib/plans";
import { Container, Section, SectionHeading, buttonClasses } from "@/components/marketing/ui";
import { TrackedLink } from "@/components/marketing/TrackedLink";
import { PhoneFrame, SmsThread } from "@/components/marketing/PhoneMock";
import { getDemoNumber } from "@/components/marketing/demo-number";
import { TRIAL_HREF } from "@/components/marketing/site";

export const metadata: Metadata = {
  title: "Live demo line",
  description: "Call the CallCatch demo line, don't answer when we call back, and get the exact text your customers would get in about 10 seconds.",
  alternates: { canonical: "/demo" },
};

export default function DemoPage() {
  const demo = getDemoNumber();
  return (
    <>
      <section className="bg-brand-900 text-white">
        <Container className="py-16 text-center sm:py-24">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-300">Live demo line · free · takes 60 seconds</p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">Call this number. Don&apos;t answer when we call back.</h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-brand-100">This is exactly what a homeowner gets when you can&apos;t pick up. No signup, no sales call — just your phone.</p>
          <div className="mt-10">
            <TrackedLink
              href={demo.tel}
              event="Lead"
              dataEvent="demo_page_call"
              params={{ content_category: "demo_call" }}
              className="inline-flex flex-col items-center gap-1 rounded-3xl bg-accent-500 px-8 py-6 text-white shadow-lg transition hover:bg-accent-600 focus:outline-none focus-visible:ring-4 focus-visible:ring-accent-300 sm:flex-row sm:gap-4 sm:px-10"
              ariaLabel={`Call the demo line at ${demo.formatted}`}
            >
              <PhoneCall className="h-8 w-8" aria-hidden="true" />
              <span className="text-3xl font-bold tabular-nums tracking-tight sm:text-5xl">{demo.formatted}</span>
            </TrackedLink>
          </div>
          {!demo.configured ? (
            <p className="mx-auto mt-5 max-w-md rounded-xl bg-white/10 px-4 py-2 text-sm text-brand-100">
              The demo line is being verified by carriers right now. The number above is a placeholder — book the free setup call instead and we&apos;ll demo it on your own line.
            </p>
          ) : (
            <p className="mt-5 text-sm text-brand-200">Standard call and message rates apply. Reply STOP to the demo text at any time. We won&apos;t call you back to sell — the only text you get is the demo.</p>
          )}
        </Container>
      </section>

      <Section>
        <Container className="grid items-start gap-12 lg:grid-cols-2">
          <div>
            <SectionHeading align="left" eyebrow="What happens next" title="Sixty seconds, start to finish." />
            <ol className="mt-8 space-y-6">
              {[
                {
                  icon: PhoneMissed,
                  title: "You call. We answer with a 6-second greeting.",
                  body: `"${DEMO_GREETING.join(" ")}" Hang up or leave a voicemail; both work.`,
                },
                {
                  icon: MessageSquareText,
                  title: "About 10 seconds later, a text arrives.",
                  body: "From the demo line, identifying itself as an automated assistant, asking what's going on at the house. Reply like a homeowner would — \"AC is blowing warm\", \"water heater leaking\", \"half the outlets are dead\".",
                },
                {
                  icon: UserRound,
                  title: "Get qualified, then see the owner's side.",
                  body: "The assistant asks the address, urgency and a window, then texts you the summary the contractor would receive — issue, address, best time, one-tap call back. That's the whole product.",
                },
              ].map((s, i) => (
                <li key={s.title} className="flex gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-900 text-white">
                    <s.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-600">Step {i + 1}</p>
                    <h3 className="mt-1 font-semibold text-brand-900">{s.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-brand-700">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-8 flex items-start gap-3 rounded-2xl border border-brand-100 bg-white p-4 text-sm text-brand-800">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-success-500" aria-hidden="true" />
              <p>
                You&apos;re opting in by calling. We store your number and the demo thread so we can show you the owner view, and delete them on request (see Data Deletion). We don&apos;t add you to any list. Full details in the{" "}
                <Link href="/sms-terms" className="underline decoration-brand-300 underline-offset-2">
                  SMS Terms
                </Link>
                .
              </p>
            </div>
          </div>
          <div className="flex justify-center">
            <PhoneFrame title="CallCatch Demo" subtitle={demo.formatted} caption="What your phone will show. Reply and it keeps going.">
              <SmsThread
                stepMs={800}
                items={[
                  { kind: "event", text: "Missed call to the demo line" },
                  {
                    kind: "out",
                    text: "Hi! This is the CallCatch demo line — the automated assistant your customers would get. Pretend you're a homeowner: what's going on at the house? Reply STOP to opt out.",
                    time: "9 seconds later",
                  },
                  { kind: "in", text: "No hot water since last night" },
                  { kind: "out", text: "Sorry to hear that. Is the water heater gas or electric, and is anything leaking around it?" },
                  { kind: "in", text: "Gas, no leak that I can see" },
                  { kind: "out", text: "Got it. What's the address, and when is someone home today?" },
                  { kind: "in", text: "19 Cedar Rd. Home after 3" },
                  { kind: "out", text: "Thanks! Here's what the contractor would see right now:\n\nNew lead · 19 Cedar Rd · gas WH, no hot water, no visible leak · home after 3 · [Call now]\n\nWant this on your own line? Start a free trial: callcatch.co/signup" },
                ]}
              />
            </PhoneFrame>
          </div>
        </Container>
      </Section>

      <Section className="bg-white">
        <Container className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-brand-900">Liked what you got? Put it on your own number.</h2>
          <p className="mx-auto mt-3 max-w-xl text-brand-700">Ten-minute setup, forwarding code from your carrier, alerts from day 0. Texting turns on when carriers verify your number (3–10 business days).</p>
          <div className="mt-8 flex justify-center">
            <TrackedLink href={TRIAL_HREF} event="StartTrial" dataEvent="demo_page_start_trial" params={{ content_category: "cta_click", plan: "starter" }} className={buttonClasses.primary}>
              Start {TRIAL_DAYS}-day trial <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </TrackedLink>
          </div>
        </Container>
      </Section>
    </>
  );
}
