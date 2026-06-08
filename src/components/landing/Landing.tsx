import { useEffect, useState } from 'react';
import LandingNav from './LandingNav';
import Hero from './Hero';
import LanguageMarquee from './LanguageMarquee';
import FeatureBento from './FeatureBento';
import ConversationDemo from './ConversationDemo';
import MetricsCounter from './MetricsCounter';
import HowItWorks from './HowItWorks';
import TryCTA from './TryCTA';
import LandingFooter from './LandingFooter';
import SectionRail from './SectionRail';
import { useScrollProgress, useScrollY } from './scroll';

interface LandingProps {
  onSignIn: () => void;
  onTryIt: () => void;
  onCrafted: () => void;
}

const STAR_POSITIONS = [
  { x: 8, y: 12, d: 0, o: 0.5 },
  { x: 22, y: 38, d: 1.2, o: 0.7 },
  { x: 38, y: 18, d: 0.6, o: 0.4 },
  { x: 55, y: 64, d: 1.8, o: 0.6 },
  { x: 70, y: 22, d: 0.3, o: 0.5 },
  { x: 84, y: 48, d: 1.5, o: 0.7 },
  { x: 92, y: 78, d: 0.9, o: 0.4 },
  { x: 14, y: 72, d: 2.1, o: 0.55 },
  { x: 46, y: 88, d: 0.7, o: 0.5 },
  { x: 62, y: 8, d: 1.3, o: 0.6 },
  { x: 30, y: 56, d: 2.4, o: 0.45 },
  { x: 78, y: 12, d: 0.4, o: 0.65 },
];

export default function Landing({ onSignIn, onTryIt, onCrafted }: LandingProps) {
  const progress = useScrollProgress();
  const scrollY = useScrollY();
  const [isMobile, setIsMobile] = useState(false);
  const [cursor, setCursor] = useState({ x: 0.5, y: 0.5 });

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    if (isMobile) return;
    let raf = 0;
    function onMove(e: MouseEvent) {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        setCursor({ x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight });
      });
    }
    window.addEventListener('mousemove', onMove);
    return () => {
      window.removeEventListener('mousemove', onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [isMobile]);

  const halo1 = isMobile ? undefined : `translate3d(${(cursor.x - 0.5) * 40}px, ${scrollY * 0.18}px, 0)`;
  const halo2 = isMobile ? undefined : `translate3d(${(cursor.x - 0.5) * -50}px, ${scrollY * 0.22}px, 0)`;
  const beamY = isMobile ? undefined : `translate3d(0, ${scrollY * -0.12}px, 0)`;
  const meshShift = isMobile ? undefined : `translate3d(${(cursor.x - 0.5) * -16}px, ${(cursor.y - 0.5) * -16}px, 0)`;

  return (
    <div className="relative bg-[#08080a] text-stone-50 min-h-screen overflow-x-hidden">
      <div
        className="fixed top-0 left-0 right-0 h-[2px] z-50 origin-left bg-gradient-to-r from-amber-400 via-rose-300 to-cyan-300"
        style={{
          transform: `scaleX(${progress})`,
          transition: 'transform 80ms linear',
          boxShadow: '0 0 18px rgba(251, 191, 36, 0.55)',
        }}
      />

      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden noise-overlay">
        <div
          className="absolute inset-0 bg-mesh-warm"
          style={meshShift ? { transform: meshShift, transition: 'transform 600ms cubic-bezier(0.16, 1, 0.3, 1)' } : undefined}
        />
        <div className="absolute inset-0 bg-grid-tight opacity-[0.32] mask-fade-y" />

        <div className="absolute inset-0 overflow-hidden" style={beamY ? { transform: beamY } : undefined}>
          <div className="beam-light" />
          <div className="beam-light hidden sm:block" style={{ left: '55%', animationDelay: '5s', filter: 'blur(60px)' }} />
        </div>

        <div className="absolute inset-0 hidden sm:block">
          {STAR_POSITIONS.map((s, i) => (
            <span
              key={i}
              className="star"
              style={{
                left: `${s.x}%`,
                top: `${s.y}%`,
                animationDelay: `${s.d}s`,
                opacity: s.o,
              }}
            />
          ))}
        </div>

        <div
          className="absolute -top-[18%] left-[3%] w-[55vw] h-[55vw] rounded-full bg-amber-500/[0.12] mobile-blur-light sm:blur-[140px] animate-blob-1"
          style={halo1 ? { transform: halo1 } : undefined}
        />
        <div
          className="absolute top-[35%] -right-[10%] w-[50vw] h-[50vw] rounded-full bg-rose-500/[0.10] mobile-blur-light sm:blur-[150px] animate-blob-2"
          style={halo2 ? { transform: halo2 } : undefined}
        />
        <div className="absolute bottom-[0%] left-[20%] w-[42vw] h-[42vw] rounded-full bg-amber-300/[0.07] mobile-blur-light sm:blur-[140px] animate-blob-3" />
        <div className="absolute inset-0 bg-radial-amber animate-aurora" />
        <div className="absolute inset-0 bg-[#08080a]/35" />
      </div>

      <SectionRail />

      <div className="relative z-10">
        <LandingNav onSignIn={onSignIn} onTryIt={onTryIt} onCrafted={onCrafted} />
        <main>
          <section id="hero">
            <Hero onTryIt={onTryIt} onSignIn={onSignIn} />
          </section>
          <section id="languages">
            <LanguageMarquee />
          </section>
          <section id="features">
            <FeatureBento />
          </section>
          <section id="demo">
            <ConversationDemo />
          </section>
          <section id="metrics">
            <MetricsCounter />
          </section>
          <section id="how">
            <HowItWorks />
          </section>
          <section id="try">
            <TryCTA onTryIt={onTryIt} onSignIn={onSignIn} />
          </section>
        </main>
        <LandingFooter onCrafted={onCrafted} />
      </div>
    </div>
  );
}
