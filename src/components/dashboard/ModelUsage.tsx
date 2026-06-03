import { Brain } from 'lucide-react';

interface ModelStat {
  model: string;
  count: number;
  percentage: number;
}

interface ModelUsageProps {
  data: ModelStat[];
}

const MODEL_ACCENTS: Record<string, { border: string; bg: string; text: string; bar: string }> = {
  'GPT-4o': { border: 'border-emerald-100', bg: 'bg-emerald-50/50', text: 'text-emerald-600', bar: 'bg-emerald-400' },
  'Claude 3.5 Sonnet': { border: 'border-amber-100', bg: 'bg-amber-50/50', text: 'text-amber-600', bar: 'bg-amber-400' },
  'Gemini Pro': { border: 'border-sky-100', bg: 'bg-sky-50/50', text: 'text-sky-600', bar: 'bg-sky-400' },
};

const DEFAULT_ACCENT = { border: 'border-stone-100', bg: 'bg-stone-50/50', text: 'text-stone-500', bar: 'bg-stone-400' };

export default function ModelUsage({ data }: ModelUsageProps) {
  return (
    <div className="bg-white rounded-2xl border border-stone-100/80 p-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h3 className="text-[13px] font-semibold text-stone-700 tracking-tight">Models</h3>
          <p className="text-[11px] text-stone-400 mt-0.5">LLM usage distribution</p>
        </div>
        <div className="w-8 h-8 rounded-lg bg-stone-50 flex items-center justify-center">
          <Brain className="w-4 h-4 text-stone-400" strokeWidth={1.5} />
        </div>
      </div>

      <div className="space-y-3">
        {data.map((item) => {
          const accent = MODEL_ACCENTS[item.model] ?? DEFAULT_ACCENT;
          return (
            <div
              key={item.model}
              className={`relative overflow-hidden rounded-xl border ${accent.border} ${accent.bg} p-4 transition-all duration-300 hover:shadow-sm`}
            >
              <div className="absolute bottom-0 left-0 h-[2px] rounded-full transition-all duration-700" style={{ width: `${item.percentage}%` }}>
                <div className={`w-full h-full ${accent.bar} rounded-full`} />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white/80 flex items-center justify-center">
                    <Brain className={`w-4 h-4 ${accent.text}`} strokeWidth={1.5} />
                  </div>
                  <div>
                    <p className="text-[12px] font-semibold text-stone-700">{item.model}</p>
                    <p className="text-[10px] text-stone-400 mt-0.5">{item.count} calls</p>
                  </div>
                </div>
                <span className="text-[18px] font-semibold text-stone-700 tabular-nums">{item.percentage}%</span>
              </div>
            </div>
          );
        })}

        {data.length === 0 && (
          <p className="text-[12px] text-stone-400 text-center py-6">No model data yet</p>
        )}
      </div>
    </div>
  );
}
