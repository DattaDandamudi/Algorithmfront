/**
 * Sparkline — pure SVG mini line (box-score cells, HRV 7-day).
 *
 * Marks (DESIGN.md "Data marks"): a 1 px text2 line with butt caps, nulls as
 * gaps, the SWC band a 9 percent bone wash with no edge, the baseline a dotted
 * hairline, the last point a 3 px bone dot. Decorative: aria-hidden with a
 * <title>; the cell's figure carries the value for screen readers.
 */
export interface SparklineProps {
  values: Array<number | null | undefined>;
  width?: number;
  height?: number;
  /** CSS colour for the line; default var(--hx-text-2). */
  color?: string;
  /** Shaded lo–hi wash (e.g. HRV SWC band). */
  band?: [number, number] | null;
  /** Horizontal dotted hairline (e.g. 30-day average). */
  baseline?: number | null;
  /** 3 px bone dot on the last non-null point. */
  highlightLast?: boolean;
  /** SVG <title> text. */
  title?: string;
  className?: string;
}

const PAD = 2;
const r1 = (n: number) => Math.round(n * 10) / 10;

export default function Sparkline({
  values,
  width = 96,
  height = 28,
  color = 'var(--hx-text-2)',
  band = null,
  baseline = null,
  highlightLast = false,
  title = 'Trend',
  className = '',
}: SparklineProps) {
  const nums = values.filter((v): v is number => v !== null && v !== undefined && Number.isFinite(v));
  const domain = [...nums];
  if (band) domain.push(band[0], band[1]);
  if (baseline !== null && baseline !== undefined && Number.isFinite(baseline)) domain.push(baseline);
  let lo = domain.length ? Math.min(...domain) : 0;
  let hi = domain.length ? Math.max(...domain) : 1;
  if (hi - lo < 1e-9) {
    lo -= 1;
    hi += 1;
  }
  const n = values.length;
  const x = (i: number) => (n <= 1 ? width / 2 : PAD + (i * (width - 2 * PAD)) / (n - 1));
  const y = (v: number) => PAD + (1 - (v - lo) / (hi - lo)) * (height - 2 * PAD);

  // Consecutive non-null runs become separate sub-paths, so nulls read as gaps.
  const runs: string[] = [];
  let cur: string[] = [];
  values.forEach((v, i) => {
    if (v === null || v === undefined || !Number.isFinite(v)) {
      if (cur.length) runs.push(cur.join(' L '));
      cur = [];
    } else {
      cur.push(`${r1(x(i))} ${r1(y(v))}`);
    }
  });
  if (cur.length) runs.push(cur.join(' L '));
  const d = runs.map((run) => `M ${run}`).join(' ');

  let lastIdx = -1;
  for (let i = n - 1; i >= 0; i--) {
    const v = values[i];
    if (v !== null && v !== undefined && Number.isFinite(v)) {
      lastIdx = i;
      break;
    }
  }

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden focusable="false" className={`block overflow-visible ${className}`}>
      <title>{title}</title>
      {band && (
        <rect
          x={0}
          width={width}
          y={r1(y(Math.max(band[0], band[1])))}
          height={Math.max(1, r1(Math.abs(y(band[0]) - y(band[1]))))}
          fill="var(--hx-text)"
          opacity={0.09}
        />
      )}
      {baseline !== null && baseline !== undefined && Number.isFinite(baseline) && (
        <line x1={0} x2={width} y1={r1(y(baseline))} y2={r1(y(baseline))} stroke="var(--hx-border)" strokeWidth={1} strokeDasharray="1 3" />
      )}
      {d && <path d={d} fill="none" stroke={color} strokeWidth={1} strokeLinejoin="miter" strokeLinecap="butt" />}
      {highlightLast && lastIdx >= 0 && <circle cx={r1(x(lastIdx))} cy={r1(y(values[lastIdx] as number))} r={1.5} fill="var(--hx-text)" />}
    </svg>
  );
}
