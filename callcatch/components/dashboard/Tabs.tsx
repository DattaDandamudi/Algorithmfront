import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type TabItem = { id: string; label: ReactNode; href: string; count?: number };

/** Link-driven tabs (server-safe): the active tab comes from the URL, so it survives refreshes. */
export function Tabs({ items, active, ariaLabel }: { items: TabItem[]; active: string; ariaLabel: string }) {
  return (
    <nav aria-label={ariaLabel} className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1 border-b border-brand-100">
        {items.map((t) => {
          const isActive = t.id === active;
          return (
            <li key={t.id}>
              <Link
                href={t.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition",
                  isActive ? "border-accent-500 text-brand-900" : "border-transparent text-brand-500 hover:border-brand-200 hover:text-brand-800"
                )}
              >
                {t.label}
                {typeof t.count === "number" ? (
                  <span className={cn("rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums", isActive ? "bg-accent-100 text-accent-800" : "bg-brand-50 text-brand-600")}>
                    {t.count}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
