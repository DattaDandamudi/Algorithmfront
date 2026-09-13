"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CreditCard, Inbox, LayoutDashboard, LogOut, Menu, PhoneIncoming, Settings, ShieldCheck, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Drawer } from "./Drawer";

export type NavCounts = { inbox?: number; leads?: number };

type NavItem = { href: string; label: string; icon: typeof Inbox; count?: number };

function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2 px-1 text-lg font-extrabold tracking-tight text-white">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-500 text-white">
        <PhoneIncoming className="h-4 w-4" aria-hidden />
      </span>
      Call<span className="text-accent-400">Catch</span>
    </Link>
  );
}

function NavList({ items, pathname, onNavigate }: { items: NavItem[]; pathname: string; onNavigate?: () => void }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                active ? "bg-brand-800 text-white" : "text-brand-200 hover:bg-brand-800/60 hover:text-white"
              )}
            >
              <Icon className={cn("h-4.5 w-4.5 shrink-0", active ? "text-accent-400" : "text-brand-300")} aria-hidden />
              <span className="flex-1">{item.label}</span>
              {item.count ? (
                <span className="rounded-full bg-accent-500 px-2 py-0.5 text-[11px] font-bold tabular-nums text-white">{item.count > 99 ? "99+" : item.count}</span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function Sidebar({
  isAdmin,
  counts,
  businessName,
  signOut,
}: {
  isAdmin: boolean;
  counts: NavCounts;
  businessName: string;
  signOut: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  const primary: NavItem[] = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/inbox", label: "Inbox", icon: Inbox, count: counts.inbox },
    { href: "/leads", label: "Leads", icon: Users, count: counts.leads },
    { href: "/calls", label: "Calls", icon: PhoneIncoming },
  ];
  const secondary: NavItem[] = [
    { href: "/settings", label: "Settings", icon: Settings },
    { href: "/billing", label: "Billing", icon: CreditCard },
    ...(isAdmin ? [{ href: "/admin", label: "Admin", icon: ShieldCheck }] : []),
  ];

  const body = (onNavigate?: () => void) => (
    <nav aria-label="Main" className="flex h-full flex-col gap-6 px-3 py-2">
      <NavList items={primary} pathname={pathname} onNavigate={onNavigate} />
      <div>
        <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-brand-400">Account</p>
        <NavList items={secondary} pathname={pathname} onNavigate={onNavigate} />
      </div>
      <div className="mt-auto border-t border-brand-800 pt-3">
        <p className="truncate px-3 text-xs text-brand-300" title={businessName}>
          {businessName}
        </p>
        <form action={signOut}>
          <button type="submit" className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-brand-200 transition hover:bg-brand-800/60 hover:text-white">
            <LogOut className="h-4.5 w-4.5 text-brand-300" aria-hidden />
            Sign out
          </button>
        </form>
      </div>
    </nav>
  );

  return (
    <>
      {/* Mobile trigger (rendered into the top bar area via fixed positioning) */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed left-3 top-3 z-40 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-brand-200 bg-white text-brand-800 shadow-sm lg:hidden"
        aria-label="Open menu"
        aria-expanded={open}
      >
        <Menu className="h-5 w-5" aria-hidden />
      </button>

      <Drawer open={open} onClose={close} title="Menu">
        <div className="px-4 pb-4">
          <Brand />
        </div>
        {body(close)}
      </Drawer>

      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:w-64 lg:flex-col lg:bg-brand-900 lg:text-white">
        <div className="px-5 py-5">
          <Brand />
        </div>
        <div className="flex-1 pb-4">{body()}</div>
      </aside>
    </>
  );
}
