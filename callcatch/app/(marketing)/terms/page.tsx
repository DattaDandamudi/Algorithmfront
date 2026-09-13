import type { Metadata } from "next";
import Link from "next/link";
import { MONEY_BACK_DAYS, PLANS, SETUP_FEE_USD, TRIAL_DAYS } from "@/lib/plans";
import { LegalPage, H2, P, UL } from "@/components/marketing/LegalPage";
import { COMPANY_LEGAL_NAME, LEGAL_ADDRESS, QUIET_HOURS_LABEL, SUPPORT_EMAIL } from "@/components/marketing/site";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The agreement between CallCatch and the businesses that use it: the service, your responsibilities for consent and forwarding, billing, refunds, acceptable use and liability.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      summary="Plain-language summary: CallCatch texts back your missed calls and lead forms from a phone number registered to your business. You keep your existing number and forward missed calls to us. You're responsible for only connecting lead sources that carry an SMS disclosure. Billing is monthly or annual, you can cancel any time, and your first payment is refundable for 30 days."
    >
      <H2 id="agreement">1. The agreement</H2>
      <P>
        These Terms of Service (&ldquo;Terms&rdquo;) are a contract between {COMPANY_LEGAL_NAME} (&ldquo;CallCatch&rdquo;, &ldquo;we&rdquo;) and the business that creates an account (&ldquo;you&rdquo;, the &ldquo;Business&rdquo;). By creating an account, clicking &ldquo;I agree&rdquo;, or using the service you accept these Terms, our{" "}
        <Link href="/privacy" className="underline">
          Privacy Policy
        </Link>
        ,{" "}
        <Link href="/sms-terms" className="underline">
          SMS Terms
        </Link>{" "}
        and{" "}
        <Link href="/refund" className="underline">
          Refund Policy
        </Link>
        . The person accepting confirms they are authorized to bind the Business. CallCatch is for businesses only; it is not offered to consumers.
      </P>

      <H2 id="service">2. What CallCatch does</H2>
      <P>
        CallCatch provides a dedicated phone number registered to your Business, a voice greeting and voicemail for calls forwarded to that number, automated and human-typed SMS conversations with the people who called or submitted your lead forms, voicemail transcription, alerts to your staff, a shared inbox, weekly reports, and — on the Pro plan — lead-form intake, booking hand-off, after-hours routing and advertising conversion pass-back. Features by plan are listed on our{" "}
        <Link href="/pricing" className="underline">
          pricing page
        </Link>
        . We may add, change or remove features; we will not remove a core feature of your plan during a paid term without offering a refund for the remainder.
      </P>

      <H2 id="numbers">3. Phone numbers and carrier verification</H2>
      <UL
        items={[
          "You keep your existing business number. You enable conditional call forwarding on it so that unanswered calls are delivered to your CallCatch number. You are responsible for enabling and disabling forwarding with your carrier and for any charges your carrier applies.",
          "The CallCatch number is registered to your Business with US carriers (toll-free verification, or 10DLC sole-proprietor registration for businesses without an EIN). You authorize us to submit your business name, address, EIN, website and use-case description to carriers and their registries for that purpose, and you warrant that this information is accurate.",
          "Outbound texting from your number begins only after carriers approve the registration, typically 3–10 business days. Until then the service delivers greetings, voicemail, transcripts and staff alerts. We cannot guarantee carrier approval or timing; if carriers reject your registration after our reasonable efforts, you may cancel for a full refund of any fees paid.",
          "Numbers remain the property of CallCatch and our carrier partners. If you cancel, we release the number 30 days later; you may request to port it out during that window at our then-current fee.",
        ]}
      />

      <H2 id="consent">4. Your consent and messaging obligations</H2>
      <P>Text messaging is regulated (including by the TCPA, the CAN-SPAM Act, state laws and CTIA and carrier rules). You agree that:</P>
      <UL
        items={[
          "CallCatch will only message people who called your Business or submitted a lead form of yours. You will not upload contact lists, forward calls from purchased leads, or use the service for cold outreach, marketing blasts or political or charitable solicitation.",
          "Any web form, ad form or other lead source you connect to CallCatch will display, adjacent to the submit button, a disclosure substantially like: \"By submitting this form you agree that [Business] may call or text you about your request. Message and data rates may apply. Reply STOP to opt out.\" We may disconnect lead sources that lack it.",
          `You will not ask us to disable STOP/HELP handling, the automated-assistant disclosure in the first message, or quiet hours (${QUIET_HOURS_LABEL}). Messages you type yourself from the inbox are your responsibility and must comply with the same laws.`,
          "You will not send or ask the assistant to send content that is illegal, deceptive, harassing, sexually explicit, related to controlled substances, firearms, gambling, high-risk financial products, or otherwise prohibited by carrier rules (SHAFT). Doing so can get your number blocked by carriers and is grounds for immediate termination.",
          "You are responsible for the accuracy of the business profile the assistant uses (services, hours, things never to say) and for reviewing conversations. The assistant is a tool; it does not make commitments on your behalf and can make mistakes.",
          "You will keep the voice greeting informational (a missed-call notice), not a sales pitch, and will obtain any consent required by law before recording calls in your state.",
        ]}
      />

      <H2 id="ai">5. Automated assistant</H2>
      <P>
        Replies and summaries are generated by software using a large language model. We design the assistant to identify itself, collect job details, avoid quoting firm prices and avoid safety or medical determinations, but its output is probabilistic and may be inaccurate. You must not rely on it for legal, safety or contractual commitments. You own the conversation content; you grant us a license to process it to provide the service, to improve prompts in aggregate and de-identified form, and as required by law. We do not use your data to train third-party models.
      </P>

      <H2 id="billing">6. Plans, trials and billing</H2>
      <UL
        items={[
          `Plans: Starter ($${PLANS.starter.priceMonthlyUsd}/month or $${PLANS.starter.priceAnnualUsd}/year) and Pro ($${PLANS.pro.priceMonthlyUsd}/month or $${PLANS.pro.priceAnnualUsd}/year). Prices are in US dollars and exclude any applicable taxes.`,
          `Included usage: ${PLANS.starter.includedConversations} conversations/month on Starter and ${PLANS.pro.includedConversations} on Pro. A conversation is one contact's thread within a 24-hour window. Additional conversations are billed at $${PLANS.starter.overagePerConversationUsd.toFixed(2)} (Starter) or $${PLANS.pro.overagePerConversationUsd.toFixed(2)} (Pro) each, added to the next invoice.`,
          `Self-serve free trial: ${TRIAL_DAYS} days. A payment method is required. The trial period begins on the day carriers verify your number and outbound texting turns on; until then you are not charged. If you do not cancel before the trial ends, the plan you selected is charged automatically.`,
          "Pay-now purchases (for example after a demo call): monthly plans are charged when your number is verified, with the billing cycle anchored to that date; annual plans and the done-for-you setup fee are charged at purchase, and the annual term starts on the verification date.",
          `Done-for-you setup: an optional one-time fee of $${SETUP_FEE_USD} on monthly plans (included with annual plans) for a guided onboarding call.`,
          "Renewal: subscriptions renew automatically at the then-current price for your plan until cancelled. We will give at least 30 days' notice by email before any price increase takes effect on renewal.",
          "Cancellation and pause: cancel or pause (up to 2 consecutive months) at any time from the customer portal. Cancellation takes effect at the end of the current billing period; there are no partial-period refunds except as stated in the Refund Policy.",
          "Payments are processed by Stripe. You authorize us to charge your payment method for the fees above. If a payment fails we will retry and email you; after 14 days of non-payment we may suspend texting and after 30 days close the account.",
        ]}
      />

      <H2 id="refunds">7. Refunds</H2>
      <P>
        Your first payment on any plan is refundable in full on request within {MONEY_BACK_DAYS} days of the charge. Renewal payments are not refundable. See the{" "}
        <Link href="/refund" className="underline">
          Refund Policy
        </Link>{" "}
        for how to request one.
      </P>

      <H2 id="referrals">8. Referrals</H2>
      <P>
        If a business you refer becomes a paying customer, both of you receive one month of service credit. Credits are applied to the next invoice, have no cash value, and may be withheld for self-referrals or abuse.
      </P>

      <H2 id="account">9. Your account</H2>
      <P>
        You are responsible for keeping login credentials confidential and for everything done under your account, including by staff you invite. Notify us immediately at <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> of unauthorized use. You must provide accurate business information and keep it current; carriers can suspend numbers registered with inaccurate information.
      </P>

      <H2 id="acceptable">10. Acceptable use</H2>
      <P>
        You will not: resell the service; use it for anyone other than your own Business; probe, scan or disrupt our systems; reverse engineer the service; use it in violation of any law; or use it to send messages to people who have opted out. We may suspend service immediately if we reasonably believe your use threatens the service, other customers, carrier relationships or the public, and will tell you why.
      </P>

      <H2 id="ip">11. Intellectual property</H2>
      <P>
        CallCatch and its software, design, prompts and content are owned by us and our licensors. We grant you a limited, non-exclusive, non-transferable license to use the service during your subscription. You own your business data and the content of your conversations. Feedback you send us may be used without obligation.
      </P>

      <H2 id="warranty">12. Disclaimers</H2>
      <P>
        THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo;. WE DO NOT WARRANT THAT MESSAGES WILL BE DELIVERED, THAT CALLS WILL BE FORWARDED, THAT THE ASSISTANT WILL BE ACCURATE, OR THAT YOU WILL BOOK ANY PARTICULAR NUMBER OF JOBS OR EARN ANY REVENUE. ESTIMATES OF &ldquo;REVENUE RECOVERED&rdquo; IN REPORTS ARE CALCULATED FROM YOUR OWN INPUTS AND ARE NOT A PROMISE. TO THE FULLEST EXTENT PERMITTED BY LAW WE DISCLAIM ALL IMPLIED WARRANTIES, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NON-INFRINGEMENT. Carrier delivery, phone networks and third-party services are outside our control.
      </P>

      <H2 id="liability">13. Limitation of liability</H2>
      <P>
        TO THE FULLEST EXTENT PERMITTED BY LAW, NEITHER PARTY WILL BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL OR PUNITIVE DAMAGES, OR LOST PROFITS OR REVENUE, ARISING OUT OF THESE TERMS, EVEN IF ADVISED OF THE POSSIBILITY. OUR TOTAL LIABILITY FOR ALL CLAIMS IN ANY 12-MONTH PERIOD IS LIMITED TO THE FEES YOU PAID US IN THAT PERIOD. These limits do not apply to your indemnification obligations, either party&apos;s gross negligence or willful misconduct, or liabilities that cannot be limited by law.
      </P>

      <H2 id="indemnity">14. Indemnification</H2>
      <P>
        You will defend and indemnify CallCatch against third-party claims, fines and carrier penalties arising from your breach of Section 4 (consent and messaging obligations), your lead sources lacking the required disclosure, messages you or your staff typed, or inaccurate business information you provided for carrier registration.
      </P>

      <H2 id="termination">15. Term and termination</H2>
      <P>
        These Terms apply while you have an account. You may close your account at any time from the customer portal. We may terminate for material breach that is not cured within 10 days of notice, or immediately for the conduct described in Sections 4 and 10. On termination, texting stops, forwarding should be disabled by you with your carrier, and your data is handled as described in the Privacy Policy and the{" "}
        <Link href="/data-deletion" className="underline">
          Data Deletion
        </Link>{" "}
        page. Sections 5, 11–14 and 16–17 survive termination.
      </P>

      <H2 id="disputes">16. Governing law and disputes</H2>
      <P>
        These Terms are governed by the laws of the State of Wyoming and applicable US federal law, without regard to conflict-of-law rules. Before filing any claim, the parties will try in good faith to resolve it by email within 30 days. Either party may bring a claim in small-claims court. Otherwise, claims will be resolved by binding individual arbitration administered by the American Arbitration Association under its Commercial Rules, with the hearing held remotely or in Wyoming; class actions and class arbitrations are waived. You may opt out of arbitration by emailing us within 30 days of first accepting these Terms.
      </P>

      <H2 id="general">17. General</H2>
      <P>
        These Terms are the entire agreement between us about the service and supersede any prior discussions. If any part is unenforceable, the rest remains in effect. Neither party is liable for delays caused by events beyond its reasonable control (carrier outages, natural disasters, government action). You may not assign these Terms without our consent; we may assign them to a successor. Notices to you go to your account email; notices to us go to <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. We may update these Terms with 30 days&apos; notice by email or in-app; continued use after that date is acceptance. {COMPANY_LEGAL_NAME}, {LEGAL_ADDRESS}.
      </P>
    </LegalPage>
  );
}
