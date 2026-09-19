/**
 * Toast — fire-and-forget confirmations ("Meal saved", "Export copied").
 *
 * `toast(message, kind)` is a plain function backed by a module-level emitter
 * so stores/actions can call it without React context; `<ToastHost />` (mount
 * once in HealthApp) renders the queue in an aria-live=polite region 6 px
 * above the running foot and auto-hides each toast after 2.5 s. A plate slip
 * (.hx-raised: card2 ground, 1 px text2 rule), no radius, the message in
 * .hx-body with a tone square for the kind. The entrance answers an action, so
 * it keeps a 6 px rise (.hx-slip).
 */
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

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

const TONE: Record<ToastKind, string> = {
  ok: 'text-hx-green',
  warn: 'text-hx-yellow',
  error: 'text-hx-red',
};

/** The foot is a hairline, 48 px of items and the safe-area padding; the slip sits 6 px above it. */
const ABOVE_FOOT = 'calc(55px + max(8px, env(safe-area-inset-bottom)))';

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
    <div role="status" aria-live="polite" aria-atomic="false" className="pointer-events-none fixed inset-x-0 z-[60] flex flex-col items-center gap-2 px-5" style={{ bottom: ABOVE_FOOT }}>
      {items.map((t) => (
        <div key={t.id} className="hx-raised hx-slip pointer-events-auto !rounded-none flex items-center gap-3 w-full max-w-[350px] text-hx-text pl-4 pr-1 py-1">
          <span className={`hx-tone ${TONE[t.kind]}`} aria-hidden />
          <span className="hx-body flex-1 py-2">{t.message}</span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))}
            className="w-11 h-11 shrink-0 inline-flex items-center justify-center text-hx-text2 hover:text-hx-text"
          >
            <X className="w-4 h-4" strokeWidth={1.5} aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}
