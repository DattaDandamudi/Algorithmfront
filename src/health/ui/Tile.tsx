/**
 * Tile — a reading in the bento (SPEC §1 #3; DESIGN.md "Bento rules").
 *
 * Label, big display-face number, optional unit, band sub-label, ▲/▼ delta vs
 * baseline, and a chart slot. `span` and `rows` place it in a `.hx-bento`
 * grid: a 1×1 holds one number and one caption; anything with a chart wider
 * than 140 px is a span-2. When `onClick` is set the whole tile is a <button>
 * (≥ 44 px) that settles a pixel on press. Null value → "—" plus `emptyHint`
 * instead of the delta (never fabricate).
 */
import type { ReactNode } from 'react';
import type { Band } from '../data/types';
import { fmt } from '../lib/format';
import { bandBg, bandText } from './bands';
import Delta from './Delta';

export interface TileDelta {
  value: number | null | undefined;
  good: boolean | null | undefined;
  dp?: number;
  unit?: string;
  format?: (abs: number) => string;
  /** Default "vs 30-day avg". */
  caption?: string;
}

export interface TileProps {
  label: string;
  value: string | number | null | undefined;
  /** Decimal places when `value` is a number. Default 0. */
  dp?: number;
  unit?: string;
  delta?: TileDelta;
  band?: Band;
  /** Small line under the number, e.g. HRV band "Balanced" (coloured by `band`). */
  sub?: ReactNode;
  /** Sparkline / ProgressRing slot. */
  chart?: ReactNode;
  /** 'inline' (default) puts the chart beside the delta; 'stack' gives it its own full-width row above the delta. */
  chartLayout?: 'inline' | 'stack';
  onClick?: () => void;
  /** Shown instead of the delta when value is null. */
  emptyHint?: string;
  size?: 'md' | 'lg';
  /** Bento placement. Default 1 column, 1 row. */
  span?: 1 | 2;
  rows?: 1 | 2;
  className?: string;
}

export default function Tile({
  label,
  value,
  dp = 0,
  unit,
  delta,
  band,
  sub,
  chart,
  chartLayout = 'inline',
  onClick,
  emptyHint,
  size = 'md',
  span = 1,
  rows = 1,
  className = '',
}: TileProps) {
  const has = value !== null && value !== undefined && !(typeof value === 'number' && Number.isNaN(value));
  const text = !has ? '—' : typeof value === 'number' ? fmt(value, dp) : value;
  const numCls = size === 'lg' ? 'text-[36px] leading-10' : 'text-[28px] leading-8';

  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="hx-label truncate">{label}</span>
        {band && band !== 'neutral' && <span className={`w-2 h-2 rounded-full shrink-0 ${bandBg(band)}`} aria-hidden />}
      </div>
      <div className="mt-2 flex items-baseline gap-1.5 min-w-0">
        <span className={`hx-display ${numCls} font-semibold ${has ? 'text-hx-text' : 'text-hx-muted'}`}>{text}</span>
        {has && unit && <span className="text-[13px] font-medium text-hx-text2">{unit}</span>}
      </div>
      {sub && <div className={`mt-1 text-[13px] leading-[18px] font-medium ${band ? bandText(band) : 'text-hx-text2'}`}>{sub}</div>}
      {chart && chartLayout === 'stack' && <div className="mt-2.5 w-full">{chart}</div>}
      <div className="mt-auto pt-2.5 flex items-end justify-between gap-2 min-h-4">
        <div className="min-w-0">
          {has && delta ? (
            <Delta value={delta.value} good={delta.good} dp={delta.dp} unit={delta.unit} format={delta.format} caption={delta.caption} />
          ) : !has && emptyHint ? (
            <span className="text-[13px] leading-[18px] text-hx-muted">{emptyHint}</span>
          ) : null}
        </div>
        {chart && chartLayout === 'inline' && <div className="shrink-0">{chart}</div>}
      </div>
    </>
  );

  const place = `${span === 2 ? 'hx-span-2' : ''} ${rows === 2 ? 'hx-row-2' : ''}`;
  const base = `hx-card p-4 text-left flex flex-col min-h-[44px] w-full ${place} ${className}`;
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${base} hx-press hover:border-hx-neutral`}>
        {body}
      </button>
    );
  }
  return <div className={base}>{body}</div>;
}
