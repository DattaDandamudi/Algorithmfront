/**
 * ProgressRule — the 2 px progress rule (DESIGN.md "Data marks"): a 2 px
 * `--hx-border` track with an ink fill in bone, or a tone token only when a
 * band applies (blue for steps before the goal, green after), and the reading
 * in `.hx-agate` at the rule's end ("78%", "of 7.9 h"). `role="meter"` so the
 * value is announced; `label` names what is measured. This is the bare rule
 * the box-score cells and the food ledger use in place of the old rings; the
 * kit's MacroBar is the same rule with its own label and figure attached.
 */
import { fmt } from '../../lib/format';
import { bandBg, type Tone } from '../../ui';

export interface ProgressRuleProps {
  value: number | null | undefined;
  max: number;
  /** Fill tone when a band applies; 'ink' (default) fills in bone. */
  tone?: Tone | 'ink';
  /** Accessible name, e.g. "Steps toward goal". */
  label: string;
  /** Agate text at the rule's end. */
  end?: string;
  /** Spoken value; defaults to "x of y". */
  valueText?: string;
  className?: string;
}

export default function ProgressRule({ value, max, tone = 'ink', label, end, valueText, className = '' }: ProgressRuleProps) {
  const v = typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
  const scale = max > 0 ? max : 1;
  const frac = Math.min(1, v / scale);
  const fill = tone === 'ink' ? 'bg-hx-text' : bandBg(tone);
  return (
    <div className={`w-full flex items-center gap-2 ${className}`}>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={scale}
        aria-valuenow={Math.min(v, scale)}
        aria-valuetext={valueText ?? `${fmt(v)} of ${fmt(scale)}`}
        className="relative flex-1 h-0.5 bg-hx-border"
      >
        <span className={`absolute inset-y-0 left-0 ${fill}`} style={{ width: `${Math.round(frac * 1000) / 10}%` }} aria-hidden />
      </div>
      {end && <span className="hx-agate shrink-0">{end}</span>}
    </div>
  );
}
