/**
 * SectionHeader — `.hx-label` row above a group of tiles/cards, with an
 * optional right-aligned action (e.g. "See all" button or a range toggle) and
 * a muted caption underneath.
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
      <div className="flex items-center justify-between gap-3 min-h-6">
        <Tag className="hx-label truncate">{title}</Tag>
        {action && <div className="shrink-0 flex items-center">{action}</div>}
      </div>
      {caption && <p className="text-[13px] leading-4 text-hx-muted">{caption}</p>}
    </div>
  );
}
