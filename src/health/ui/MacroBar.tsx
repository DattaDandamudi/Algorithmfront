/**
 * MacroBar — a ledger row with a progress rule (SPEC §1 #4): protein → carbs
 * (day-type range as a wash) → fat (60 g floor tick) → fiber.
 *
 * Label left in .hx-body; the eaten figure flush right in .hx-fig-sm with its
 * target as the unit ("83 of 176 g"). Beneath: a 2 px --hx-border track with
 * an ink fill (the tone when a band applies, bone when neutral), the state in
 * .hx-agate at the rule's end ("93 g left", "in range", "12 g over"), a floor
 * tick as a hairline with its agate label. Over target shows the overflow in
 * red and says so in words. Scale = max(target, range hi, floor, value up to
 * 125 percent of target) so a normal day fills the rule and a blow-out is
 * still legible. `role="meter"` kept.
 */
import { fmt } from '../lib/format';
import { bandBg, type Tone } from './bands';

export interface MacroBarProps {
  label: string;
  value: number | null | undefined;
  target: number;
  /** Lighter zone lo–hi, e.g. carbs range for the day type. When set, `target` should be the top of the range: "left" counts to the top, "over" starts above it, and values inside the zone read "in range". */
  range?: [number, number] | null;
  /** Text shown as the target instead of the number, e.g. "70–100". */
  targetLabel?: string;
  /** Vertical tick + "x g floor" label (fat floor). */
  floor?: number | null;
  unit?: string;
  /** The fill's tone when a band applies; 'neutral' fills in bone. */
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
  const right = !remainingLabel ? null : over ? `${fmt(v - target)} ${unit} over` : inRange ? 'in range' : `${fmt(remaining)} ${unit} left`;
  const hasFloor = floor !== null && floor !== undefined;
  const fill = color === 'neutral' ? 'bg-hx-text' : bandBg(color);

  return (
    <div className={`flex flex-col gap-1.5 ${hasFloor ? 'pb-4' : ''} ${className}`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="hx-body">{label}</span>
        <span className="hx-fig-sm text-hx-text text-right shrink-0">
          {fmt(v)}
          <span className="hx-unit">
            of {targetLabel ?? fmt(target)} {unit}
          </span>
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div
          role="meter"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={target}
          aria-valuenow={Math.min(v, target)}
          aria-valuetext={`${fmt(v)} of ${fmt(target)} ${unit}${right ? `, ${right}` : ''}`}
          className="relative flex-1 h-0.5 bg-hx-border overflow-visible"
        >
          {range && (
            <span
              className="absolute -inset-y-1 bg-hx-text/10"
              style={{ left: pct(Math.min(range[0], range[1]), scale), width: pct(rangeHi - Math.min(range[0], range[1]), scale) }}
              aria-hidden
            />
          )}
          <span className={`absolute inset-y-0 left-0 ${fill}`} style={{ width: pct(Math.min(v, target), scale) }} aria-hidden />
          {over && <span className="absolute inset-y-0 bg-hx-red" style={{ left: pct(target, scale), width: pct(Math.min(v, scale) - target, scale) }} aria-hidden />}
          {hasFloor && (
            <span className="absolute -top-1 flex flex-col items-center" style={{ left: pct(floor, scale) }} aria-hidden>
              <span className="w-px h-2.5 bg-hx-text2" />
              <span className="hx-agate whitespace-nowrap absolute top-3 left-1/2 -translate-x-1/2">
                {fmt(floor)} {unit} floor
              </span>
            </span>
          )}
        </div>
        {right && <span className={`hx-agate shrink-0 ${over ? 'text-hx-red' : inRange ? 'text-hx-green' : ''}`}>{right}</span>}
      </div>
    </div>
  );
}
