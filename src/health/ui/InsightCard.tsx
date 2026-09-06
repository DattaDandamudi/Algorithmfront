/**
 * InsightCard — SPEC §7 card: ≤2 sentences, coloured by state via a left rail,
 * tap opens the Coach pre-filled with `insight.coachPrompt`. Renders as a
 * <button> only when it can actually open something, otherwise a plain card.
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
      <span className={`absolute inset-y-0 left-0 w-1 ${bandBg(insight.band)}`} aria-hidden />
      <span className="flex-1 min-w-0 flex flex-col gap-1 py-3.5 pl-4 pr-3">
        <span className="text-[14px] leading-5 font-semibold text-hx-text">{insight.title}</span>
        <span className="text-[13px] leading-5 text-hx-text2">{insight.body}</span>
        {tappable && <span className="text-[12px] leading-4 text-hx-blue font-medium mt-0.5">Ask the coach</span>}
      </span>
      {tappable && <ChevronRight className="w-4 h-4 text-hx-muted shrink-0 mr-3 self-center" aria-hidden />}
    </>
  );

  const base = `hx-card relative overflow-hidden flex items-stretch w-full text-left hx-fade-up ${className}`;
  if (tappable) {
    return (
      <button type="button" onClick={() => onOpen?.(prompt as string)} className={`${base} transition-colors hover:border-hx-neutral active:bg-hx-card2`}>
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
