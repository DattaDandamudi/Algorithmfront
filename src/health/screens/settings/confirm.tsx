/**
 * Promise-based confirmation sheet for Settings.
 *
 * Every destructive action (reset, remove, replace-import, clear) awaits
 * `confirm({...})` before touching the store. One <Sheet> is mounted at the
 * Settings root; sections never open their own sheets, so the "no nested
 * sheets" rule from the UI kit holds. `requireText` implements the typed
 * double-confirm for "Clear all data".
 */
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Button, Sheet } from '../../ui';

export interface ConfirmOptions {
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** The user must type this exact text before the confirm button enables. */
  requireText?: string;
  /** Optional extra footer action (e.g. "Export JSON first"); does not close the sheet. */
  secondary?: { label: string; onClick: () => void };
}

export type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmContext);
  if (!fn) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return fn;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((next) => {
    // A second request while one is pending cancels the first.
    resolver.current?.(false);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setTyped('');
      setOpts(next);
      setOpen(true);
    });
  }, []);

  const finish = (ok: boolean) => {
    const r = resolver.current;
    resolver.current = null;
    setOpen(false); // keep `opts` mounted for the slide-out animation
    r?.(ok);
  };

  const needsText = !!opts?.requireText;
  const canConfirm = !needsText || typed.trim() === opts?.requireText;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Sheet
        open={open}
        onClose={() => finish(false)}
        title={opts?.title}
        footer={
          opts && (
            <div className="flex flex-col gap-2">
              {opts.secondary && (
                <Button variant="ghost" fullWidth onClick={opts.secondary.onClick}>
                  {opts.secondary.label}
                </Button>
              )}
              <div className="flex gap-2">
                <Button variant="secondary" fullWidth onClick={() => finish(false)}>
                  {opts.cancelLabel ?? 'Cancel'}
                </Button>
                <Button variant={opts.danger ? 'danger' : 'primary'} fullWidth disabled={!canConfirm} onClick={() => finish(true)}>
                  {opts.confirmLabel ?? 'Confirm'}
                </Button>
              </div>
            </div>
          )
        }
      >
        {opts && (
          <div className="space-y-3">
            <div className="text-[14px] leading-6 text-hx-text2">{opts.body}</div>
            {needsText && (
              <label className="block">
                <span className="hx-label">Type {opts.requireText} to continue</span>
                <input
                  type="text"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  placeholder={opts.requireText}
                  className="mt-1.5 h-11 w-full px-3 text-[15px] tracking-widest"
                />
              </label>
            )}
          </div>
        )}
      </Sheet>
    </ConfirmContext.Provider>
  );
}
