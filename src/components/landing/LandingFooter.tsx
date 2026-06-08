import { Sparkles, Globe, Heart } from 'lucide-react';
import { useScrollReveal } from './scroll';

interface LandingFooterProps {
  onCrafted?: () => void;
}

export default function LandingFooter({ onCrafted }: LandingFooterProps) {
  const wordmarkRef = useScrollReveal<HTMLDivElement>();

  return (
    <footer className="relative bg-[#08080a] text-stone-400 border-t border-stone-50/10 overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/30 to-transparent" />
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[80%] h-40 bg-amber-500/[0.08] mobile-blur-light sm:blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-stone-50/[0.06] to-transparent" />

      <div className="relative max-w-7xl mx-auto px-5 sm:px-10 py-12 sm:py-20">
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-[1.4fr_1fr_1fr_1fr] gap-8 sm:gap-12">
          <div className="col-span-2 sm:col-span-2 md:col-span-1">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-rose-400 flex items-center justify-center shadow-[0_6px_24px_rgba(251,113,133,0.35)]">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <span className="text-[15px] font-semibold tracking-tight text-stone-100">Algoritm</span>
            </div>
            <p className="mt-4 text-[13px] leading-relaxed max-w-sm">
              The voice agent for restaurants — multilingual, always on, and fluent in your guests'
              language from the very first ring.
            </p>
            <div className="mt-5 flex items-center gap-3 text-[11px] tracking-[0.2em] uppercase text-stone-500">
              <span className="inline-flex items-center gap-1.5">
                <Globe className="w-3 h-3 text-amber-300" />
                80+ languages
              </span>
              <span className="w-px h-3 bg-stone-50/15" />
              <span className="inline-flex items-center gap-1.5">
                <span className="relative flex w-2 h-2">
                  <span className="absolute inset-0 rounded-full bg-emerald-400/60 animate-ping" />
                  <span className="relative w-2 h-2 rounded-full bg-emerald-400" />
                </span>
                Live
              </span>
            </div>
          </div>

          <FooterColumn
            title="Product"
            links={[
              { label: 'Features', href: '#features' },
              { label: 'Languages', href: '#languages' },
              { label: 'How it works', href: '#how' },
              { label: 'Pricing', href: '#try' },
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

        <div
          ref={wordmarkRef}
          className="scroll-reveal relative mt-12 sm:mt-20 select-none overflow-hidden"
          aria-hidden
        >
          <div
            className="text-center leading-[0.9] text-shimmer animate-gradient-shift font-semibold tracking-[-0.06em] whitespace-nowrap"
            style={{ fontSize: 'clamp(48px, 14vw, 184px)' }}
          >
            Algoritm
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-[#08080a] via-[#08080a]/60 to-transparent" />
        </div>

        <div className="mt-8 sm:mt-12 pt-6 border-t border-stone-50/10 flex flex-wrap items-center justify-between gap-4 text-[11px] sm:text-[12px]">
          <span>&copy; {new Date().getFullYear()} Algoritm. All rights reserved.</span>
          <span className="inline-flex items-center gap-1.5 text-stone-500">
            Crafted with <Heart className="w-3 h-3 text-rose-300" /> for hospitality
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
                className="group inline-flex items-center gap-1.5 text-[13px] text-stone-300 hover:text-amber-300 transition-colors"
              >
                <span className="w-0 group-hover:w-2 h-px bg-amber-300 transition-all duration-300" />
                {l.label}
              </button>
            ) : (
              <a
                href={l.href}
                className="group inline-flex items-center gap-1.5 text-[13px] text-stone-300 hover:text-amber-300 transition-colors"
              >
                <span className="w-0 group-hover:w-2 h-px bg-amber-300 transition-all duration-300" />
                {l.label}
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
