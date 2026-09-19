/**
 * Bits shared by the three chart components: container measurement, the
 * tooltip slip, the visually-hidden "table view twin" and the empty frame.
 *
 * The graphics desk (DESIGN.md "Data marks"): hairlines, direct labels in
 * agate, no legend, no gridlines, no y-axis line, no fills except a 9 percent
 * ink wash where a band applies. The tooltip is a plate slip (.hx-raised) with
 * .hx-agate values, no radius, no shadow and no arrow; each row is keyed by a
 * short stroke or an 8 px square in the series colour; every string is a
 * React text node, never innerHTML. It grows to 220 px so a label such as
 * "90% band" never truncates, but never past the room on its side of the
 * anchor: a long label wraps under itself instead. The tooltip only enhances:
 * the last value is direct-labelled and the hidden table always carries every
 * number, so nothing is gated behind hover.
 */
import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

/** The measure inside the 390 px page: 390 minus two 20 px margins. */
export const DEFAULT_CHART_WIDTH = 350;

/** Agate is the floor: nothing on a chart is set below 12 px. */
export const FONT = { tick: 12, label: 12, small: 12 } as const;

/** Design tokens as CSS variables — the only colour form allowed inside SVG. */
export const TOKEN = {
  base: 'var(--hx-base)',
  card: 'var(--hx-card)',
  border: 'var(--hx-border)',
  muted: 'var(--hx-muted)',
  text: 'var(--hx-text)',
  text2: 'var(--hx-text-2)',
  neutral: 'var(--hx-neutral)',
  blue: 'var(--hx-blue)',
  green: 'var(--hx-green)',
  yellow: 'var(--hx-yellow)',
  red: 'var(--hx-red)',
} as const;

/** The ink wash used for bands and zones. */
export const WASH = 0.09;

/**
 * Measure the rendered width of a container (ResizeObserver, falling back to
 * window resize) so SVGs can lay out in real pixels — text stays crisp and
 * the chart fits the 350 px measure and a wider tablet frame alike.
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
  /** The number (or text) — rendered first, in bone. */
  value: string;
  /** Series / category name — secondary, after the value. */
  label: string;
  /** Series colour for the key; omit for a neutral row. */
  color?: string;
  /** Key glyph: a short line, a dot, or a small square (bars / bands). Dots and squares are both 8 px squares here. */
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
  const style = { background: row.color ?? TOKEN.text2, opacity: row.opacity ?? 1 };
  if (kind === 'line') return <span className="inline-block w-3 h-px shrink-0" style={style} aria-hidden />;
  return <span className="inline-block w-2 h-2 shrink-0" style={style} aria-hidden />;
}

/** The slip's width: wide enough for "182.4–184.6 lb  90% band" on one line, never wider than the room beside the anchor. */
const TOOLTIP_MAX_WIDTH = 220;
const TOOLTIP_MIN_WIDTH = 120;

/** Absolutely positioned plate slip; the parent must be `position: relative`. */
export function ChartTooltip({ x, width, title, rows, top = 4 }: TooltipProps) {
  const flip = x > width / 2;
  const room = flip ? x - 10 : width - x - 10;
  const maxWidth = Math.min(TOOLTIP_MAX_WIDTH, Math.max(TOOLTIP_MIN_WIDTH, Math.floor(room)));
  const style = flip ? { right: Math.max(0, width - x + 10), top, maxWidth } : { left: Math.max(0, x + 10), top, maxWidth };
  return (
    <div role="status" className="hx-raised hx-agate pointer-events-none absolute z-10 !rounded-none px-2.5 py-1.5" style={style}>
      {title ? <div className="text-hx-muted mb-1">{title}</div> : null}
      <ul className="space-y-0.5">
        {rows.map((row, i) => (
          // The key sits on the first line; the value never breaks inside itself; the
          // label follows it like prose and wraps under it when the slip is full.
          <li key={i} className="flex items-start gap-2">
            <span className="flex h-4 items-center shrink-0">
              <Key row={row} />
            </span>
            <span className="min-w-0">
              <span className="text-hx-text whitespace-nowrap">{row.value}</span>
              {row.label ? <span className="text-hx-text2"> {row.label}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The table view twin: every plotted number, reachable without a pointer. */
export function HiddenTable({ caption, head, rows }: { caption: string; head: string[]; rows: string[][] }) {
  // Wrapped in an sr-only <div>: a <table> never shrinks below its content width, so an
  // absolutely-positioned sr-only table can widen the document and cause horizontal scroll.
  return (
    <div className="sr-only">
      <table>
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
              {r.map((c, j) =>
                j === 0 ? (
                  <th key={j} scope="row">
                    {c}
                  </th>
                ) : (
                  <td key={j}>{c}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Empty / insufficient-data state: an italic sentence inside the chart's frame, so the layout never jumps. */
export function EmptyFrame({ height, text, ariaLabel }: { height: number; text: string; ariaLabel: string }) {
  return (
    <div role="img" aria-label={`${ariaLabel}: ${text}`} className="hx-body italic text-hx-text2 flex items-center border-t border-hx-border" style={{ height }}>
      {text}
    </div>
  );
}

/** Shared focus ring + touch behaviour for the focusable SVG. */
export const SVG_CLASS = 'block outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hx-lume';
