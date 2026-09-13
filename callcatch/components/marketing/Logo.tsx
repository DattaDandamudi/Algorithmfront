import Link from "next/link";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  /** "light" for dark backgrounds */
  tone?: "dark" | "light";
  href?: string;
};

/** Wordmark + glyph (SVG, no image assets). */
export function Logo({ className, tone = "dark", href = "/" }: Props) {
  return (
    <Link
      href={href}
      aria-label="CallCatch home"
      className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", tone === "light" ? "text-white" : "text-brand-900", className)}
    >
      <LogoGlyph className="h-7 w-7" />
      <span className="text-lg leading-none">
        Call<span className={tone === "light" ? "text-accent-400" : "text-accent-600"}>Catch</span>
      </span>
    </Link>
  );
}

export function LogoGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="8" fill="#0b1f3a" />
      <path
        d="M10.5 9.5c.6-.6 1.5-.6 2.1 0l2 2.1c.5.6.5 1.4 0 2l-1.2 1.2c.9 1.9 2.5 3.5 4.4 4.4l1.2-1.2c.6-.5 1.4-.5 2 0l2.1 2c.6.6.6 1.5 0 2.1l-1.1 1.1c-1 1-2.5 1.3-3.8.8-4.2-1.6-7.6-5-9.2-9.2-.5-1.3-.2-2.8.8-3.8l.7-.5z"
        fill="#ff6a1a"
      />
      <path d="M19 8.5h5v5" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M24 8.5l-5.5 5.5" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}
