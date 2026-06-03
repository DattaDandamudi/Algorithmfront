import { ChevronDown, MessageSquareText, Globe } from 'lucide-react';

interface Language {
  id: string;
  name: string;
}

interface LanguageSelectorProps {
  languages: Language[];
  selectedLanguageId: string;
  onLanguageChange: (id: string) => void;
  showTranscript: boolean;
  onTranscriptToggle: () => void;
}

export default function LanguageSelector({
  languages,
  selectedLanguageId,
  onLanguageChange,
  showTranscript,
  onTranscriptToggle,
}: LanguageSelectorProps) {
  return (
    <div className="mt-5 pt-5 border-t border-stone-100">
      <div className="flex items-center gap-2 mb-2">
        <Globe className="w-3.5 h-3.5 text-stone-400" />
        <span className="text-[11px] font-medium text-stone-400 uppercase tracking-widest">
          Language
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <select
            value={selectedLanguageId}
            onChange={(e) => onLanguageChange(e.target.value)}
            className="w-full appearance-none bg-white border border-stone-200 rounded-xl px-4 py-3 text-[13px] font-medium text-stone-700 cursor-pointer hover:border-stone-300 focus:outline-none focus:border-stone-300 transition-all duration-200 hover:shadow-sm"
          >
            {languages.map((lang) => (
              <option key={lang.id} value={lang.id}>
                {lang.name}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
        </div>
        <button
          type="button"
          onClick={onTranscriptToggle}
          className={`group flex items-center gap-2 px-4 py-3 rounded-xl text-[13px] font-medium transition-all duration-300 border ${
            showTranscript
              ? 'bg-teal-600 text-white border-teal-600 shadow-md shadow-teal-600/15'
              : 'bg-white text-stone-500 border-stone-200 hover:border-stone-300 hover:text-stone-700 hover:shadow-sm'
          }`}
        >
          <MessageSquareText className={`w-4 h-4 transition-transform duration-300 ${showTranscript ? '' : 'group-hover:scale-110'}`} />
          <span className="whitespace-nowrap">Transcript</span>
        </button>
      </div>
    </div>
  );
}
