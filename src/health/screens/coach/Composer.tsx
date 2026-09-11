/**
 * Composer (task items 3, 4, 6): the quick-prompt chips (COACH_CHIPS) as a
 * horizontal scroll row with no scrollbar (tap = send immediately), a textarea
 * — a well, like every input in the app — that sends on Enter and inserts a
 * newline on Shift+Enter, the lume Send key swapping to Stop while a reply
 * streams, and the persistent medical disclaimer (§4 "Persistent medical
 * disclaimer footer"; DISCLAIMER from ai/guardrails, verbatim and left-aligned).
 *
 * The chip row is a real <ul>/<li> list so each Chip keeps its implicit
 * `button` role (never forward `role` to the Chip — review R2-2); both Chip
 * sizes are 44 px tall, so `sm` meets the touch-target floor (R2-13) while
 * keeping more prompts on screen.
 */
import { useEffect, type KeyboardEvent, type RefObject } from 'react';
import { Send, Square } from 'lucide-react';
import { DISCLAIMER } from '../../ai/guardrails';
import { COACH_CHIPS } from '../../engine';
import { Button, Chip } from '../../ui';

/** Auto-grow ceiling (~4 lines) before the textarea scrolls internally. */
const MAX_TEXTAREA_PX = 120;

export interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (text: string) => void;
  onStop: () => void;
  busy: boolean;
  /** Hidden in the empty state, where the transcript already shows every chip. */
  showChips: boolean;
  onChip: (prompt: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement>;
}

export default function Composer({ value, onChange, onSend, onStop, busy, showChips, onChip, textareaRef }: ComposerProps) {
  const canSend = !busy && value.trim().length > 0;

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_PX)}px`;
  }, [value, textareaRef]);

  const submit = () => {
    if (!canSend) return;
    onSend(value);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    submit();
  };

  return (
    <div className="shrink-0 border-t border-hx-border bg-hx-base pt-2.5">
      {showChips && (
        <ul className="m-0 p-0 list-none flex gap-2 overflow-x-auto hx-no-scrollbar px-4 pb-2.5" role="list" aria-label="Quick prompts">
          {COACH_CHIPS.map((c) => (
            <li key={c} className="shrink-0">
              <Chip size="sm" disabled={busy} onClick={() => onChip(c)}>
                {c}
              </Chip>
            </li>
          ))}
        </ul>
      )}
      <form
        className="px-4 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        aria-busy={busy || undefined}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          disabled={busy}
          placeholder="Ask about training, food, sleep, recovery…"
          aria-label="Message the coach"
          enterKeyHint="send"
          autoComplete="off"
          className="flex-1 min-w-0 min-h-[44px] max-h-[120px] resize-none px-3.5 py-[11px] text-[15px] leading-[22px] disabled:opacity-60"
        />
        {busy ? (
          <Button type="button" variant="danger" aria-label="Stop reply" icon={<Square />} onClick={onStop}>
            Stop
          </Button>
        ) : (
          <Button type="submit" variant="primary" aria-label="Send" icon={<Send />} disabled={!canSend} className="w-11 px-0" />
        )}
      </form>
      <p className="px-4 pt-2 pb-2 text-[12px] leading-4 text-hx-muted">{DISCLAIMER}</p>
    </div>
  );
}
