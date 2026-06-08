import { CalendarCheck, ShoppingBag, Phone, ChefHat, Users, Wallet } from 'lucide-react';
import { useScrollReveal, useTilt } from './scroll';

const FEATURES = [
  {
    title: 'Reservations on autopilot',
    desc: 'Books, modifies, and confirms tables across your floor plan in real time — no overbookings, ever.',
    icon: CalendarCheck,
    accent: 'amber',
    visual: 'reservation',
  },
  {
    title: 'Takeout & delivery orders',
    desc: 'Reads your menu, suggests upsells, handles modifiers, and routes the order straight to your POS.',
    icon: ShoppingBag,
    accent: 'rose',
    visual: 'order',
  },
  {
    title: 'Always answers',
    desc: 'Picks up on the first ring, around the clock, in 80+ languages — you never miss a call again.',
    icon: Phone,
    accent: 'cyan',
    visual: 'phone',
  },
  {
    title: 'Knows your menu',
    desc: 'Allergens, ingredients, specials, wine pairings — answers anything a guest could ask.',
    icon: ChefHat,
    accent: 'amber',
    visual: 'menu',
  },
  {
    title: 'Manages waitlists',
    desc: 'Smart wait times, SMS notifications, and party-size routing — your host stand, automated.',
    icon: Users,
    accent: 'rose',
    visual: 'wait',
  },
  {
    title: 'Pays for itself',
    desc: 'Cuts call-handling labor by 70%, and recovers revenue from every missed call after hours.',
    icon: Wallet,
    accent: 'cyan',
    visual: 'money',
  },
];

const ACCENT_ICON: Record<string, string> = {
  amber: 'from-amber-400/25 to-amber-600/10 border-amber-400/40 text-amber-300',
  rose: 'from-rose-400/25 to-rose-600/10 border-rose-400/40 text-rose-300',
  cyan: 'from-cyan-400/25 to-cyan-600/10 border-cyan-400/40 text-cyan-300',
};

const ACCENT_GLOW: Record<string, string> = {
  amber: 'from-amber-400/15 via-amber-500/5 to-transparent',
  rose: 'from-rose-400/15 via-rose-500/5 to-transparent',
  cyan: 'from-cyan-400/15 via-cyan-500/5 to-transparent',
};

export default function FeatureBento() {
  const headerRef = useScrollReveal<HTMLDivElement>();

  return (
    <section className="relative text-stone-50 py-20 sm:py-32 overflow-hidden">
      <div className="absolute left-1/2 top-0 -translate-x-1/2 w-[80%] h-px bg-gradient-to-r from-transparent via-stone-50/15 to-transparent" />

      <div className="relative max-w-7xl mx-auto px-5 sm:px-10">
        <div ref={headerRef} className="scroll-reveal">
          <div className="flex items-end gap-4 sm:gap-6 flex-wrap">
            <div className="text-[60px] sm:text-[80px] lg:text-[110px] leading-none font-semibold tracking-[-0.04em] text-stroke select-none">
              02
            </div>
            <div className="pb-2 sm:pb-3">
              <div className="inline-flex items-center gap-2 bg-stone-50/[0.05] border border-stone-50/10 rounded-full px-3 py-1 text-[11px] tracking-[0.18em] uppercase text-stone-300">
                Capabilities
              </div>
              <h2 className="mt-3 sm:mt-4 text-[28px] sm:text-[42px] lg:text-[52px] font-semibold tracking-[-0.025em] leading-[1.08] sm:leading-[1.04]">
                One agent. <span className="text-shimmer animate-gradient-shift">Every shift.</span>
                <br className="hidden sm:block" />
                <span className="sm:hidden"> </span>
                Every language.
              </h2>
            </div>
          </div>
          <p className="mt-4 sm:mt-6 text-[13.5px] sm:text-[15px] text-stone-400 leading-[1.65] sm:leading-[1.7] max-w-2xl">
            Algoritm runs your front-of-house phone like a seasoned host with infinite patience —
            handling everything from a casual table booking to a complex multi-course inquiry.
          </p>
          <div className="mt-6 sm:mt-8 h-px w-full bg-gradient-to-r from-stone-50/20 via-stone-50/5 to-transparent" />
        </div>

        <div className="mt-10 sm:mt-14 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-3 sm:gap-4">
          {FEATURES.map((f, i) => (
            <FeatureCard key={f.title} feature={f} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureCard({
  feature,
  index,
}: {
  feature: (typeof FEATURES)[number];
  index: number;
}) {
  const reveal = useScrollReveal<HTMLDivElement>();
  const tilt = useTilt<HTMLDivElement>();
  const Icon = feature.icon;

  return (
    <div
      ref={reveal}
      className="scroll-reveal"
      style={{ transitionDelay: `${(index % 3) * 90}ms` }}
    >
      <div
        ref={tilt.ref}
        onMouseMove={tilt.onMouseMove}
        onMouseLeave={tilt.onMouseLeave}
        className="spotlight-card tilt-card group relative overflow-hidden rounded-2xl border border-stone-50/[0.08] bg-[#0c0c0e] hover:border-stone-50/20 transition-all duration-500 aspect-square"
      >
        <div className={`pointer-events-none absolute -top-16 -right-16 w-48 h-48 rounded-full bg-gradient-to-br ${ACCENT_GLOW[feature.accent]} opacity-0 group-hover:opacity-100 transition-opacity duration-700 blur-2xl`} />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-stone-50/[0.03] to-transparent opacity-60" />

        <div className="relative p-4 flex flex-col h-full">
          <div className="flex items-start justify-between">
            <div
              className={`w-8 h-8 rounded-lg bg-gradient-to-br ${ACCENT_ICON[feature.accent]} border flex items-center justify-center`}
            >
              <Icon className="w-4 h-4" />
            </div>
          </div>

          <div className="relative flex-1 mt-3 rounded-lg overflow-hidden border border-stone-50/[0.05] bg-stone-50/[0.02]">
            <FeatureVisual kind={feature.visual} accent={feature.accent} />
          </div>

          <div className="mt-3">
            <h3 className="text-[13px] font-semibold tracking-tight text-stone-100 leading-tight">
              {feature.title}
            </h3>
            <p className="mt-1 text-[10.5px] text-stone-500 leading-[1.5] line-clamp-2">{feature.desc}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureVisual({ kind, accent }: { kind: string; accent: string }) {
  const accentColor =
    accent === 'amber' ? '#fbbf24' : accent === 'rose' ? '#fb7185' : '#22d3ee';

  if (kind === 'reservation') {
    return (
      <div className="absolute inset-0 p-2.5 flex flex-col">
        <div className="flex-1 grid grid-cols-7 grid-rows-4 gap-[3px]">
          {Array.from({ length: 28 }).map((_, i) => {
            const isBooked = [4, 10, 11, 17, 18, 19, 24, 25].includes(i);
            const isHighlight = i === 18;
            return (
              <div
                key={i}
                className="rounded flex items-center justify-center text-[7px] font-medium"
                style={{
                  background: isHighlight
                    ? `${accentColor}33`
                    : isBooked
                    ? 'rgba(255,255,255,0.04)'
                    : 'transparent',
                  border: isHighlight
                    ? `1px solid ${accentColor}77`
                    : '1px solid rgba(255,255,255,0.04)',
                  color: isHighlight ? accentColor : isBooked ? '#a8a29e' : '#44403c',
                  boxShadow: isHighlight ? `0 2px 8px ${accentColor}30` : undefined,
                }}
              >
                {i + 1}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (kind === 'order') {
    const items = ['Truffle Risotto', 'Wagyu Tartare', 'Tiramisu'];
    return (
      <div className="absolute inset-0 p-2.5 flex flex-col justify-center gap-1.5">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-stone-50/[0.03] border border-stone-50/[0.05]">
            <div className="w-4 h-4 rounded flex items-center justify-center text-[8px] font-bold" style={{ background: `${accentColor}18`, color: accentColor }}>
              {i + 1}
            </div>
            <span className="text-[9px] text-stone-300 flex-1 truncate">{item}</span>
          </div>
        ))}
        <div className="flex items-center justify-end mt-0.5">
          <span className="text-[9px] font-semibold" style={{ color: accentColor }}>$70</span>
        </div>
      </div>
    );
  }

  if (kind === 'phone') {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 50% 50%, ${accentColor}0a, transparent 70%)` }} />
        <div className="absolute w-20 h-20 rounded-full animate-ring-pulse" style={{ border: `1px solid ${accentColor}25` }} />
        <div className="absolute w-14 h-14 rounded-full animate-ring-pulse" style={{ border: `1px solid ${accentColor}40`, animationDelay: '0.5s' }} />
        <div
          className="relative w-10 h-10 rounded-xl flex items-center justify-center"
          style={{
            background: `linear-gradient(135deg, ${accentColor}, ${accentColor}88)`,
            boxShadow: `0 6px 20px ${accentColor}40`,
          }}
        >
          <Phone className="w-4 h-4 text-stone-900" />
        </div>
      </div>
    );
  }

  if (kind === 'menu') {
    const tags = ['Peanuts', 'Gluten-free', 'Pinot Noir', 'Truffle', 'Dairy', 'Wagyu'];
    return (
      <div className="absolute inset-0 p-2.5 flex flex-wrap gap-1.5 content-center justify-center">
        {tags.map((tag, i) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[8px] font-medium border"
            style={{
              background: i < 2 ? `${accentColor}12` : 'rgba(255,255,255,0.02)',
              borderColor: i < 2 ? `${accentColor}30` : 'rgba(255,255,255,0.06)',
              color: i < 2 ? accentColor : '#a8a29e',
            }}
          >
            <span className="w-1 h-1 rounded-full" style={{ background: i < 2 ? accentColor : '#57534e' }} />
            {tag}
          </span>
        ))}
      </div>
    );
  }

  if (kind === 'wait') {
    const progress = [90, 60, 35, 12];
    return (
      <div className="absolute inset-0 p-2.5 flex flex-col justify-center gap-2">
        {progress.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-bold" style={{ border: `1px solid ${accentColor}40`, color: accentColor }}>
              {i + 1}
            </div>
            <div className="flex-1 h-1.5 rounded-full bg-stone-50/[0.06] overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${p}%`,
                  background: `linear-gradient(90deg, ${accentColor}, ${accentColor}55)`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (kind === 'money') {
    const bars = [40, 65, 50, 80, 60, 92, 75];
    return (
      <div className="absolute inset-0 p-2.5 flex flex-col">
        <div className="flex items-center justify-end mb-1">
          <span className="text-[9px] font-semibold" style={{ color: accentColor }}>+70%</span>
        </div>
        <div className="flex-1 flex items-end gap-1">
          {bars.map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-t-sm"
              style={{
                height: `${h}%`,
                background: `linear-gradient(180deg, ${accentColor}, ${accentColor}33)`,
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  return null;
}
