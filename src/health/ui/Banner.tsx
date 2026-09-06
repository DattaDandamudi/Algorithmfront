/**
 * Banner — persistent inline notice for storage quota / integrity problems
 * (SPEC §10), WHOOP import results, and the medical "confirm with your doctor"
 * cue. warn/error use role=alert; info/success use role=status. Colour lives
 * in the icon + left rail only.
 */
import type { ReactNode } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { bandBg, bandText, type Tone } from './bands';
import Button from './Button';

export type BannerKind = 'info' | 'warn' | 'error' | 'success';

export interface BannerProps {
  kind: BannerKind;
  children: ReactNode;
  onDismiss?: () => void;
  /** Inline action: `{ label, onClick }` or any node (e.g. a <Button>). */
  action?: { label: string; onClick: () => void } | ReactNode;
  className?: string;
}

const META: Record<BannerKind, { tone: Tone; Icon: typeof Info; role: 'status' | 'alert' }> = {
  info: { tone: 'blue', Icon: Info, role: 'status' },
  success: { tone: 'green', Icon: CheckCircle2, role: 'status' },
  warn: { tone: 'yellow', Icon: AlertTriangle, role: 'alert' },
  error: { tone: 'red', Icon: AlertCircle, role: 'alert' },
};

function isActionSpec(a: BannerProps['action']): a is { label: string; onClick: () => void } {
  return typeof a === 'object' && a !== null && 'label' in a && 'onClick' in a;
}

export default function Banner({ kind, children, onDismiss, action, className = '' }: BannerProps) {
  const { tone, Icon, role } = META[kind];
  return (
    <div role={role} className={`hx-card relative overflow-hidden flex items-start gap-3 pl-4 pr-2 py-3 ${className}`}>
      <span className={`absolute inset-y-0 left-0 w-1 ${bandBg(tone)}`} aria-hidden />
      <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${bandText(tone)}`} aria-hidden />
      <div className="flex-1 min-w-0 text-[13px] leading-5 text-hx-text py-0.5">
        {children}
        {action && (
          <div className="mt-2">
            {isActionSpec(action) ? (
              <Button variant="secondary" size="sm" onClick={action.onClick}>
                {action.label}
              </Button>
            ) : (
              action
            )}
          </div>
        )}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="w-11 h-11 -my-2 -mr-1 shrink-0 inline-flex items-center justify-center rounded-xl text-hx-muted hover:text-hx-text hover:bg-hx-card2"
        >
          <X className="w-4 h-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
