import { CalendarCheck, ShoppingBag, Phone, ChefHat, Users, Wallet, Clock, CheckCircle2, Zap, ArrowUpRight } from 'lucide-react';
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

        <div className="mt-10 sm:mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
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
        className="spotlight-card tilt-card group relative overflow-hidden rounded-2xl sm:rounded-3xl border border-stone-50/[0.08] bg-[#0c0c0e] hover:border-stone-50/20 transition-all duration-500 h-full"
      >
        <div className={`pointer-events-none absolute -top-24 -right-24 w-72 h-72 rounded-full bg-gradient-radial ${ACCENT_GLOW[feature.accent]} opacity-0 group-hover:opacity-100 transition-opacity duration-700`} />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-stone-50/[0.03] to-transparent opacity-60" />

        <div className="relative p-5 sm:p-6 flex flex-col h-full">
          <div className="flex items-start justify-between mb-4">
            <div
              className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-gradient-to-br ${ACCENT_ICON[feature.accent]} border flex items-center justify-center shadow-lg`}
            >
              <Icon className="w-[18px] h-[18px] sm:w-5 sm:h-5" />
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/80" />
              <span className="text-[9px] tracking-[0.2em] uppercase text-stone-500">Active</span>
            </div>
          </div>

          <div className="relative rounded-xl sm:rounded-2xl overflow-hidden border border-stone-50/[0.06] bg-stone-50/[0.02] flex-1 min-h-[160px] sm:min-h-[180px]">
            <FeatureVisual kind={feature.visual} accent={feature.accent} />
          </div>

          <div className="mt-5">
            <div className="flex items-center gap-2">
              <h3 className="text-[16px] sm:text-[18px] font-semibold tracking-tight text-stone-100">
                {feature.title}
              </h3>
              <ArrowUpRight className="w-3.5 h-3.5 text-stone-600 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300" />
            </div>
            <p className="mt-2 text-[12.5px] sm:text-[13px] text-stone-400 leading-[1.65]">{feature.desc}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureVisual({ kind, accent }: { kind: string; accent: string }) {
  const accentColor =
    accent === 'amber' ? '#fbbf24' : accent === 'rose' ? '#fb7185' : '#22d3ee';
  const accentDim =
    accent === 'amber' ? '#b4580820' : accent === 'rose' ? '#9f123620' : '#0e748820';

  if (kind === 'reservation') {
    return (
      <div className="absolute inset-0 p-3 sm:p-4 flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: accentColor }} />
            <span className="text-[10px] font-medium text-stone-300">March 2026</span>
          </div>
          <span className="text-[9px] tracking-wider uppercase text-stone-500">Floor plan</span>
        </div>
        <div className="flex-1 grid grid-cols-7 grid-rows-4 gap-1">
          {Array.from({ length: 28 }).map((_, i) => {
            const isBooked = [4, 10, 11, 17, 18, 19, 24, 25].includes(i);
            const isHighlight = i === 18;
            return (
              <div
                key={i}
                className="rounded-md flex items-center justify-center text-[9px] font-medium transition-all duration-300"
                style={{
                  background: isHighlight
                    ? `linear-gradient(135deg, ${accentColor}44, ${accentColor}22)`
                    : isBooked
                    ? 'rgba(255,255,255,0.04)'
                    : 'transparent',
                  border: isHighlight
                    ? `1px solid ${accentColor}88`
                    : isBooked
                    ? '1px solid rgba(255,255,255,0.06)'
                    : '1px solid transparent',
                  color: isHighlight ? accentColor : isBooked ? '#a8a29e' : '#57534e',
                  boxShadow: isHighlight ? `0 4px 16px ${accentColor}25` : undefined,
                }}
              >
                {i + 1}
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex items-center gap-3 pt-2 border-t border-stone-50/[0.05]">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ background: `${accentColor}55` }} />
            <span className="text-[9px] text-stone-500">Booked</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm border border-stone-50/10" />
            <span className="text-[9px] text-stone-500">Available</span>
          </div>
          <div className="ml-auto flex items-center gap-1" style={{ color: accentColor }}>
            <CheckCircle2 className="w-3 h-3" />
            <span className="text-[9px] font-medium">Auto-confirmed</span>
          </div>
        </div>
      </div>
    );
  }

  if (kind === 'order') {
    const items = [
      { name: 'Truffle Risotto', mod: 'No mushroom', price: '$24' },
      { name: 'Wagyu Tartare', mod: 'Extra capers', price: '$32' },
      { name: 'Tiramisu', mod: '', price: '$14' },
    ];
    return (
      <div className="absolute inset-0 p-3 sm:p-4 flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: `${accentColor}22`, border: `1px solid ${accentColor}44` }}>
              <ShoppingBag className="w-3 h-3" style={{ color: accentColor }} />
            </div>
            <span className="text-[10px] font-medium text-stone-300">Order #20457</span>
          </div>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium" style={{ background: `${accentColor}18`, color: accentColor, border: `1px solid ${accentColor}33` }}>
            <Zap className="w-2.5 h-2.5" />
            Live
          </span>
        </div>
        <div className="flex-1 flex flex-col justify-center gap-2">
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-stone-50/[0.03] border border-stone-50/[0.05] group/item hover:border-stone-50/10 transition-colors">
              <div className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-semibold" style={{ background: `${accentColor}15`, color: accentColor }}>
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-medium text-stone-200 truncate">{item.name}</div>
                {item.mod && <div className="text-[9px] text-stone-500 mt-0.5">{item.mod}</div>}
              </div>
              <span className="text-[11px] font-medium text-stone-300">{item.price}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between pt-2 border-t border-stone-50/[0.05]">
          <span className="text-[9px] text-stone-500">Upsell suggested</span>
          <span className="text-[11px] font-semibold" style={{ color: accentColor }}>$70.00</span>
        </div>
      </div>
    );
  }

  if (kind === 'phone') {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 50% 50%, ${accentColor}08, transparent 70%)` }} />
        <div className="absolute w-32 h-32 sm:w-36 sm:h-36 rounded-full border border-dashed opacity-20 animate-orb-spin-slow" style={{ borderColor: accentColor }} />
        <div className="absolute w-24 h-24 sm:w-28 sm:h-28 rounded-full animate-ring-pulse" style={{ border: `1px solid ${accentColor}30` }} />
        <div className="absolute w-16 h-16 sm:w-20 sm:h-20 rounded-full animate-ring-pulse" style={{ border: `1.5px solid ${accentColor}50`, animationDelay: '0.5s' }} />
        <div
          className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center shadow-2xl"
          style={{
            background: `linear-gradient(135deg, ${accentColor}, ${accentColor}88)`,
            boxShadow: `0 8px 32px ${accentColor}40, 0 0 0 1px ${accentColor}60`,
          }}
        >
          <Phone className="w-5 h-5 sm:w-6 sm:h-6 text-stone-900" />
        </div>
        <div className="absolute bottom-3 sm:bottom-4 left-0 right-0 flex justify-center gap-4">
          <MiniStat label="Answered" value="100%" color={accentColor} />
          <MiniStat label="Avg wait" value="0.4s" color={accentColor} />
        </div>
      </div>
    );
  }

  if (kind === 'menu') {
    const tags = [
      { label: 'Allergens', items: ['Peanuts', 'Gluten', 'Dairy'], icon: '!' },
      { label: 'Wine Pairs', items: ['Pinot Noir', 'Chablis'], icon: '~' },
      { label: 'Specials', items: ['Truffle pasta', 'Wagyu'], icon: '*' },
    ];
    return (
      <div className="absolute inset-0 p-3 sm:p-4 flex flex-col">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-3 h-3 text-stone-500" />
          <span className="text-[9px] text-stone-500 uppercase tracking-wider">Real-time menu knowledge</span>
        </div>
        <div className="flex-1 grid grid-cols-3 gap-2">
          {tags.map((tag, i) => (
            <div
              key={tag.label}
              className="rounded-xl border border-stone-50/[0.06] bg-stone-50/[0.02] p-2.5 flex flex-col"
              style={{ animationDelay: `${i * 0.4}s` }}
            >
              <div className="w-6 h-6 rounded-lg mb-2 flex items-center justify-center text-[11px] font-bold" style={{ background: `${accentColor}15`, color: accentColor }}>
                {tag.icon}
              </div>
              <div className="text-[9px] uppercase tracking-wider text-stone-500 mb-1.5">{tag.label}</div>
              <div className="flex-1 flex flex-col gap-1">
                {tag.items.map((item) => (
                  <div key={item} className="text-[10px] text-stone-300 flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: accentColor }} />
                    <span className="truncate">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2 pt-2 border-t border-stone-50/[0.05] flex items-center gap-1.5">
          <CheckCircle2 className="w-3 h-3" style={{ color: accentColor }} />
          <span className="text-[9px] text-stone-400">Answers guest questions with 98.4% accuracy</span>
        </div>
      </div>
    );
  }

  if (kind === 'wait') {
    const parties = [
      { name: 'Martinez', size: 4, wait: '5 min', progress: 90 },
      { name: 'Chen', size: 2, wait: '12 min', progress: 65 },
      { name: 'Williams', size: 6, wait: '20 min', progress: 35 },
      { name: 'Patel', size: 3, wait: '28 min', progress: 15 },
    ];
    return (
      <div className="absolute inset-0 p-3 sm:p-4 flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-medium text-stone-300">Live waitlist</span>
          <span className="inline-flex items-center gap-1 text-[9px] text-stone-500">
            <Users className="w-3 h-3" />
            {parties.length} parties
          </span>
        </div>
        <div className="flex-1 flex flex-col gap-1.5">
          {parties.map((p, i) => (
            <div key={i} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-stone-50/[0.02] border border-stone-50/[0.04]">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-semibold" style={{ background: `${accentColor}12`, color: accentColor, border: `1px solid ${accentColor}30` }}>
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-[10.5px] font-medium text-stone-200">{p.name}</span>
                  <span className="text-[9px] text-stone-500">{p.size} guests</span>
                </div>
                <div className="mt-1 h-1 rounded-full bg-stone-50/[0.06] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-1000"
                    style={{
                      width: `${p.progress}%`,
                      background: `linear-gradient(90deg, ${accentColor}, ${accentColor}66)`,
                      boxShadow: `0 0 8px ${accentColor}40`,
                    }}
                  />
                </div>
              </div>
              <span className="text-[9px] font-medium tabular-nums text-stone-400 w-10 text-right">{p.wait}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (kind === 'money') {
    const bars = [
      { label: 'Mon', before: 20, after: 55 },
      { label: 'Tue', before: 30, after: 70 },
      { label: 'Wed', before: 25, after: 65 },
      { label: 'Thu', before: 35, after: 80 },
      { label: 'Fri', before: 40, after: 92 },
      { label: 'Sat', before: 38, after: 88 },
      { label: 'Sun', before: 22, after: 60 },
    ];
    return (
      <div className="absolute inset-0 p-3 sm:p-4 flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-medium text-stone-300">Revenue recovered</span>
          <span className="text-[11px] font-semibold" style={{ color: accentColor }}>+70%</span>
        </div>
        <div className="flex-1 flex items-end gap-1.5">
          {bars.map((b, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full flex items-end gap-[2px]" style={{ height: '100%' }}>
                <div
                  className="flex-1 rounded-t-sm opacity-40"
                  style={{
                    height: `${b.before}%`,
                    background: 'rgba(255,255,255,0.12)',
                  }}
                />
                <div
                  className="flex-1 rounded-t-sm"
                  style={{
                    height: `${b.after}%`,
                    background: `linear-gradient(180deg, ${accentColor}, ${accentColor}44)`,
                    boxShadow: `0 -4px 12px ${accentColor}20`,
                  }}
                />
              </div>
              <span className="text-[8px] text-stone-600">{b.label}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 pt-2 border-t border-stone-50/[0.05] flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-sm bg-stone-50/10" />
            <span className="text-[9px] text-stone-500">Before</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-sm" style={{ background: accentColor }} />
            <span className="text-[9px] text-stone-500">With Algoritm</span>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-[12px] font-semibold tabular-nums" style={{ color }}>{value}</span>
      <span className="text-[8px] uppercase tracking-wider text-stone-500 mt-0.5">{label}</span>
    </div>
  );
}
