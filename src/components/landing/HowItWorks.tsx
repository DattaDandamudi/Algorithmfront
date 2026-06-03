import { PhoneIncoming, FileText, Rocket } from 'lucide-react';
import { useScrollReveal, useTilt } from './scroll';

const STEPS = [
  {
    n: '01',
    title: 'Connect your line',
    desc: 'Forward your existing restaurant number to Algoritm in under 5 minutes — no new hardware.',
    icon: PhoneIncoming,
    detail: 'Works with Twilio, your PBX, or a fresh number we provision for you.',
  },
  {
    n: '02',
    title: 'Upload your menu',
    desc: 'Drop in a PDF, photo, or POS export. Algoritm reads ingredients, modifiers, and pricing instantly.',
    icon: FileText,
    detail: 'Allergens, modifiers, wine pairings, and specials picked up automatically.',
  },
  {
    n: '03',
    title: 'Go live in 80+ languages',
    desc: 'Pick a voice, set your hours, and your restaurant is multilingual the moment the next call rings.',
    icon: Rocket,
    detail: 'Switch personas, dialects, or time-of-day greetings without redeploying.',
  },
];

export default function HowItWorks() {
  const headerRef = useScrollReveal<HTMLDivElement>();

  return (
    <section className="relative text-stone-50 py-32 overflow-hidden">
      <div className="absolute left-1/2 top-0 -translate-x-1/2 w-[80%] h-px bg-gradient-to-r from-transparent via-stone-50/15 to-transparent" />

      <div className="relative max-w-7xl mx-auto px-6 sm:px-10">
        <div ref={headerRef} className="scroll-reveal">
          <div className="flex items-end gap-6 flex-wrap">
            <div className="text-[80px] sm:text-[110px] leading-none font-semibold tracking-[-0.04em] text-stroke select-none">
              03
            </div>
            <div className="pb-3">
              <div className="inline-flex items-center gap-2 bg-stone-50/[0.05] border border-stone-50/10 rounded-full px-3 py-1 text-[11px] tracking-[0.18em] uppercase text-stone-300">
                How it works
              </div>
              <h2 className="mt-4 text-[36px] sm:text-[52px] font-semibold tracking-[-0.025em] leading-[1.04]">
                Live in three steps.
                <br />
                <span className="text-shimmer animate-gradient-shift">No code, no headaches.</span>
              </h2>
            </div>
          </div>
          <div className="mt-8 h-px w-full bg-gradient-to-r from-stone-50/20 via-stone-50/5 to-transparent" />
        </div>

        <div className="mt-16 relative">
          <svg
            className="hidden md:block absolute top-16 left-0 right-0 w-full h-24 pointer-events-none"
            viewBox="0 0 1200 100"
            preserveAspectRatio="none"
            aria-hidden
          >
            <defs>
              <linearGradient id="path-grad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="rgba(251, 191, 36, 0)" />
                <stop offset="20%" stopColor="rgba(251, 191, 36, 0.45)" />
                <stop offset="50%" stopColor="rgba(251, 113, 133, 0.45)" />
                <stop offset="80%" stopColor="rgba(251, 191, 36, 0.45)" />
                <stop offset="100%" stopColor="rgba(251, 191, 36, 0)" />
              </linearGradient>
            </defs>
            <path
              d="M 80 50 Q 300 -20, 600 50 T 1120 50"
              fill="none"
              stroke="url(#path-grad)"
              strokeWidth="1.5"
              strokeDasharray="6 8"
            />
          </svg>

          <div className="grid md:grid-cols-3 gap-5 relative">
            {STEPS.map((s, i) => (
              <StepCard key={s.n} step={s} index={i} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function StepCard({
  step,
  index,
}: {
  step: (typeof STEPS)[number];
  index: number;
}) {
  const reveal = useScrollReveal<HTMLDivElement>();
  const tilt = useTilt<HTMLDivElement>();
  const Icon = step.icon;

  return (
    <div ref={reveal} className="scroll-reveal" style={{ transitionDelay: `${index * 120}ms` }}>
      <div
        ref={tilt.ref}
        onMouseMove={tilt.onMouseMove}
        onMouseLeave={tilt.onMouseLeave}
        className="spotlight-card tilt-card group relative h-full bg-stone-50/[0.04] border border-stone-50/10 rounded-3xl p-7 hover:border-amber-300/30 transition-colors duration-500 overflow-hidden"
      >
        <div className="absolute -top-24 -right-24 w-56 h-56 rounded-full bg-amber-400/10 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />

        <div className="relative">
          <div className="flex items-start justify-between">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400/30 to-rose-400/15 border border-amber-300/30 flex items-center justify-center shadow-[0_8px_30px_rgba(251,191,36,0.2)]">
              <Icon className="w-5 h-5 text-amber-200" />
            </div>
            <div className="text-[44px] leading-none font-semibold tracking-[-0.04em] text-stroke select-none">
              {step.n}
            </div>
          </div>

          <h3 className="mt-8 text-[22px] font-semibold tracking-[-0.02em]">{step.title}</h3>
          <p className="mt-2 text-[13.5px] text-stone-400 leading-[1.7]">{step.desc}</p>

          <div className="mt-7 pt-5 border-t border-stone-50/[0.06] text-[11.5px] text-stone-500 leading-relaxed">
            {step.detail}
          </div>
        </div>
      </div>
    </div>
  );
}
