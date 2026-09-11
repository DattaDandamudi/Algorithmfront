/**
 * SectionHeader — a real heading in the display face, sentence case, sitting
 * on the grid ground above a group of tiles (DESIGN.md "Bento rules"). Optional
 * right-aligned action (a "See all" button, a range toggle) and a muted caption.
 */
import type { ReactNode } from 'react';

export interface SectionHeaderProps {
  title: string;
  action?: ReactNode;
  caption?: string;
  /** Heading level for the document outline. Default h2. */
  as?: 'h2' | 'h3';
  className?: string;
}

export default function SectionHeader({ title, action, caption, as: Tag = 'h2', className = '' }: SectionHeaderProps) {
  return (
    <div className={`flex flex-col gap-0.5 ${className}`}>
      <div className="flex items-center justify-between gap-3 min-h-7">
        <Tag className={`hx-display truncate text-hx-text ${Tag === 'h2' ? 'text-[17px] leading-6 font-semibold' : 'text-[15px] leading-5 font-semibold'}`}>{title}</Tag>
        {action && <div className="shrink-0 flex items-center">{action}</div>}
      </div>
      {caption && <p className="text-[13px] leading-[18px] text-hx-muted">{caption}</p>}
    </div>
  );
}
