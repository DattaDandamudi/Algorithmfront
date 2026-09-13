"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Logo } from "./Logo";
import { TrackedLink } from "./TrackedLink";
import { Container, buttonClasses } from "./ui";
import { LOGIN_HREF, NAV_LINKS, TRIAL_HREF } from "./site";
import { cn } from "@/lib/utils";

export function Nav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [lastPath, setLastPath] = useState(pathname);
  // Close the mobile menu on navigation (state adjustment during render, per React docs).
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  return (
    <header className="sticky top-0 z-40 border-b border-brand-100/80 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <Container className="flex h-16 items-center justify-between gap-4">
        <Logo />
        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={buttonClasses.ghostDark}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          <Link href={LOGIN_HREF} className={buttonClasses.ghostDark}>
            Log in
          </Link>
          <TrackedLink href={TRIAL_HREF} event="StartTrial" dataEvent="nav_start_trial" params={{ content_category: "cta_click", plan: "starter" }} className={cn(buttonClasses.primary, "px-4 py-2 text-sm")}>
            Start free trial
          </TrackedLink>
        </div>
        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-brand-900 hover:bg-brand-50 md:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-6 w-6" aria-hidden="true" /> : <Menu className="h-6 w-6" aria-hidden="true" />}
        </button>
      </Container>
      <div id="mobile-nav" hidden={!open} className="border-t border-brand-100 bg-background md:hidden">
        <Container className="flex flex-col gap-1 py-3">
          {NAV_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-lg px-3 py-3 text-base font-medium text-brand-900 hover:bg-brand-50">
              {l.label}
            </Link>
          ))}
          <Link href={LOGIN_HREF} className="rounded-lg px-3 py-3 text-base font-medium text-brand-900 hover:bg-brand-50">
            Log in
          </Link>
          <TrackedLink href={TRIAL_HREF} event="StartTrial" dataEvent="nav_mobile_start_trial" params={{ content_category: "cta_click", plan: "starter" }} className={cn(buttonClasses.primary, "mt-2")}>
            Start free trial
          </TrackedLink>
        </Container>
      </div>
    </header>
  );
}
