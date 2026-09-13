"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Slide-in panel (mobile nav, side sheets). Closes on Escape and backdrop click. */
export function Drawer({
  open,
  onClose,
  title,
  children,
  side = "left",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  side?: "left" | "right";
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Close menu" onClick={onClose} className="absolute inset-0 bg-brand-950/50 backdrop-blur-[1px]" />
      <div
        className={cn(
          "absolute inset-y-0 flex w-[min(20rem,85vw)] flex-col bg-brand-900 text-white shadow-2xl",
          side === "left" ? "left-0" : "right-0"
        )}
      >
        <div className="flex items-center justify-between px-4 py-4">
          <span className="text-sm font-semibold text-brand-100">{title}</span>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-brand-200 hover:bg-brand-800 hover:text-white" aria-label="Close">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
