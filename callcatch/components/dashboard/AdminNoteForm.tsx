"use client";

import { useActionState, useEffect, useRef } from "react";
import { addAdminNoteAction, type AdminActionState } from "@/app/(app)/admin/actions";
import { btn, inputClass } from "./primitives";

export function AdminNoteForm({ accountId }: { accountId: string }) {
  const [state, action, pending] = useActionState<AdminActionState, FormData>(addAdminNoteAction, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="flex flex-col gap-2">
      <input type="hidden" name="accountId" value={accountId} />
      <label htmlFor="admin-note" className="text-sm font-medium text-brand-800">
        Add a note
      </label>
      <textarea id="admin-note" name="note" rows={3} required maxLength={4000} placeholder="Called owner re: forwarding; Verizon *71 set, test passed." className={inputClass} />
      <div className="flex items-center justify-between gap-2">
        <p className={`text-xs ${state?.error ? "text-red-600" : "text-green-700"}`} role="status">
          {state?.error ?? state?.ok ?? ""}
        </p>
        <button type="submit" disabled={pending} className={btn.primary}>
          {pending ? "Saving…" : "Add note"}
        </button>
      </div>
    </form>
  );
}
