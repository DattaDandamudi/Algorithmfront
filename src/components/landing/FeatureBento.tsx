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

const ACCENT: Record<string, string> = {
  amber: 'from-amber-400/20 to-amber-300/5 border-amber-300/30 text-amber-200',
  rose: 'from-rose-400/20 to-rose-300/5 border-rose-300/30 text-rose-200',
  cyan: 'from-cyan-400/20 to-cyan-300/5 border-cyan-300/30 text-cyan-200',
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
        className="spotlight-card tilt-card group relative overflow-hidden rounded-2xl sm:rounded-3xl border border-stone-50/10 bg-gradient-to-b from-stone-50/[0.04] to-stone-50/[0.01] p-5 sm:p-6 hover:border-stone-50/25 transition-colors duration-500"
      >
        <div
          className={`pointer-events-none absolute -top-20 -right-20 w-56 h-56 rounded-full bg-gradient-to-br ${ACCENT[feature.accent]} blur-3xl opacity-30 group-hover:opacity-70 transition-opacity duration-700`}
        />

        <div className="relative">
          <div className="flex items-start justify-between">
            <div
              className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${ACCENT[feature.accent]} border flex items-center justify-center shadow-[0_6px_24px_rgba(0,0,0,0.25)]`}
            >
              <Icon className="w-5 h-5" />
            </div>
            <div className="text-[10px] tracking-[0.25em] uppercase text-stone-600">
              0{index + 1}
            </div>
          </div>

          <div className="mt-12 h-28 flex items-end">
            <FeatureVisual kind={feature.visual} accent={feature.accent} />
          </div>

          <h3 className="mt-7 text-[18px] font-semibold tracking-tight text-stone-100">
            {feature.title}
          </h3>
          <p className="mt-2 text-[13px] text-stone-400 leading-[1.65]">{feature.desc}</p>
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
      <div className="relative w-full h-full">
        <div className="absolute inset-x-0 top-2 grid grid-cols-7 gap-1.5">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className="h-12 rounded-lg border border-stone-50/10 bg-stone-50/[0.04]"
              style={{
                background: i === 4 ? `linear-gradient(180deg, ${accentColor}33, ${accentColor}11)` : undefined,
                borderColor: i === 4 ? `${accentColor}80` : undefined,
              }}
            >
              <div className="h-full flex items-center justify-center text-[10px] text-stone-400 font-medium">
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'][i]}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (kind === 'order') {
    return (
      <div className="w-full h-full flex items-end">
        <div className="w-full bg-stone-50/[0.04] border border-stone-50/10 rounded-xl p-3 animate-float-soft">
          <div className="flex items-center justify-between text-[10.5px] text-stone-400 mb-2">
            <span>Order #20457</span>
            <span style={{ color: accentColor }}>Confirmed</span>
          </div>
          {['Pad Thai', 'Spring Rolls', 'Thai Iced Tea'].map((item, i) => (
            <div key={item} className="flex items-center justify-between py-1 border-t border-stone-50/5 first:border-t-0">
              <span className="text-[11px] text-stone-200">{item}</span>
              <span className="text-[10.5px] text-stone-500">x{i + 1}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (kind === 'phone') {
    return (
      <div className="relative w-full h-full flex items-center justify-center">
        <div className="absolute w-24 h-24 rounded-full border animate-ring-pulse" style={{ borderColor: `${accentColor}40` }} />
        <div className="absolute w-16 h-16 rounded-full border animate-ring-pulse" style={{ borderColor: `${accentColor}60`, animationDelay: '0.6s' }} />
        <div
          className="relative w-12 h-12 rounded-2xl flex items-center justify-center"
          style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentColor}66)` }}
        >
          <Phone className="w-5 h-5 text-stone-900" />
        </div>
      </div>
    );
  }

  if (kind === 'menu') {
    return (
      <div className="w-full h-full flex items-end gap-2">
        {['Allergens', 'Pairings', 'Specials'].map((tag, i) => (
          <div
            key={tag}
            className="flex-1 h-full rounded-xl border border-stone-50/10 bg-stone-50/[0.04] p-2.5 flex flex-col justify-end animate-float-soft"
            style={{ animationDelay: `${i * 0.4}s` }}
          >
            <div className="text-[9.5px] uppercase tracking-wider text-stone-500">{tag}</div>
            <div className="text-[10.5px] mt-1" style={{ color: accentColor }}>
              {['Peanuts noted', 'Pinot Noir', 'Truffle pasta'][i]}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (kind === 'wait') {
    return (
      <div className="w-full h-full flex flex-col justify-end gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full border border-stone-50/15 bg-stone-50/[0.05] flex items-center justify-center text-[9px] text-stone-400 font-medium">
              {i + 1}
            </div>
            <div className="flex-1 h-1.5 rounded-full bg-stone-50/[0.06] overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${[80, 55, 30, 10][i]}%`,
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
    return (
      <div className="w-full h-full flex items-end gap-1.5">
        {[40, 65, 50, 80, 60, 92, 75].map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-t-md"
            style={{
              height: `${h}%`,
              background: `linear-gradient(180deg, ${accentColor}, ${accentColor}33)`,
            }}
          />
        ))}
      </div>
    );
  }

  return null;
}
