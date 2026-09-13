import type { ReactNode } from "react";
import { PhoneMissed } from "lucide-react";
import { cn } from "@/lib/utils";

export type ThreadItem =
  | { kind: "event"; text: string }
  | { kind: "in"; text: string; time?: string }
  | { kind: "out"; text: string; time?: string }
  | { kind: "typing" };

type PhoneFrameProps = {
  title: string;
  subtitle?: string;
  className?: string;
  children: ReactNode;
  /** Adds a caption below the frame. */
  caption?: ReactNode;
};

/** Phone-shaped frame (pure CSS). */
export function PhoneFrame({ title, subtitle, className, children, caption }: PhoneFrameProps) {
  return (
    <figure className={cn("mx-auto w-full max-w-[340px]", className)}>
      <div className="rounded-[2.2rem] border border-brand-800 bg-brand-950 p-2 shadow-[0_30px_60px_-20px_rgba(6,18,36,.55)]">
        <div className="overflow-hidden rounded-[1.8rem] bg-white">
          <div className="flex items-center gap-3 border-b border-brand-100 bg-brand-50 px-4 pb-3 pt-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-900 text-xs font-bold text-white" aria-hidden="true">
              {title.slice(0, 1)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-brand-900">{title}</p>
              {subtitle ? <p className="truncate text-xs text-brand-600">{subtitle}</p> : null}
            </div>
          </div>
          <div className="min-h-[380px] space-y-2 bg-[#f7f5f0] px-3 py-4">{children}</div>
          <div className="flex items-center gap-2 border-t border-brand-100 bg-white px-3 py-2">
            <div className="h-8 flex-1 rounded-full border border-brand-200 bg-brand-50 px-3 text-xs leading-8 text-brand-400">Text message</div>
            <div className="h-8 w-8 rounded-full bg-accent-500" aria-hidden="true" />
          </div>
        </div>
      </div>
      {caption ? <figcaption className="mt-3 text-center text-xs text-brand-600">{caption}</figcaption> : null}
    </figure>
  );
}

/** Renders a thread with staggered pop-in animation (CSS only, respects reduced motion). */
export function SmsThread({ items, animate = true, stepMs = 900 }: { items: ThreadItem[]; animate?: boolean; stepMs?: number }) {
  return (
    <ol className="space-y-2" aria-label="Sample text conversation">
      {items.map((item, i) => {
        const delay = animate ? `${i * stepMs}ms` : "0ms";
        const motion = animate ? "cc-motion animate-[cc-pop_.45s_ease-out_both]" : "";
        if (item.kind === "event") {
          return (
            <li key={i} className={cn("flex justify-center", motion)} style={{ animationDelay: delay }}>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-100 px-2.5 py-1 text-[11px] font-medium text-brand-700">
                <PhoneMissed className="h-3 w-3" aria-hidden="true" />
                {item.text}
              </span>
            </li>
          );
        }
        if (item.kind === "typing") {
          return (
            <li key={i} className={cn("flex justify-start", motion)} style={{ animationDelay: delay }}>
              <span className="inline-flex items-center gap-1 rounded-2xl rounded-bl-sm bg-white px-3 py-2.5 shadow-sm" aria-label="typing">
                {[0, 1, 2].map((d) => (
                  <span key={d} className="cc-motion inline-block h-1.5 w-1.5 animate-[cc-typing_1.2s_ease-in-out_infinite] rounded-full bg-brand-400" style={{ animationDelay: `${d * 150}ms` }} />
                ))}
              </span>
            </li>
          );
        }
        const out = item.kind === "out";
        return (
          <li key={i} className={cn("flex", out ? "justify-end" : "justify-start", motion)} style={{ animationDelay: delay }}>
            <div className={cn("max-w-[85%]", out ? "items-end" : "items-start")}>
              <p
                className={cn(
                  "whitespace-pre-line rounded-2xl px-3 py-2 text-[13px] leading-snug shadow-sm",
                  out ? "rounded-br-sm bg-brand-900 text-white" : "rounded-bl-sm bg-white text-brand-900"
                )}
              >
                {item.text}
              </p>
              {item.time ? <p className={cn("mt-0.5 text-[10px] text-brand-500", out ? "text-right" : "text-left")}>{item.time}</p> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** The owner's side: an alert card as it arrives on the contractor's phone. */
export function OwnerAlertCard({
  from,
  lines,
  animate = true,
  delayMs = 0,
}: {
  from: string;
  lines: string[];
  animate?: boolean;
  delayMs?: number;
}) {
  return (
    <div
      className={cn("rounded-2xl border border-brand-100 bg-white p-3 shadow-sm", animate ? "cc-motion animate-[cc-pop_.45s_ease-out_both]" : "")}
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-accent-600">{from}</p>
        <p className="text-[10px] text-brand-500">now</p>
      </div>
      <ul className="mt-1.5 space-y-1 text-[13px] leading-snug text-brand-900">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <span className="rounded-lg bg-accent-500 px-2 py-1.5 text-center text-xs font-semibold text-white">Call now</span>
        <span className="rounded-lg border border-brand-200 px-2 py-1.5 text-center text-xs font-semibold text-brand-800">Open thread</span>
      </div>
    </div>
  );
}
