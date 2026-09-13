import type { Metadata } from "next";
import Link from "next/link";
import { GoogleButton, OrDivider } from "../_shared/GoogleButton";
import { safeNextPath } from "../_shared/next-path";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function LoginPage(props: PageProps<"/login">) {
  const sp = await props.searchParams;
  const next = safeNextPath(first(sp.next));
  const error = first(sp.error)?.slice(0, 200);
  const message = first(sp.message)?.slice(0, 200);

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-brand-900">Welcome back</h1>
        <p className="mt-1 text-sm text-brand-600">Sign in to your CallCatch front desk.</p>
      </div>
      <GoogleButton flow="login" next={next} />
      <OrDivider />
      <LoginForm next={next} initialError={error} message={message} />
      <p className="mt-6 text-center text-sm text-brand-600">
        New to CallCatch?{" "}
        <Link href="/signup" className="font-semibold text-accent-600 hover:text-accent-700">
          Start your free trial
        </Link>
      </p>
    </>
  );
}
