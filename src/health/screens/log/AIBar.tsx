/**
 * AIBar — the natural-language entry (SPEC §2 "Primary = natural-language AI
 * bar"), as the Log screen's hero: a span-2 RAISED tile, because it is the
 * thing you act on (DESIGN.md "Material system"). Purely presentational: the
 * Log screen owns the estimate call so the result can open the shared
 * EstimateSheet. Shows a busy state while estimating, an inline question when
 * the parser found no food, and a line saying who will answer — Claude, the
 * offline parser (no key), or, for a configured key whose SDK is still loading
 * / failed to load, that state and its reason (review R7-3: never "add an AI
 * key" when one exists).
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
import { Sparkles } from 'lucide-react';
import { Button, SectionHeader } from '../../ui';
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
  const captionTone = aiStatus === 'error' ? 'text-hx-yellow' : 'text-hx-muted';

  return (
    <form onSubmit={submit} className="hx-raised hx-span-2 p-4 flex flex-col gap-3" aria-busy={busy || undefined} aria-label="Log a meal">
      <SectionHeader title="Log a meal" caption="Type what you ate, in your own words." />
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
            className="w-full h-11 pl-9 pr-3"
            readOnly={busy}
            aria-busy={busy || undefined}
          />
        </div>
        <Button type="submit" size="md" loading={busy || waiting} disabled={!text.trim()} className="shrink-0">
          {busy ? 'Estimating' : waiting ? AI_LOADING_LABEL : 'Estimate'}
        </Button>
      </div>
      {question ? (
        <p className="text-[13px] leading-[18px] text-hx-yellow" role="status">
          {question}
        </p>
      ) : (
        <p className={`text-[13px] leading-[18px] ${captionTone}`} role={aiStatus === 'error' ? 'status' : undefined}>
          {aiBarCaption(aiStatus, aiError)}
        </p>
      )}
    </form>
  );
}
