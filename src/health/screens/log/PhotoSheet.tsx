/**
 * PhotoSheet — SPEC §2 "Photo (secondary; depth/portion caveat)".
 *
 * A camera capture (`<input type="file" accept="image/*" capture="environment">`)
 * goes to ai/foodImage.ts, which needs the user's AI client (their key or
 * proxy) — without one we say so and hand over to the text bar rather than
 * fake an estimate. The result opens the shared EstimateSheet with a
 * mandatory grams confirm: a photo has no depth cue and hides oil, so the
 * portion is a guess (the spec's Cal AI evidence). Estimation state is owned
 * by the Log screen (`busy` / `error`) so the result can open its sheet.
 *
 * The client is loaded lazily (aiStatus.ts, review R7-3): with a key
 * configured but the SDK still loading the camera button reads "Loading AI…"
 * and waits (a photo has no local fallback), and a failed load shows the
 * reason — the "add an AI key" copy is only for `aiStatus === 'none'`.
 */
import { useRef, useState, type ChangeEvent } from 'react';
import { Camera, Loader2, Settings2 } from 'lucide-react';
import { Button, Sheet } from '../../ui';
import { AI_LOADING_LABEL, photoAINote, type AIStatus } from './aiStatus';

/** Caveat copy (spec §2 / §9 photo evidence). */
export const PHOTO_CAVEAT = "Photos can't judge depth or hidden oil — confirm the grams";

export interface PhotoSheetProps {
  open: boolean;
  onClose: () => void;
  /** Lazy-client state; 'none' = no key configured. */
  aiStatus: AIStatus;
  /** Why the client failed when `aiStatus === 'error'`. */
  aiError?: string | null;
  /** True while the photo is being encoded/estimated. */
  busy: boolean;
  /** Last estimation failure, shown inline. */
  error?: string | null;
  onPick: (file: File, hint: string) => void;
  /** Close and focus the text bar. */
  onUseTextBar: () => void;
  onOpenAISettings: () => void;
}

export default function PhotoSheet({ open, onClose, aiStatus, aiError = null, busy, error, onPick, onUseTextBar, onOpenAISettings }: PhotoSheetProps) {
  const [hint, setHint] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const aiConfigured = aiStatus !== 'none';
  const loading = aiStatus === 'loading' || aiStatus === 'slow';
  // Loading or failed: nothing can estimate the photo, so do not open the camera (R7-3).
  const aiNote = photoAINote(aiStatus, aiError);
  const canShoot = aiNote === null;

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so re-taking the same photo fires change again.
    e.target.value = '';
    if (file) onPick(file, hint.trim());
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Log from a photo"
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={busy}>
            Close
          </Button>
          <Button variant="secondary" className="flex-1" onClick={onUseTextBar} disabled={busy}>
            Type it instead
          </Button>
        </div>
      }
    >
      <div className="space-y-3" aria-busy={busy || undefined}>
        <p className="text-[14px] leading-5 text-hx-text font-semibold">{PHOTO_CAVEAT}</p>
        <p className="text-[13px] leading-5 text-hx-text2">
          Claude names the dishes and guesses a restaurant-size portion; a plate of biryani looks the same at 250 g and 450 g, so you confirm the weight before anything is saved.
        </p>

        {aiConfigured ? (
          <>
            <label className="block">
              <span className="hx-label">Hint (optional)</span>
              <input
                type="text"
                value={hint}
                onChange={(e) => setHint(e.target.value)}
                placeholder="e.g. chicken biryani, home-cooked"
                className="mt-1 w-full h-11 px-3 text-[15px]"
                aria-label="Hint for the photo estimate"
                disabled={busy}
              />
            </label>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden onChange={onFile} disabled={busy || !canShoot} />
            <Button size="lg" fullWidth icon={busy || loading ? <Loader2 className="animate-spin" aria-hidden /> : <Camera aria-hidden />} onClick={() => fileRef.current?.click()} disabled={busy || !canShoot}>
              {busy ? 'Estimating from the photo…' : loading ? AI_LOADING_LABEL : 'Take a photo'}
            </Button>
            {busy && (
              <p role="status" className="text-[12px] leading-4 text-hx-text2 text-center">
                Resizing and sending to Claude — a few seconds.
              </p>
            )}
            {aiNote && !busy && (
              <p role="status" className={`text-[13px] leading-5 ${aiStatus === 'error' ? 'text-hx-yellow' : 'text-hx-text2'}`}>
                {aiNote}
              </p>
            )}
            {error && !busy && (
              <p role="alert" className="text-[13px] leading-5 text-hx-red">
                {error}
              </p>
            )}
            <p className="text-[12px] leading-4 text-hx-muted">The photo is downsized on your phone and sent only to your AI provider; it is not stored.</p>
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-[13px] leading-5 text-hx-yellow">Photo estimates need an AI key — add one under Settings → Coach &amp; AI. We won't fake an estimate without it.</p>
            <p className="text-[13px] leading-5 text-hx-text2">Until then the fastest accurate path is the text bar with a weight — "320 g chicken biryani" — which you can edit before saving.</p>
            <Button variant="secondary" size="md" fullWidth icon={<Settings2 aria-hidden />} onClick={onOpenAISettings}>
              Open AI settings
            </Button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
