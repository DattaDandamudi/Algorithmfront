import { useEffect, useRef, useState } from 'react';
import { useScrollReveal } from './scroll';

interface Metric {
  label: string;
  target: number;
  suffix?: string;
  prefix?: string;
  decimals?: number;
}

const METRICS: Metric[] = [
  { label: 'Languages supported', target: 84, suffix: '+' },
  { label: 'Avg. response time', target: 312, suffix: 'ms' },
  { label: 'Calls handled / day', target: 24800, suffix: '+' },
  { label: 'Restaurants on waitlist', target: 1247, suffix: '' },
];

function formatNumber(n: number, decimals = 0): string {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export default function MetricsCounter() {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const headerRef = useScrollReveal<HTMLDivElement>();

  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setActive(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={ref} className="relative text-stone-50 py-16 sm:py-28 overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-stone-50/15 to-transparent" />

      <div className="relative max-w-7xl mx-auto px-5 sm:px-10">
        <div ref={headerRef} className="scroll-reveal mb-8 sm:mb-12 max-w-2xl">
          <div className="inline-flex items-center gap-2 bg-stone-50/[0.05] border border-stone-50/10 rounded-full px-3 py-1 text-[11px] tracking-[0.18em] uppercase text-stone-300">
            By the numbers
          </div>
          <h2 className="mt-4 sm:mt-5 text-[26px] sm:text-[36px] lg:text-[44px] font-semibold tracking-[-0.025em] leading-[1.08] sm:leading-[1.05]">
            Built for <span className="text-shimmer animate-gradient-shift">scale</span>, tuned for hospitality.
          </h2>
        </div>

        <div className="relative grid grid-cols-2 md:grid-cols-4 gap-px bg-stone-50/10 rounded-2xl sm:rounded-3xl overflow-hidden border border-stone-50/10 shadow-[0_20px_80px_rgba(0,0,0,0.4)]">
          <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[60%] h-64 bg-amber-400/10 blur-3xl pointer-events-none hidden sm:block" />
          {METRICS.map((m, i) => (
            <Tile key={m.label} metric={m} active={active} delay={i * 250} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

function Tile({
  metric,
  active,
  delay,
  index,
}: {
  metric: Metric;
  active: boolean;
  delay: number;
  index: number;
}) {
  const [value, setValue] = useState(0);
  const tileRef = useScrollReveal<HTMLDivElement>();

  useEffect(() => {
    if (!active) return;
    const start = performance.now() + delay;
    const duration = 1800;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / duration));
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(metric.target * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, metric.target, delay]);

  return (
    <div
      ref={tileRef}
      className="scroll-reveal relative bg-[#0c0c0e]/80 p-5 sm:p-8 lg:p-10 group hover:bg-stone-50/[0.04] transition-colors duration-500"
      style={{ transitionDelay: `${index * 100}ms` }}
    >
      <div className="text-[9px] sm:text-[10px] tracking-[0.3em] uppercase text-stone-600 mb-2 sm:mb-3">
        0{index + 1}
      </div>
      <div className="text-[28px] sm:text-[36px] lg:text-[48px] font-semibold tracking-[-0.03em] tabular-nums text-stone-50 leading-none">
        {metric.prefix ?? ''}
        {formatNumber(value, metric.decimals ?? 0)}
        <span className="text-amber-300">{metric.suffix ?? ''}</span>
      </div>
      <div className="mt-3 sm:mt-4 text-[10px] sm:text-[12px] uppercase tracking-[0.18em] text-stone-500">
        {metric.label}
      </div>
      <div className="absolute bottom-0 left-0 h-px w-0 group-hover:w-full bg-gradient-to-r from-amber-400 to-transparent transition-all duration-700" />
    </div>
  );
}
