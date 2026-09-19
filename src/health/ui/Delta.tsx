/**
 * Delta — "▲ 3 ms vs 30-day avg" (SPEC §0 baseline framing).
 *
 * A 10 px triangle in the tone (green when the direction is good, red when
 * bad, neutral when unknown or zero), the figure in text2 with tabular
 * numerals, the caption in muted. The glyph is aria-hidden and a screen-reader
 * string ("up 3 ms") is provided. Markup order is pinned by tests: the glyph
 * span, then a bare aria-hidden span holding " 3 ms".
 */
import { fmt } from '../lib/format';
import { bandText, deltaTone } from './bands';

export interface DeltaProps {
  /** today − baseline; null renders a neutral "—". */
  value: number | null | undefined;
  /** Is this direction good for the metric? null → neutral. */
  good: boolean | null | undefined;
  dp?: number;
  /** Unit suffix, e.g. 'ms', 'bpm', 'g'. */
  unit?: string;
  /** Custom absolute-number formatter (overrides dp). */
  format?: (abs: number) => string;
  /** Muted trailing text; default "vs 30-day avg". Pass '' to hide. */
  caption?: string;
  className?: string;
}

export default function Delta({ value, good, dp = 0, unit = '', format, caption = 'vs 30-day avg', className = '' }: DeltaProps) {
  const has = value !== null && value !== undefined && !Number.isNaN(value);
  const isZero = has && Math.abs(value) < 0.5 / 10 ** dp;
  const tone = deltaTone(good, has ? (isZero ? 0 : value) : null);
  const abs = has ? Math.abs(value) : 0;
  const num = has ? (format ? format(abs) : fmt(abs, dp)) : '';
  const glyph = !has ? '—' : isZero ? '•' : value > 0 ? '▲' : '▼';
  const text = !has ? '' : `${isZero ? '0' : num}${unit ? ` ${unit}` : ''}`;
  const sr = !has ? 'no baseline yet' : isZero ? `no change${unit ? ` in ${unit}` : ''}` : `${value > 0 ? 'up' : 'down'} ${num}${unit ? ` ${unit}` : ''}`;

  return (
    <span className={`inline-flex items-baseline gap-1 text-[13px] leading-[18px] ${className}`}>
      <span className="font-medium text-hx-text2">
        <span aria-hidden className={`text-[10px] ${bandText(tone)}`}>
          {glyph}
        </span>
        {text && <span aria-hidden> {text}</span>}
        <span className="sr-only">{sr}</span>
      </span>
      {caption && <span className="text-hx-muted">{caption}</span>}
    </span>
  );
}
