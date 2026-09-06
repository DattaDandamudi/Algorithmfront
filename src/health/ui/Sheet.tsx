/**
 * Sheet — bottom sheet for editors (macro card, weigh-in, settings pickers).
 *
 * role=dialog + aria-modal, ESC closes, backdrop tap closes, body scroll is
 * locked while open, focus moves into the panel on open and returns to the
 * opener on close, Tab is trapped inside. Slide-up/fade uses CSS transitions
 * with `motion-reduce:` so prefers-reduced-motion gets an instant show/hide.
 * Portalled into the `.hx` root so the design tokens resolve.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Sticky footer (e.g. Save button row). */
  footer?: ReactNode;
  className?: string;
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
const EXIT_MS = 220;

export default function Sheet({ open, onClose, title, children, footer, className = '' }: SheetProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<Element | null>(null);
  // Latest onClose without re-running the focus effect (an inline arrow from
  // the parent would otherwise yank focus back to the first control per render).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);

  // Mount → next frame slide in; close → slide out, then unmount.
  useEffect(() => {
    if (open) {
      setMounted(true);
      const raf = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(raf);
    }
    setShown(false);
    const t = window.setTimeout(() => setMounted(false), EXIT_MS);
    return () => window.clearTimeout(t);
  }, [open]);

  // Scroll lock, ESC, focus management, tab trap.
  useEffect(() => {
    if (!mounted || !open) return;
    openerRef.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus({ preventScroll: true });

    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const nodes = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!nodes.length) {
        e.preventDefault();
        return;
      }
      const a = nodes[0];
      const z = nodes[nodes.length - 1];
      if (e.shiftKey && (document.activeElement === a || document.activeElement === panel)) {
        e.preventDefault();
        z.focus();
      } else if (!e.shiftKey && document.activeElement === z) {
        e.preventDefault();
        a.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      const opener = openerRef.current;
      if (opener instanceof HTMLElement) opener.focus({ preventScroll: true });
    };
  }, [mounted, open]);

  if (!mounted || typeof document === 'undefined') return null;
  const host = document.querySelector('.hx') ?? document.body;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center" aria-hidden={!open}>
      <div
        className={`absolute inset-0 bg-black/60 transition-opacity duration-200 motion-reduce:transition-none ${shown ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={`relative w-full max-w-[390px] max-h-[88dvh] flex flex-col rounded-t-3xl border border-b-0 border-hx-border bg-hx-card text-hx-text shadow-2xl outline-none transition-transform duration-200 ease-out motion-reduce:transition-none ${
          shown ? 'translate-y-0' : 'translate-y-full'
        } ${className}`}
      >
        <div className="flex justify-center pt-2.5 pb-1" aria-hidden>
          <span className="w-10 h-1 rounded-full bg-hx-border" />
        </div>
        <div className="flex items-center justify-between gap-3 px-5 pt-1 pb-3">
          {title ? (
            <h2 id={titleId} className="text-[17px] font-semibold leading-6 truncate">
              {title}
            </h2>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-11 h-11 -mr-2 inline-flex items-center justify-center rounded-xl text-hx-text2 hover:text-hx-text hover:bg-hx-card2"
          >
            <X className="w-5 h-5" aria-hidden />
          </button>
        </div>
        <div className="hx-scroll flex-1 overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>
        {footer && <div className="border-t border-hx-border px-5 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>,
    host,
  );
}
