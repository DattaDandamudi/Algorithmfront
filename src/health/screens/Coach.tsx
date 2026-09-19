/**
 * Coach — SPEC §4 (chat UI, quick-prompt chips, tone toggle, disclaimer,
 * escalation cue) on top of the §8 prompt in ai/coach.ts.
 *
 * A printed interview (DESIGN.md "Coach"): a page that scrolls, not a chat
 * panel. Masthead and tone words, the transcript as paragraphs divided by
 * hairlines, the prompt tags and the underline composer at the foot, then
 * the disclaimer as the colophon under a final hairline. Nothing here is
 * sticky; the tab bar is the app's only fixed element. This file composes the
 * three parts (header, transcript, composer), the nav prefill hand-off (task
 * item 7) and the clear-conversation confirm (task item 8). The send flow
 * lives in coach/useCoachChat.ts.
 */
import { useEffect, useRef, useState } from 'react';
import { DISCLAIMER } from '../ai/guardrails';
import { useNav } from '../nav';
import { Button, Sheet, toast } from '../ui';
import Composer from './coach/Composer';
import CoachHeader from './coach/CoachHeader';
import Transcript from './coach/Transcript';
import { modelStatusLine } from './coach/text';
import { introLine } from './coach/turn';
import { useCoachChat } from './coach/useCoachChat';

/** The status line when no key is set: a sentence, not a pill (the aria-label adds "Open Settings"). */
const OFFLINE_STATUS = 'Offline coach, add a key in Settings';

export default function Coach() {
  const c = useCoachChat();
  const { openSettings, coachPrefill, consumeCoachPrefill } = useNav();
  const [draft, setDraft] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sendRef = useRef(c.send);
  sendRef.current = c.send;
  const handledNonce = useRef<number | null>(null);

  const send = (text: string) => {
    if (c.send(text)) setDraft('');
  };

  // Prefill from Today/Trends tiles: fill the composer, auto-send when asked.
  // The nonce guard makes a double-invoked effect (StrictMode) a no-op.
  useEffect(() => {
    if (!coachPrefill || handledNonce.current === coachPrefill.nonce) return;
    handledNonce.current = coachPrefill.nonce;
    const { prompt, send: auto } = coachPrefill;
    consumeCoachPrefill();
    if (auto && sendRef.current(prompt)) {
      setDraft('');
      return;
    }
    // Not auto-sent (or a reply is in flight): leave it in the composer to review.
    setDraft(prompt);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [coachPrefill, consumeCoachPrefill]);

  const clear = () => {
    c.clear();
    setConfirmOpen(false);
    toast('Conversation cleared');
  };

  return (
    <div className="flex flex-col px-5 pt-8">
      <CoachHeader
        tone={c.settings.ai.tone}
        onTone={c.setTone}
        statusLabel={c.aiConfigured ? modelStatusLine(c.settings.ai) : OFFLINE_STATUS}
        onOpenSettings={() => openSettings('coach')}
        canClear={c.chat.length > 0}
        onClear={() => setConfirmOpen(true)}
      />

      <Transcript chat={c.chat} intro={introLine(c.ctx)} busy={c.busy} className="mt-6" />

      <Composer value={draft} onChange={setDraft} onSend={send} onStop={c.stop} busy={c.busy} shelf={c.chat.length === 0} onChip={send} textareaRef={textareaRef} className="mt-8" />

      {/* The colophon: the §4 persistent disclaimer, verbatim, under a hairline. */}
      <div className="hx-hair mt-10" aria-hidden />
      <p className="hx-hedge mt-3">{DISCLAIMER}</p>

      <Sheet
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Clear conversation?"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" fullWidth onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" fullWidth onClick={clear}>
              Clear
            </Button>
          </div>
        }
      >
        <p className="hx-body text-hx-text2">
          This removes all {c.chat.length} message{c.chat.length === 1 ? '' : 's'} from this device{c.busy ? ' and stops the reply in progress' : ''}. Your logs, targets and settings are untouched.
        </p>
      </Sheet>
    </div>
  );
}
