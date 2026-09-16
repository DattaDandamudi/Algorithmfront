"use client";

import { useActionState } from "react";
import { Loader2, Play, ThumbsDown, ThumbsUp } from "lucide-react";
import { btn, inputClass, Notice } from "@/components/dashboard/primitives";
import { approveTaskAction, rejectTaskAction, runRoleAction, saveBlockersAction, type AgentActionState } from "./actions";

export function RunRoleForm({ role }: { role: string }) {
  const [state, action, pending] = useActionState(runRoleAction, null as AgentActionState);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="role" value={role} />
      <div className="flex gap-2">
        <input name="input" placeholder='{"city":"Houston","trade":"hvac"}' className={`${inputClass} text-xs`} aria-label={`Input JSON for ${role}`} />
        <button type="submit" disabled={pending} className={`${btn.secondary} shrink-0`}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />} Run now
        </button>
      </div>
      {state?.ok ? <Notice tone="success">{state.ok}</Notice> : null}
      {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
    </form>
  );
}

export function TaskDecisionForm({ taskId }: { taskId: string }) {
  const [a, approve, approving] = useActionState(approveTaskAction, null as AgentActionState);
  const [r, reject, rejecting] = useActionState(rejectTaskAction, null as AgentActionState);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <form action={approve}>
          <input type="hidden" name="taskId" value={taskId} />
          <button type="submit" disabled={approving || rejecting} className={btn.primary}>
            {approving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ThumbsUp className="h-4 w-4" aria-hidden />} Approve
          </button>
        </form>
        <form action={reject} className="flex items-center gap-2">
          <input type="hidden" name="taskId" value={taskId} />
          <input name="reason" placeholder="reason (optional)" className={`${inputClass} w-44 text-xs`} aria-label="Reject reason" />
          <button type="submit" disabled={approving || rejecting} className={btn.secondary}>
            <ThumbsDown className="h-4 w-4" aria-hidden /> Reject
          </button>
        </form>
      </div>
      {a?.ok ? <Notice tone="success">{a.ok}</Notice> : null}
      {a?.error ? <Notice tone="error">{a.error}</Notice> : null}
      {r?.ok ? <Notice tone="info">{r.ok}</Notice> : null}
      {r?.error ? <Notice tone="error">{r.error}</Notice> : null}
    </div>
  );
}

export function BlockersForm({ initial }: { initial: string[] }) {
  const [state, action, pending] = useActionState(saveBlockersAction, null as AgentActionState);
  return (
    <form action={action} className="flex flex-col gap-2">
      <textarea name="blockers" defaultValue={initial.join("\n")} rows={5} className={`${inputClass} font-mono text-xs`} placeholder={"One blocker per line, e.g.\nLLC filed 9/16, EIN pending\nTwilio ISV profile submitted"} aria-label="Founder blockers" />
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={btn.secondary}>{pending ? "Saving…" : "Save blockers"}</button>
        {state?.ok ? <span className="text-xs text-green-700">{state.ok}</span> : null}
        {state?.error ? <span className="text-xs text-red-700">{state.error}</span> : null}
      </div>
    </form>
  );
}
