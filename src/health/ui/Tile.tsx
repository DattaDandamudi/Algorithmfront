/**
 * Tile — secondary metric card (SPEC §1 #3): label, big tabular number,
 * optional unit, band sub-label, ▲/▼ delta vs baseline, sparkline slot.
 *
 * Sizes: md number 28 px, lg 32 px (the protein tile). When `onClick` is set
 * the whole tile is a <button> (≥ 44 px, focus ring from health.css). Null
 * value → "—" plus `emptyHint` instead of the delta (never fabricate).
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
  /** Sparkline / ProgressRing slot, rendered at the bottom-right. */
  chart?: ReactNode;
  /** 'inline' (default) puts the chart beside the delta; 'stack' gives it its own full-width row above the delta so a wide sparkline never squeezes the text. */
  chartLayout?: 'inline' | 'stack';
  onClick?: () => void;
  /** Shown instead of the delta when value is null. */
  emptyHint?: string;
  size?: 'md' | 'lg';
  className?: string;
}

export default function Tile({ label, value, dp = 0, unit, delta, band, sub, chart, chartLayout = 'inline', onClick, emptyHint, size = 'md', className = '' }: TileProps) {
  const has = value !== null && value !== undefined && !(typeof value === 'number' && Number.isNaN(value));
  const text = !has ? '—' : typeof value === 'number' ? fmt(value, dp) : value;
  const numCls = size === 'lg' ? 'text-[32px] leading-9' : 'text-[28px] leading-8';

  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="hx-label truncate">{label}</span>
        {band && band !== 'neutral' && <span className={`w-2 h-2 rounded-full shrink-0 ${bandBg(band)}`} aria-hidden />}
      </div>
      <div className="mt-1.5 flex items-baseline gap-1 min-w-0">
        <span className={`${numCls} font-semibold tracking-tight ${has ? 'text-hx-text' : 'text-hx-muted'}`}>{text}</span>
        {has && unit && <span className="text-[13px] font-medium text-hx-text2">{unit}</span>}
      </div>
      {sub && <div className={`mt-0.5 text-[13px] leading-4 font-medium ${band ? bandText(band) : 'text-hx-text2'}`}>{sub}</div>}
      {chart && chartLayout === 'stack' && <div className="mt-2 w-full">{chart}</div>}
      <div className="mt-2 flex items-end justify-between gap-2 min-h-4">
        <div className="min-w-0">
          {has && delta ? (
            <Delta value={delta.value} good={delta.good} dp={delta.dp} unit={delta.unit} format={delta.format} caption={delta.caption} />
          ) : !has && emptyHint ? (
            <span className="text-[13px] leading-4 text-hx-muted">{emptyHint}</span>
          ) : null}
        </div>
        {chart && chartLayout === 'inline' && <div className="shrink-0">{chart}</div>}
      </div>
    </>
  );

  const base = `hx-card p-4 text-left flex flex-col min-h-[44px] w-full ${className}`;
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${base} transition-colors hover:border-hx-neutral active:bg-hx-card2`}>
        {body}
      </button>
    );
  }
  return <div className={base}>{body}</div>;
}
