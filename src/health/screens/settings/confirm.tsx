/**
 * Promise-based confirmation sheet for Settings.
 *
 * Every destructive action (reset, remove, replace-import, clear) awaits
 * `confirm({...})` before touching the store. One <Sheet> (a plate) is mounted
 * at the Settings root; sections never open their own sheets, so the "no
 * nested sheets" rule from the UI kit holds. The body is reading text, the
 * confirm key is the red outline button when `danger` is set, and
 * `requireText` adds the typed double-confirm for "Clear all data" as an
 * underline field. The hook lives in ./useConfirm.ts.
 */
import { useCallback, useId, useRef, useState, type ReactNode } from 'react';
import { Button, Sheet } from '../../ui';
import { ConfirmContext, type ConfirmFn, type ConfirmOptions } from './useConfirm';

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const typedId = useId();

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
            <div className="flex flex-col gap-3">
              {opts.secondary && (
                <Button variant="ghost" fullWidth onClick={opts.secondary.onClick}>
                  {opts.secondary.label}
                </Button>
              )}
              <div className="flex gap-3">
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
          <div className="flex flex-col gap-5 pt-1 pb-2">
            <div className="hx-body text-hx-text2">{opts.body}</div>
            {needsText && (
              <div className="flex flex-col gap-1">
                <label htmlFor={typedId} className="hx-label">
                  Type {opts.requireText} to continue
                </label>
                <input id={typedId} type="text" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder={opts.requireText} className="w-full px-0 leading-6" />
              </div>
            )}
          </div>
        )}
      </Sheet>
    </ConfirmContext.Provider>
  );
}
