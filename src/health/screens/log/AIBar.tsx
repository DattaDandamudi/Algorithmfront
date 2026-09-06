/**
 * AIBar — the pinned natural-language entry (SPEC §2 "Primary = natural-
 * language AI bar"). Purely presentational: the Log screen owns the estimate
 * call so the result can open the shared EstimateSheet. Shows a busy state
 * while estimating, an inline question when the parser found no food, and a
 * reminder that the offline parser is in use when no AI key is configured.
 */
import { useState, type FormEvent, type RefObject } from 'react';
import { Loader2, Sparkles } from 'lucide-react';

export interface AIBarProps {
  inputRef: RefObject<HTMLInputElement>;
  busy: boolean;
  aiConfigured: boolean;
  /** Question to show under the bar when the last submit produced no items. */
  question?: string | null;
  onSubmit: (text: string) => void;
}

export const AI_BAR_PLACEHOLDER = '200 g chicken tikka and one roti';

export default function AIBar({ inputRef, busy, aiConfigured, question, onSubmit }: AIBarProps) {
  const [text, setText] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || busy) return;
    onSubmit(t);
  };

  return (
    <form onSubmit={submit} className="space-y-1.5" aria-busy={busy || undefined}>
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-hx-blue pointer-events-none" aria-hidden />
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={AI_BAR_PLACEHOLDER}
            enterKeyHint="go"
            autoComplete="off"
            autoCorrect="off"
            aria-label="Describe what you ate"
            className="w-full h-12 pl-9 pr-3 text-[15px] rounded-2xl"
            disabled={busy}
          />
        </div>
        <button
          type="submit"
          disabled={busy || !text.trim()}
          className="h-12 px-4 shrink-0 rounded-2xl bg-hx-text text-hx-base font-semibold text-[14px] inline-flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed hover:bg-white transition-colors"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
          {busy ? 'Estimating' : 'Estimate'}
        </button>
      </div>
      {question ? (
        <p className="text-[13px] leading-4 text-hx-yellow px-1" role="status">
          {question}
        </p>
      ) : (
        <p className="text-[12px] leading-4 text-hx-muted px-1">
          {aiConfigured ? 'Claude estimates macros with Indian / Middle Eastern priors — you edit before saving.' : 'Offline parser · add an AI key in Settings for better accuracy on restaurant dishes.'}
        </p>
      )}
    </form>
  );
}
