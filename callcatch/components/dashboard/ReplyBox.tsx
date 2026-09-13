"use client";

import { useActionState, useEffect, useRef } from "react";
import { Send } from "lucide-react";
import { replyAction, type InboxActionState } from "@/app/(app)/inbox/actions";
import { btn } from "./primitives";
import { cn } from "@/lib/utils";

export function ReplyBox({ conversationId, disabled, disabledReason, businessName }: { conversationId: string; disabled: boolean; disabledReason?: string; businessName: string }) {
  const [state, action, pending] = useActionState<InboxActionState, FormData>(replyAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      textRef.current?.focus();
    }
  }, [state]);

  return (
    <form ref={formRef} action={action} className="rounded-2xl border border-brand-100 bg-white p-3 shadow-[0_1px_2px_rgba(11,31,58,0.04)]">
      <input type="hidden" name="conversationId" value={conversationId} />
      <label htmlFor="reply-body" className="sr-only">
        Reply as {businessName}
      </label>
      <textarea
        ref={textRef}
        id="reply-body"
        name="body"
        rows={2}
        required
        maxLength={1000}
        disabled={disabled || pending}
        placeholder={disabled ? disabledReason ?? "Texting is unavailable for this thread." : `Reply as ${businessName}… (sending pauses the AI on this thread)`}
        className={cn("block w-full resize-y rounded-xl border-0 bg-brand-50/60 px-3 py-2 text-sm text-brand-900 placeholder:text-brand-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-200", disabled && "cursor-not-allowed opacity-70")}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") formRef.current?.requestSubmit();
        }}
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className={cn("text-xs", state?.error ? "text-red-600" : "text-brand-500")} role={state?.error ? "alert" : "status"}>
          {state?.error ?? state?.ok ?? "⌘/Ctrl + Enter to send. Replies go from your CallCatch number."}
        </p>
        <button type="submit" disabled={disabled || pending} className={btn.primary}>
          <Send className="h-4 w-4" aria-hidden />
          {pending ? "Sending…" : "Send"}
        </button>
      </div>
    </form>
  );
}
