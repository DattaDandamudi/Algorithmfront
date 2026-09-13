import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, BellRing, MessageSquareText, PhoneCall, PhoneForwarded } from "lucide-react";
import { MONEY_BACK_DAYS, PLANS, TRIAL_DAYS } from "@/lib/plans";
import { Container, Section, SectionHeading, Eyebrow, buttonClasses } from "@/components/marketing/ui";
import { TrackedLink } from "@/components/marketing/TrackedLink";
import { PhoneFrame, SmsThread, OwnerAlertCard } from "@/components/marketing/PhoneMock";
import { RoiCalculator } from "@/components/marketing/RoiCalculator";
import { Faq, LANDING_FAQ } from "@/components/marketing/Faq";
import { TRADES, TRADE_SLUGS, isTradeSlug } from "@/components/marketing/trades";
import { getDemoNumber } from "@/components/marketing/demo-number";
import { TRIAL_HREF } from "@/components/marketing/site";

export const dynamicParams = false;

export function generateStaticParams() {
  return TRADE_SLUGS.map((trade) => ({ trade }));
}

export async function generateMetadata({ params }: PageProps<"/for/[trade]">): Promise<Metadata> {
  const { trade } = await params;
  if (!isTradeSlug(trade)) return {};
  const t = TRADES[trade];
  return {
    title: `CallCatch for ${t.name} contractors`,
    description: t.metaDescription,
    alternates: { canonical: `/for/${t.slug}` },
  };
}

export default async function TradePage({ params }: PageProps<"/for/[trade]">) {
  const { trade } = await params;
  if (!isTradeSlug(trade)) notFound();
  const t = TRADES[trade];
  const demo = getDemoNumber();

  return (
    <>
      <section className="bg-brand-900 text-white">
        <Container className="grid items-center gap-12 py-16 sm:py-24 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <Eyebrow tone="light">CallCatch for {t.audience}</Eyebrow>
            <h1 className="mt-4 text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl">{t.headline}</h1>
            <p className="mt-5 text-lg text-brand-100">{t.sub}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <TrackedLink href={TRIAL_HREF} event="StartTrial" dataEvent={`trade_${t.slug}_start_trial`} params={{ content_category: "cta_click", plan: "starter", trade: t.slug }} className={buttonClasses.primary}>
                Start {TRIAL_DAYS}-day trial <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </TrackedLink>
              <TrackedLink href={demo.tel} event="Lead" dataEvent={`trade_${t.slug}_call_demo`} params={{ content_category: "demo_call", trade: t.slug }} className={buttonClasses.secondaryLight}>
                <PhoneCall className="h-5 w-5" aria-hidden="true" /> Call {demo.formatted}
              </TrackedLink>
            </div>
            <p className="mt-6 max-w-xl rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-relaxed text-brand-100">{t.scenario}</p>
          </div>
          <PhoneFrame title={t.businessName} subtitle="Automated assistant · texts from the business number" caption="Sample conversation. Names and addresses are made up.">
            <SmsThread items={t.thread} stepMs={700} />
          </PhoneFrame>
        </Container>
      </section>

      <Section>
        <Container>
          <SectionHeading eyebrow={`Trained for ${t.name.toLowerCase()}`} title="It asks what your dispatcher would ask." sub={`Typical ${t.name.toLowerCase()} ticket: ${t.ticketRange}. The assistant never quotes a firm price and never promises a time — it collects what you need to call back ready.`} />
          <div className="mt-12 grid gap-10 lg:grid-cols-2">
            <div className="rounded-3xl border border-brand-100 bg-white p-6 sm:p-8">
              <h3 className="text-lg font-semibold text-brand-900">Qualification questions</h3>
              <ol className="mt-4 space-y-3">
                {t.qualificationQuestions.map((q, i) => (
                  <li key={q} className="flex gap-3 text-sm text-brand-800 sm:text-base">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-100 text-xs font-bold text-accent-800">{i + 1}</span>
                    {q}
                  </li>
                ))}
              </ol>
              <p className="mt-6 text-sm text-brand-600">{t.seasonalNote}</p>
            </div>
            <div>
              <h3 className="mb-4 text-center text-sm font-semibold uppercase tracking-[0.18em] text-brand-700">What lands on your phone</h3>
              <PhoneFrame title="CallCatch alerts" subtitle="From our verified notification number">
                <div className="space-y-3">
                  <OwnerAlertCard from="New lead" lines={t.ownerAlert} animate={false} />
                  <div className="rounded-2xl border border-brand-100 bg-white p-3 text-[13px] text-brand-900 shadow-sm">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-600">Owner reply from inbox</p>
                    <p className="mt-1">You take over any thread with one tap. The AI steps aside until you hand it back.</p>
                  </div>
                </div>
              </PhoneFrame>
            </div>
          </div>
        </Container>
      </Section>

      <Section className="bg-white">
        <Container>
          <SectionHeading eyebrow="How it works" title="Forward. Text back. Get the lead." />
          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {[
              { icon: PhoneForwarded, title: "Forward missed calls", body: "Verizon *71, AT&T *61, T-Mobile **61. Answered calls never touch CallCatch." },
              { icon: MessageSquareText, title: "Caller gets a text in 10 seconds", body: `An on-brand text from your number that says it's an automated assistant and asks what's going on.` },
              { icon: BellRing, title: "You get the lead", body: "Issue, address, window, urgency and a one-tap call-back. Then a Monday report of what it recovered." },
            ].map((s, i) => (
              <li key={s.title} className="rounded-3xl border border-brand-100 bg-brand-50/50 p-6">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-900 text-white">
                    <s.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-600">Step {i + 1}</span>
                </div>
                <h3 className="mt-4 text-lg font-semibold text-brand-900">{s.title}</h3>
                <p className="mt-2 text-sm text-brand-700">{s.body}</p>
              </li>
            ))}
          </ol>
        </Container>
      </Section>

      <Section>
        <Container>
          <SectionHeading eyebrow="Do the math" title={`What missed ${t.name.toLowerCase()} calls cost you.`} sub={`Defaults use a $${t.avgTicketUsd} blended ticket. Slide to your numbers.`} />
          <div className="mt-10">
            <RoiCalculator defaultTicketUsd={t.avgTicketUsd} />
          </div>
        </Container>
      </Section>

      <Section className="bg-white">
        <Container className="max-w-3xl">
          <SectionHeading eyebrow="FAQ" title="Straight answers." />
          <div className="mt-10">
            <Faq items={LANDING_FAQ} />
          </div>
        </Container>
      </Section>

      <section className="bg-brand-900 py-16 text-center text-white">
        <Container>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            ${PLANS.starter.priceMonthlyUsd} a month. {MONEY_BACK_DAYS}-day money-back.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-brand-100">Alerts and voicemail transcripts from day 0. Texting turns on when carriers verify your number, typically 3–10 business days.</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <TrackedLink href={TRIAL_HREF} event="StartTrial" dataEvent={`trade_${t.slug}_footer_start_trial`} params={{ content_category: "cta_click", plan: "starter", trade: t.slug }} className={buttonClasses.primary}>
              Start {TRIAL_DAYS}-day trial <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </TrackedLink>
            <Link href="/pricing" className={buttonClasses.secondaryLight}>
              See pricing
            </Link>
          </div>
        </Container>
      </section>
    </>
  );
}
