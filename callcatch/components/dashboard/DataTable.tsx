import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Column<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  /** Hide on small screens (the row's primary cell should carry the essentials). */
  hideBelow?: "sm" | "md" | "lg";
  align?: "left" | "right";
};

const HIDE: Record<NonNullable<Column<unknown>["hideBelow"]>, string> = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
};

/** Accessible, horizontally scrollable table. Keep essentials in the first column for phones. */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  empty,
  className,
  rowClassName,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  caption?: string;
  empty?: ReactNode;
  className?: string;
  rowClassName?: (row: T) => string | undefined;
}) {
  if (rows.length === 0 && empty) return <>{empty}</>;
  return (
    <div className={cn("overflow-x-auto rounded-2xl border border-brand-100 bg-white shadow-[0_1px_2px_rgba(11,31,58,0.04)]", className)}>
      <table className="w-full min-w-[40rem] border-collapse text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr className="border-b border-brand-100 bg-brand-50/60 text-left text-xs font-semibold uppercase tracking-wide text-brand-500">
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cn("px-4 py-3 font-semibold", c.align === "right" && "text-right", c.hideBelow && HIDE[c.hideBelow], c.className)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-brand-100">
          {rows.map((row) => (
            <tr key={rowKey(row)} className={cn("align-top transition hover:bg-brand-50/50", rowClassName?.(row))}>
              {columns.map((c) => (
                <td key={c.key} className={cn("px-4 py-3 text-brand-800", c.align === "right" && "text-right", c.hideBelow && HIDE[c.hideBelow], c.className)}>
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
