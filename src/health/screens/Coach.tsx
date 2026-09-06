/**
 * Coach — SPEC §4 (chat UI, 8 quick-prompt chips, tone toggle, disclaimer,
 * escalation cue) on top of the §8 prompt in ai/coach.ts.
 *
 * Layout: a fixed-height column (100dvh minus the shell's 96 px bottom
 * padding) so the transcript scrolls internally while header and composer
 * stay put. This file only composes: header · transcript · chips + composer,
 * the nav prefill hand-off (task item 7) and the clear-conversation confirm
 * (task item 8). The send flow lives in coach/useCoachChat.ts.
 */
import { useEffect, useRef, useState } from 'react';
import { useNav } from '../nav';
import { Button, Sheet, toast } from '../ui';
import Composer from './coach/Composer';
import CoachHeader from './coach/CoachHeader';
import Transcript from './coach/Transcript';
import { modelPillLabel } from './coach/text';
import { introLine } from './coach/turn';
import { useCoachChat } from './coach/useCoachChat';

/** Short enough to never truncate inside the 390 px header pill (review R6-17); the aria-label adds "Open Settings". */
const OFFLINE_STATUS = 'Offline · add a key';

export default function Coach() {
  const c = useCoachChat();
  const { openSettings, coachPrefill, consumeCoachPrefill } = useNav();
  const [draft, setDraft] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sendRef = useRef(c.send);
  sendRef.current = c.send;
  const handledNonce = useRef<number | null>(null);

  const appName = c.settings.ai.appName?.trim() || 'Pulse';

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
    <div className="flex flex-col h-[calc(100dvh-96px)]">
      <CoachHeader
        appName={appName}
        tone={c.settings.ai.tone}
        onTone={c.setTone}
        statusLabel={c.aiConfigured ? modelPillLabel(c.settings.ai) : OFFLINE_STATUS}
        configured={c.aiConfigured}
        onOpenSettings={() => openSettings('coach')}
        canClear={c.chat.length > 0}
        onClear={() => setConfirmOpen(true)}
      />

      <Transcript chat={c.chat} appName={appName} intro={introLine(c.ctx)} busy={c.busy} onChip={send} />

      <Composer
        value={draft}
        onChange={setDraft}
        onSend={send}
        onStop={c.stop}
        busy={c.busy}
        showChips={c.chat.length > 0}
        onChip={send}
        textareaRef={textareaRef}
      />

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
        <p className="text-[14px] leading-6 text-hx-text2">
          This removes all {c.chat.length} message{c.chat.length === 1 ? '' : 's'} from this device{c.busy ? ' and stops the reply in progress' : ''}. Your logs, targets and settings are untouched.
        </p>
      </Sheet>
    </div>
  );
}
