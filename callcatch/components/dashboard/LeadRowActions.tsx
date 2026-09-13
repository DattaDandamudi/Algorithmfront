"use client";

import { useActionState, useState } from "react";
import { Check, CheckCircle2, Pencil, RotateCcw, XCircle } from "lucide-react";
import { setLeadStatusAction, updateLeadValueAction, type LeadActionState } from "@/app/(app)/leads/actions";
import { btn } from "./primitives";
import { cn } from "@/lib/utils";

/** Inline est. value editor: click the amount, type, Enter/blur saves. */
export function LeadValueEditor({ leadId, value, fallbackUsd, readOnly }: { leadId: string; value: number | null; fallbackUsd: number; readOnly: boolean }) {
  const [state, action, pending] = useActionState<LeadActionState, FormData>(updateLeadValueAction, null);
  const [editing, setEditing] = useState(false);
  // Close the editor once a save succeeds (adjust-state-during-render pattern, no effect needed).
  const [seenState, setSeenState] = useState<LeadActionState>(null);
  if (state !== seenState) {
    setSeenState(state);
    if (state?.ok) setEditing(false);
  }

  const display = value != null ? `$${Math.round(value).toLocaleString("en-US")}` : `~$${Math.round(fallbackUsd).toLocaleString("en-US")}`;

  if (!editing) {
    return (
      <button
        type="button"
        disabled={readOnly}
        onClick={() => setEditing(true)}
        className={cn("group inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-sm font-semibold tabular-nums", value == null ? "text-brand-500" : "text-brand-900", !readOnly && "hover:bg-brand-50")}
        title={value == null ? "Estimated from your average ticket — click to set" : "Click to edit"}
      >
        {display}
        {!readOnly ? <Pencil className="h-3 w-3 text-brand-300 group-hover:text-brand-500" aria-hidden /> : null}
      </button>
    );
  }

  return (
    <form action={action} className="inline-flex items-center gap-1">
      <input type="hidden" name="leadId" value={leadId} />
      <label htmlFor={`est-${leadId}`} className="sr-only">
        Estimated value in dollars
      </label>
      <span className="text-sm text-brand-500">$</span>
      <input
        id={`est-${leadId}`}
        name="estValue"
        type="number"
        min={0}
        step={1}
        inputMode="numeric"
        defaultValue={value ?? ""}
        autoFocus
        disabled={pending}
        placeholder={String(Math.round(fallbackUsd))}
        className="w-24 rounded-lg border border-brand-200 px-2 py-1 text-sm tabular-nums text-brand-900 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
        onKeyDown={(e) => {
          if (e.key === "Escape") setEditing(false);
        }}
      />
      <button type="submit" disabled={pending} className="rounded-lg bg-brand-900 p-1.5 text-white hover:bg-brand-800" aria-label="Save value">
        <Check className="h-3.5 w-3.5" aria-hidden />
      </button>
      {state?.error ? (
        <span role="alert" className="text-xs text-red-600">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

export function LeadStatusActions({ leadId, status, readOnly }: { leadId: string; status: string; readOnly: boolean }) {
  const [state, action, pending] = useActionState<LeadActionState, FormData>(setLeadStatusAction, null);
  const [lostOpen, setLostOpen] = useState(false);
  const [seenState, setSeenState] = useState<LeadActionState>(null);
  if (state !== seenState) {
    setSeenState(state);
    if (state?.ok) setLostOpen(false);
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap justify-end gap-1.5">
        {status !== "booked" ? (
          <form action={action}>
            <input type="hidden" name="leadId" value={leadId} />
            <input type="hidden" name="status" value="booked" />
            <button type="submit" disabled={readOnly || pending} className={cn(btn.small, "border-green-200 bg-green-50 text-green-800 hover:bg-green-100")}>
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Booked
            </button>
          </form>
        ) : null}
        {status !== "lost" ? (
          <button type="button" disabled={readOnly || pending} onClick={() => setLostOpen((v) => !v)} className={cn(btn.small, "border-red-200 text-red-700 hover:bg-red-50")} aria-expanded={lostOpen}>
            <XCircle className="h-3.5 w-3.5" aria-hidden /> Lost
          </button>
        ) : null}
        {status === "booked" || status === "lost" ? (
          <form action={action}>
            <input type="hidden" name="leadId" value={leadId} />
            <input type="hidden" name="status" value="qualified" />
            <button type="submit" disabled={readOnly || pending} className={btn.small} title="Move back to qualified">
              <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Reopen
            </button>
          </form>
        ) : null}
      </div>
      {lostOpen ? (
        <form action={action} className="flex items-center gap-1.5">
          <input type="hidden" name="leadId" value={leadId} />
          <input type="hidden" name="status" value="lost" />
          <label htmlFor={`lost-${leadId}`} className="sr-only">
            Lost reason
          </label>
          <select id={`lost-${leadId}`} name="lostReason" defaultValue="" className="rounded-lg border border-brand-200 bg-white px-2 py-1 text-xs text-brand-900">
            <option value="">Reason (optional)</option>
            <option value="price">Price</option>
            <option value="went_with_competitor">Went with someone else</option>
            <option value="out_of_area">Out of area</option>
            <option value="no_response">Never replied</option>
            <option value="not_a_job">Not a job / spam</option>
            <option value="other">Other</option>
          </select>
          <button type="submit" disabled={pending} className={cn(btn.small, "bg-red-600 text-white hover:bg-red-700 border-red-600")}>
            Confirm
          </button>
        </form>
      ) : null}
      {state?.error ? (
        <span role="alert" className="text-xs text-red-600">
          {state.error}
        </span>
      ) : null}
    </div>
  );
}
