import { Sparkles } from 'lucide-react';

interface LandingFooterProps {
  onCrafted?: () => void;
}

export default function LandingFooter({ onCrafted }: LandingFooterProps) {
  return (
    <footer className="relative bg-[#08080a] text-stone-400 border-t border-stone-50/10">
      <div className="max-w-7xl mx-auto px-6 sm:px-10 py-14">
        <div className="grid md:grid-cols-[1.4fr_1fr_1fr_1fr] gap-10">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-rose-400 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <span className="text-[15px] font-semibold tracking-tight text-stone-100">Algoritm</span>
            </div>
            <p className="mt-4 text-[13px] leading-relaxed max-w-sm">
              The voice agent for restaurants — multilingual, always on, and fluent in your guests'
              language from the very first ring.
            </p>
          </div>

          <FooterColumn
            title="Product"
            links={[
              { label: 'Features', href: '#features' },
              { label: 'Languages', href: '#languages' },
              { label: 'How it works', href: '#how' },
              { label: 'Pricing', href: '#waitlist' },
            ]}
          />

          <FooterColumn
            title="Company"
            links={[
              { label: 'About', href: '#' },
              { label: 'Crafted by', onClick: onCrafted },
              { label: 'Careers', href: '#' },
              { label: 'Contact', href: '#' },
            ]}
          />

          <FooterColumn
            title="Legal"
            links={[
              { label: 'Terms', href: '#' },
              { label: 'Privacy', href: '#' },
              { label: 'Security', href: '#' },
              { label: 'Status', href: '#' },
            ]}
          />
        </div>

        <div className="mt-12 pt-6 border-t border-stone-50/10 flex flex-wrap items-center justify-between gap-4 text-[12px]">
          <span>© {new Date().getFullYear()} Algoritm. All rights reserved.</span>
          <span className="text-stone-500">
            Crafted for hospitality · Speaks 80+ languages
          </span>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { label: string; href?: string; onClick?: () => void }[];
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.2em] text-stone-500 mb-4">{title}</div>
      <ul className="space-y-2.5">
        {links.map((l) => (
          <li key={l.label}>
            {l.onClick ? (
              <button
                type="button"
                onClick={l.onClick}
                className="text-[13px] text-stone-300 hover:text-amber-300 transition-colors"
              >
                {l.label}
              </button>
            ) : (
              <a
                href={l.href}
                className="text-[13px] text-stone-300 hover:text-amber-300 transition-colors"
              >
                {l.label}
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
