/**
 * InsightCard — SPEC §7 card: ≤2 sentences, state shown by an indicator lamp
 * beside the title (the band's colour, sized like a dial's warning light), tap
 * opens the Coach pre-filled with `insight.coachPrompt`. Renders as a <button>
 * only when it can actually open something, otherwise a plain card. No entrance
 * animation: cards do not move on load (DESIGN.md "Motion").
 */
import { ChevronRight } from 'lucide-react';
import type { Insight } from '../data/types';
import { bandBg } from './bands';

export interface InsightCardProps {
  insight: Insight;
  onOpen?: (prompt: string) => void;
  className?: string;
}

export default function InsightCard({ insight, onOpen, className = '' }: InsightCardProps) {
  const prompt = insight.coachPrompt;
  const tappable = Boolean(onOpen && prompt);

  const inner = (
    <>
      <span className="flex-1 min-w-0 flex flex-col gap-1 py-4 pl-4 pr-3">
        <span className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${bandBg(insight.band)}`} aria-hidden />
          <span className="hx-display text-[15px] leading-5 font-semibold text-hx-text">{insight.title}</span>
        </span>
        <span className="text-[15px] leading-[22px] text-hx-text2">{insight.body}</span>
        {tappable && <span className="text-[13px] leading-[18px] text-hx-blue font-medium mt-0.5">Ask the coach</span>}
      </span>
      {tappable && <ChevronRight className="w-4 h-4 text-hx-muted shrink-0 mr-3 self-center" aria-hidden />}
    </>
  );

  const base = `hx-card relative overflow-hidden flex items-stretch w-full text-left ${className}`;
  if (tappable) {
    return (
      <button type="button" onClick={() => onOpen?.(prompt as string)} className={`${base} hx-press hover:border-hx-neutral`}>
        {inner}
      </button>
    );
  }
  return (
    <article className={base} aria-label={insight.title}>
      {inner}
    </article>
  );
}
