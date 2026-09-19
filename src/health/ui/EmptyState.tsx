/**
 * EmptyState — an invitation to act (SPEC §1 empty states: "Log your first
 * meal to see protein remaining."). An italic .hx-body paragraph under a
 * hairline, the title in bone and the hint in text2, with a ghost verb. No
 * dashed box, no icon; `icon` is accepted for callers and not drawn.
 */
import type { ReactNode } from 'react';
import Button from './Button';

export interface EmptyStateProps {
  /** Accepted for callers; decorative icons are not drawn. */
  icon?: ReactNode;
  title: string;
  hint: string;
  action?: { label: string; onClick: () => void };
  className?: string;
}

export default function EmptyState(props: EmptyStateProps) {
  const { title, hint, action, className = '' } = props;
  const stop = /[.!?…]$/.test(title.trim()) ? '' : '.';
  return (
    <div className={`border-t border-hx-border pt-3 flex flex-col items-start text-left gap-2 ${className}`}>
      <p className="hx-body italic text-hx-text2 max-w-[320px]">
        <span className="text-hx-text">{title}</span>
        {stop} {hint}
      </p>
      {action && (
        <Button variant="ghost" size="sm" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
