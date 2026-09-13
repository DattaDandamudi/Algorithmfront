import type { Metadata } from "next";
import Link from "next/link";
import { MONEY_BACK_DAYS, SETUP_FEE_USD, TRIAL_DAYS } from "@/lib/plans";
import { LegalPage, H2, P, UL, OL } from "@/components/marketing/LegalPage";
import { COMPANY_LEGAL_NAME, SUPPORT_EMAIL } from "@/components/marketing/site";

export const metadata: Metadata = {
  title: "Refund Policy",
  description: `CallCatch refund policy: ${MONEY_BACK_DAYS}-day money-back on your first payment, no refunds on renewals, cancel or pause any time.`,
  alternates: { canonical: "/refund" },
};

export default function RefundPage() {
  return (
    <LegalPage
      title="Refund Policy"
      summary={`Your first payment — monthly, annual or done-for-you setup — is refundable in full if you ask within ${MONEY_BACK_DAYS} days of the charge. Renewals are not refundable, but you can cancel any time so you're never billed for a period you don't want, and you can pause for up to 2 months in the slow season.`}
    >
      <H2 id="money-back">1. {MONEY_BACK_DAYS}-day money-back on your first payment</H2>
      <P>
        If CallCatch isn&apos;t right for your business, email <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> from your account email within {MONEY_BACK_DAYS} days of your <strong>first</strong> charge and we will refund it in full. This applies to:
      </P>
      <UL
        items={[
          "The first monthly plan payment (Starter or Pro).",
          "The first annual plan payment (Starter or Pro).",
          `The one-time $${SETUP_FEE_USD} done-for-you setup fee, even if the setup call already happened.`,
          "Usage overage charges included on that first invoice.",
        ]}
      />
      <P>No questions, no call required. We may ask what didn&apos;t work so we can fix it, but answering is optional.</P>

      <H2 id="trial">2. The free trial and when charges start</H2>
      <P>
        The self-serve trial is {TRIAL_DAYS} days and starts on the day carriers verify your number and texting turns on — not on the day you sign up. Your card is not charged during the trial. If you cancel from the customer portal before the trial ends you are never charged. If the trial converts, that first charge is covered by the {MONEY_BACK_DAYS}-day guarantee above.
      </P>

      <H2 id="renewals">3. Renewals</H2>
      <P>
        Renewal payments (the second monthly charge onward, or an annual renewal) are not refundable. To avoid a renewal, cancel before the renewal date in the customer portal; your service continues until the end of the period you already paid for. We email annual customers 30 days before an annual renewal.
      </P>

      <H2 id="pause">4. Pause instead of cancelling</H2>
      <P>
        Seasonal business? From the cancel flow you can pause for up to 2 consecutive months. While paused you are not billed, texting is off, your number and settings are kept, and you can resume any time without re-verifying your number.
      </P>

      <H2 id="carrier">5. If carriers reject your number</H2>
      <P>
        If, after our reasonable efforts (including resubmission with corrected information), carriers decline to verify your business number so that texting cannot be enabled, you may cancel for a full refund of every fee paid, regardless of the {MONEY_BACK_DAYS}-day window.
      </P>

      <H2 id="exceptions">6. Exceptions</H2>
      <UL
        items={[
          "Accounts terminated for violating the messaging rules in our Terms of Service (cold outreach, prohibited content, disabling STOP) are not eligible for a refund.",
          "Refunds are made to the original payment method through Stripe, usually within 5–10 business days depending on your bank. We cannot refund to a different card or by check.",
          "Referral credits and promotional credits have no cash value and are not refundable.",
        ]}
      />

      <H2 id="how">7. How to request a refund</H2>
      <OL
        items={[
          <>
            Email <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> with the subject &ldquo;Refund&rdquo; from the email address on your account (or include your business name and the last four digits of the card).
          </>,
          "We confirm within 1 business day and issue the refund through Stripe.",
          "We cancel the subscription at the same time unless you tell us to keep it. Remember to turn off call forwarding with your carrier.",
        ]}
      />
      <P>
        This policy is part of our{" "}
        <Link href="/terms" className="underline">
          Terms of Service
        </Link>
        . {COMPANY_LEGAL_NAME}.
      </P>
    </LegalPage>
  );
}
