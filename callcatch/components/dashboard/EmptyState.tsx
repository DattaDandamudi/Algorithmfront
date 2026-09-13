import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({ icon, title, body, action, className }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-2xl border border-dashed border-brand-200 bg-white px-6 py-12 text-center", className)}>
      {icon ? <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-500">{icon}</div> : null}
      <h3 className="text-base font-semibold text-brand-900">{title}</h3>
      {body ? <p className="mt-1 max-w-md text-sm text-brand-600">{body}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
