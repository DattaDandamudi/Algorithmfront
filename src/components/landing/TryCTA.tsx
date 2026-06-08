import { useMemo, useRef, useState } from 'react';
import { ArrowRight, LogIn } from 'lucide-react';
import VoiceOrb3D from './VoiceOrb3D';
import { useScrollReveal } from './scroll';

interface TryCTAProps {
  onTryIt: () => void;
  onSignIn: () => void;
}

interface Particle {
  id: number;
  bx: number;
  by: number;
  color: string;
}

const PARTICLE_COLORS = ['#fbbf24', '#fb7185', '#22d3ee', '#fb923c', '#f5d77a'];

export default function TryCTA({ onTryIt, onSignIn }: TryCTAProps) {
  const reveal = useScrollReveal<HTMLDivElement>();
  const orbReveal = useScrollReveal<HTMLDivElement>();
  const isMobile = useMemo(
    () => typeof window !== 'undefined' && window.innerWidth < 768,
    []
  );
  const btnRef = useRef<HTMLButtonElement>(null);
  const [particles, setParticles] = useState<Particle[]>([]);
  const burstId = useRef(0);

  function handleTry() {
    const next: Particle[] = Array.from({ length: 18 }).map(() => {
      burstId.current += 1;
      const angle = Math.random() * Math.PI * 2;
      const radius = 70 + Math.random() * 90;
      return {
        id: burstId.current,
        bx: Math.cos(angle) * radius,
        by: Math.sin(angle) * radius,
        color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
      };
    });
    setParticles((prev) => [...prev, ...next]);
    window.setTimeout(() => {
      setParticles((prev) => prev.filter((p) => !next.includes(p)));
    }, 950);
    onTryIt();
  }

  return (
    <section className="relative text-stone-50 py-20 sm:py-32 overflow-hidden">
      <div className="absolute inset-0 bg-radial-amber pointer-events-none" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-stone-50/15 to-transparent" />

      <div className="relative max-w-7xl mx-auto px-5 sm:px-10">
        <div className="relative overflow-hidden rounded-[24px] sm:rounded-[40px] border border-stone-50/10 bg-gradient-to-b from-stone-50/[0.05] to-transparent shadow-[0_30px_120px_rgba(0,0,0,0.4)]">
          <div className="absolute inset-0 conic-sweep opacity-50 hidden sm:block" />
          <div className="absolute -top-32 -left-32 w-[320px] sm:w-[480px] h-[320px] sm:h-[480px] rounded-full bg-amber-500/15 mobile-blur-light sm:blur-3xl animate-blob-1" />
          <div className="absolute -bottom-32 -right-24 w-[320px] sm:w-[480px] h-[320px] sm:h-[480px] rounded-full bg-rose-500/12 mobile-blur-light sm:blur-3xl animate-blob-2" />
          <div className="absolute inset-0 bg-grid-tight opacity-[0.18] hidden sm:block" />

          <div className="relative grid lg:grid-cols-[1fr_1fr] gap-8 sm:gap-12 items-center px-6 sm:px-14 py-12 sm:py-20">
            <div
              ref={orbReveal}
              className="scroll-reveal relative h-[280px] sm:h-[360px] hidden lg:flex items-center justify-center"
            >
              <div className="absolute inset-0 m-auto w-[320px] sm:w-[420px] h-[320px] sm:h-[420px] rounded-full bg-gradient-to-br from-amber-400/30 via-rose-400/15 to-transparent blur-2xl sm:blur-3xl animate-ring-pulse" />
              <div className="relative scale-90 origin-center">
                <VoiceOrb3D />
              </div>
            </div>

            <div ref={reveal} className="scroll-reveal relative">
              <div className="inline-flex items-center gap-2 bg-stone-50/[0.06] border border-stone-50/10 rounded-full px-3 py-1 text-[11px] tracking-[0.18em] uppercase text-stone-300 backdrop-blur">
                Live preview
              </div>
              <h2 className="mt-4 sm:mt-5 text-[32px] sm:text-[48px] lg:text-[60px] font-semibold tracking-[-0.03em] leading-[1.05] sm:leading-[0.98]">
                Hear Algoritm
                <br />
                <span className="text-shimmer animate-gradient-shift">in your own voice.</span>
              </h2>
              <p className="mt-4 sm:mt-5 text-[14px] sm:text-[15px] text-stone-400 leading-[1.65] sm:leading-[1.7] max-w-xl">
                Jump straight into the studio — pick a persona, choose a language, and start a
                conversation. No signup needed.
              </p>

              <div className="mt-7 sm:mt-9 flex flex-wrap items-center gap-3 relative">
                <div className="relative">
                  <button
                    ref={btnRef}
                    type="button"
                    onClick={handleTry}
                    className="magnetic-cta group inline-flex items-center gap-2 bg-amber-400 hover:bg-amber-300 text-stone-900 font-medium rounded-full pl-5 sm:pl-6 pr-4 sm:pr-5 py-3 sm:py-3.5 text-[13px] sm:text-[14px]"
                  >
                    Try it now
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                  </button>
                  {particles.map((p) => (
                    <span
                      key={p.id}
                      className="particle"
                      style={
                        {
                          background: p.color,
                          boxShadow: `0 0 12px ${p.color}`,
                          ['--bx' as string]: `${p.bx}px`,
                          ['--by' as string]: `${p.by}px`,
                        } as React.CSSProperties
                      }
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={onSignIn}
                  className="inline-flex items-center gap-2 bg-stone-50/[0.06] hover:bg-stone-50/[0.1] border border-stone-50/10 text-stone-100 rounded-full px-5 py-3 sm:py-3.5 text-[13px] sm:text-[14px] font-medium transition-all backdrop-blur"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  Sign in
                </button>
              </div>

              <div className="mt-8 sm:mt-12 grid grid-cols-3 gap-4 sm:gap-6 max-w-md text-stone-400">
                <Bullet title="No signup" sub="Instant access" />
                <Bullet title="80+ languages" sub="Out of the box" />
                <Bullet title="Real voice" sub="Studio quality" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Bullet({ title, sub }: { title: string; sub: string }) {
  return (
    <div>
      <div className="text-[14px] font-medium text-stone-100">{title}</div>
      <div className="text-[11.5px] text-stone-500 mt-0.5">{sub}</div>
    </div>
  );
}
