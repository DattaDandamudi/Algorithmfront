import { useEffect, useRef, useState } from 'react';
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

interface LandingProps {
  onSignIn: () => void;
  onTryIt: () => void;
  onCrafted: () => void;
}

export default function Landing({ onSignIn, onTryIt, onCrafted }: LandingProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    let raf = 0;
    function onScroll() {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (barRef.current) {
          const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
          barRef.current.style.transform = `scaleX(${window.scrollY / max})`;
        }
      });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="relative bg-[#08080a] text-stone-50 min-h-screen overflow-x-hidden">
      <div
        ref={barRef}
        className="fixed top-0 left-0 right-0 h-[2px] z-50 origin-left bg-gradient-to-r from-amber-400 via-rose-300 to-cyan-300 will-change-transform"
        style={{ transform: 'scaleX(0)' }}
      />

      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute inset-0 bg-mesh-warm" />
        {!isMobile && <div className="absolute inset-0 bg-grid-tight opacity-[0.25] mask-fade-y" />}
        <div className="absolute -top-[18%] left-[3%] w-[55vw] h-[55vw] rounded-full bg-amber-500/[0.10] blur-[100px] sm:blur-[140px]" />
        <div className="absolute top-[35%] -right-[10%] w-[50vw] h-[50vw] rounded-full bg-rose-500/[0.08] blur-[100px] sm:blur-[140px]" />
        <div className="absolute bottom-[0%] left-[20%] w-[42vw] h-[42vw] rounded-full bg-amber-300/[0.06] blur-[100px] sm:blur-[140px]" />
        <div className="absolute inset-0 bg-[#08080a]/40" />
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
