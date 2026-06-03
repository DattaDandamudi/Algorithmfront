import { useState, useRef, useEffect } from 'react';
import { User, Bot, X, ArrowRight, Send } from 'lucide-react';

export interface TranscriptEntry {
  id: string;
  role: 'user' | 'agent';
  original: string;
  translated: string;
  timestamp: Date;
}

interface LiveTranscriptProps {
  entries: TranscriptEntry[];
  sourceLang: string;
  targetLang: string;
  onClose: () => void;
  onSendMessage: (message: string) => void;
}

function formatTime(date: Date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function LiveTranscript({
  entries,
  sourceLang,
  targetLang,
  onClose,
  onSendMessage,
}: LiveTranscriptProps) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries.length]);

  function handleSend() {
    const trimmed = input.trim();
    if (!trimmed) return;
    onSendMessage(trimmed);
    setInput('');
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex flex-col h-full rounded-2xl bg-white border border-stone-100 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100/80">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-medium text-stone-500 uppercase tracking-widest">
            {sourceLang}
          </span>
          <ArrowRight className="w-3 h-3 text-teal-500" />
          <span className="text-[11px] font-semibold text-teal-600 uppercase tracking-widest">
            {targetLang}
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 rounded-full px-2.5 py-1 bg-teal-50">
            <span className="live-dot inline-block w-1.5 h-1.5 rounded-full bg-teal-500" />
            <span className="text-[10px] text-teal-600 font-semibold uppercase tracking-wider">
              Live
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-stone-50 hover:bg-stone-100 flex items-center justify-center transition-colors duration-200"
          >
            <X className="w-3.5 h-3.5 text-stone-400" />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-1 custom-scrollbar">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-stone-400 select-none">
            <div className="w-14 h-14 rounded-2xl bg-stone-50 flex items-center justify-center mb-4">
              <Bot className="w-6 h-6 text-stone-300" />
            </div>
            <p className="text-sm font-medium text-stone-400">No conversation yet</p>
            <p className="text-xs text-stone-300 mt-1">Start speaking or type a message</p>
          </div>
        ) : (
          entries.map((entry, index) => {
            const isUser = entry.role === 'user';
            return (
              <div
                key={entry.id}
                className="animate-fade-in-up rounded-xl p-3 hover:bg-stone-50/50 transition-colors duration-200"
                style={{ animationDelay: `${index * 60}ms` }}
              >
                <div className={`flex gap-3 ${isUser ? '' : 'flex-row-reverse'}`}>
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      isUser ? 'bg-teal-50' : 'bg-amber-50'
                    }`}
                  >
                    {isUser ? (
                      <User className="w-3.5 h-3.5 text-teal-600" />
                    ) : (
                      <Bot className="w-3.5 h-3.5 text-amber-600" />
                    )}
                  </div>
                  <div className={`flex-1 min-w-0 ${isUser ? '' : 'text-right'}`}>
                    <div className={`flex items-center gap-2 mb-1 ${isUser ? '' : 'justify-end'}`}>
                      {isUser ? (
                        <>
                          <span className="text-[11px] font-semibold text-stone-600">You</span>
                          <span className="text-[10px] text-stone-300">{formatTime(entry.timestamp)}</span>
                        </>
                      ) : (
                        <>
                          <span className="text-[10px] text-stone-300">{formatTime(entry.timestamp)}</span>
                          <span className="text-[11px] font-semibold text-stone-600">Agent</span>
                        </>
                      )}
                    </div>
                    <p className="text-[13px] text-stone-500 leading-relaxed">{entry.original}</p>
                    <p className="text-[13px] text-teal-700 leading-relaxed mt-0.5 font-medium">
                      {entry.translated}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="px-4 pb-4 pt-2">
        <div className="flex items-center gap-2 bg-stone-50 rounded-xl border border-stone-100 focus-within:border-stone-200 focus-within:bg-white transition-all duration-200 px-4 py-2.5">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="flex-1 bg-transparent text-[13px] text-stone-700 placeholder-stone-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim()}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 flex-shrink-0 ${
              input.trim()
                ? 'bg-teal-600 text-white hover:bg-teal-700 shadow-sm'
                : 'bg-stone-100 text-stone-300 cursor-not-allowed'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
