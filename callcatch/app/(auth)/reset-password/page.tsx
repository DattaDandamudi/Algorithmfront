import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth/session";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

export default async function ResetPasswordPage() {
  const user = await getUser();
  if (!user) redirect("/login?next=%2Freset-password&error=" + encodeURIComponent("Your reset link expired. Request a new one."));
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-brand-900">Choose a new password</h1>
        <p className="mt-1 text-sm text-brand-600">
          Signed in as <span className="font-medium text-brand-800">{user.email}</span>.
        </p>
      </div>
      <ResetPasswordForm />
    </>
  );
}
