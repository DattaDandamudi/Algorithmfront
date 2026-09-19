/**
 * Tile — a box-score cell or, with `span={2}`, a ledger row (DESIGN.md "Three
 * block types"). Transparent: no ground, border, radius or shadow.
 *
 * A cell stacks label (.hx-label), figure (.hx-fig with its .hx-unit), an
 * optional band line led by a tone square, then the delta line with the chart
 * slot beside it (a sparkline or a progress rule; `chartLayout="stack"` gives
 * the chart its own full-width line). A row puts the label left and the
 * figure flush right on one line, then the chart, the caption and the delta.
 * `onClick` makes the whole block a button with a 56 px floor whose leader
 * inks on press. Null value renders "—" plus `emptyHint` (never a fabricated
 * number). Inside `.hx-score-grid` the cell takes its column rule and row
 * hairlines from the grid; inside `.hx-ledger` rows divide by hairlines.
 * `size` and `rows` are accepted for callers; both sizes set `.hx-fig`.
 */
import type { ReactNode } from 'react';
import type { Band } from '../data/types';
import { fmt } from '../lib/format';
import { bandText } from './bands';
import Delta from './Delta';

export interface TileDelta {
  value: number | null | undefined;
  good: boolean | null | undefined;
  dp?: number;
  unit?: string;
  format?: (abs: number) => string;
  /** Default "vs 30-day avg". */
  caption?: string;
  /** Let the caption drop to its own line inside a 159 px cell (Delta `wrap`). */
  wrap?: boolean;
}

export interface TileProps {
  label: string;
  value: string | number | null | undefined;
  /** Decimal places when `value` is a number. Default 0. */
  dp?: number;
  unit?: string;
  delta?: TileDelta;
  band?: Band;
  /** The band line under the figure, e.g. HRV "Balanced" (coloured by `band`, led by a tone square). */
  sub?: ReactNode;
  /** Sparkline / progress rule / ProgressRing slot. */
  chart?: ReactNode;
  /** 'inline' (default) puts the chart beside the delta; 'stack' gives it its own full-width line. */
  chartLayout?: 'inline' | 'stack';
  onClick?: () => void;
  /** Shown instead of the delta when value is null. */
  emptyHint?: string;
  /** Accepted for callers; both sizes set the figure in .hx-fig. */
  size?: 'md' | 'lg';
  /** 1 = box-score cell (.hx-cell); 2 = ledger row (.hx-row). */
  span?: 1 | 2;
  /** Accepted for callers; a no-op now that there is no bento. */
  rows?: 1 | 2;
  className?: string;
}

export default function Tile(props: TileProps) {
  const { label, value, dp = 0, unit, delta, band, sub, chart, chartLayout = 'inline', onClick, emptyHint, span = 1, className = '' } = props;
  const has = value !== null && value !== undefined && !(typeof value === 'number' && Number.isNaN(value));
  const text = !has ? '—' : typeof value === 'number' ? fmt(value, dp) : value;
  const row = span === 2;

  const figure = (
    <div className={`hx-fig ${row ? 'text-right shrink-0' : 'mt-1'} ${has ? 'text-hx-text' : 'text-hx-muted'}`}>
      {text}
      {has && unit && <span className="hx-unit">{unit}</span>}
    </div>
  );

  const bandLine = sub ? (
    <div className={`mt-1 text-[13px] leading-[18px] font-medium ${band ? bandText(band) : 'text-hx-text2'}`}>
      {band && band !== 'neutral' && <span className="hx-tone mr-1.5" aria-hidden />}
      {sub}
    </div>
  ) : null;

  const foot = (
    <div className="mt-auto pt-2 w-full flex items-end justify-between gap-2">
      <div className="min-w-0">
        {has && delta ? (
          <Delta value={delta.value} good={delta.good} dp={delta.dp} unit={delta.unit} format={delta.format} caption={delta.caption} wrap={delta.wrap} />
        ) : !has && emptyHint ? (
          <span className="hx-cap">{emptyHint}</span>
        ) : null}
      </div>
      {chart && chartLayout === 'inline' && <div className="shrink-0">{chart}</div>}
    </div>
  );

  const body = row ? (
    <>
      <div className="w-full flex items-baseline justify-between gap-3">
        <span className="hx-label min-w-0">{label}</span>
        {figure}
      </div>
      {chart && chartLayout === 'stack' && <div className="mt-2 w-full">{chart}</div>}
      {bandLine}
      {foot}
    </>
  ) : (
    <>
      <span className="hx-label">{label}</span>
      {figure}
      {bandLine}
      {chart && chartLayout === 'stack' && <div className="mt-2 w-full">{chart}</div>}
      {foot}
    </>
  );

  const base = `${row ? 'hx-row' : 'hx-cell'} ${className}`;
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${base} hx-press min-h-[56px]`}>
        {body}
      </button>
    );
  }
  return <div className={base}>{body}</div>;
}
