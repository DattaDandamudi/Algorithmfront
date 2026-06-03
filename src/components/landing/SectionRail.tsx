import { useEffect, useState } from 'react';

interface Section {
  id: string;
  label: string;
}

const SECTIONS: Section[] = [
  { id: 'hero', label: 'Intro' },
  { id: 'languages', label: 'Languages' },
  { id: 'features', label: 'Capabilities' },
  { id: 'demo', label: 'Live demo' },
  { id: 'metrics', label: 'Numbers' },
  { id: 'how', label: 'How' },
  { id: 'try', label: 'Try it' },
];

export default function SectionRail() {
  const [active, setActive] = useState('hero');

  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (!el) return;
      const obs = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) setActive(s.id);
          }
        },
        { rootMargin: '-40% 0px -40% 0px', threshold: 0.01 }
      );
      obs.observe(el);
      observers.push(obs);
    });
    return () => observers.forEach((o) => o.disconnect());
  }, []);

  function go(id: string) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="hidden lg:flex fixed right-6 top-1/2 -translate-y-1/2 z-40 flex-col items-end gap-3">
      {SECTIONS.map((s) => {
        const isActive = active === s.id;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => go(s.id)}
            className="group flex items-center gap-3"
            aria-label={`Jump to ${s.label}`}
          >
            <span
              className={`text-[10.5px] tracking-[0.22em] uppercase transition-all duration-300 ${
                isActive
                  ? 'opacity-100 text-amber-200'
                  : 'opacity-0 group-hover:opacity-80 text-stone-400'
              }`}
            >
              {s.label}
            </span>
            <span
              className={`block rounded-full transition-all duration-300 ${
                isActive
                  ? 'w-2.5 h-2.5 bg-amber-300 section-rail-active shadow-[0_0_18px_rgba(251,191,36,0.7)]'
                  : 'w-1.5 h-1.5 bg-stone-50/30 group-hover:bg-stone-50/60'
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}
