import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, H2, P, UL, OL } from "@/components/marketing/LegalPage";
import { COMPANY_LEGAL_NAME, PRIVACY_EMAIL, SUPPORT_EMAIL } from "@/components/marketing/site";

export const metadata: Metadata = {
  title: "Data Deletion",
  description: "How to request deletion of your data from CallCatch — for business customers, for people who called or texted a business using CallCatch, and for Facebook/Meta users.",
  alternates: { canonical: "/data-deletion" },
};

export default function DataDeletionPage() {
  return (
    <LegalPage
      title="Data Deletion Requests"
      summary="Anyone can ask us to delete their personal information. Business customers email us from their account address and we delete the whole account; callers and leads can email us or reply STOP; Meta users whose lead-form data reached CallCatch through a business's Facebook Page can use the process below. We confirm within 3 business days and complete deletion within 30 days."
    >
      <H2 id="customers">1. Business customers (account owners and staff)</H2>
      <P>
        Account deletion is handled by our team, not by a button in the app: email{" "}
        <a className="underline" href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a> from the email address you log in with, with the subject &ldquo;Delete my account&rdquo;. Then:
      </P>
      <OL
        items={[
          "Turn off call forwarding with your carrier first, otherwise your missed calls will ring a disconnected number. (To stop only the alerts or the weekly report while keeping your account, use Settings → Alerts.)",
          "We reply within 3 business days to confirm the request came from the account owner.",
          "We cancel any active subscription (no further charges), release your CallCatch number to the carrier after 30 days, and delete your account, staff logins, business profile, calls, messages, voicemails, transcripts, leads and reports within 30 days of the request.",
          "We retain: invoices and payment records for 7 years (tax law); text-message consent and opt-out records for 4 years (carrier and TCPA requirements), in a form that is not linked to your business profile; and security logs for 12 months.",
        ]}
      />

      <H2 id="callers">2. People who called, texted or submitted a form to a business</H2>
      <P>
        If you contacted a business that uses CallCatch, the business is the controller of your data and we process it on its behalf. You can:
      </P>
      <UL
        items={[
          <>
            <strong>Stop messages:</strong> reply <strong>STOP</strong> to any text. This is honored immediately and stored as an opt-out.
          </>,
          <>
            <strong>Request deletion:</strong> email <a className="underline" href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a> with the phone number (or email address) you used and, if you know it, the name of the business you contacted. We forward the request to the business and delete your call records, messages, voicemail audio, transcripts and lead details within 30 days, unless the business objects with a lawful reason (for example an open job or dispute) — in which case we tell you and the business handles the request directly. If the business does not respond within 10 days we act on your request.
          </>,
          <>
            <strong>What we keep:</strong> the phone number and timestamp of your STOP request so we never text you again, and a minimal consent record (number, time, channel) for 4 years as carrier rules require. Nothing else about you is retained.
          </>,
        ]}
      />

      <H2 id="meta">3. Facebook / Meta users (lead forms)</H2>
      <P>
        If you submitted a Facebook or Instagram lead form belonging to a business, and that business connected its Page to CallCatch, your form answers (name, phone, email, trade-related questions) were delivered to CallCatch to send you a text reply on the business&apos;s behalf. To delete that data:
      </P>
      <OL
        items={[
          <>
            Email <a className="underline" href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a> with the subject &ldquo;Meta data deletion&rdquo;, the phone number or email you entered on the form, and the business or Page name if you remember it.
          </>,
          "We reply within 3 business days with a confirmation code and delete the lead record, messages and any derived summaries within 30 days.",
          "You can also remove CallCatch's access via your Facebook Settings → Apps and Websites, which stops any further data from reaching us; existing records are deleted through the email process above.",
        ]}
      />
      <P>
        Businesses that connected their Page can disconnect it at any time in Settings → Lead sources, which revokes our access token and stops all lead delivery immediately.
      </P>

      <H2 id="demo">4. Demo line callers</H2>
      <P>
        If you called our demo line, we keep your number and the demo thread only so we can show you the owner&apos;s view of the demo. Reply STOP to the demo text or email <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> and we delete both within 30 days of your request.
      </P>

      <H2 id="subprocessors">5. Deletion at our service providers</H2>
      <P>
        When we delete data we also delete or instruct deletion at the providers that hold copies: Supabase (database and storage), Twilio (call and message logs, recordings), Deepgram (transcription requests are not retained), Anthropic (API inputs are not retained for training and are deleted per their retention policy), Resend (email logs) and Stripe (only what tax law requires us to keep). Backups are rotated within 35 days.
      </P>

      <H2 id="verify">6. Verifying your request</H2>
      <P>
        To protect people&apos;s data we verify requests: account owners must email from the address they log in with; callers must email from, or reply from, the phone number or email address on record, or answer a confirmation text we send to that number. We will not delete data based on a request we cannot verify, and we will tell you why.
      </P>

      <H2 id="timeline">7. Timeline and confirmation</H2>
      <UL
        items={[
          "Acknowledgement: within 3 business days.",
          "Completion: within 30 days (45 days for complex requests, with notice).",
          "Confirmation: an email stating what was deleted and what was retained under law, with a reference number you can cite later.",
        ]}
      />
      <P>
        Questions about this process: <a className="underline" href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>. See also our{" "}
        <Link href="/privacy" className="underline">
          Privacy Policy
        </Link>
        . {COMPANY_LEGAL_NAME}.
      </P>
    </LegalPage>
  );
}
