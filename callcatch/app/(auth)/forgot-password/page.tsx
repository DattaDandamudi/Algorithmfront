import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const metadata: Metadata = { title: "Reset your password", robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-brand-900">Reset your password</h1>
        <p className="mt-1 text-sm text-brand-600">Enter your email and we&apos;ll send a link to choose a new one.</p>
      </div>
      <ForgotPasswordForm />
      <p className="mt-6 text-center text-sm text-brand-600">
        <Link href="/login" className="font-semibold text-accent-600 hover:text-accent-700">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
