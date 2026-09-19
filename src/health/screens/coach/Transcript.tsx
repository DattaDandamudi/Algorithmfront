/**
 * Transcript — the printed interview (DESIGN.md "Coach"). No bubbles.
 *
 * Each turn is a paragraph with the speaker word hanging in a 56 px left
 * column in .hx-label ("You" / "Coach"); the user's line is Archivo 15/22 500
 * (the spec names that size; the ladder has no class for it), the coach's
 * reply is .hx-body with `**bold**` rendered as <strong> (the only markup the
 * coach emits, §8 OUTPUT), and a hairline divides the turns. Under a reply the
 * citation line ("Offline coach, 9:41 am") is set as a hedge, the over-120-
 * words hint after it. A reply to a lab / dosing / symptom ask carries the
 * medical escalation cue above it as a note in amber (task item 6; copy
 * verbatim from ./turn); a guardrail or error reply is itself a note in its
 * tone with the tone word first, so colour is never the only carrier. The
 * empty state is the coach's opening turn with the intro line from real
 * numbers; the quick prompts live in the composer beneath.
 *
 * The page scrolls, not the transcript: a fresh user turn takes the window to
 * the foot of the page (where the composer is), a streaming reply follows only
 * while the reader is already there, and a reader who has scrolled up to
 * re-read is left alone. Nothing scrolls while the tab is hidden.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import type { ChatMessage } from '../../data/types';
import { SOURCE_LABEL, splitBold, stripDanglingBold } from './text';
import { MEDICAL_CUE, formatTime, needsMedicalCue, wordHint } from './turn';

/** How close to the foot of the page (px) still counts as "reading the latest". */
const STICK_PX = 80;

export interface TranscriptProps {
  chat: ChatMessage[];
  /** Empty-state one-liner built from the current context. */
  intro: string;
  busy: boolean;
  className?: string;
}

const atFoot = () => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - STICK_PX;

export default function Transcript({ chat, intro, busy, className = '' }: TranscriptProps) {
  const log = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);

  // Track where the reader is, but only while this tab is the visible one.
  useEffect(() => {
    const onScroll = () => {
      if (log.current?.offsetParent === null) return;
      stuck.current = atFoot();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const last = chat[chat.length - 1];
  useEffect(() => {
    const el = log.current;
    // The empty state is read from the top: the intro and the prompts are the whole page.
    if (!el || chat.length === 0 || el.offsetParent === null) return;
    // A fresh user turn always jumps to the foot; streaming follows only while stuck.
    if (last?.role === 'user') stuck.current = true;
    if (stuck.current) window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'auto' });
  }, [chat, last]);

  return (
    <div ref={log} role="log" aria-label="Conversation" aria-busy={busy || undefined} className={`flex flex-col divide-y divide-hx-border ${className}`}>
      {chat.length === 0 ? (
        <Turn speaker="Coach">
          <p className="hx-body">
            I answer from your own numbers — readiness, HRV baseline, trend weight, macros, sleep, today's session and your stress signals. Short replies, one action each.
          </p>
          <p className="hx-hedge">{intro}</p>
        </Turn>
      ) : (
        chat.map((m, i) => <Message key={m.id} m={m} medicalCue={needsMedicalCue(chat, i)} />)
      )}
    </div>
  );
}

/** One turn: the speaker word hanging in a 56 px column, the paragraph beside it. */
function Turn({ speaker, children }: { speaker: 'You' | 'Coach'; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[56px_minmax(0,1fr)] py-4">
      <span className="hx-label pt-0.5">{speaker}</span>
      <div className="min-w-0 flex flex-col gap-2">{children}</div>
    </div>
  );
}

function Message({ m, medicalCue }: { m: ChatMessage; medicalCue: boolean }) {
  if (m.role === 'user') {
    return (
      <Turn speaker="You">
        <p className="text-[15px] leading-[22px] font-medium text-hx-text whitespace-pre-wrap break-words">{m.text}</p>
      </Turn>
    );
  }

  const streaming = m.streaming === true;
  const source = m.source;
  const hint = !streaming && source !== 'error' ? wordHint(m.text) : null;
  const text = streaming ? stripDanglingBold(m.text) : m.text;
  const body = splitBold(text).map((seg, i) =>
    seg.bold ? (
      <strong key={i} className="font-semibold">
        {seg.text}
      </strong>
    ) : (
      <span key={i}>{seg.text}</span>
    ),
  );

  return (
    <Turn speaker="Coach">
      {medicalCue && (
        <p className="hx-note border-hx-yellow hx-body">
          <span className="hx-label text-hx-yellow">Caution</span> {MEDICAL_CUE}
        </p>
      )}
      {streaming && !text ? (
        <p role="status" aria-label="Coach is replying" className="hx-hedge">
          Replying…
        </p>
      ) : source === 'error' || source === 'guardrail' ? (
        // A failure or a guardrail stop is a note in its tone, the tone word first.
        <p className={`hx-note hx-body whitespace-pre-wrap break-words ${source === 'error' ? 'border-hx-red' : 'border-hx-yellow'}`}>
          <span className={`hx-label ${source === 'error' ? 'text-hx-red' : 'text-hx-yellow'}`}>{source === 'error' ? 'Problem' : 'Caution'}</span> {body}
        </p>
      ) : (
        <p className="hx-body whitespace-pre-wrap break-words">{body}</p>
      )}
      {/* The citation: who answered and when, as a comma list, never a middle dot. */}
      {(text || !streaming) && <p className="hx-hedge">{streaming ? 'Replying…' : source ? `${SOURCE_LABEL[source]}, ${formatTime(m.ts)}` : formatTime(m.ts)}</p>}
      {hint && <p className="hx-hedge">{hint}</p>}
    </Turn>
  );
}
