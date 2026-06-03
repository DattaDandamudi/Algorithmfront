import { Globe } from 'lucide-react';

interface LanguageStat {
  language: string;
  count: number;
  percentage: number;
}

interface LanguageBreakdownProps {
  data: LanguageStat[];
}

const LANG_COLORS: Record<string, { bar: string; dot: string }> = {
  Telugu: { bar: 'bg-amber-400', dot: 'bg-amber-400' },
  Hindi: { bar: 'bg-teal-400', dot: 'bg-teal-400' },
  Tamil: { bar: 'bg-sky-400', dot: 'bg-sky-400' },
  Malayalam: { bar: 'bg-rose-400', dot: 'bg-rose-400' },
  Kannada: { bar: 'bg-emerald-400', dot: 'bg-emerald-400' },
  Bengali: { bar: 'bg-orange-400', dot: 'bg-orange-400' },
};

const DEFAULT_COLOR = { bar: 'bg-stone-300', dot: 'bg-stone-400' };

export default function LanguageBreakdown({ data }: LanguageBreakdownProps) {
  return (
    <div className="bg-white rounded-2xl border border-stone-100/80 p-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h3 className="text-[13px] font-semibold text-stone-700 tracking-tight">Languages</h3>
          <p className="text-[11px] text-stone-400 mt-0.5">Distribution by language</p>
        </div>
        <div className="w-8 h-8 rounded-lg bg-stone-50 flex items-center justify-center">
          <Globe className="w-4 h-4 text-stone-400" strokeWidth={1.5} />
        </div>
      </div>

      <div className="space-y-5">
        {data.map((item) => {
          const colors = LANG_COLORS[item.language] ?? DEFAULT_COLOR;
          return (
            <div key={item.language} className="group">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <span className={`w-2 h-2 rounded-full ${colors.dot}`} />
                  <span className="text-[12px] font-medium text-stone-700">{item.language}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-semibold text-stone-700 tabular-nums">{item.count}</span>
                  <span className="text-[10px] text-stone-400 tabular-nums">{item.percentage}%</span>
                </div>
              </div>
              <div className="h-1.5 bg-stone-50 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${colors.bar} transition-all duration-700 ease-out`}
                  style={{ width: `${item.percentage}%` }}
                />
              </div>
            </div>
          );
        })}

        {data.length === 0 && (
          <p className="text-[12px] text-stone-400 text-center py-6">No language data yet</p>
        )}
      </div>
    </div>
  );
}
