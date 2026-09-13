import type { Metadata } from "next";
import { BadgeCheck, Clock3, ShieldCheck } from "lucide-react";
import { MONEY_BACK_DAYS, TRIAL_DAYS } from "@/lib/plans";
import { Container, Section, SectionHeading } from "@/components/marketing/ui";
import { PricingSection } from "@/components/marketing/PricingSection";
import { Faq, PRICING_FAQ } from "@/components/marketing/Faq";

export const metadata: Metadata = {
  title: "Pricing",
  description: "CallCatch pricing: Starter $79/mo, Pro $149/mo. Annual gets 2 months free and setup included. 14-day trial, card not charged until your text-back is live. 30-day money-back.",
  alternates: { canonical: "/pricing" },
};

export default function PricingPage() {
  return (
    <>
      <Section>
        <Container>
          <SectionHeading
            eyebrow="Pricing"
            title="Simple pricing. One recovered repair pays for the year."
            sub={`No contract, no seats, no per-text fees. ${TRIAL_DAYS}-day trial that only starts when your texting is live. ${MONEY_BACK_DAYS}-day money-back on your first charge.`}
          />
          <div className="mt-10">
            <PricingSection showComparison id="plans" />
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-3">
            {[
              { icon: Clock3, title: "Trial starts when texting is live", body: "Carrier verification takes 3–10 business days. Your card isn't charged and your trial clock doesn't tick until your number is verified." },
              { icon: BadgeCheck, title: `${MONEY_BACK_DAYS}-day money-back`, body: "Not happy in the first 30 days after your first charge? Email us. Full refund, no call required." },
              { icon: ShieldCheck, title: "Cancel or pause any time", body: "Self-serve in the customer portal. Pause up to 2 months in the slow season and keep your number." },
            ].map((t) => (
              <div key={t.title} className="rounded-2xl border border-brand-100 bg-white p-5">
                <t.icon className="h-6 w-6 text-accent-600" aria-hidden="true" />
                <h3 className="mt-3 font-semibold text-brand-900">{t.title}</h3>
                <p className="mt-1 text-sm text-brand-700">{t.body}</p>
              </div>
            ))}
          </div>
        </Container>
      </Section>
      <Section className="bg-white">
        <Container className="max-w-3xl">
          <SectionHeading eyebrow="Pricing FAQ" title="Billing, conversations and refunds." />
          <div className="mt-10">
            <Faq items={PRICING_FAQ} />
          </div>
        </Container>
      </Section>
    </>
  );
}
