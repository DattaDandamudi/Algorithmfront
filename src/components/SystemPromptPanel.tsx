import { ChevronDown, FileText } from 'lucide-react';

interface Persona {
  id: string;
  name: string;
  system_prompt: string;
}

interface SystemPromptPanelProps {
  personas: Persona[];
  selectedPersonaId: string;
  promptText: string;
  onPersonaChange: (id: string) => void;
  onPromptChange: (text: string) => void;
}

export default function SystemPromptPanel({
  personas,
  selectedPersonaId,
  promptText,
  onPersonaChange,
  onPromptChange,
}: SystemPromptPanelProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <FileText className="w-3.5 h-3.5 text-stone-400" />
          <span className="text-[11px] font-medium text-stone-400 uppercase tracking-widest">
            System Prompt
          </span>
        </div>
        <div className="relative">
          <select
            value={selectedPersonaId}
            onChange={(e) => onPersonaChange(e.target.value)}
            className="appearance-none bg-white border border-stone-200 rounded-xl pl-3.5 pr-8 py-2 text-[13px] font-medium text-stone-600 cursor-pointer hover:border-stone-300 focus:outline-none focus:border-stone-300 transition-all duration-200 hover:shadow-sm"
          >
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400 pointer-events-none" />
        </div>
      </div>

      <div className="relative flex-1 bg-stone-50/80 rounded-2xl overflow-hidden flex flex-col border border-stone-100 transition-all duration-300 focus-within:border-stone-200 focus-within:bg-white">
        <textarea
          value={promptText}
          onChange={(e) => onPromptChange(e.target.value)}
          className="flex-1 w-full bg-transparent resize-none p-5 pr-8 text-[14px] leading-[1.85] text-stone-700 placeholder-stone-300 focus:outline-none custom-scrollbar"
          spellCheck={false}
          placeholder="Define your agent's personality and behavior..."
        />
      </div>
    </div>
  );
}
