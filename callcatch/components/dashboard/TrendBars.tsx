import { cn } from "@/lib/utils";

export type TrendPoint = { label: string; value: number; highlight?: boolean };

/** Tiny CSS bar chart (no chart lib). Bars scale to the max value; zero weeks show a hairline. */
export function TrendBars({ points, title, valueLabel, className }: { points: TrendPoint[]; title: string; valueLabel?: (v: number) => string; className?: string }) {
  const max = Math.max(1, ...points.map((p) => p.value));
  const fmt = valueLabel ?? ((v: number) => String(v));
  return (
    <figure className={cn("flex flex-col gap-2", className)}>
      <figcaption className="text-xs font-semibold uppercase tracking-wide text-brand-500">{title}</figcaption>
      <div className="flex h-24 items-end gap-2" role="img" aria-label={`${title}: ${points.map((p) => `${p.label} ${fmt(p.value)}`).join(", ")}`}>
        {points.map((p) => {
          const pct = Math.max(2, Math.round((p.value / max) * 100));
          return (
            <div key={p.label} className="flex flex-1 flex-col items-center justify-end gap-1 self-stretch">
              <span className="text-[11px] font-semibold tabular-nums text-brand-700">{fmt(p.value)}</span>
              <div className="flex w-full flex-1 items-end">
                <div
                  className={cn("w-full rounded-t-md transition-all", p.highlight ? "bg-accent-500" : "bg-brand-200")}
                  style={{ height: `${pct}%` }}
                  title={`${p.label}: ${fmt(p.value)}`}
                />
              </div>
              <span className="text-[11px] text-brand-500">{p.label}</span>
            </div>
          );
        })}
      </div>
    </figure>
  );
}
