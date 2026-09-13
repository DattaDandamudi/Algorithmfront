import { AlertTriangle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export type BubbleMessage = {
  id: string;
  direction: string;
  author: string;
  body: string;
  status: string;
  created_at: string;
  error_code?: string | null;
  send_after?: string | null;
};

function authorLabel(author: string, businessName: string): string {
  switch (author) {
    case "ai":
      return `${businessName} · AI`;
    case "owner":
      return `${businessName} · you`;
    case "system":
      return "CallCatch";
    default:
      return "Customer";
  }
}

/** One SMS bubble. Outbound on the right (navy), inbound on the left (white). */
export function Bubble({ message, businessName, time }: { message: BubbleMessage; businessName: string; time: string }) {
  const out = message.direction === "out";
  const system = message.author === "system";
  const failed = message.status === "failed";
  const queued = message.status === "queued";

  if (system) {
    return (
      <div className="flex justify-center">
        <p className="max-w-[85%] rounded-full bg-brand-50 px-3 py-1 text-center text-xs text-brand-600">
          {message.body} <span className="text-brand-400">· {time}</span>
        </p>
      </div>
    );
  }

  return (
    <div className={cn("flex", out ? "justify-end" : "justify-start")}>
      <div className={cn("flex max-w-[85%] flex-col gap-1 sm:max-w-[70%]", out ? "items-end" : "items-start")}>
        <span className="px-1 text-[11px] font-medium text-brand-500">{authorLabel(message.author, businessName)}</span>
        <div
          className={cn(
            "whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm",
            out
              ? message.author === "ai"
                ? "rounded-br-md bg-brand-700 text-white"
                : "rounded-br-md bg-brand-900 text-white"
              : "rounded-bl-md border border-brand-100 bg-white text-brand-900",
            failed && "ring-2 ring-red-300"
          )}
        >
          {message.body}
        </div>
        <span className={cn("flex items-center gap-1 px-1 text-[11px]", failed ? "text-red-600" : "text-brand-400")}>
          {failed ? (
            <>
              <AlertTriangle className="h-3 w-3" aria-hidden /> Failed{message.error_code ? ` (${message.error_code})` : ""} · {time}
            </>
          ) : queued ? (
            <>
              <Clock className="h-3 w-3" aria-hidden /> Queued for quiet hours · {time}
            </>
          ) : (
            <>
              {out ? (message.status === "delivered" ? "Delivered" : "Sent") : "Received"} · {time}
            </>
          )}
        </span>
      </div>
    </div>
  );
}
