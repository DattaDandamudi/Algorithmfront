/**
 * Sheet — bottom sheet for editors (macro card, weigh-in, settings pickers).
 *
 * A plate (.hx-raised: card2 ground, a 1 px text2 rule along the top) with a
 * 12 px top radius, a 32 by 2 px lume grabber and the title as a running head
 * inside. No blur, no shadow. role=dialog + aria-modal, ESC closes, backdrop
 * tap closes, body scroll is locked while open, focus moves into the panel on
 * open and returns to the opener on close, Tab is trapped inside. The slide-up
 * is 240 ms and uses `motion-reduce:` so prefers-reduced-motion gets an
 * instant show/hide. Portalled into the `.hx` root so the tokens resolve.
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
const EXIT_MS = 240;

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
        className={`absolute inset-0 bg-hx-base/70 transition-opacity duration-200 motion-reduce:transition-none ${shown ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={`hx-raised !rounded-b-none !rounded-t-[12px] relative w-full max-w-[390px] max-h-[88dvh] flex flex-col text-hx-text outline-none transition-transform duration-[240ms] ease-out motion-reduce:transition-none ${
          shown ? 'translate-y-0' : 'translate-y-full'
        } ${className}`}
      >
        <div className="flex justify-center pt-2 pb-1" aria-hidden>
          <span className="block w-8 h-0.5 bg-hx-lume" />
        </div>
        <div className="flex items-center justify-between gap-3 px-5 pt-1 pb-2">
          {title ? (
            <h2 id={titleId} className="hx-label min-w-0">
              {title}
            </h2>
          ) : (
            <span />
          )}
          <button type="button" onClick={onClose} aria-label="Close" className="w-11 h-11 -mr-2 shrink-0 inline-flex items-center justify-center text-hx-text2 hover:text-hx-text">
            <X className="w-5 h-5" strokeWidth={1.5} aria-hidden />
          </button>
        </div>
        <div className="hx-scroll flex-1 overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>
        {footer && <div className="border-t border-hx-border px-5 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>,
    host,
  );
}
