import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Phone, Sparkles } from 'lucide-react';
import VoiceOrb3D from './VoiceOrb3D';
import { useScrollReveal } from './scroll';

const GREETINGS: { lang: string; greet: string }[] = [
  { lang: 'English', greet: 'Welcome — would you like a table tonight?' },
  { lang: 'Telugu', greet: 'Namaskaram — meeku table kaavala?' },
  { lang: 'Spanish', greet: 'Hola — le gustaria una mesa esta noche?' },
  { lang: 'French', greet: 'Bonsoir — souhaitez-vous une table?' },
  { lang: 'Mandarin', greet: 'Nin hao — qing wen ji wei?' },
  { lang: 'Arabic', greet: 'Marhaban — hal turid tawila al-layla?' },
  { lang: 'Hindi', greet: 'Namaste — kya aap ke liye table chahiye?' },
  { lang: 'Japanese', greet: 'Irasshaimase — gonin sama desu ka?' },
  { lang: 'Italian', greet: 'Buonasera — desidera un tavolo?' },
  { lang: 'Portuguese', greet: 'Boa noite — gostaria de uma mesa?' },
];

const FLOATING_CARDS = [
  { text: 'Reserved a table for 4 at 8 PM', sub: 'Spanish caller', tone: 'amber' },
  { text: 'Naa order ekkada undi?', sub: 'Translated to English', tone: 'rose' },
  { text: 'Allergy noted: peanuts, shellfish', sub: 'Mandarin caller', tone: 'cyan' },
  { text: 'Une reservation pour deux', sub: 'French caller', tone: 'amber' },
] as const;

const TONE_CLASS: Record<string, string> = {
  amber: 'border-amber-300/30 bg-amber-500/10 text-amber-100',
  rose: 'border-rose-300/30 bg-rose-500/10 text-rose-100',
  cyan: 'border-cyan-300/30 bg-cyan-500/10 text-cyan-100',
};

interface HeroProps {
  onTryIt: () => void;
  onSignIn: () => void;
}

export default function Hero({ onTryIt, onSignIn }: HeroProps) {
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState('');
  const leftReveal = useScrollReveal<HTMLDivElement>();
  const orbReveal = useScrollReveal<HTMLDivElement>();
  const btnRef = useRef<HTMLButtonElement>(null);

  const isMobile = useMemo(
    () => typeof window !== 'undefined' && (window.innerWidth < 768 || 'ontouchstart' in window),
    []
  );

  useEffect(() => {
    const target = GREETINGS[index].greet;
    setTyped('');
    let i = 0;
    const interval = window.setInterval(() => {
      i++;
      setTyped(target.slice(0, i));
      if (i >= target.length) window.clearInterval(interval);
    }, 28);
    const next = window.setTimeout(() => setIndex((prev) => (prev + 1) % GREETINGS.length), 4200);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(next);
    };
  }, [index]);

  return (
    <section className="relative overflow-hidden text-stone-50">
      <div className="relative max-w-7xl mx-auto px-5 sm:px-10 pt-24 sm:pt-28 pb-20 sm:pb-32">
        <div className="grid lg:grid-cols-[1.05fr_1fr] gap-10 lg:gap-6 items-center">
          <div ref={leftReveal} className="scroll-reveal relative z-10">
            <div className="inline-flex items-center gap-2 bg-stone-50/[0.06] border border-stone-50/10 rounded-full pl-1.5 pr-3 py-1 text-[11px] sm:text-[11.5px] tracking-wide text-stone-300 backdrop-blur-md">
              <span className="flex items-center gap-1 bg-amber-400/20 text-amber-200 rounded-full px-2 py-0.5 font-medium">
                <Sparkles className="w-3 h-3" />
                New
              </span>
              <span className="hidden xs:inline">Voice agents for restaurants, in 80+ languages</span>
              <span className="xs:hidden">80+ language voice agents</span>
            </div>

            <h1 className="mt-6 sm:mt-7 text-[36px] sm:text-[56px] lg:text-[80px] leading-[1.02] sm:leading-[0.98] font-semibold tracking-[-0.035em]">
              <span className="block text-stone-100">Your restaurant,</span>
              <span className="block text-shimmer animate-gradient-shift">fluent in 80+</span>
              <span className="block text-shimmer animate-gradient-shift">languages.</span>
            </h1>

            <p className="mt-5 sm:mt-7 max-w-[540px] text-[14px] sm:text-[15.5px] leading-[1.65] sm:leading-[1.7] text-stone-300/90">
              Algoritm answers every call, takes reservations, manages orders, and speaks to guests
              in their native tongue — 24 hours a day, in real time, with zero wait.
            </p>

            <div className="mt-6 sm:mt-8 inline-flex items-center gap-3 glass-panel-dark rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3 shadow-[0_10px_40px_rgba(0,0,0,0.25)]">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 live-dot" />
                <span className="text-[10px] sm:text-[11px] uppercase tracking-[0.18em] text-stone-400">Live</span>
              </div>
              <div className="text-[12px] sm:text-[13px] text-stone-200 min-w-0 flex-1 overflow-hidden">
                <span className="text-stone-500 mr-2">{GREETINGS[index].lang}</span>
                <span className="break-words">{typed}</span>
                <span className="caret">|</span>
              </div>
            </div>

            <div className="mt-7 sm:mt-9 flex flex-wrap items-center gap-3">
              <button
                ref={btnRef}
                type="button"
                onClick={onTryIt}
                className="magnetic-cta group inline-flex items-center gap-2 bg-amber-400 hover:bg-amber-300 text-stone-900 font-medium rounded-full pl-5 pr-4 py-3 text-[13px] sm:text-[13.5px]"
              >
                Try it now
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
              </button>
              <button
                type="button"
                onClick={onSignIn}
                className="inline-flex items-center gap-2 bg-stone-50/[0.06] hover:bg-stone-50/[0.1] border border-stone-50/10 text-stone-100 rounded-full px-5 py-3 text-[13px] sm:text-[13.5px] font-medium transition-colors backdrop-blur"
              >
                <Phone className="w-3.5 h-3.5" />
                Sign in to studio
              </button>
            </div>

            <div className="mt-10 sm:mt-12 grid grid-cols-3 gap-4 sm:gap-6 max-w-md">
              <StatItem value="80+" label="Languages" />
              <StatItem value="<400ms" label="Latency" />
              <StatItem value="24/7" label="Always on" />
            </div>

            <div className="mt-10 sm:mt-14 hidden sm:flex items-center gap-3 text-[10.5px] tracking-[0.3em] uppercase text-stone-500">
              <span className="w-8 h-px bg-stone-50/20" />
              Scroll to explore
            </div>
          </div>

          <div ref={orbReveal} className="scroll-reveal relative" style={{ transitionDelay: '120ms' }}>
            {!isMobile && (
              <div className="absolute inset-0 -z-10">
                <div className="absolute inset-0 m-auto w-[420px] h-[420px] rounded-full bg-gradient-to-br from-amber-400/20 via-rose-400/10 to-transparent blur-2xl animate-ring-pulse" />
              </div>
            )}

            <VoiceOrb3D />

            <div className="hidden sm:block">
              <FloatingCard className="absolute -top-2 left-6 animate-drift-1" tone={FLOATING_CARDS[0].tone}>
                <div className="text-[12px] font-medium">{FLOATING_CARDS[0].text}</div>
                <div className="text-[10.5px] opacity-70 mt-0.5">{FLOATING_CARDS[0].sub}</div>
              </FloatingCard>

              <FloatingCard className="absolute top-24 right-0 animate-drift-2" tone={FLOATING_CARDS[1].tone}>
                <div className="text-[12px] font-medium">"{FLOATING_CARDS[1].text}"</div>
                <div className="text-[10.5px] opacity-70 mt-0.5">{FLOATING_CARDS[1].sub}</div>
              </FloatingCard>

              <FloatingCard className="absolute bottom-12 left-0 animate-drift-3" tone={FLOATING_CARDS[2].tone}>
                <div className="text-[12px] font-medium">{FLOATING_CARDS[2].text}</div>
                <div className="text-[10.5px] opacity-70 mt-0.5">{FLOATING_CARDS[2].sub}</div>
              </FloatingCard>

              <FloatingCard className="absolute -bottom-2 right-6 animate-drift-1" tone={FLOATING_CARDS[3].tone}>
                <div className="text-[12px] font-medium">{FLOATING_CARDS[3].text}</div>
                <div className="text-[10.5px] opacity-70 mt-0.5">{FLOATING_CARDS[3].sub}</div>
              </FloatingCard>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-stone-50/[0.08] to-transparent" />
    </section>
  );
}

function StatItem({ value, label }: { value: string; label: string }) {
  return (
    <div className="relative cursor-default">
      <div className="text-[22px] sm:text-[26px] font-semibold tracking-tight tabular-nums text-stone-50">
        {value}
      </div>
      <div className="text-[10px] sm:text-[11px] uppercase tracking-[0.18em] text-stone-500 mt-1">{label}</div>
    </div>
  );
}

function FloatingCard({
  children,
  className,
  tone,
}: {
  children: React.ReactNode;
  className?: string;
  tone: string;
}) {
  return (
    <div
      className={`border rounded-2xl px-3.5 py-2.5 max-w-[220px] shadow-[0_10px_40px_rgba(0,0,0,0.45)] ${TONE_CLASS[tone]} ${className ?? ''}`}
    >
      {children}
    </div>
  );
}
