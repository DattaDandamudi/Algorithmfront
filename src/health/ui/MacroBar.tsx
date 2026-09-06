/**
 * MacroBar — thin remaining-macro bar (SPEC §1 #4): protein → carbs (day-type
 * range as a lighter zone) → fat (60 g floor tick) → fiber.
 *
 * Bar ≤ 10 px, rounded data end, numbers in text tokens (never coloured by the
 * series); over-target shows the overflow in red and flips the right-hand
 * label to "x g over". Scale = max(target, range hi, floor, value up to 125 %
 * of target) so a normal day fills the bar and a blow-out is still legible.
 */
import { fmt } from '../lib/format';
import { bandBg, type Tone } from './bands';

export interface MacroBarProps {
  label: string;
  value: number | null | undefined;
  target: number;
  /** Lighter zone lo–hi, e.g. carbs range for the day type. When set, `target` should be the top of the range: "left" counts to the top, "over" starts above it, and values inside the zone read "in range". */
  range?: [number, number] | null;
  /** Text shown after the slash instead of the numeric target, e.g. "70–100". */
  targetLabel?: string;
  /** Vertical tick + "x g floor" label (fat floor). */
  floor?: number | null;
  unit?: string;
  color: Tone;
  /** Show "x g left" / "x g over" at the right. Default true. */
  remainingLabel?: boolean;
  className?: string;
}

const pct = (n: number, scale: number) => `${Math.max(0, Math.min(100, (n / scale) * 100))}%`;

export default function MacroBar({ label, value, target, range = null, targetLabel, floor = null, unit = 'g', color, remainingLabel = true, className = '' }: MacroBarProps) {
  const v = value !== null && value !== undefined && Number.isFinite(value) ? Math.max(0, value) : 0;
  const rangeHi = range ? Math.max(range[0], range[1]) : 0;
  const scale = Math.max(target, rangeHi, floor ?? 0, Math.min(v, target * 1.25), 1);
  const rangeLo = range ? Math.min(range[0], range[1]) : null;
  const over = v > target;
  const inRange = rangeLo !== null && v >= rangeLo && !over;
  const remaining = target - v;
  const right = !remainingLabel
    ? null
    : over
      ? `${fmt(v - target)} ${unit} over`
      : inRange
        ? 'in range'
        : `${fmt(remaining)} ${unit} left`;

  return (
    <div className={`flex flex-col gap-1.5 ${floor !== null && floor !== undefined ? 'pb-4' : ''} ${className}`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="hx-label">{label}</span>
        <span className="text-[13px] leading-4 text-hx-text2">
          <span className="text-hx-text font-semibold">{fmt(v)}</span> / {targetLabel ?? fmt(target)} {unit}
          {right && <span className={`ml-2 ${over ? 'text-hx-red font-medium' : inRange ? 'text-hx-green' : 'text-hx-muted'}`}>{right}</span>}
        </span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={target}
        aria-valuenow={Math.min(v, target)}
        aria-valuetext={`${fmt(v)} of ${fmt(target)} ${unit}${right ? `, ${right}` : ''}`}
        className="relative h-2 rounded-full bg-hx-card2 overflow-visible"
      >
        {range && (
          <span
            className={`absolute inset-y-0 rounded-full opacity-25 ${bandBg(color)}`}
            style={{ left: pct(Math.min(range[0], range[1]), scale), width: pct(rangeHi - Math.min(range[0], range[1]), scale) }}
            aria-hidden
          />
        )}
        <span
          className={`absolute inset-y-0 left-0 ${over ? 'rounded-l-full' : 'rounded-full'} ${bandBg(color)}`}
          style={{ width: pct(Math.min(v, target), scale) }}
          aria-hidden
        />
        {over && (
          <span
            className="absolute inset-y-0 rounded-r-full bg-hx-red"
            style={{ left: pct(target, scale), width: pct(Math.min(v, scale) - target, scale) }}
            aria-hidden
          />
        )}
        {floor !== null && floor !== undefined && (
          <span className="absolute -top-1 bottom-0 flex flex-col items-center" style={{ left: pct(floor, scale) }} aria-hidden>
            <span className="w-0.5 h-4 rounded-full bg-hx-text2" />
            <span className="mt-0.5 text-[11px] leading-3 text-hx-muted whitespace-nowrap -translate-x-1/2 absolute top-4 left-1/2">
              {fmt(floor)} {unit} floor
            </span>
          </span>
        )}
      </div>
    </div>
  );
}
