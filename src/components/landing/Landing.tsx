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
import { useScrollProgress, useScrollY } from './scroll';

interface LandingProps {
  onSignIn: () => void;
  onTryIt: () => void;
  onCrafted: () => void;
}

export default function Landing({ onSignIn, onTryIt, onCrafted }: LandingProps) {
  const progress = useScrollProgress();
  const scrollY = useScrollY();
  const [cursor, setCursor] = useState({ x: 0.5, y: 0.5 });

  useEffect(() => {
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
  }, []);

  const halo1 = `translate3d(${(cursor.x - 0.5) * 30}px, ${scrollY * 0.18}px, 0)`;
  const halo2 = `translate3d(${(cursor.x - 0.5) * -40}px, ${scrollY * 0.22}px, 0)`;

  return (
    <div className="relative bg-[#08080a] text-stone-50 min-h-screen overflow-x-hidden">
      <div
        className="fixed top-0 left-0 right-0 h-[2px] z-50 origin-left bg-gradient-to-r from-amber-400 via-rose-300 to-amber-400"
        style={{ transform: `scaleX(${progress})`, transition: 'transform 80ms linear' }}
      />

      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute inset-0 bg-[#08080a]" />
        <div className="absolute inset-0 bg-grid-tight opacity-[0.32] mask-fade-y" />
        <div
          className="absolute -top-[18%] left-[3%] w-[55vw] h-[55vw] rounded-full bg-amber-500/[0.10] blur-[140px] animate-blob-1"
          style={{ transform: halo1 }}
        />
        <div
          className="absolute top-[35%] -right-[10%] w-[50vw] h-[50vw] rounded-full bg-rose-500/[0.09] blur-[150px] animate-blob-2"
          style={{ transform: halo2 }}
        />
        <div className="absolute bottom-[0%] left-[20%] w-[42vw] h-[42vw] rounded-full bg-amber-300/[0.06] blur-[140px] animate-blob-3" />
        <div className="absolute inset-0 bg-radial-amber animate-aurora" />
        <div className="absolute inset-0 bg-[#08080a]/35" />
      </div>

      <div className="relative z-10">
        <LandingNav onSignIn={onSignIn} onTryIt={onTryIt} onCrafted={onCrafted} />
        <main>
          <Hero onTryIt={onTryIt} onSignIn={onSignIn} />
          <section id="languages">
            <LanguageMarquee />
          </section>
          <section id="features">
            <FeatureBento />
          </section>
          <ConversationDemo />
          <MetricsCounter />
          <section id="how">
            <HowItWorks />
          </section>
          <TryCTA onTryIt={onTryIt} onSignIn={onSignIn} />
        </main>
        <LandingFooter onCrafted={onCrafted} />
      </div>
    </div>
  );
}
