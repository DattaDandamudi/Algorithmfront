/**
 * Transcript (task item 2) — the Coach screen's surface, and the one screen in
 * the app that is NOT a bento: a conversation sitting on the ground.
 *
 * The two turns are told apart by material, not by colour (DESIGN.md "Depth is
 * structural"): a user turn is `.hx-raised` — the thing you did, slate glass,
 * aligned right — and a coach turn is `.hx-card` — a reading, graphite, aligned
 * left. Inside a reply: `**bold**` rendered as <strong> (the only markup the
 * coach emits, §8 OUTPUT, so the bold action line it ends with stays bold), a
 * caption naming who answered and when, the over-120-words hint, and the
 * medical escalation cue above replies to lab / medication / symptom asks
 * (task item 6) — its copy verbatim from ai/guardrails. Empty state = a short
 * intro from real numbers plus the quick-prompt chips (COACH_CHIPS, §4).
 *
 * Auto-scroll sticks to the bottom while the reader is there (or has just
 * sent a message) and leaves them alone once they scroll up to re-read.
 */
import { useEffect, useRef, type UIEvent } from 'react';
import { AlertTriangle, Stethoscope } from 'lucide-react';
import type { ChatMessage } from '../../data/types';
import { COACH_CHIPS } from '../../engine';
import { Chip } from '../../ui';
import { SOURCE_DOT, SOURCE_LABEL, splitBold, stripDanglingBold } from './text';
import { MEDICAL_CUE, formatTime, needsMedicalCue, wordHint } from './turn';

/** How close to the bottom (px) still counts as "reading the latest". */
const STICK_PX = 80;

export interface TranscriptProps {
  chat: ChatMessage[];
  /** Empty-state one-liner built from the current context. */
  intro: string;
  busy: boolean;
  onChip: (prompt: string) => void;
}

export default function Transcript({ chat, intro, busy, onChip }: TranscriptProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);

  const onScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    stuck.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_PX;
  };

  const last = chat[chat.length - 1];
  useEffect(() => {
    const el = scroller.current;
    // The empty state is read from the top: its intro and chips are the whole screen.
    if (!el || chat.length === 0) return;
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
        <EmptyIntro intro={intro} busy={busy} onChip={onChip} />
      ) : (
        chat.map((m, i) => <Bubble key={m.id} m={m} medicalCue={needsMedicalCue(chat, i)} />)
      )}
    </div>
  );
}

function EmptyIntro({ intro, busy, onChip }: Omit<TranscriptProps, 'chat'>) {
  return (
    <div className="flex flex-col gap-5">
      {/* The coach's opening turn: the same graphite card its replies arrive in. */}
      <div className="hx-card px-4 py-3.5 flex flex-col gap-2 self-start max-w-[92%]">
        <p className="text-[15px] leading-[22px] text-hx-text">
          I answer from your own numbers — readiness, HRV baseline, trend weight, macros, sleep, today's session and your stress signals. Short replies, one action each.
        </p>
        <p className="text-[13px] leading-[18px] text-hx-text2">{intro}</p>
      </div>
      <div className="flex flex-col gap-2">
        <p className="hx-label">Ask me</p>
        {/*
         * A two-row shelf that scrolls sideways: the longest prompt is wider
         * than the 358 px column, so a wrapping row would break the 16 px
         * margin. Wide content scrolls inside its own container (DESIGN.md
         * "Quality floor"). Real list + 44 px chips keep button semantics and
         * the touch-target floor (review R2-2 / R2-13).
         */}
        <ul
          className="m-0 p-0 list-none grid grid-flow-col grid-rows-2 auto-cols-max gap-2 overflow-x-auto hx-no-scrollbar"
          role="list"
          aria-label="Quick prompts"
        >
          {COACH_CHIPS.map((c) => (
            <li key={c}>
              <Chip size="sm" disabled={busy} onClick={() => onChip(c)}>
                {c}
              </Chip>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Bubble({ m, medicalCue }: { m: ChatMessage; medicalCue: boolean }) {
  if (m.role === 'user') {
    return (
      <div className="self-end max-w-[85%] flex flex-col items-end gap-1">
        {/* Raised glass: the thing you did. */}
        <div className="hx-raised px-4 py-3 text-[15px] leading-[22px] text-hx-text whitespace-pre-wrap break-words">{m.text}</div>
        <span className="px-1 text-[12px] leading-4 text-hx-muted">{formatTime(m.ts)}</span>
      </div>
    );
  }

  const streaming = m.streaming === true;
  const source = m.source;
  // The bezel carries the state on a reply that is not ordinary coaching.
  const tone = source === 'error' ? '!border-hx-red/40' : source === 'guardrail' ? '!border-hx-yellow/40' : '';
  const hint = !streaming && source !== 'error' ? wordHint(m.text) : null;
  const text = streaming ? stripDanglingBold(m.text) : m.text;

  return (
    <div className="self-start max-w-[92%] flex flex-col gap-1.5">
      {medicalCue && (
        <p className="flex items-start gap-2 px-1 text-[13px] leading-[18px] text-hx-yellow">
          <Stethoscope className="w-4 h-4 shrink-0 mt-px" aria-hidden />
          <span>{MEDICAL_CUE}</span>
        </p>
      )}
      {/* Graphite card: a reading. */}
      <div className={`hx-card px-4 py-3 text-[15px] leading-[22px] text-hx-text whitespace-pre-wrap break-words ${tone}`}>
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
      <div className="flex items-center gap-2 px-1 text-[12px] leading-4 text-hx-muted">
        {streaming ? (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-hx-blue hx-pulse" aria-hidden />
            <span>Replying…</span>
          </>
        ) : (
          <>
            {source && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${SOURCE_DOT[source]}`} aria-hidden />}
            {/* A comma list, never a middle dot: "Offline coach, 9:41 am". */}
            <span>{source ? `${SOURCE_LABEL[source]}, ${formatTime(m.ts)}` : formatTime(m.ts)}</span>
          </>
        )}
      </div>
      {hint && <p className="px-1 -mt-0.5 text-[12px] leading-4 text-hx-yellow">{hint}</p>}
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
