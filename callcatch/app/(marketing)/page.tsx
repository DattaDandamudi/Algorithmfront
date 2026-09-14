import { demoFirstTextbackTemplate } from "@/lib/ai/prompts";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  BellRing,
  CalendarCheck,
  Clock3,
  Droplets,
  Flame,
  MessageSquareText,
  Moon,
  PhoneCall,
  PhoneForwarded,
  ShieldCheck,
  Voicemail,
  Zap,
} from "lucide-react";
import { MONEY_BACK_DAYS, TRIAL_DAYS } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { Container, Section, SectionHeading, Eyebrow, buttonClasses } from "@/components/marketing/ui";
import { TrackedLink } from "@/components/marketing/TrackedLink";
import { PhoneFrame, SmsThread, OwnerAlertCard } from "@/components/marketing/PhoneMock";
import { RoiCalculator } from "@/components/marketing/RoiCalculator";
import { PricingSection } from "@/components/marketing/PricingSection";
import { Faq, LANDING_FAQ } from "@/components/marketing/Faq";
import { TRADES } from "@/components/marketing/trades";
import { getDemoNumber } from "@/components/marketing/demo-number";
import { TRIAL_HREF } from "@/components/marketing/site";

export const metadata: Metadata = {
  title: "CallCatch — Every missed call texts back in 10 seconds",
  description:
    "AI front desk for HVAC, plumbing and electrical contractors. When you can't pick up, the caller gets a text in 10 seconds, gets qualified, and lands on your phone as a booking-ready lead. Keep your number. Set up in 10 minutes.",
  alternates: { canonical: "/" },
};

const hvac = TRADES.hvac;

export default function LandingPage() {
  const demo = getDemoNumber();

  return (
    <>
      {/* 1. Hero */}
      <section className="relative overflow-hidden bg-brand-900 text-white">
        <HeroBackdrop />
        <Container className="relative grid items-center gap-12 py-16 sm:py-24 lg:grid-cols-[1.1fr_0.9fr] lg:gap-8">
          <div className="max-w-2xl">
            <Eyebrow tone="light">AI text-back front desk · No number change</Eyebrow>
            <h1 className="mt-4 text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              Every missed call texts back in <span className="text-accent-400">10 seconds.</span>
            </h1>
            <p className="mt-5 text-lg text-brand-100 sm:text-xl">
              AI front desk for HVAC, plumbing and electrical contractors. Keep your number. Set up in 10 minutes. The caller gets a text, gets qualified, and lands on your phone as a booking-ready lead.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <TrackedLink
                href={TRIAL_HREF}
                event="StartTrial"
                dataEvent="hero_start_trial"
                params={{ content_category: "cta_click", plan: "starter" }}
                className={buttonClasses.primary}
              >
                Start {TRIAL_DAYS}-day trial
                <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </TrackedLink>
              <TrackedLink href={demo.tel} event="Lead" dataEvent="hero_call_demo" params={{ content_category: "demo_call" }} className={buttonClasses.secondaryLight}>
                <PhoneCall className="h-5 w-5" aria-hidden="true" />
                Call {demo.formatted} to see it work
              </TrackedLink>
            </div>
            <p className="mt-4 text-sm text-brand-200">
              Call the demo line and <strong className="text-white">don&apos;t answer when we call back.</strong> You&apos;ll get the exact text your customers would get.
              {!demo.configured ? " (Demo line launching soon — number shown is a placeholder.)" : ""}
            </p>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-brand-100">
              {["Card required, not charged until texting is live", `${MONEY_BACK_DAYS}-day money-back`, "Cancel any time"].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <BadgeCheck className="h-4 w-4 text-accent-400" aria-hidden="true" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative">
            <PhoneFrame title={hvac.businessName} subtitle="Automated assistant · texts from the business number" caption={<span>Real conversation shape. Names and addresses are made up.</span>}>
              <SmsThread items={hvac.thread} stepMs={700} />
            </PhoneFrame>
          </div>
        </Container>
      </section>

      {/* 2. Proof strip */}
      <div className="border-b border-brand-100 bg-white">
        <Container className="flex flex-col items-center justify-center gap-2 py-5 text-center sm:flex-row sm:gap-6">
          <p className="text-sm font-semibold text-brand-900">
            <span className="text-2xl font-bold text-accent-600">27–62%</span> of contractor calls go unanswered
          </p>
          <p className="text-xs text-brand-600 sm:text-sm">Invoca 2024 · ServiceTitan 2024. Do the math on your own number below.</p>
        </Container>
      </div>

      {/* 3. How it works */}
      <Section id="how-it-works">
        <Container>
          <SectionHeading eyebrow="How it works" title="Forward your missed calls. That's the whole setup." sub="Three steps. You do the first one once; CallCatch does the other two every time your phone rings and you can't pick up." />
          <ol className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              {
                icon: PhoneForwarded,
                title: "Forward missed calls",
                body: "Turn on conditional forwarding on the number you already have (Verizon *71, AT&T *61, T-Mobile **61). Answered calls never touch us.",
              },
              {
                icon: MessageSquareText,
                title: "The caller gets a text and gets qualified",
                body: "Within 10 seconds of the call ending, the caller gets an on-brand text from your business. The assistant asks what's wrong, where, how urgent, and when they're home.",
              },
              {
                icon: BellRing,
                title: "You get a booking-ready lead",
                body: "Your phone buzzes with the issue, address and window, plus a one-tap \"Call now\". Reply from the inbox any time and the AI steps aside.",
              },
            ].map((s, i) => (
              <li key={s.title} className="relative rounded-3xl border border-brand-100 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-900 text-white">
                    <s.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-600">Step {i + 1}</span>
                </div>
                <h3 className="mt-4 text-lg font-semibold text-brand-900">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-brand-700">{s.body}</p>
              </li>
            ))}
          </ol>
        </Container>
      </Section>

      {/* 4. Live demo block */}
      <Section id="demo" className="bg-white">
        <Container className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <SectionHeading
              align="left"
              eyebrow="Try it on your own phone"
              title={
                <>
                  Call <span className="whitespace-nowrap text-accent-600">{demo.formatted}</span> and don&apos;t answer when we call back.
                </>
              }
              sub="It rings, goes to our greeting, and about 10 seconds later your phone gets the text a homeowner would get. Reply to it and watch the qualification happen. Standard message rates apply; reply STOP any time."
            />
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <TrackedLink href={demo.tel} event="Lead" dataEvent="demo_block_call" params={{ content_category: "demo_call" }} className={buttonClasses.primary}>
                <PhoneCall className="h-5 w-5" aria-hidden="true" />
                Call the demo line
              </TrackedLink>
              <Link href="/demo" className={buttonClasses.secondaryDark}>
                What happens when I call?
              </Link>
            </div>
            <ol className="mt-8 space-y-3 text-sm text-brand-800">
              {[
                "You call, hear a 6-second greeting, and hang up (or leave a voicemail).",
                "About 10 seconds later: a text from the CallCatch demo line, exactly like your customers would get.",
                "Text back like a homeowner would. We'll qualify you and send the summary — you're seeing the owner side too.",
              ].map((t, i) => (
                <li key={t} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-100 text-xs font-bold text-accent-800">{i + 1}</span>
                  <span>{t}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="relative flex justify-center">
            <PulseRing />
            <PhoneFrame title="CallCatch Demo" subtitle={demo.formatted} className="relative">
              <SmsThread
                stepMs={800}
                items={[
                  { kind: "event", text: "You called · we didn't pick up" },
                  {
                    kind: "out",
                    text: demoFirstTextbackTemplate(),
                    time: "9 seconds later",
                  },
                  { kind: "in", text: "Furnace is making a grinding noise and shuts off" },
                  { kind: "out", text: "That sounds like a blower or inducer motor. What's the address, and is anyone home this afternoon?" },
                  { kind: "typing" },
                ]}
              />
            </PhoneFrame>
          </div>
        </Container>
      </Section>

      {/* 5. What the caller sees / what you see */}
      <Section className="bg-brand-50/60">
        <Container>
          <SectionHeading eyebrow="Both sides of the text" title="What the caller sees. What you see." sub="The homeowner gets a calm, on-brand conversation. You get the summary, the address and a button. Nothing to learn." />
          <div className="mt-12 grid gap-10 md:grid-cols-2">
            <div>
              <h3 className="mb-4 text-center text-sm font-semibold uppercase tracking-[0.18em] text-brand-700">The caller&apos;s phone</h3>
              <PhoneFrame title={hvac.businessName} subtitle="Text from the business number">
                <SmsThread items={hvac.thread} animate={false} />
              </PhoneFrame>
            </div>
            <div>
              <h3 className="mb-4 text-center text-sm font-semibold uppercase tracking-[0.18em] text-brand-700">Your phone</h3>
              <PhoneFrame title="CallCatch alerts" subtitle="From our verified notification number">
                <div className="space-y-3">
                  <div className="rounded-2xl border border-brand-100 bg-white p-3 shadow-sm">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-600">Missed call · 2:14 PM</p>
                      <Voicemail className="h-4 w-4 text-brand-500" aria-hidden="true" />
                    </div>
                    <p className="mt-1 text-[13px] text-brand-900">(480) 555-0142 · Voicemail: &ldquo;Hi, my AC is out, can someone come today?&rdquo;</p>
                    <p className="mt-1 text-[11px] text-brand-500">Text-back sent 2:14:09 PM</p>
                  </div>
                  <OwnerAlertCard from="New lead · 2:17 PM" lines={hvac.ownerAlert} animate={false} />
                  <div className="rounded-2xl border border-brand-100 bg-white p-3 shadow-sm">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-600">Monday 7:00 AM · Weekly report</p>
                    <p className="mt-1 text-[13px] text-brand-900">14 missed calls · 11 texted back · 6 booked · ~$3,900 recovered</p>
                  </div>
                </div>
              </PhoneFrame>
            </div>
          </div>
        </Container>
      </Section>

      {/* ROI calculator */}
      <Section id="roi">
        <Container>
          <SectionHeading eyebrow="Do the math" title="Ten missed calls a week is a truck payment." sub="Studies put contractor missed-call rates between 27% and 62%. Slide to your own numbers." />
          <div className="mt-10">
            <RoiCalculator />
          </div>
        </Container>
      </Section>

      {/* Trust / compliance strip */}
      <div className="border-y border-brand-100 bg-white">
        <Container className="grid gap-6 py-10 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: PhoneForwarded, title: "No number change", body: "Forwarding only. Your number stays on the truck, the ads and the reviews." },
            { icon: ShieldCheck, title: "STOP honored instantly", body: "Every first text says it's an automated assistant for your business. STOP ends it. HELP gets help." },
            { icon: Moon, title: "Quiet hours 8 AM – 9 PM", body: "Automated texts only go out in the caller's local daytime. Late calls get a text at 8 AM — and you still get the alert." },
            { icon: Clock3, title: "Only people who called you", body: "We never cold-text. A caller or a form submission with your SMS disclosure is the only way in." },
          ].map((t) => (
            <div key={t.title} className="flex gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-900">
                <t.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-brand-900">{t.title}</h3>
                <p className="mt-1 text-sm text-brand-700">{t.body}</p>
              </div>
            </div>
          ))}
        </Container>
      </div>

      {/* 6. Pricing */}
      <Section id="pricing-section">
        <Container>
          <SectionHeading eyebrow="Pricing" title="$79 a month. One recovered repair pays for the year." sub="Two plans, no contract, no seats. Annual gets two months free and setup included." />
          <div className="mt-10">
            <PricingSection />
          </div>
          <p className="mt-6 text-center text-sm text-brand-700">
            <Link href="/pricing" className="font-medium text-brand-900 underline decoration-brand-300 underline-offset-4 hover:decoration-brand-900">
              See the full comparison and pricing FAQ
            </Link>
          </p>
        </Container>
      </Section>

      {/* 7. Trades */}
      <Section className="bg-brand-900 text-white">
        <Container>
          <SectionHeading tone="light" eyebrow="Built for the trades" title="Trained on your calls, not a generic chatbot." sub="The assistant knows what to ask for each trade — and what not to say (no firm prices, no promises). You edit the profile in two minutes." />
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              { t: TRADES.hvac, icon: Flame },
              { t: TRADES.plumbing, icon: Droplets },
              { t: TRADES.electrical, icon: Zap },
            ].map(({ t, icon: Icon }) => (
              <article key={t.slug} className="flex flex-col rounded-3xl border border-white/10 bg-white/5 p-6">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-500 text-white">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="text-lg font-semibold">{t.name}</h3>
                </div>
                <p className="mt-3 text-sm text-brand-200">Typical ticket: {t.ticketRange}</p>
                <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-accent-300">Sample qualification</p>
                <ul className="mt-2 flex-1 space-y-1.5 text-sm text-brand-50">
                  {t.qualificationQuestions.slice(0, 4).map((q) => (
                    <li key={q} className="flex gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-400" aria-hidden="true" />
                      {q}
                    </li>
                  ))}
                </ul>
                <Link href={`/for/${t.slug}`} className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-accent-300 hover:text-accent-200">
                  CallCatch for {t.name.toLowerCase()} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </article>
            ))}
          </div>
        </Container>
      </Section>

      {/* 8. FAQ */}
      <Section id="faq">
        <Container className="max-w-3xl">
          <SectionHeading eyebrow="FAQ" title="Straight answers." />
          <div className="mt-10">
            <Faq items={LANDING_FAQ} />
          </div>
        </Container>
      </Section>

      {/* 9. Founder note + guarantee */}
      <Section className="bg-white">
        <Container className="max-w-3xl">
          <div className="rounded-3xl border border-brand-100 bg-brand-50/60 p-8 sm:p-10">
            <Eyebrow>A note from the founder</Eyebrow>
            <blockquote className="mt-4 space-y-4 text-base leading-relaxed text-brand-800 sm:text-lg">
              <p>
                I built CallCatch after calling forty contractors&apos; ad numbers at 6:40 on a weeknight. Thirty-one went to voicemail. None texted back. Those weren&apos;t lazy owners — they were under a house, in an attic, or driving. The homeowner just called the next number.
              </p>
              <p>
                This isn&apos;t a suite, a CRM, or a $399-a-month sales call. It&apos;s the text your customers should have been getting all along, and the lead you should have been getting a minute later.
              </p>
            </blockquote>
            <div className="mt-8 flex items-start gap-3 rounded-2xl bg-white p-4 shadow-sm">
              <BadgeCheck className="mt-0.5 h-6 w-6 shrink-0 text-success-500" aria-hidden="true" />
              <div>
                <p className="font-semibold text-brand-900">{MONEY_BACK_DAYS}-day money-back guarantee</p>
                <p className="mt-1 text-sm text-brand-700">
                  If CallCatch doesn&apos;t earn its keep in your first {MONEY_BACK_DAYS} days after your first charge, email us and we refund it in full. No forms, no call.
                </p>
              </div>
            </div>
          </div>
        </Container>
      </Section>

      {/* Final CTA */}
      <section className="relative overflow-hidden bg-brand-900 py-16 text-white sm:py-20">
        <HeroBackdrop />
        <Container className="relative text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Your next missed call is probably today.</h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-brand-100">Ten minutes to set up. Alerts and voicemail transcripts from day 0. Texting turns on the day carriers verify your number.</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <TrackedLink href={TRIAL_HREF} event="StartTrial" dataEvent="footer_start_trial" params={{ content_category: "cta_click", plan: "starter" }} className={buttonClasses.primary}>
              Start {TRIAL_DAYS}-day trial <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </TrackedLink>
            <TrackedLink href={demo.tel} event="Lead" dataEvent="footer_call_demo" params={{ content_category: "demo_call" }} className={buttonClasses.secondaryLight}>
              <PhoneCall className="h-5 w-5" aria-hidden="true" /> Call {demo.formatted}
            </TrackedLink>
          </div>
          <p className="mt-6 flex items-center justify-center gap-2 text-sm text-brand-200">
            <CalendarCheck className="h-4 w-4" aria-hidden="true" /> Prefer a walkthrough? Book the done-for-you setup at checkout and we do it with you on a call.
          </p>
        </Container>
      </section>
    </>
  );
}

/** Subtle radial glow + grid (CSS only, no images). */
function HeroBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-accent-500/20 blur-3xl" />
      <div className="absolute -bottom-40 -right-24 h-[28rem] w-[28rem] rounded-full bg-brand-400/20 blur-3xl" />
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
    </div>
  );
}

function PulseRing() {
  return (
    <div aria-hidden="true" className={cn("absolute left-1/2 top-1/2 -z-0 h-64 w-64 -translate-x-1/2 -translate-y-1/2")}>
      <span className="cc-motion absolute inset-0 animate-[cc-pulse-ring_2.4s_ease-out_infinite] rounded-full border-2 border-accent-300/50" />
      <span className="cc-motion absolute inset-0 animate-[cc-pulse-ring_2.4s_ease-out_1.2s_infinite] rounded-full border-2 border-accent-300/40" />
    </div>
  );
}
