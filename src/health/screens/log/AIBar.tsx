/**
 * AIBar — the pinned natural-language entry (SPEC §2 "Primary = natural-
 * language AI bar"). Purely presentational: the Log screen owns the estimate
 * call so the result can open the shared EstimateSheet. Shows a busy state
 * while estimating, an inline question when the parser found no food, and a
 * line saying who will answer — Claude, the offline parser (no key), or, for
 * a configured key whose SDK is still loading / failed to load, that state and
 * its reason (review R7-3: never "add an AI key" when one exists).
 *
 * While the SDK is 'loading' the button reads "Loading AI…" and submits are
 * held; after the Log's grace period ('slow') the local parser answers so a
 * slow link never blocks logging.
 *
 * While busy the input is `readOnly`, not `disabled`: disabling would throw
 * focus to <body>, and the estimate Sheet records the focused element as the
 * place to return focus to on close (review R6-5).
 */
import type { FormEvent, RefObject } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { AI_LOADING_LABEL, aiBarCaption, type AIStatus } from './aiStatus';

export interface AIBarProps {
  inputRef: RefObject<HTMLInputElement>;
  /** Controlled text — the screen clears it after a successful save and reuses it for clarifications. */
  value: string;
  onChange: (text: string) => void;
  busy: boolean;
  /** Lazy-client state (aiStatus.ts). */
  aiStatus: AIStatus;
  /** Why the client failed when `aiStatus === 'error'`. */
  aiError?: string | null;
  /** Question to show under the bar when the last submit produced no items. */
  question?: string | null;
  onSubmit: (text: string) => void;
}

export const AI_BAR_PLACEHOLDER = '200 g chicken tikka and one roti';

export default function AIBar({ inputRef, value: text, onChange: setText, busy, aiStatus, aiError = null, question, onSubmit }: AIBarProps) {
  // Hold submits only for the first stretch of loading; 'slow' lets the local parser answer.
  const waiting = aiStatus === 'loading';
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || busy || waiting) return;
    onSubmit(t);
  };
  const spinning = busy || waiting;
  const captionTone = aiStatus === 'error' ? 'text-hx-yellow' : 'text-hx-muted';

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
            readOnly={busy}
            aria-busy={busy || undefined}
          />
        </div>
        <button
          type="submit"
          disabled={busy || waiting || !text.trim()}
          className="h-12 px-4 shrink-0 rounded-2xl bg-hx-text text-hx-base font-semibold text-[14px] inline-flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed hover:bg-white transition-colors"
        >
          {spinning ? <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
          {busy ? 'Estimating' : waiting ? AI_LOADING_LABEL : 'Estimate'}
        </button>
      </div>
      {question ? (
        <p className="text-[13px] leading-4 text-hx-yellow px-1" role="status">
          {question}
        </p>
      ) : (
        <p className={`text-[12px] leading-4 px-1 ${captionTone}`} role={aiStatus === 'error' ? 'status' : undefined}>
          {aiBarCaption(aiStatus, aiError)}
        </p>
      )}
    </form>
  );
}
