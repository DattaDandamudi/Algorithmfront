/**
 * Transcript (task item 2): user bubbles right, assistant left, `**bold**`
 * rendered as <strong> (the only markup the coach emits, §8 OUTPUT), a
 * source caption ('Claude' / 'offline' / 'guardrail' / 'error'), the
 * over-120-words hint, and the medical escalation cue above replies to
 * lab / medication / symptom asks (task item 6). Empty state = a short intro
 * from real numbers + the 8 quick-prompt chips (§4).
 *
 * Auto-scroll sticks to the bottom while the reader is there (or has just
 * sent a message) and leaves them alone once they scroll up to re-read.
 */
import { useEffect, useRef, type UIEvent } from 'react';
import { AlertTriangle, Sparkles, Stethoscope } from 'lucide-react';
import type { ChatMessage } from '../../data/types';
import { COACH_CHIPS } from '../../engine';
import { Chip } from '../../ui';
import { SOURCE_DOT, SOURCE_LABEL, splitBold, stripDanglingBold } from './text';
import { MEDICAL_CUE, formatTime, needsMedicalCue, wordHint } from './turn';

/** How close to the bottom (px) still counts as "reading the latest". */
const STICK_PX = 80;

export interface TranscriptProps {
  chat: ChatMessage[];
  appName: string;
  /** Empty-state one-liner built from the current context. */
  intro: string;
  busy: boolean;
  onChip: (prompt: string) => void;
}

export default function Transcript({ chat, appName, intro, busy, onChip }: TranscriptProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);

  const onScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    stuck.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_PX;
  };

  const last = chat[chat.length - 1];
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    // A fresh user turn always jumps to the bottom; streaming follows only while stuck.
    if (last?.role === 'user') stuck.current = true;
    if (stuck.current) el.scrollTop = el.scrollHeight;
  }, [chat, last]);

  return (
    <div
      ref={scroller}
      onScroll={onScroll}
      role="log"
      aria-label="Conversation"
      aria-busy={busy || undefined}
      className="flex-1 min-h-0 overflow-y-auto hx-scroll px-4 py-4 flex flex-col gap-3"
    >
      {chat.length === 0 ? (
        <EmptyIntro appName={appName} intro={intro} busy={busy} onChip={onChip} />
      ) : (
        chat.map((m, i) => <Bubble key={m.id} m={m} medicalCue={needsMedicalCue(chat, i)} />)
      )}
    </div>
  );
}

function EmptyIntro({ appName, intro, busy, onChip }: Omit<TranscriptProps, 'chat'>) {
  return (
    <div className="flex flex-col gap-4 pt-2">
      <div className="hx-card p-4 flex flex-col gap-2">
        <div className="flex items-center gap-2 text-hx-blue">
          <Sparkles className="w-4 h-4" aria-hidden />
          <span className="hx-label !text-hx-blue">{appName} Coach</span>
        </div>
        <p className="text-[15px] leading-[22px] text-hx-text">
          I answer from your own numbers — readiness, HRV baseline, trend weight, macros and sleep. Short replies, one action each.
        </p>
        <p className="text-[13px] leading-5 text-hx-text2">{intro}</p>
      </div>
      <div>
        <p className="hx-label mb-2">Ask me</p>
        <div className="flex flex-wrap gap-2">
          {COACH_CHIPS.map((c) => (
            <Chip key={c} size="sm" disabled={busy} onClick={() => onChip(c)}>
              {c}
            </Chip>
          ))}
        </div>
      </div>
    </div>
  );
}

function Bubble({ m, medicalCue }: { m: ChatMessage; medicalCue: boolean }) {
  if (m.role === 'user') {
    return (
      <div className="self-end max-w-[85%] flex flex-col items-end gap-1">
        <div className="rounded-2xl rounded-br-md bg-hx-text text-hx-base px-3.5 py-2.5 text-[15px] leading-[22px] whitespace-pre-wrap break-words">{m.text}</div>
        <span className="text-[11px] leading-4 text-hx-muted px-1">{formatTime(m.ts)}</span>
      </div>
    );
  }

  const streaming = m.streaming === true;
  const source = m.source;
  const tone = source === 'error' ? 'border-hx-red/40' : source === 'guardrail' ? 'border-hx-yellow/40' : 'border-hx-border';
  const hint = !streaming && source !== 'error' ? wordHint(m.text) : null;
  const text = streaming ? stripDanglingBold(m.text) : m.text;

  return (
    <div className="self-start max-w-[92%] flex flex-col gap-1.5">
      {medicalCue && (
        <p className="flex items-start gap-1.5 px-1 text-[12px] leading-4 text-hx-yellow">
          <Stethoscope className="w-3.5 h-3.5 shrink-0 mt-px" aria-hidden />
          <span>{MEDICAL_CUE}</span>
        </p>
      )}
      <div className={`rounded-2xl rounded-bl-md bg-hx-card border ${tone} px-3.5 py-2.5 text-[15px] leading-[22px] text-hx-text whitespace-pre-wrap break-words`}>
        {streaming && !text ? (
          <TypingDots />
        ) : (
          <>
            {(source === 'error' || source === 'guardrail') && (
              <AlertTriangle className={`inline w-4 h-4 mr-1.5 -mt-0.5 ${source === 'error' ? 'text-hx-red' : 'text-hx-yellow'}`} aria-hidden />
            )}
            {splitBold(text).map((seg, i) =>
              seg.bold ? (
                <strong key={i} className="font-semibold">
                  {seg.text}
                </strong>
              ) : (
                <span key={i}>{seg.text}</span>
              ),
            )}
          </>
        )}
      </div>
      <div className="flex items-center gap-1.5 px-1 text-[11px] leading-4 text-hx-muted">
        {streaming ? (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-hx-blue hx-pulse" aria-hidden />
            <span>replying…</span>
          </>
        ) : (
          <>
            {source && <span className={`w-1.5 h-1.5 rounded-full ${SOURCE_DOT[source]}`} aria-hidden />}
            {source && <span>{SOURCE_LABEL[source]}</span>}
            {source && <span aria-hidden>·</span>}
            <span>{formatTime(m.ts)}</span>
            {hint && (
              <>
                <span aria-hidden>·</span>
                <span className="text-hx-yellow">{hint}</span>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 h-[22px]" role="status" aria-label="Coach is replying">
      <span className="w-1.5 h-1.5 rounded-full bg-hx-text2 hx-pulse" aria-hidden />
      <span className="w-1.5 h-1.5 rounded-full bg-hx-text2 hx-pulse [animation-delay:200ms]" aria-hidden />
      <span className="w-1.5 h-1.5 rounded-full bg-hx-text2 hx-pulse [animation-delay:400ms]" aria-hidden />
    </span>
  );
}
