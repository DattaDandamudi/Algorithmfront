interface Option {
  value: string;
  label: string;
}

interface SegmentedControlProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
}

export default function SegmentedControl({ options, value, onChange }: SegmentedControlProps) {
  return (
    <div className="flex p-[3px] bg-stone-100 rounded-[11px] gap-px">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`flex-1 py-[5px] px-2.5 text-[11.5px] font-medium rounded-[9px] transition-all duration-150 whitespace-nowrap ${
            value === opt.value
              ? 'bg-white shadow-sm text-stone-800'
              : 'text-stone-400 hover:text-stone-600'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
