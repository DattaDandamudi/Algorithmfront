import { ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectFieldProps {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
}

export default function SelectField({ label, hint, value, onChange, options }: SelectFieldProps) {
  return (
    <div className="flex items-start justify-between gap-8">
      {label && (
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-medium text-stone-800">{label}</p>
          {hint && <p className="text-[11px] text-stone-400 mt-0.5 leading-relaxed max-w-xs">{hint}</p>}
        </div>
      )}
      <div className="relative flex-shrink-0 w-56">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none bg-stone-50 border border-transparent rounded-xl px-3 py-2 text-[12px] text-stone-800 focus:outline-none focus:bg-white focus:border-stone-200 pr-8 cursor-pointer transition-all duration-200"
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400 pointer-events-none" />
      </div>
    </div>
  );
}
