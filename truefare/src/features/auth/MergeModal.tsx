import { useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { useAuth } from './AuthContext';

/** One-time offer to import guest-mode activity after first sign-in. */
export function MergeModal() {
  const { mergeAvailable, runMerge, dismissMerge } = useAuth();
  const [busy, setBusy] = useState(false);

  return (
    <Modal open={mergeAvailable} onClose={dismissMerge} title="Bring your guest activity?">
      <p className="text-[14px] leading-relaxed text-muted">
        You have orders and taste signals saved on this device from guest mode.
        Import them into your account so your recommendations and history come
        with you. Your local copy stays untouched either way.
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={dismissMerge} disabled={busy}>
          Start fresh
        </Button>
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await runMerge();
            setBusy(false);
          }}
        >
          {busy ? 'Importing…' : 'Import my activity'}
        </Button>
      </div>
    </Modal>
  );
}
