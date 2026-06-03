import { useEffect, useState } from 'react';
import { Sparkles, Menu, X } from 'lucide-react';

interface LandingNavProps {
  onSignIn: () => void;
  onTryIt: () => void;
  onCrafted: () => void;
}

const LINKS = [
  { href: '#features', label: 'Features' },
  { href: '#languages', label: 'Languages' },
  { href: '#how', label: 'How it works' },
];

export default function LandingNav({ onSignIn, onTryIt, onCrafted }: LandingNavProps) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 16);
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  function go(href: string) {
    setOpen(false);
    const el = document.querySelector(href);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-[#0a0a0b]/80 backdrop-blur-xl border-b border-stone-50/10' : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 sm:px-10 h-16 flex items-center justify-between">
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="flex items-center gap-2.5"
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-rose-400 flex items-center justify-center shadow-[0_4px_20px_rgba(251,191,36,0.3)]">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="text-[15px] font-semibold tracking-tight text-stone-50">Algoritm</span>
        </button>

        <nav className="hidden md:flex items-center gap-1">
          {LINKS.map((l) => (
            <button
              key={l.href}
              type="button"
              onClick={() => go(l.href)}
              className="px-3.5 py-2 rounded-full text-[12.5px] font-medium text-stone-400 hover:text-stone-100 hover:bg-stone-50/[0.06] transition-all"
            >
              {l.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onCrafted();
            }}
            className="px-3.5 py-2 rounded-full text-[12.5px] font-medium text-stone-400 hover:text-stone-100 hover:bg-stone-50/[0.06] transition-all"
          >
            Crafted by
          </button>
        </nav>

        <div className="hidden md:flex items-center gap-2">
          <button
            type="button"
            onClick={onSignIn}
            className="px-4 py-2 rounded-full text-[12.5px] font-medium text-stone-300 hover:text-stone-100 transition-all"
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={onTryIt}
            className="px-4 py-2 rounded-full text-[12.5px] font-medium bg-amber-400 hover:bg-amber-300 text-stone-900 transition-all shadow-[0_4px_20px_rgba(251,191,36,0.3)]"
          >
            Try it now
          </button>
        </div>

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="md:hidden w-9 h-9 rounded-full bg-stone-50/[0.06] border border-stone-50/10 flex items-center justify-center text-stone-200"
        >
          {open ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
        </button>
      </div>

      {open && (
        <div className="md:hidden bg-[#0a0a0b]/95 backdrop-blur-xl border-t border-stone-50/10">
          <div className="px-6 py-4 flex flex-col gap-1">
            {LINKS.map((l) => (
              <button
                key={l.href}
                type="button"
                onClick={() => go(l.href)}
                className="text-left px-3 py-2.5 rounded-xl text-[13px] font-medium text-stone-300 hover:bg-stone-50/[0.06]"
              >
                {l.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onCrafted();
              }}
              className="text-left px-3 py-2.5 rounded-xl text-[13px] font-medium text-stone-300 hover:bg-stone-50/[0.06]"
            >
              Crafted by
            </button>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <button
                type="button"
                onClick={onSignIn}
                className="px-4 py-2.5 rounded-full text-[13px] font-medium bg-stone-50/[0.06] border border-stone-50/10 text-stone-200"
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={onTryIt}
                className="px-4 py-2.5 rounded-full text-[13px] font-medium bg-amber-400 text-stone-900"
              >
                Try it now
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
