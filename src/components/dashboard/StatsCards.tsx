import { Phone, Clock, TrendingUp, ShoppingBag } from 'lucide-react';

interface StatsCardsProps {
  totalCalls: number;
  avgDuration: number;
  completionRate: number;
  totalOrders: number;
}

const CARDS = [
  {
    key: 'calls',
    label: 'Total Calls',
    icon: Phone,
    accent: 'from-amber-400 to-orange-300',
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-500',
    format: (v: number) => v.toLocaleString(),
  },
  {
    key: 'duration',
    label: 'Avg Duration',
    icon: Clock,
    accent: 'from-teal-400 to-emerald-300',
    iconBg: 'bg-teal-50',
    iconColor: 'text-teal-500',
    format: (v: number) => {
      const m = Math.floor(v / 60);
      const s = v % 60;
      return `${m}m ${s}s`;
    },
  },
  {
    key: 'rate',
    label: 'Completion Rate',
    icon: TrendingUp,
    accent: 'from-sky-400 to-blue-300',
    iconBg: 'bg-sky-50',
    iconColor: 'text-sky-500',
    format: (v: number) => `${v}%`,
  },
  {
    key: 'orders',
    label: 'Total Orders',
    icon: ShoppingBag,
    accent: 'from-rose-400 to-pink-300',
    iconBg: 'bg-rose-50',
    iconColor: 'text-rose-500',
    format: (v: number) => v.toLocaleString(),
  },
] as const;

export default function StatsCards({
  totalCalls,
  avgDuration,
  completionRate,
  totalOrders,
}: StatsCardsProps) {
  const values: Record<string, number> = {
    calls: totalCalls,
    duration: avgDuration,
    rate: completionRate,
    orders: totalOrders,
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
      {CARDS.map((card, index) => {
        const Icon = card.icon;
        return (
          <div
            key={card.key}
            className="group relative overflow-hidden rounded-2xl bg-white border border-stone-100/80 p-6 transition-all duration-500 hover:shadow-xl hover:shadow-stone-900/[0.04] hover:-translate-y-1 dashboard-card-enter"
            style={{ animationDelay: `${index * 80}ms` }}
          >
            <div className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${card.accent} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />

            <div className="flex items-center justify-between mb-5">
              <div className={`w-10 h-10 rounded-xl ${card.iconBg} flex items-center justify-center transition-transform duration-500 group-hover:scale-110`}>
                <Icon className={`w-[18px] h-[18px] ${card.iconColor}`} strokeWidth={1.8} />
              </div>
            </div>

            <p className="text-[28px] font-semibold text-stone-800 tracking-tight leading-none mb-1.5">
              {card.format(values[card.key])}
            </p>
            <p className="text-[11px] text-stone-400 font-medium tracking-wide uppercase">{card.label}</p>
          </div>
        );
      })}
    </div>
  );
}
