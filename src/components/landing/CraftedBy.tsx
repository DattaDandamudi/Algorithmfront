import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Heart, MapPin, ExternalLink, Sparkles, Globe as Globe2, Users, Languages as LanguagesIcon, ImagePlus } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import VoiceOrb3D from './VoiceOrb3D';
import AvatarUploader from './AvatarUploader';
import { useMagnetic, useScrollReveal, useScrollY, useScrollProgress } from './scroll';

interface Contributor {
  id: string;
  name: string;
  role: string;
  category: string;
  bio: string;
  avatar_url: string;
  location: string;
  link_url: string;
  sort_order: number;
}

interface CraftedByProps {
  onBack: () => void;
  onTryIt: () => void;
}

const SECTIONS: { key: string; index: string; title: string; subtitle: string }[] = [
  {
    key: 'founders',
    index: '01',
    title: 'Founders',
    subtitle: 'The first two who said yes — and never stopped.',
  },
  {
    key: 'engineering',
    index: '02',
    title: 'Engineering & Design',
    subtitle: 'The hands behind every line of code, every pixel, every millisecond.',
  },
  {
    key: 'linguists',
    index: '03',
    title: 'Linguists & Advisors',
    subtitle: 'The voices that taught Algoritm how the world really speaks.',
  },
  {
    key: 'data',
    index: '04',
    title: 'Data Engineers',
    subtitle: 'The team that wrangles the data, models, and pipelines that keep Algoritm fluent.',
  },
];

const FALLBACK: Contributor[] = [
  {
    id: '1',
    name: 'Aarav Mehta',
    role: 'Founder & CEO',
    category: 'founders',
    bio: 'Built Algoritm to give every restaurant a multilingual voice — no matter how small.',
    avatar_url: '',
    location: 'San Francisco, USA',
    link_url: '',
    sort_order: 1,
  },
  {
    id: '2',
    name: 'Priya Nair',
    role: 'Founder & CTO',
    category: 'founders',
    bio: 'Architected the real-time speech pipeline running under 400ms across 80+ languages.',
    avatar_url: '',
    location: 'Bangalore, India',
    link_url: '',
    sort_order: 2,
  },
];

const GRADIENTS = [
  'from-amber-400 via-orange-400 to-rose-400',
  'from-rose-400 via-amber-300 to-orange-300',
  'from-cyan-400 via-emerald-300 to-amber-300',
  'from-amber-300 via-orange-400 to-rose-300',
  'from-emerald-300 via-cyan-400 to-amber-200',
  'from-orange-400 via-rose-400 to-amber-300',
  'from-cyan-300 via-amber-300 to-rose-300',
  'from-rose-300 via-orange-400 to-amber-300',
];

function gradientFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return GRADIENTS[hash % GRADIENTS.length];
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export default function CraftedBy({ onBack, onTryIt }: CraftedByProps) {
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [showUploader, setShowUploader] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [filter, setFilter] = useState<string>('all');
  const scrollY = useScrollY();
  const progress = useScrollProgress();

  const isMobile = useMemo(
    () => typeof window !== 'undefined' && (window.innerWidth < 768 || 'ontouchstart' in window),
    []
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => setSession(s));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data, error } = await supabase
        .from('contributors')
        .select('*')
        .order('sort_order', { ascending: true });

      if (cancelled) return;
      if (error || !data || data.length === 0) {
        setContributors(FALLBACK);
      } else {
        setContributors(data as Contributor[]);
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const grouped = useMemo(() => {
    const map: Record<string, Contributor[]> = {};
    for (const c of contributors) {
      const k = c.category || 'team';
      if (!map[k]) map[k] = [];
      map[k].push(c);
    }
    return map;
  }, [contributors]);

  const countries = useMemo(() => {
    const set = new Set<string>();
    for (const c of contributors) {
      if (c.location) {
        const country = c.location.split(',').pop()?.trim();
        if (country) set.add(country);
      }
    }
    return set.size;
  }, [contributors]);

  const allNames = contributors.map((c) => c.name);

  const heroParallax = isMobile ? undefined : `translate3d(0, ${scrollY * 0.18}px, 0)`;
  const orbParallax = isMobile ? undefined : `translate3d(0, ${scrollY * -0.06}px, 0) scale(${Math.max(0.7, 1 - scrollY * 0.0006)})`;
  const haloParallax = isMobile ? 'none' : `translate3d(0, ${scrollY * 0.32}px, 0)`;

  return (
    <div className="relative bg-[#08080a] text-stone-50 min-h-screen overflow-x-hidden">
      <div
        className="fixed top-0 left-0 right-0 h-[2px] z-50 origin-left bg-gradient-to-r from-amber-400 via-rose-300 to-amber-400"
        style={{ transform: `scaleX(${progress})`, transition: 'transform 80ms linear' }}
      />

      <BackgroundLayers haloTransform={haloParallax} />

      <header className="sticky top-0 z-40 bg-[#08080a]/60 backdrop-blur-xl border-b border-stone-50/[0.06]">
        <div className="max-w-7xl mx-auto px-6 sm:px-10 h-16 flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="group inline-flex items-center gap-2 text-[12.5px] font-medium text-stone-300 hover:text-stone-50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
            Back to Algoritm
          </button>
          <div className="hidden md:flex items-center gap-2 text-[11px] tracking-[0.3em] uppercase text-stone-500">
            <Sparkles className="w-3 h-3 text-amber-300" />
            Crafted by
          </div>
          <div className="flex items-center gap-2">
            {session && (
              <button
                type="button"
                onClick={() => setShowUploader(true)}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-[12px] font-medium text-stone-300 hover:text-stone-50 bg-stone-50/[0.04] hover:bg-stone-50/[0.08] border border-stone-50/10 transition-colors"
                title="Upload a contributor avatar"
              >
                <ImagePlus className="w-3.5 h-3.5 text-amber-300" />
                Manage avatars
              </button>
            )}
            <button
              type="button"
              onClick={onTryIt}
              className="group inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[12.5px] font-medium bg-amber-400 hover:bg-amber-300 text-stone-900 transition-all shadow-[0_4px_24px_rgba(251,191,36,0.35)]"
            >
              Try it now
              <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
        </div>
      </header>

      <section className="relative">
        <div
          className="relative max-w-7xl mx-auto px-5 sm:px-10 pt-20 sm:pt-36 pb-16 sm:pb-24"
          style={heroParallax ? { transform: heroParallax } : undefined}
        >
          <div className="grid lg:grid-cols-[1.25fr_1fr] gap-12 items-center">
            <div className="relative z-10">
              <div className="inline-flex items-center gap-2 bg-stone-50/[0.05] border border-stone-50/10 rounded-full px-3 py-1 text-[11px] tracking-[0.18em] uppercase text-stone-300 backdrop-blur">
                <Heart className="w-3 h-3 text-rose-300" />
                The humans behind it
              </div>
              <h1 className="mt-5 sm:mt-7 text-[38px] sm:text-[56px] lg:text-[88px] leading-[1.02] sm:leading-[0.95] font-semibold tracking-[-0.035em]">
                <span className="block text-stone-200/95">The people</span>
                <span className="block text-stone-200/95">who built</span>
                <span className="block text-shimmer animate-gradient-shift">Algoritm.</span>
              </h1>
              <p className="mt-8 max-w-xl text-[15.5px] leading-[1.65] text-stone-300/90">
                A small team of engineers, designers, linguists, and hospitality veterans —
                scattered across continents, time zones, and dialects — who cared enough to give
                every restaurant a voice in every language.
              </p>

              <div className="mt-12 grid grid-cols-3 gap-4 max-w-md">
                <Stat icon={Users} value={contributors.length || 12} label="People" />
                <Stat icon={Globe2} value={countries || 8} label="Countries" />
                <Stat icon={LanguagesIcon} value={80} suffix="+" label="Languages" />
              </div>

              <div className="mt-14 flex items-center gap-3 text-[11px] tracking-[0.3em] uppercase text-stone-500 animate-float-soft">
                <span className="w-8 h-px bg-stone-50/20" />
                Scroll to meet them
              </div>
            </div>

            <div className="relative h-[320px] sm:h-[420px] flex items-center justify-center hidden lg:flex">
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={orbParallax ? { transform: orbParallax } : undefined}
              >
                <div className="absolute w-[480px] h-[480px] rounded-full bg-gradient-to-br from-amber-400/20 via-rose-400/10 to-transparent blur-3xl animate-ring-pulse" />
                <div className="relative scale-100 origin-center">
                  <VoiceOrb3D />
                </div>
              </div>
              <FloatingPortraits items={contributors.slice(0, 5)} />
            </div>
          </div>
        </div>
      </section>

      <ManifestoSection />

      <CategoryFilter
        active={filter}
        onChange={setFilter}
        counts={{
          all: contributors.length,
          founders: grouped.founders?.length ?? 0,
          engineering: grouped.engineering?.length ?? 0,
          data: grouped.data?.length ?? 0,
          linguists: grouped.linguists?.length ?? 0,
        }}
      />

      <section className="relative max-w-7xl mx-auto px-6 sm:px-10 pb-32 space-y-28">
        {SECTIONS.map((section) => {
          if (filter !== 'all' && filter !== section.key) return null;
          const items = grouped[section.key] ?? [];
          if (items.length === 0 && !loading) return null;
          return (
            <SectionBlock
              key={section.key}
              index={section.index}
              title={section.title}
              subtitle={section.subtitle}
              items={items}
              loading={loading}
            />
          );
        })}
      </section>

      <NameMarquee names={allNames.length > 0 ? allNames : FALLBACK.map((c) => c.name)} />

      <ClosingCTA onTryIt={onTryIt} />

      {showUploader && (
        <AvatarUploader
          onClose={() => setShowUploader(false)}
          onUpdated={() => setReloadKey((k) => k + 1)}
        />
      )}
    </div>
  );
}

function BackgroundLayers({ haloTransform }: { haloTransform: string }) {
  return (
    <div className="pointer-events-none fixed inset-0 -z-0 overflow-hidden">
      <div className="absolute inset-0 bg-[#08080a]" />
      <div className="absolute inset-0 bg-grid-tight opacity-[0.35] mask-fade-y" />
      <div
        className="absolute -top-[20%] left-[5%] w-[55vw] h-[55vw] rounded-full bg-amber-500/10 mobile-blur-light sm:blur-[120px] animate-blob-1"
        style={haloTransform !== 'none' ? { transform: haloTransform } : undefined}
      />
      <div
        className="absolute top-[40%] -right-[10%] w-[45vw] h-[45vw] rounded-full bg-rose-500/10 mobile-blur-light sm:blur-[140px] animate-blob-2"
      />
      <div
        className="absolute bottom-[5%] left-[20%] w-[40vw] h-[40vw] rounded-full bg-amber-300/[0.07] mobile-blur-light sm:blur-[120px] animate-blob-3"
      />
      <div className="absolute inset-0 bg-radial-amber animate-aurora" />
      <div className="absolute inset-0 bg-[#08080a]/30" />
    </div>
  );
}

function Stat({
  icon: Icon,
  value,
  label,
  suffix = '',
}: {
  icon: typeof Users;
  value: number;
  label: string;
  suffix?: string;
}) {
  const [n, setN] = useState(0);
  const ref = useScrollReveal<HTMLDivElement>();

  useEffect(() => {
    const start = performance.now();
    const dur = 1400;
    let raf = 0;
    function tick(t: number) {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(value * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return (
    <div ref={ref} className="scroll-reveal">
      <div className="flex items-center gap-1.5 text-stone-500 text-[11px] uppercase tracking-[0.18em] mb-2">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <div className="text-[28px] font-semibold tracking-[-0.02em] text-stone-50 tabular-nums">
        {n}
        {suffix}
      </div>
    </div>
  );
}

function FloatingPortraits({ items }: { items: Contributor[] }) {
  if (items.length === 0) return null;
  const positions = [
    { className: 'top-2 left-0', delay: '0s' },
    { className: 'top-10 right-2', delay: '0.6s' },
    { className: 'bottom-12 left-4', delay: '1.2s' },
    { className: 'bottom-4 right-8', delay: '0.3s' },
    { className: 'top-1/2 left-1/2 -translate-x-1/2', delay: '0.9s' },
  ];

  return (
    <>
      {items.map((c, i) => {
        const pos = positions[i % positions.length];
        const grad = gradientFor(c.name);
        return (
          <div
            key={c.id}
            className={`absolute ${pos.className} animate-float-soft`}
            style={{ animationDelay: pos.delay }}
          >
            <div className="relative">
              <div
                className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${grad} text-stone-900 text-[12px] font-semibold flex items-center justify-center shadow-[0_8px_30px_rgba(251,191,36,0.25)] border border-stone-50/15 backdrop-blur`}
              >
                {initials(c.name)}
              </div>
              <div className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#08080a]" />
            </div>
          </div>
        );
      })}
    </>
  );
}

function ManifestoSection() {
  const ref = useScrollReveal<HTMLDivElement>();
  return (
    <section className="relative py-24 sm:py-32">
      <div ref={ref} className="scroll-reveal max-w-5xl mx-auto px-6 sm:px-10">
        <div className="text-[11px] tracking-[0.3em] uppercase text-stone-500 mb-6">Manifesto</div>
        <p className="text-[26px] sm:text-[36px] lg:text-[44px] leading-[1.18] font-medium tracking-[-0.025em] text-stone-200/95">
          We believe a guest should never be asked to <span className="text-amber-300">repeat themselves</span>.
          That a kitchen should never lose an order to <span className="text-amber-300">a language barrier</span>.
          And that hospitality, at its very best, is the <span className="text-amber-300">art of being heard</span>.
        </p>
      </div>
    </section>
  );
}

function SectionBlock({
  index,
  title,
  subtitle,
  items,
  loading,
}: {
  index: string;
  title: string;
  subtitle: string;
  items: Contributor[];
  loading: boolean;
}) {
  const headerRef = useScrollReveal<HTMLDivElement>();
  return (
    <div>
      <div ref={headerRef} className="scroll-reveal mb-12">
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div className="flex items-end gap-6">
            <div className="text-[80px] sm:text-[110px] leading-none font-semibold tracking-[-0.04em] text-stroke select-none">
              {index}
            </div>
            <div className="pb-3">
              <h2 className="text-[28px] sm:text-[40px] font-semibold tracking-[-0.025em] text-stone-50 leading-[1.05]">
                {title}
              </h2>
              <p className="mt-2 text-[14px] text-stone-400 max-w-xl leading-relaxed">{subtitle}</p>
            </div>
          </div>
          <span className="text-[11px] uppercase tracking-[0.25em] text-stone-500">
            {items.length} {items.length === 1 ? 'person' : 'people'}
          </span>
        </div>
        <div className="mt-6 h-px w-full bg-gradient-to-r from-stone-50/20 via-stone-50/5 to-transparent" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {loading
          ? Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)
          : items.map((c, i) => <ContributorCard key={c.id} contributor={c} index={i} />)}
      </div>
    </div>
  );
}

function ContributorCard({ contributor, index }: { contributor: Contributor; index: number }) {
  const ref = useScrollReveal<HTMLDivElement>();
  const cardRef = useRef<HTMLDivElement>(null);
  const grad = gradientFor(contributor.name);
  const hasPhoto = Boolean(contributor.avatar_url);

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    el.style.setProperty('--spot-x', `${x}%`);
    el.style.setProperty('--spot-y', `${y}%`);
    const rx = (y - 50) * -0.05;
    const ry = (x - 50) * 0.05;
    el.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg)`;
  }
  function handleMouseLeave() {
    const el = cardRef.current;
    if (!el) return;
    el.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg)';
  }

  return (
    <div
      ref={ref}
      className="scroll-reveal h-full"
      style={{ transitionDelay: `${(index % 3) * 80}ms` }}
    >
      <div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="spotlight-card tilt-card group relative overflow-hidden rounded-3xl border border-stone-50/10 bg-gradient-to-b from-stone-50/[0.05] to-stone-50/[0.01] hover:border-amber-300/30 transition-colors duration-500 flex flex-col h-full"
      >
        <div className="relative aspect-[4/3] overflow-hidden">
          {hasPhoto ? (
            <img
              src={contributor.avatar_url}
              alt={contributor.name}
              loading="lazy"
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-[1.05]"
            />
          ) : (
            <>
              <div className={`absolute inset-0 bg-gradient-to-br ${grad} opacity-90`} />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-stone-50/25 text-[88px] leading-none font-semibold tracking-[-0.04em] select-none">
                  {initials(contributor.name)}
                </span>
              </div>
            </>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent pointer-events-none" />

          {contributor.location && (
            <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/45 backdrop-blur-md border border-stone-50/15 text-[10.5px] text-stone-100">
              <MapPin className="w-3 h-3" />
              {contributor.location}
            </div>
          )}
          {contributor.link_url && (
            <a
              href={contributor.link_url}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/45 backdrop-blur-md border border-stone-50/15 text-stone-100 hover:text-amber-300 hover:bg-black/60 transition-colors flex items-center justify-center"
              aria-label={`${contributor.name} external link`}
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>

        <div className="relative flex-1 p-6 flex flex-col">
          <div
            className={`pointer-events-none absolute -top-24 -right-20 w-56 h-56 rounded-full bg-gradient-to-br ${grad} opacity-0 blur-3xl group-hover:opacity-25 transition-opacity duration-700`}
          />
          <div className="relative">
            <div className="text-[10px] tracking-[0.3em] uppercase text-amber-300/90 mb-2">
              Algoritm
            </div>
            <h3 className="text-[18px] sm:text-[20px] font-semibold tracking-tight text-stone-50 leading-[1.15]">
              {contributor.name}
            </h3>
            {contributor.role && (
              <div className="mt-1.5 text-[12.5px] text-amber-200/90 font-medium">
                {contributor.role}
              </div>
            )}
            {contributor.bio && (
              <p className="mt-3 text-[12.5px] leading-[1.65] text-stone-300/85">
                {contributor.bio}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="rounded-3xl border border-stone-50/10 bg-stone-50/[0.03] overflow-hidden animate-pulse">
      <div className="aspect-[4/3] bg-stone-50/[0.05]" />
      <div className="p-6 space-y-2.5">
        <div className="h-2.5 bg-stone-50/10 rounded w-1/4" />
        <div className="h-4 bg-stone-50/10 rounded w-2/3" />
        <div className="h-3 bg-stone-50/10 rounded w-1/2" />
        <div className="h-2.5 bg-stone-50/10 rounded w-full mt-2" />
        <div className="h-2.5 bg-stone-50/10 rounded w-3/4" />
      </div>
    </div>
  );
}

function NameMarquee({ names }: { names: string[] }) {
  if (names.length === 0) return null;
  const looped = [...names, ...names, ...names];
  const ref = useScrollReveal<HTMLDivElement>();

  return (
    <section className="relative py-24 border-y border-stone-50/[0.06]">
      <div ref={ref} className="scroll-reveal max-w-7xl mx-auto px-6 sm:px-10 mb-10">
        <div className="text-[11px] tracking-[0.3em] uppercase text-stone-500">Wall of names</div>
        <h2 className="mt-3 text-[28px] sm:text-[36px] font-semibold tracking-[-0.025em] text-stone-100">
          Every name behind the orb.
        </h2>
      </div>

      <div className="marquee-mask space-y-3 select-none">
        <div className="flex gap-4 animate-marquee whitespace-nowrap">
          {looped.map((n, i) => (
            <NameChip key={`a-${i}`} name={n} accent={i % 4 === 0} />
          ))}
        </div>
        <div className="flex gap-4 animate-marquee-reverse whitespace-nowrap">
          {looped.map((n, i) => (
            <NameChip key={`b-${i}`} name={n} accent={i % 5 === 0} />
          ))}
        </div>
      </div>
    </section>
  );
}

function NameChip({ name, accent }: { name: string; accent: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-[14px] tracking-tight border ${
        accent
          ? 'bg-amber-400/10 border-amber-300/30 text-amber-200'
          : 'bg-stone-50/[0.04] border-stone-50/10 text-stone-300'
      }`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-amber-300/80" />
      {name}
    </span>
  );
}

function ClosingCTA({ onTryIt }: { onTryIt: () => void }) {
  const ref = useScrollReveal<HTMLDivElement>();
  const magneticBtn = useMagnetic<HTMLButtonElement>(0.32);
  return (
    <section className="relative py-32">
      <div
        ref={ref}
        className="scroll-reveal max-w-5xl mx-auto px-6 sm:px-10"
      >
        <div className="relative overflow-hidden rounded-[32px] border border-stone-50/10 bg-gradient-to-b from-stone-50/[0.05] to-transparent p-12 sm:p-16 text-center">
          <div className="absolute inset-0 bg-radial-amber opacity-60 pointer-events-none" />
          <div className="absolute inset-0 conic-sweep opacity-50 pointer-events-none" />
          <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-amber-500/10 blur-3xl animate-blob-1" />
          <div className="absolute -bottom-24 -right-24 w-96 h-96 rounded-full bg-rose-500/10 blur-3xl animate-blob-2" />

          <div className="relative">
            <div className="inline-flex items-center gap-2 bg-stone-50/[0.06] border border-stone-50/10 rounded-full px-3 py-1 text-[11px] tracking-[0.18em] uppercase text-stone-300">
              <Heart className="w-3 h-3 text-rose-300" />
              And countless more
            </div>
            <h2 className="mt-6 text-[34px] sm:text-[52px] font-semibold tracking-[-0.03em] leading-[1.05]">
              To every restaurant, every guest,
              <br />
              every late-night call —
              <br />
              <span className="text-shimmer animate-gradient-shift">thank you.</span>
            </h2>
            <p className="mt-6 text-[14.5px] text-stone-400 max-w-xl mx-auto leading-relaxed">
              Algoritm is shaped by the rooms we get to listen to. If your restaurant is one of
              them, we'd love to hear you next.
            </p>
            <button
              ref={magneticBtn}
              type="button"
              onClick={onTryIt}
              className="magnetic-cta mt-10 group inline-flex items-center gap-2 bg-amber-400 hover:bg-amber-300 text-stone-900 font-medium rounded-full pl-6 pr-5 py-3.5 text-[14px]"
            >
              Try Algoritm now
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function CategoryFilter({
  active,
  onChange,
  counts,
}: {
  active: string;
  onChange: (k: string) => void;
  counts: Record<string, number>;
}) {
  const ref = useScrollReveal<HTMLDivElement>();
  const options = [
    { key: 'all', label: 'Everyone' },
    { key: 'founders', label: 'Founders' },
    { key: 'engineering', label: 'Engineering & Design' },
    { key: 'data', label: 'Data' },
    { key: 'linguists', label: 'Linguists' },
  ].filter((o) => (o.key === 'all' ? true : (counts[o.key] ?? 0) > 0));

  return (
    <div ref={ref} className="scroll-reveal max-w-7xl mx-auto px-6 sm:px-10 pb-12">
      <div className="flex flex-wrap items-center gap-2 glass-panel-dark rounded-full p-1.5 w-fit">
        {options.map((o) => {
          const isActive = active === o.key;
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => onChange(o.key)}
              className={`relative inline-flex items-center gap-2 rounded-full px-4 py-2 text-[12.5px] font-medium transition-all ${
                isActive
                  ? 'bg-amber-400 text-stone-900 shadow-[0_8px_24px_rgba(251,191,36,0.4)]'
                  : 'text-stone-300 hover:text-stone-50 hover:bg-stone-50/[0.06]'
              }`}
            >
              {o.label}
              <span
                className={`text-[10px] tabular-nums tracking-wider px-1.5 py-0.5 rounded-full ${
                  isActive ? 'bg-stone-900/15 text-stone-900/80' : 'bg-stone-50/[0.08] text-stone-500'
                }`}
              >
                {counts[o.key] ?? 0}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
