/**
 * AIBar — the natural-language entry (SPEC §2 "Primary = natural-language AI
 * bar"), the Log's one tipped-in surface (DESIGN.md "Tipped-in surfaces"): a
 * 52 px field on the sheet ground with a text2 underline and an italic
 * placeholder, the Estimate key beside it as an ink key (an outline while it
 * is disabled, never a grey slab), and the line saying who will answer as a
 * hedge beneath. Purely presentational: the Log screen owns the estimate
 * call so the result can open the shared EstimateSheet. The caption names
 * the offline parser (no key), the loading / failed SDK state and its reason
 * (review R7-3: never "add an AI key" when one exists), or the AI.
 *
 * While the SDK is 'loading' the key reads "Loading AI…" and submits are
 * held; after the Log's grace period ('slow') the local parser answers so a
 * slow link never blocks logging.
 *
 * While busy the input is `readOnly`, not `disabled`: disabling would throw
 * focus to <body>, and the estimate Sheet records the focused element as the
 * place to return focus to on close (review R6-5).
 */
import type { FormEvent, RefObject } from 'react';
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
  /** Question to show under the field when the last submit produced no items. */
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
    // The key goes `loading` (disabled) while the estimate runs, which would
    // drop focus to <body> before the sheet opens; the read-only field keeps
    // it, so the sheet returns focus here when it closes.
    inputRef.current?.focus({ preventScroll: true });
    onSubmit(t);
  };

  return (
    <form onSubmit={submit} className="flex flex-col" aria-busy={busy || undefined} aria-label="Log a meal">
      <SectionHeader as="h2" rule={false} title="Log a meal" />
      <div className="mt-4 flex items-center gap-3">
        {/* The kit makes every input an underline field; the sheet ground and the 52 px height are this field's only additions. */}
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
          className="flex-1 min-w-0 h-[52px] px-3 bg-hx-card"
          readOnly={busy}
          aria-busy={busy || undefined}
        />
        <Button type="submit" size="lg" loading={busy || waiting} disabled={!text.trim()} className="shrink-0 !h-[52px] min-w-[112px]">
          {busy ? 'Estimating' : waiting ? AI_LOADING_LABEL : 'Estimate'}
        </Button>
      </div>
      {question ? (
        <p className="hx-cap text-hx-yellow mt-2" role="status">
          {question}
        </p>
      ) : (
        <p className={`hx-hedge mt-2 ${aiStatus === 'error' ? 'text-hx-yellow' : ''}`} role={aiStatus === 'error' ? 'status' : undefined}>
          {aiBarCaption(aiStatus, aiError)}
        </p>
      )}
    </form>
  );
}
