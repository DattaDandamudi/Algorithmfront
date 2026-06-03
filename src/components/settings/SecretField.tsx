import { useState } from 'react';
import { Eye, EyeOff, Copy, Check } from 'lucide-react';

interface SecretFieldProps {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function SecretField({ label, hint, value, onChange, placeholder }: SecretFieldProps) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    if (!value) return;
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <div className="mb-2.5">
        <p className="text-[12.5px] font-medium text-stone-800">{label}</p>
        {hint && <p className="text-[11px] text-stone-400 mt-0.5 leading-relaxed max-w-sm">{hint}</p>}
      </div>
      <div className="relative flex items-center">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-stone-50 border border-transparent rounded-xl px-3 py-2 text-[12.5px] text-stone-800 placeholder-stone-300 focus:outline-none focus:bg-white focus:border-stone-200 pr-[72px] transition-all duration-200 font-mono tracking-wide"
          spellCheck={false}
          autoComplete="off"
        />
        <div className="absolute right-1 flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setVisible(!visible)}
            className="p-1.5 rounded-lg text-stone-300 hover:text-stone-500 hover:bg-stone-100 transition-all duration-150"
          >
            {visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={handleCopy}
            disabled={!value}
            className={`p-1.5 rounded-lg transition-all duration-150 ${
              value ? 'text-stone-300 hover:text-stone-500 hover:bg-stone-100' : 'text-stone-200 cursor-not-allowed'
            }`}
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
      {value.length > 0 && (
        <p className="text-[10.5px] text-stone-400 mt-1.5 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
          Configured
        </p>
      )}
    </div>
  );
}
