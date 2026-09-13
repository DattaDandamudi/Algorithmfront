import Link from "next/link";
import { Logo } from "./Logo";
import { Container } from "./ui";
import { COMPANY_LEGAL_NAME, LEGAL_LINKS, NAV_LINKS, SUPPORT_EMAIL, TRADE_LINKS } from "./site";

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-brand-100 bg-white">
      <Container className="py-12">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="mt-4 max-w-sm text-sm text-brand-700">
              The AI text-back front desk. Every missed call gets a text in 10 seconds, gets qualified, and lands on your phone as a booking-ready lead.
            </p>
            <p className="mt-4 text-sm font-medium text-brand-900">Made for HVAC, plumbing &amp; electrical contractors.</p>
          </div>
          <FooterCol title="Product" links={[...NAV_LINKS, { href: "/signup?plan=starter&interval=month&path=trial", label: "Start free trial" }, { href: "/login", label: "Log in" }]} />
          <FooterCol title="By trade" links={TRADE_LINKS} />
          <FooterCol title="Legal" links={LEGAL_LINKS} />
        </div>
        <div className="mt-10 space-y-3 border-t border-brand-100 pt-6 text-xs leading-relaxed text-brand-600">
          <p>
            <span className="font-semibold text-brand-800">SMS disclosure:</span> CallCatch sends text messages on behalf of the business you called or submitted a form to, and only after you initiated that contact. Message frequency varies by conversation (typically 2–6 messages). Message and data rates may apply. Reply <strong>STOP</strong> to opt out at any time, <strong>HELP</strong> for help. Automated texts are sent between 8 AM and 9 PM in your local time zone. See our{" "}
            <Link href="/sms-terms" className="underline decoration-brand-300 underline-offset-2 hover:text-brand-900">
              SMS Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline decoration-brand-300 underline-offset-2 hover:text-brand-900">
              Privacy Policy
            </Link>
            .
          </p>
          <p>
            © {year} {COMPANY_LEGAL_NAME}. All rights reserved. Questions:{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="underline decoration-brand-300 underline-offset-2 hover:text-brand-900">
              {SUPPORT_EMAIL}
            </a>
            . CallCatch is not affiliated with Jobber, Housecall Pro, ServiceTitan, Podium or any carrier named on this site.
          </p>
        </div>
      </Container>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: ReadonlyArray<{ href: string; label: string }> }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-brand-900">{title}</h3>
      <ul className="mt-3 space-y-2">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="text-sm text-brand-700 hover:text-brand-900 hover:underline">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
