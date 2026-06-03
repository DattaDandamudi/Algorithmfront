import { PhoneIncoming, FileText, Rocket } from 'lucide-react';
import { useElementProgress, useScrollReveal, useTilt } from './scroll';

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

const PATH_LENGTH = 1400;

export default function HowItWorks() {
  const headerRef = useScrollReveal<HTMLDivElement>();
  const { ref: gridRef, progress } = useElementProgress<HTMLDivElement>();

  const drawProgress = Math.min(1, Math.max(0, (progress - 0.15) / 0.6));
  const dashOffset = PATH_LENGTH * (1 - drawProgress);

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

        <div ref={gridRef} className="mt-16 relative">
          <svg
            className="hidden md:block absolute top-16 left-0 right-0 w-full h-32 pointer-events-none"
            viewBox="0 0 1200 120"
            preserveAspectRatio="none"
            aria-hidden
          >
            <defs>
              <linearGradient id="path-grad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="rgba(251, 191, 36, 0.0)" />
                <stop offset="20%" stopColor="rgba(251, 191, 36, 0.85)" />
                <stop offset="50%" stopColor="rgba(251, 113, 133, 0.85)" />
                <stop offset="80%" stopColor="rgba(34, 211, 238, 0.65)" />
                <stop offset="100%" stopColor="rgba(251, 191, 36, 0)" />
              </linearGradient>
              <filter id="path-glow">
                <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <path
              d="M 80 60 Q 320 -10, 600 60 T 1120 60"
              fill="none"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="1.5"
              strokeDasharray="4 8"
            />
            <path
              d="M 80 60 Q 320 -10, 600 60 T 1120 60"
              fill="none"
              stroke="url(#path-grad)"
              strokeWidth="2.4"
              strokeLinecap="round"
              filter="url(#path-glow)"
              style={{
                strokeDasharray: PATH_LENGTH,
                strokeDashoffset: dashOffset,
                transition: 'stroke-dashoffset 80ms linear',
              }}
            />
            <circle
              cx={80 + (1120 - 80) * drawProgress}
              cy={60 - Math.sin(drawProgress * Math.PI) * 35}
              r="5"
              fill="rgba(252, 211, 77, 1)"
              filter="url(#path-glow)"
              style={{ opacity: drawProgress > 0.02 && drawProgress < 0.99 ? 1 : 0, transition: 'opacity 200ms ease' }}
            />
          </svg>

          <div className="grid md:grid-cols-3 gap-5 relative">
            {STEPS.map((s, i) => (
              <StepCard key={s.n} step={s} index={i} active={drawProgress > i / STEPS.length} />
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
  active,
}: {
  step: (typeof STEPS)[number];
  index: number;
  active: boolean;
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
        className={`spotlight-card tilt-card group relative h-full bg-stone-50/[0.04] border rounded-3xl p-7 transition-all duration-700 overflow-hidden ${
          active ? 'border-amber-300/40 shadow-[0_20px_70px_rgba(251,191,36,0.12)]' : 'border-stone-50/10'
        }`}
      >
        <div
          className={`absolute -top-24 -right-24 w-56 h-56 rounded-full bg-amber-400/10 blur-3xl transition-opacity duration-700 ${
            active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        />

        <div className="relative">
          <div className="flex items-start justify-between">
            <div
              className={`w-12 h-12 rounded-2xl bg-gradient-to-br border flex items-center justify-center transition-all duration-700 ${
                active
                  ? 'from-amber-400/50 to-rose-400/30 border-amber-300/50 shadow-[0_10px_40px_rgba(251,191,36,0.35)]'
                  : 'from-amber-400/30 to-rose-400/15 border-amber-300/30 shadow-[0_8px_30px_rgba(251,191,36,0.2)]'
              }`}
            >
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

          <div
            className={`absolute bottom-0 left-0 h-px bg-gradient-to-r from-amber-400 via-rose-300 to-transparent transition-all duration-700 ${
              active ? 'w-full opacity-80' : 'w-0 opacity-0'
            }`}
          />
        </div>
      </div>
    </div>
  );
}
