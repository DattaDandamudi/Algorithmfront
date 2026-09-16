"use client";

import { useActionState } from "react";
import { Upload } from "lucide-react";
import { btn, inputClass, Notice, selectClass } from "@/components/dashboard/primitives";
import { bulkStatusAction, importCsvAction, type ProspectActionState } from "./actions";

export function ImportForm() {
  const [state, action, pending] = useActionState(importCsvAction, null as ProspectActionState);
  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <input type="file" name="file" accept=".csv,text/csv" required className={`${inputClass} max-w-xs text-xs`} aria-label="CSV file" />
        <select name="source" className={`${selectClass} w-40 text-xs`} aria-label="Source" defaultValue="csv">
          <option value="csv">csv</option>
          <option value="license_board">license_board</option>
          <option value="manual">manual</option>
          <option value="referral">referral</option>
          <option value="web">web</option>
        </select>
        <button type="submit" disabled={pending} className={btn.primary}><Upload className="h-4 w-4" aria-hidden /> {pending ? "Importing…" : "Import CSV"}</button>
      </div>
      <p className="text-xs text-brand-500">Columns: business_name, trade, phone, email, website, address, city, state, zip, rating, review_count, source, external_ref, owner_name (aliases like Name / Phone Number / Reviews work).</p>
      {state?.ok ? <Notice tone="success">{state.ok}</Notice> : null}
      {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
    </form>
  );
}

export function BulkForm({ children }: { children: React.ReactNode }) {
  const [state, action, pending] = useActionState(bulkStatusAction, null as ProspectActionState);
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <select name="status" className={`${selectClass} w-44 text-xs`} aria-label="Set status" defaultValue="queued">
          <option value="queued">Queue for outreach</option>
          <option value="new">Back to new</option>
          <option value="disqualified">Disqualify</option>
          <option value="do_not_contact">Do not contact</option>
        </select>
        <button type="submit" disabled={pending} className={btn.secondary}>{pending ? "Applying…" : "Apply to selected"}</button>
        {state?.ok ? <span className="text-xs text-green-700">{state.ok}</span> : null}
        {state?.error ? <span className="text-xs text-red-700">{state.error}</span> : null}
      </div>
      {children}
    </form>
  );
}
