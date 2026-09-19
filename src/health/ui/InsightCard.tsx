/**
 * InsightCard — a brief (SPEC §7: two sentences at most). The tone word
 * ("Note" for a neutral band) hangs in a 72 px left column in .hx-label with a tone square; the title is
 * .hx-ui and the body .hx-body; "Ask the coach" is a ghost verb; a hairline
 * runs beneath. When `onOpen` and `insight.coachPrompt` exist the whole brief
 * is the button (it inks its hairline on press) and opens the Coach pre-filled;
 * otherwise it is a plain article. No entrance animation.
 */
import type { Insight } from '../data/types';
import { bandLabel, bandText } from './bands';

export interface InsightCardProps {
  insight: Insight;
  onOpen?: (prompt: string) => void;
  className?: string;
}

export default function InsightCard({ insight, onOpen, className = '' }: InsightCardProps) {
  const prompt = insight.coachPrompt;
  const tappable = Boolean(onOpen && prompt);
  // A brief with no band is a note, not a missing signal.
  const word = insight.band === 'neutral' ? 'Note' : bandLabel(insight.band);

  const inner = (
    <>
      <span className={`hx-label w-[72px] shrink-0 pt-4 inline-flex items-center gap-1 whitespace-nowrap self-start ${bandText(insight.band)}`}>
        <span className="hx-tone" aria-hidden />
        {word}
      </span>
      <span className="flex-1 min-w-0 flex flex-col gap-1 py-4">
        <span className="hx-ui text-hx-text">{insight.title}</span>
        <span className="hx-body">{insight.body}</span>
        {tappable && <span className="hx-ui text-hx-text2 underline decoration-1 underline-offset-[3px] self-start mt-1">Ask the coach</span>}
      </span>
    </>
  );

  const base = `flex items-start gap-3 w-full text-left border-b border-hx-border ${className}`;
  if (tappable) {
    return (
      <button type="button" onClick={() => onOpen?.(prompt as string)} className={`${base} hx-press`}>
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
