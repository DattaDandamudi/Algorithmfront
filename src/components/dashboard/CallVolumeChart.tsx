interface DayVolume {
  label: string;
  count: number;
}

interface CallVolumeChartProps {
  data: DayVolume[];
}

export default function CallVolumeChart({ data }: CallVolumeChartProps) {
  const max = Math.max(...data.map((d) => d.count), 1);
  const total = data.reduce((sum, d) => sum + d.count, 0);
  const todayCount = data[data.length - 1]?.count ?? 0;

  return (
    <div className="bg-white rounded-2xl border border-stone-100/80 p-6 h-full">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h3 className="text-[13px] font-semibold text-stone-700 tracking-tight">Call Volume</h3>
          <p className="text-[11px] text-stone-400 mt-0.5">Last 7 days</p>
        </div>
        <div className="text-right">
          <p className="text-[22px] font-semibold text-stone-800 leading-none">{total}</p>
          <p className="text-[10px] text-stone-400 mt-1 font-medium">total calls</p>
        </div>
      </div>

      <div className="flex items-end gap-2 sm:gap-4 h-44">
        {data.map((day, i) => {
          const height = max > 0 ? (day.count / max) * 100 : 0;
          const isToday = i === data.length - 1;

          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-2.5 group">
              <span className={`text-[11px] font-semibold transition-colors duration-300 ${
                isToday ? 'text-stone-700' : 'text-stone-300 group-hover:text-stone-500'
              }`}>
                {day.count}
              </span>

              <div className="w-full relative rounded-xl overflow-hidden bg-stone-50/80" style={{ height: '140px' }}>
                <div
                  className={`absolute bottom-0 left-0 right-0 rounded-xl transition-all duration-700 ease-out ${
                    isToday
                      ? 'bg-gradient-to-t from-stone-800 to-stone-600'
                      : 'bg-gradient-to-t from-stone-200 to-stone-100 group-hover:from-stone-300 group-hover:to-stone-200'
                  }`}
                  style={{ height: `${Math.max(height, 4)}%` }}
                />
              </div>

              <span className={`text-[10px] font-medium transition-colors duration-300 ${
                isToday ? 'text-stone-700' : 'text-stone-400'
              }`}>
                {day.label}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-5 pt-4 border-t border-stone-50 flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-stone-800" />
          <span className="text-[10px] text-stone-500 font-medium">Today ({todayCount})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-stone-200" />
          <span className="text-[10px] text-stone-400 font-medium">Previous</span>
        </div>
      </div>
    </div>
  );
}
