/**
 * Pure text helpers for the Coach screen (SPEC §4 / §8).
 *
 * - splitBold: the only markdown the coach emits is **bold** (§8 OUTPUT ends
 *   with "the single action in **bold**"). Everything else is rendered
 *   verbatim, so model output can never inject markup into the transcript.
 * - stripDanglingBold: while a reply streams, an opening `**` arrives before
 *   its close — hide it until the pair completes so the bubble doesn't flash
 *   asterisks mid-sentence.
 * - modelPillLabel: "Claude · Opus 5" for the header status pill.
 * - SOURCE_LABEL / SOURCE_DOT: caption text and dot colour per ChatMessage.source
 *   (blue = AI per §0 "Blue: informational/AI"; error red; guardrail yellow).
 */
import type { AISettings, ChatMessage } from '../../data/types';
import { MODEL_OPTIONS, resolveModel } from '../../ai/config';

export interface TextSegment {
  text: string;
  bold: boolean;
}

/** `**…**` spans; the body cannot start with `*`/newline or contain `*` (so "** **" and stray stars stay literal). */
const BOLD = /\*\*([^*\n][^*]*?)\*\*/g;

/** Split "Eat more **protein** now" into plain / bold segments, in order. Empty input → []. */
export function splitBold(text: string): TextSegment[] {
  const out: TextSegment[] = [];
  if (!text) return out;
  let last = 0;
  BOLD.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = BOLD.exec(text)) !== null) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), bold: false });
    out.push({ text: m[1], bold: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), bold: false });
  return out;
}

/** With an odd number of `**` markers, drop the last one (it has no partner yet). */
export function stripDanglingBold(text: string): string {
  if (!text) return text;
  const count = (text.match(/\*\*/g) ?? []).length;
  if (count % 2 === 0) return text;
  const idx = text.lastIndexOf('**');
  return text.slice(0, idx) + text.slice(idx + 2);
}

/** "Claude · Opus 5" from the settings' model (label without the "(default)" hint), or the raw id for unknown models. */
export function modelPillLabel(ai: AISettings): string {
  const id = resolveModel(ai);
  const opt = MODEL_OPTIONS.find((o) => o.id === id);
  const short = opt ? opt.label.replace(/\s*\([^)]*\)\s*$/, '').replace(/^Claude\s+/i, '') : id;
  return `Claude · ${short}`;
}

export type ReplySource = NonNullable<ChatMessage['source']>;

export const SOURCE_LABEL: Record<ReplySource, string> = {
  claude: 'Claude',
  offline: 'offline',
  guardrail: 'guardrail',
  error: 'error',
};

export const SOURCE_DOT: Record<ReplySource, string> = {
  claude: 'bg-hx-blue',
  offline: 'bg-hx-neutral',
  guardrail: 'bg-hx-yellow',
  error: 'bg-hx-red',
};
