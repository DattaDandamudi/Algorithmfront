/**
 * SectionHeader — the running head (DESIGN.md "Layout grammar").
 *
 * `as="h2"` draws the full-bleed ink rule above itself: that rule is a section
 * boundary, so a screen carries at most three. The title sits flush left in
 * .hx-label; `caption` is the dateline, flush right in .hx-hedge, and should
 * be real metadata ("vs your 30-day avg", "3 meals left, 14:20"); `action` is
 * a slot for a ghost verb or a range toggle. `as="h3"` drops the rule. Put
 * 40 px above a ruled head and 16 px between the head and its content; the
 * rule-to-head 12 px is drawn here. `rule` overrides the default.
 */
import type { ReactNode } from 'react';

export interface SectionHeaderProps {
  title: string;
  action?: ReactNode;
  /** The dateline, flush right, in .hx-hedge. */
  caption?: string;
  /** Heading level for the document outline. Default h2. */
  as?: 'h2' | 'h3';
  /** Draw the ink rule above. Default: true for h2, false for h3. */
  rule?: boolean;
  className?: string;
}

export default function SectionHeader({ title, action, caption, as: Tag = 'h2', rule, className = '' }: SectionHeaderProps) {
  const inked = rule ?? Tag === 'h2';
  return (
    <div className={`flex flex-col ${className}`}>
      {inked && <div className="hx-rule" aria-hidden />}
      <div className={`flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 ${inked ? 'pt-3' : ''}`}>
        <Tag className="hx-label shrink-0">{title}</Tag>
        {caption && <p className="hx-hedge min-w-0 flex-1 text-right">{caption}</p>}
        {action && <div className="shrink-0 ml-auto flex items-center">{action}</div>}
      </div>
    </div>
  );
}
