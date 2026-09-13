"use client";

import { useActionState, useState } from "react";
import { Bot, CheckCircle2, PauseCircle, PlayCircle, RotateCcw, Sparkles, XCircle } from "lucide-react";
import { pauseAiAction, resumeAiAction, setConversationStatusAction, type InboxActionState } from "@/app/(app)/inbox/actions";
import { btn } from "./primitives";
import { cn } from "@/lib/utils";

export function ThreadControls({ conversationId, aiPaused, status, readOnly }: { conversationId: string; aiPaused: boolean; status: string; readOnly: boolean }) {
  const [state, action, pending] = useActionState<InboxActionState, FormData>(setConversationStatusAction, null);
  const [lostOpen, setLostOpen] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <form action={aiPaused ? resumeAiAction : pauseAiAction}>
          <input type="hidden" name="conversationId" value={conversationId} />
          <button type="submit" disabled={readOnly} className={cn(btn.secondary, aiPaused && "border-accent-300 bg-accent-50 text-accent-800 hover:bg-accent-100")}>
            {aiPaused ? <PlayCircle className="h-4 w-4" aria-hidden /> : <PauseCircle className="h-4 w-4" aria-hidden />}
            {aiPaused ? "Resume AI" : "Pause AI"}
          </button>
        </form>
        <span className="inline-flex items-center gap-1.5 text-xs text-brand-500">
          <Bot className="h-3.5 w-3.5" aria-hidden />
          {aiPaused ? "You're handling this thread — the AI stays quiet." : "The AI is qualifying this caller."}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {status !== "qualified" && status !== "booked" ? (
          <form action={action}>
            <input type="hidden" name="conversationId" value={conversationId} />
            <input type="hidden" name="status" value="qualified" />
            <button type="submit" disabled={readOnly || pending} className={btn.small}>
              <Sparkles className="h-3.5 w-3.5" aria-hidden /> Mark qualified
            </button>
          </form>
        ) : null}
        {status !== "booked" ? (
          <form action={action}>
            <input type="hidden" name="conversationId" value={conversationId} />
            <input type="hidden" name="status" value="booked" />
            <button type="submit" disabled={readOnly || pending} className={cn(btn.small, "border-green-200 bg-green-50 text-green-800 hover:bg-green-100")}>
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Mark booked
            </button>
          </form>
        ) : null}
        {status !== "lost" ? (
          <button type="button" onClick={() => setLostOpen((v) => !v)} disabled={readOnly || pending} className={cn(btn.small, "border-red-200 text-red-700 hover:bg-red-50")} aria-expanded={lostOpen}>
            <XCircle className="h-3.5 w-3.5" aria-hidden /> Mark lost
          </button>
        ) : null}
        {status === "booked" || status === "lost" || status === "closed" ? (
          <form action={action}>
            <input type="hidden" name="conversationId" value={conversationId} />
            <input type="hidden" name="status" value="open" />
            <button type="submit" disabled={readOnly || pending} className={btn.small}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Reopen
            </button>
          </form>
        ) : null}
      </div>

      {lostOpen ? (
        <form action={action} className="flex flex-col gap-2 rounded-xl border border-red-100 bg-red-50/60 p-3 sm:flex-row sm:items-end">
          <input type="hidden" name="conversationId" value={conversationId} />
          <input type="hidden" name="status" value="lost" />
          <div className="flex-1">
            <label htmlFor="lost-reason" className="text-xs font-medium text-brand-800">
              Why was it lost? (optional)
            </label>
            <select id="lost-reason" name="lostReason" className="mt-1 block w-full rounded-lg border border-brand-200 bg-white px-2.5 py-1.5 text-sm text-brand-900" defaultValue="">
              <option value="">Pick a reason</option>
              <option value="price">Price</option>
              <option value="went_with_competitor">Went with someone else</option>
              <option value="out_of_area">Out of service area</option>
              <option value="no_response">Never replied</option>
              <option value="not_a_job">Not a real job / spam</option>
              <option value="other">Other</option>
            </select>
          </div>
          <button type="submit" disabled={readOnly || pending} className={btn.danger}>
            Confirm lost
          </button>
        </form>
      ) : null}

      {state?.error ? (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      ) : state?.ok ? (
        <p role="status" className="text-xs text-green-700">
          {state.ok}
        </p>
      ) : null}
    </div>
  );
}
