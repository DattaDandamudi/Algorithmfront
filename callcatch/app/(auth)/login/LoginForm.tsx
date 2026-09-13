"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowRight, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Card";
import { signInWithPassword, type AuthFormState } from "../actions";

const initial: AuthFormState = { ok: false };

export function LoginForm({ next, initialError, message }: { next: string; initialError?: string; message?: string }) {
  const [state, action, pending] = useActionState(signInWithPassword, initial);
  const error = state.error ?? initialError;
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={next} />
      {message ? <Alert tone="success">{message}</Alert> : null}
      {error ? (
        <Alert tone="error" icon={<AlertCircle className="h-4 w-4" />}>
          {error}
        </Alert>
      ) : null}
      <Input label="Email" name="email" type="email" autoComplete="email" inputMode="email" required placeholder="you@yourcompany.com" error={state.fieldErrors?.email} />
      <div className="flex flex-col gap-1.5">
        <Input label="Password" name="password" type="password" autoComplete="current-password" required placeholder="••••••••" error={state.fieldErrors?.password} />
        <Link href="/forgot-password" className="self-end text-xs font-medium text-brand-600 hover:text-brand-900">
          Forgot password?
        </Link>
      </div>
      <Button type="submit" loading={pending} block size="lg" rightIcon={<ArrowRight className="h-4 w-4" aria-hidden />}>
        Sign in
      </Button>
    </form>
  );
}
