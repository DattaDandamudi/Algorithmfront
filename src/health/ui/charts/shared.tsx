/**
 * Bits shared by the three chart components: container measurement, the HTML
 * tooltip, the visually-hidden "table view twin" and the empty frame.
 *
 * Tooltip rules (dataviz/interaction.md): values lead and labels follow, each
 * row is keyed by a short stroke of the series colour (never a filled box),
 * every string is rendered as a React text node — never innerHTML — and the
 * tooltip only enhances: the last value is direct-labelled and the hidden
 * table always carries every number, so nothing is gated behind hover.
 */
import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

/** Card content width inside the 390 px frame (358 px card − 2 × 16 px padding). */
export const DEFAULT_CHART_WIDTH = 326;

export const FONT = { tick: 11, label: 12, small: 10 } as const;

/** Design tokens as CSS variables — the only colour form allowed inside SVG. */
export const TOKEN = {
  card: 'var(--hx-card)',
  border: 'var(--hx-border)',
  muted: 'var(--hx-muted)',
  text: 'var(--hx-text)',
  text2: 'var(--hx-text-2)',
  neutral: 'var(--hx-neutral)',
  blue: 'var(--hx-blue)',
  green: 'var(--hx-green)',
} as const;

/**
 * Measure the rendered width of a container (ResizeObserver, falling back to
 * window resize) so SVGs can lay out in real pixels — text stays crisp and
 * the chart fits a 358 px card and a wider tablet frame alike.
 */
export function useMeasuredWidth<T extends HTMLElement>(fallback = DEFAULT_CHART_WIDTH): [RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = Math.round(el.getBoundingClientRect().width);
      if (w > 0) setWidth(w);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

export interface TooltipRow {
  /** The number (or text) — rendered strong, first. */
  value: string;
  /** Series / category name — secondary, after the value. */
  label: string;
  /** Series colour for the key stroke; omit for a neutral row. */
  color?: string;
  /** Key glyph: a short line, a dot, or a small square (bars / bands). */
  kind?: 'line' | 'dot' | 'rect' | 'none';
  /** Opacity of the key glyph (heatmap levels). */
  opacity?: number;
}

interface TooltipProps {
  /** Pixel x of the anchored data position inside the container. */
  x: number;
  /** Container width — the tooltip flips to the left past the midpoint. */
  width: number;
  title?: string;
  rows: TooltipRow[];
  top?: number;
}

function Key({ row }: { row: TooltipRow }) {
  const kind = row.kind ?? 'line';
  if (kind === 'none') return <span className="inline-block w-3" aria-hidden />;
  const style = { background: row.color ?? TOKEN.neutral, opacity: row.opacity ?? 1 };
  if (kind === 'dot') return <span className="inline-block w-2 h-2 rounded-full shrink-0" style={style} aria-hidden />;
  if (kind === 'rect') return <span className="inline-block w-2.5 h-2.5 rounded-[2px] shrink-0" style={style} aria-hidden />;
  return <span className="inline-block w-3 h-0.5 rounded-full shrink-0" style={style} aria-hidden />;
}

/** Absolutely positioned readout; the parent must be `position: relative`. */
export function ChartTooltip({ x, width, title, rows, top = 4 }: TooltipProps) {
  const flip = x > width / 2;
  const style = flip ? { right: Math.max(0, width - x + 10), top } : { left: Math.max(0, x + 10), top };
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 max-w-[170px] rounded-lg border border-hx-border bg-hx-card2 px-2.5 py-1.5 text-[12px] leading-4 shadow-lg shadow-black/40"
      style={style}
    >
      {title ? <div className="text-hx-muted mb-1 whitespace-nowrap">{title}</div> : null}
      <ul className="space-y-0.5">
        {rows.map((row, i) => (
          <li key={i} className="flex items-center gap-2 whitespace-nowrap">
            <Key row={row} />
            <span className="font-semibold text-hx-text">{row.value}</span>
            {row.label ? <span className="text-hx-text2 truncate">{row.label}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The table view twin: every plotted number, reachable without a pointer. */
export function HiddenTable({ caption, head, rows }: { caption: string; head: string[]; rows: string[][] }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {head.map((h, i) => (
            <th key={i} scope="col">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j}>{c}</td>))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Empty / insufficient-data state drawn inside the chart's frame so the layout never jumps. */
export function EmptyFrame({ height, text, ariaLabel }: { height: number; text: string; ariaLabel: string }) {
  return (
    <div
      role="img"
      aria-label={`${ariaLabel}: ${text}`}
      className="flex items-center justify-center rounded-xl border border-hx-border bg-hx-card2/40 px-4 text-center text-[13px] leading-5 text-hx-text2"
      style={{ height }}
    >
      {text}
    </div>
  );
}

/** Shared focus ring + touch behaviour for the focusable SVG. */
export const SVG_CLASS = 'block rounded-lg outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-hx-blue';
