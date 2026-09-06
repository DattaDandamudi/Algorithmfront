/**
 * EmptyState — dashed, muted card that *instructs* (SPEC §1 empty states:
 * "Log your first meal to see protein remaining."). Optional single action.
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
    <div className={`rounded-2xl border border-dashed border-hx-border bg-hx-card/40 px-5 py-6 flex flex-col items-center text-center gap-2 ${className}`}>
      <div className="text-hx-muted [&>svg]:w-6 [&>svg]:h-6" aria-hidden>
        {icon ?? <Inbox />}
      </div>
      <p className="text-[15px] font-semibold text-hx-text2">{title}</p>
      <p className="text-[13px] leading-5 text-hx-muted max-w-[280px]">{hint}</p>
      {action && (
        <Button variant="secondary" size="sm" className="mt-2" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
