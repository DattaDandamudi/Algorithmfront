/**
 * Composer (task items 3, 4, 6): the quick prompts (COACH_CHIPS) as tags in a
 * row that scrolls sideways under the page margins (tap = send immediately),
 * then the underline composer: a textarea that is an underline field by the
 * kit's own rule (transparent, a 1 px text2 rule beneath, 44 px, 16 px type,
 * an italic placeholder), sending on Enter and inserting a newline on
 * Shift+Enter, growing to three lines before it scrolls inside itself, with
 * the ink-key Send (a 44 px square, `aria-label="Send"`) that swaps to a red
 * outline Stop while a reply streams. The disclaimer is the screen's colophon,
 * so it is not here.
 *
 * The chip row is a real <ul>/<li> list so each Chip keeps its implicit
 * `button` role (never forward `role` to the Chip — review R2-2); `sm` chips
 * are still 44 px tall (R2-13). In the empty state the same list is a two-row
 * shelf under a running head, so more prompts show without a wrapping row
 * breaking the margin.
 */
import { useEffect, useRef, type KeyboardEvent, type RefObject } from 'react';
import { COACH_CHIPS } from '../../engine';
import { Button, Chip, SectionHeader } from '../../ui';

/** Three lines of 24 px plus the field's 20 px of vertical padding. */
const MAX_TEXTAREA_PX = 92;

export interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (text: string) => void;
  onStop: () => void;
  busy: boolean;
  /** Empty state: the prompts as a two-row shelf under a running head. */
  shelf: boolean;
  onChip: (prompt: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement>;
  className?: string;
}

export default function Composer({ value, onChange, onSend, onStop, busy, shelf, onChip, textareaRef, className = '' }: ComposerProps) {
  const canSend = !busy && value.trim().length > 0;

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_PX)}px`;
  }, [value, textareaRef]);

  // The shelf becomes a row after the first send; start the row at its first prompt
  // rather than wherever the shelf had been scrolled to reach the tapped chip.
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (list.current) list.current.scrollLeft = 0;
  }, [shelf]);

  const submit = () => {
    if (!canSend) return;
    onSend(value);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    submit();
  };

  // The list bleeds to the page edges (-mx-5) and pads back in (px-5), so the
  // first chip sits on the margin and the row scrolls under both margins.
  const shape = shelf ? 'grid grid-flow-col grid-rows-2 auto-cols-max' : 'flex';

  return (
    <div className={`flex flex-col ${className}`}>
      {shelf && <SectionHeader as="h3" title="Ask me" className="mb-3" />}
      <ul ref={list} className={`m-0 p-0 list-none ${shape} gap-2 overflow-x-auto hx-no-scrollbar -mx-5 px-5`} role="list" aria-label="Quick prompts">
        {COACH_CHIPS.map((c) => (
          <li key={c} className="shrink-0">
            <Chip size="sm" disabled={busy} onClick={() => onChip(c)}>
              {c}
            </Chip>
          </li>
        ))}
      </ul>
      <form
        className="mt-4 flex items-end gap-3"
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
          className="flex-1 min-w-0 px-0 py-2.5 leading-6 resize-none max-h-[92px] disabled:opacity-60"
        />
        {busy ? (
          <Button type="button" variant="danger" aria-label="Stop reply" onClick={onStop} className="shrink-0">
            Stop
          </Button>
        ) : (
          // An ink key once there is something to send; until then an outline, not a grey slab.
          <Button type="submit" variant={canSend ? 'primary' : 'secondary'} aria-label="Send" disabled={!canSend} className="w-11 px-0 shrink-0">
            Send
          </Button>
        )}
      </form>
    </div>
  );
}
