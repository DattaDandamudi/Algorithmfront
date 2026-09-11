/**
 * EmptyState — an invitation to act (SPEC §1 empty states: "Log your first
 * meal to see protein remaining."). A dashed bezel, no fill, so it reads as a
 * space waiting for a reading rather than a reading that failed. Optional
 * single action.
 */
import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import Button from './Button';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  hint: string;
  action?: { label: string; onClick: () => void };
  className?: string;
}

export default function EmptyState({ icon, title, hint, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`rounded-tile border border-dashed border-hx-border px-5 py-6 flex flex-col items-start text-left gap-2 ${className}`}>
      <div className="text-hx-muted [&>svg]:w-6 [&>svg]:h-6" aria-hidden>
        {icon ?? <Inbox />}
      </div>
      <p className="hx-display text-[17px] leading-6 font-semibold text-hx-text">{title}</p>
      <p className="text-[15px] leading-[22px] text-hx-text2 max-w-[300px]">{hint}</p>
      {action && (
        <Button variant="secondary" size="sm" className="mt-1" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
