/**
 * Banner — a note: persistent inline notice for storage quota / integrity
 * problems (SPEC §10), WHOOP import results, and the medical "confirm with
 * your doctor" cue. A 2 px left rule in the tone, the tone word (or `lead`,
 * e.g. "Physician follow-up:") first in .hx-label, the message in .hx-body.
 * warn/error are role=alert and sit on a plate; info/success are role=status
 * on the stock. No icon, no radius; the action is a ghost verb and the
 * dismiss a 44 px target.
 */
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { bandBorder, bandText, type Tone } from './bands';
import Button from './Button';

export type BannerKind = 'info' | 'warn' | 'error' | 'success';

export interface BannerProps {
  kind: BannerKind;
  children: ReactNode;
  onDismiss?: () => void;
  /** Inline action: `{ label, onClick }` or any node (e.g. a <Button>). */
  action?: { label: string; onClick: () => void } | ReactNode;
  /** Replaces the tone word, e.g. "Physician follow-up:". */
  lead?: string;
  className?: string;
}

const META: Record<BannerKind, { tone: Tone; word: string; role: 'status' | 'alert' }> = {
  info: { tone: 'blue', word: 'Note', role: 'status' },
  success: { tone: 'green', word: 'Done', role: 'status' },
  warn: { tone: 'yellow', word: 'Caution', role: 'alert' },
  error: { tone: 'red', word: 'Problem', role: 'alert' },
};

function isActionSpec(a: BannerProps['action']): a is { label: string; onClick: () => void } {
  return typeof a === 'object' && a !== null && 'label' in a && 'onClick' in a;
}

export default function Banner({ kind, children, onDismiss, action, lead, className = '' }: BannerProps) {
  const { tone, word, role } = META[kind];
  const alert = role === 'alert';
  return (
    <div role={role} className={`hx-note ${bandBorder(tone)} ${alert ? 'bg-hx-card2 py-3 pr-2' : 'py-1 pr-1'} flex items-start gap-2 ${className}`}>
      <div className="flex-1 min-w-0">
        <div className="hx-body">
          <span className={`hx-label ${bandText(tone)}`}>{lead ?? word}</span> <span>{children}</span>
        </div>
        {action && (
          <div className="mt-1">
            {isActionSpec(action) ? (
              <Button variant="ghost" size="sm" onClick={action.onClick}>
                {action.label}
              </Button>
            ) : (
              action
            )}
          </div>
        )}
      </div>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="w-11 h-11 -my-2 shrink-0 inline-flex items-center justify-center text-hx-text2 hover:text-hx-text">
          <X className="w-4 h-4" strokeWidth={1.5} aria-hidden />
        </button>
      )}
    </div>
  );
}
