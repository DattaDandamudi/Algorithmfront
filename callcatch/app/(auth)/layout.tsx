import Link from "next/link";
import { Logo } from "@/components/marketing/Logo";

/** Centered auth card on a soft navy-tinted ground. */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col bg-[radial-gradient(60rem_40rem_at_50%_-10%,#d8e2f2_0%,#fbfaf7_60%)]">
      <header className="mx-auto flex w-full max-w-md items-center justify-between px-4 pt-8 sm:px-6">
        <Logo />
        <Link href="/" className="text-sm font-medium text-brand-600 hover:text-brand-900">
          ← Back to site
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-8 sm:px-6">
        <div className="rounded-3xl border border-brand-100 bg-white p-6 shadow-[0_12px_40px_-16px_rgba(11,31,58,0.25)] sm:p-8">{children}</div>
        <p className="mt-6 text-center text-xs text-brand-500">
          By continuing you agree to our{" "}
          <Link href="/terms" className="underline decoration-brand-200 underline-offset-2 hover:text-brand-800">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline decoration-brand-200 underline-offset-2 hover:text-brand-800">
            Privacy Policy
          </Link>
          .
        </p>
      </main>
    </div>
  );
}
