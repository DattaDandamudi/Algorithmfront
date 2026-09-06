/**
 * Toast — fire-and-forget confirmations ("Meal saved", "Export copied").
 *
 * `toast(message, kind)` is a plain function backed by a module-level emitter
 * so stores/actions can call it without React context; `<ToastHost />` (mount
 * once in HealthApp) renders the queue in an aria-live=polite region above the
 * tab bar and auto-hides each toast after 2.5 s. Kind colours the icon only.
 */
import { useEffect, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, X } from 'lucide-react';

export type ToastKind = 'ok' | 'warn' | 'error';
export interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

const AUTO_HIDE_MS = 2500;
const listeners = new Set<(t: ToastItem) => void>();
let seq = 0;

export function toast(message: string, kind: ToastKind = 'ok'): void {
  const item: ToastItem = { id: ++seq, message, kind };
  listeners.forEach((fn) => fn(item));
}

const ICON: Record<ToastKind, { Icon: typeof CheckCircle2; cls: string }> = {
  ok: { Icon: CheckCircle2, cls: 'text-hx-green' },
  warn: { Icon: AlertTriangle, cls: 'text-hx-yellow' },
  error: { Icon: AlertCircle, cls: 'text-hx-red' },
};

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const add = (t: ToastItem) => {
      setItems((xs) => [...xs.slice(-2), t]);
      window.setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== t.id)), AUTO_HIDE_MS);
    };
    listeners.add(add);
    return () => {
      listeners.delete(add);
    };
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 z-[60] flex flex-col items-center gap-2 px-4 bottom-[calc(76px+env(safe-area-inset-bottom))]"
    >
      {items.map((t) => {
        const { Icon, cls } = ICON[t.kind];
        return (
          <div
            key={t.id}
            className="pointer-events-auto hx-fade-up flex items-center gap-2.5 w-full max-w-[358px] rounded-2xl border border-hx-border bg-hx-card2 text-hx-text shadow-2xl pl-3.5 pr-1.5 py-1.5"
          >
            <Icon className={`w-5 h-5 shrink-0 ${cls}`} aria-hidden />
            <span className="flex-1 text-[14px] leading-5 py-1.5">{t.message}</span>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))}
              className="w-9 h-9 inline-flex items-center justify-center rounded-xl text-hx-muted hover:text-hx-text"
            >
              <X className="w-4 h-4" aria-hidden />
            </button>
          </div>
        );
      })}
    </div>
  );
}
