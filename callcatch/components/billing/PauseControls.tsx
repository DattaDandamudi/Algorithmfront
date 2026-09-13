"use client";

import { useActionState, useState } from "react";
import { Loader2, PauseCircle, PlayCircle } from "lucide-react";
import type { ActionState } from "@/app/(app)/billing/actions";
import { pauseAction, resumeAction } from "@/app/(app)/billing/actions";
import { formatDate } from "@/lib/billing/plans-ui";
import { cn } from "@/lib/utils";
import { btn, Notice } from "@/components/billing/ui";

export function PauseControls({ paused, pauseUntil, disabled }: { paused: boolean; pauseUntil: string | null; disabled?: boolean }) {
  const [months, setMonths] = useState<1 | 2>(1);
  const [pauseState, pauseFormAction, pausing] = useActionState<ActionState, FormData>(pauseAction, null);
  const [resumeState, resumeFormAction, resuming] = useActionState<ActionState, FormData>(async () => resumeAction(), null);

  if (paused) {
    return (
      <div className="space-y-3">
        {resumeState?.error ? <Notice tone="error">{resumeState.error}</Notice> : null}
        {resumeState?.ok ? <Notice tone="success">{resumeState.ok}</Notice> : null}
        <p className="text-sm text-brand-700">
          Billing and text-backs are paused{pauseUntil ? ` until ${formatDate(pauseUntil)}` : ""}. Callers still hear your greeting and leave voicemail; you still get the alerts.
        </p>
        <form action={resumeFormAction}>
          <button type="submit" disabled={resuming} className={btn.primary}>
            {resuming ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <PlayCircle className="h-4 w-4" aria-hidden />}
            Resume now
          </button>
        </form>
      </div>
    );
  }

  return (
    <form action={pauseFormAction} className="space-y-3">
      {pauseState?.error ? <Notice tone="error">{pauseState.error}</Notice> : null}
      {pauseState?.ok ? <Notice tone="success">{pauseState.ok}</Notice> : null}
      <p className="text-sm text-brand-700">Slow season? Pause for up to 2 months. No charges while paused; text-backs switch off and turn back on automatically.</p>
      <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Pause length">
        {([1, 2] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={months === m}
            onClick={() => setMonths(m)}
            className={cn("rounded-lg border px-3 py-1.5 text-sm font-medium transition", months === m ? "border-brand-900 bg-brand-900 text-white" : "border-brand-200 bg-white text-brand-800 hover:bg-brand-50")}
          >
            {m} month{m > 1 ? "s" : ""}
          </button>
        ))}
        <input type="hidden" name="months" value={months} />
        <button type="submit" disabled={disabled || pausing} className={cn(btn.secondary, "ml-auto")}>
          {pausing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <PauseCircle className="h-4 w-4" aria-hidden />}
          Pause subscription
        </button>
      </div>
    </form>
  );
}
