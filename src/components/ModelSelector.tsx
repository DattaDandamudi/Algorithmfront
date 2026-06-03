import { ChevronDown, Check } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

interface Model {
  id: string;
  name: string;
  provider: string;
  description: string;
}

interface ModelSelectorProps {
  label: string;
  icon: React.ReactNode;
  models: Model[];
  selectedModelId: string;
  onModelChange: (id: string) => void;
}

const PROVIDER_COLORS: Record<string, string> = {
  OpenAI: 'bg-emerald-50 text-emerald-600',
  Anthropic: 'bg-amber-50 text-amber-600',
  Google: 'bg-sky-50 text-sky-600',
  Meta: 'bg-blue-50 text-blue-600',
  ElevenLabs: 'bg-rose-50 text-rose-600',
};

export default function ModelSelector({
  label,
  icon,
  models,
  selectedModelId,
  onModelChange,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const selected = models.find((m) => m.id === selectedModelId);

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-stone-400">{icon}</span>
        <span className="text-[11px] font-medium text-stone-400 uppercase tracking-widest">
          {label}
        </span>
      </div>

      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between bg-white border border-stone-200 rounded-xl px-4 py-3 text-left cursor-pointer hover:border-stone-300 focus:outline-none focus:border-stone-300 transition-all duration-300 hover:shadow-sm group"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex flex-col min-w-0">
            <span className="text-[13px] font-medium text-stone-700 truncate">
              {selected?.name ?? 'Select model'}
            </span>
            {selected && (
              <span className="text-[11px] text-stone-400 truncate">
                {selected.provider}
              </span>
            )}
          </div>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-stone-400 transition-transform duration-200 flex-shrink-0 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white border border-stone-200 rounded-xl shadow-lg shadow-stone-900/5 overflow-hidden animate-fade-in-up">
          <div className="py-1.5 max-h-64 overflow-y-auto custom-scrollbar">
            {models.map((model) => {
              const isSelected = model.id === selectedModelId;
              const colorClass = PROVIDER_COLORS[model.provider] ?? 'bg-stone-50 text-stone-500';
              return (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => {
                    onModelChange(model.id);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors duration-150 ${
                    isSelected
                      ? 'bg-stone-50'
                      : 'hover:bg-stone-50/60'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-stone-700">
                        {model.name}
                      </span>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${colorClass}`}>
                        {model.provider}
                      </span>
                    </div>
                    {model.description && (
                      <p className="text-[11px] text-stone-400 mt-0.5 truncate">
                        {model.description}
                      </p>
                    )}
                  </div>
                  {isSelected && (
                    <Check className="w-3.5 h-3.5 text-teal-600 flex-shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
