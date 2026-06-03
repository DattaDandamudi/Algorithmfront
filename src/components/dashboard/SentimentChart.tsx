import { SmilePlus, Meh, Frown } from 'lucide-react';

interface SentimentChartProps {
  positive: number;
  neutral: number;
  negative: number;
}

export default function SentimentChart({ positive, neutral, negative }: SentimentChartProps) {
  const total = positive + neutral + negative || 1;
  const pct = {
    positive: Math.round((positive / total) * 100),
    neutral: Math.round((neutral / total) * 100),
    negative: Math.round((negative / total) * 100),
  };

  const segments = [
    {
      key: 'positive',
      label: 'Positive',
      value: positive,
      pct: pct.positive,
      color: 'bg-emerald-400',
      dotColor: 'bg-emerald-400',
      textColor: 'text-emerald-600',
      icon: SmilePlus,
    },
    {
      key: 'neutral',
      label: 'Neutral',
      value: neutral,
      pct: pct.neutral,
      color: 'bg-amber-300',
      dotColor: 'bg-amber-400',
      textColor: 'text-amber-600',
      icon: Meh,
    },
    {
      key: 'negative',
      label: 'Negative',
      value: negative,
      pct: pct.negative,
      color: 'bg-rose-400',
      dotColor: 'bg-rose-400',
      textColor: 'text-rose-500',
      icon: Frown,
    },
  ];

  const dominantIndex = segments.reduce((best, s, i) => s.value > segments[best].value ? i : best, 0);
  const dominant = segments[dominantIndex];

  return (
    <div className="bg-white rounded-2xl border border-stone-100/80 p-6 flex flex-col h-full">
      <div className="mb-6">
        <h3 className="text-[13px] font-semibold text-stone-700 tracking-tight">Sentiment</h3>
        <p className="text-[11px] text-stone-400 mt-0.5">Customer satisfaction</p>
      </div>

      <div className="flex-1 flex flex-col justify-center">
        <div className="flex items-center justify-center mb-6">
          <div className="relative">
            <svg viewBox="0 0 120 120" className="w-32 h-32">
              {(() => {
                const radius = 50;
                const circumference = 2 * Math.PI * radius;
                let offset = 0;

                return segments.map((s) => {
                  const dashLength = (s.pct / 100) * circumference;
                  const dashOffset = -offset;
                  offset += dashLength;

                  const colorMap: Record<string, string> = {
                    positive: '#34d399',
                    neutral: '#fbbf24',
                    negative: '#fb7185',
                  };

                  return (
                    <circle
                      key={s.key}
                      cx="60"
                      cy="60"
                      r={radius}
                      fill="none"
                      stroke={colorMap[s.key]}
                      strokeWidth="8"
                      strokeDasharray={`${dashLength} ${circumference - dashLength}`}
                      strokeDashoffset={dashOffset}
                      strokeLinecap="round"
                      className="transition-all duration-1000 ease-out"
                      transform="rotate(-90 60 60)"
                    />
                  );
                });
              })()}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[22px] font-semibold text-stone-800 leading-none">{dominant.pct}%</span>
              <span className={`text-[10px] font-medium mt-1 ${dominant.textColor}`}>{dominant.label}</span>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {segments.map((s) => (
            <div key={s.key} className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className={`w-2 h-2 rounded-full ${s.dotColor}`} />
                <span className="text-[12px] text-stone-600 font-medium">{s.label}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[12px] font-semibold text-stone-700 tabular-nums">{s.value}</span>
                <span className="text-[10px] text-stone-400 w-8 text-right tabular-nums">{s.pct}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
