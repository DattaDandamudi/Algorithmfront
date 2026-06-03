export type AccentColor = 'amber' | 'orange' | 'sky' | 'teal' | 'rose' | 'stone';

interface TextFieldProps {
  type: 'text' | 'number' | 'email' | 'url';
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  suffix?: string;
}

interface ToggleFieldProps {
  type: 'toggle';
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  accentColor?: AccentColor;
}

interface SliderFieldProps {
  type: 'slider';
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  accentColor?: AccentColor;
  formatValue?: (v: number) => string;
}

type SettingsFieldProps = TextFieldProps | ToggleFieldProps | SliderFieldProps;

const ACCENT = '#292524';

export default function SettingsField(props: SettingsFieldProps) {
  const { type, label, hint, value, onChange } = props;

  if (type === 'toggle') {
    const checked = value === 'true';
    return (
      <div className="flex items-center justify-between gap-8">
        <div className="min-w-0">
          <p className="text-[12.5px] font-medium text-stone-800">{label}</p>
          {hint && <p className="text-[11px] text-stone-400 mt-0.5 leading-relaxed max-w-xs">{hint}</p>}
        </div>
        <button
          type="button"
          onClick={() => onChange(checked ? 'false' : 'true')}
          className={`relative flex-shrink-0 w-[42px] h-[24px] rounded-full transition-all duration-250 ${
            checked ? 'bg-stone-900' : 'bg-stone-200 hover:bg-stone-300'
          }`}
        >
          <div
            className={`absolute top-[4px] w-[16px] h-[16px] rounded-full bg-white shadow-sm transition-transform duration-250 ${
              checked ? 'translate-x-[22px]' : 'translate-x-[4px]'
            }`}
          />
        </button>
      </div>
    );
  }

  if (type === 'slider') {
    const { min, max, step, suffix, formatValue } = props;
    const num = parseFloat(value) || min;
    const pct = Math.max(0, Math.min(100, Math.round(((num - min) / (max - min)) * 100)));
    const trackBg = `linear-gradient(to right, #292524 0%, #292524 ${pct}%, #e7e5e4 ${pct}%, #e7e5e4 100%)`;
    const displayVal = formatValue ? formatValue(num) : `${Number.isInteger(num) ? num : num.toFixed(2)}${suffix ?? ''}`;

    return (
      <div>
        <div className="flex items-center justify-between gap-4 mb-3">
          <div className="min-w-0">
            <p className="text-[12.5px] font-medium text-stone-800">{label}</p>
            {hint && <p className="text-[11px] text-stone-400 mt-0.5 leading-relaxed max-w-xs">{hint}</p>}
          </div>
          <span className="flex-shrink-0 text-[12px] font-semibold text-stone-700 tabular-nums bg-stone-100 px-2.5 py-1 rounded-lg">
            {displayVal}
          </span>
        </div>
        <div style={{ '--accent': ACCENT } as React.CSSProperties}>
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={num}
            onChange={(e) => onChange(e.target.value)}
            className="settings-slider w-full"
            style={{ background: trackBg }}
          />
        </div>
        <div className="flex justify-between mt-1.5">
          <span className="text-[10px] text-stone-300">{min}{suffix ?? ''}</span>
          <span className="text-[10px] text-stone-300">{max}{suffix ?? ''}</span>
        </div>
      </div>
    );
  }

  const { placeholder, suffix } = props;
  return (
    <div className="flex items-start justify-between gap-8">
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-medium text-stone-800">{label}</p>
        {hint && <p className="text-[11px] text-stone-400 mt-0.5 leading-relaxed max-w-xs">{hint}</p>}
      </div>
      <div className="relative flex-shrink-0 w-56">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-stone-50 border border-transparent rounded-xl px-3 py-2 text-[12.5px] text-stone-800 placeholder-stone-300 focus:outline-none focus:bg-white focus:border-stone-200 transition-all duration-200 text-right pr-3"
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-stone-400 pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}
