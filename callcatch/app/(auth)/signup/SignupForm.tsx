"use client";

import { useActionState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Card";
import { signUpWithPassword, type AuthFormState } from "../actions";
import type { PlanParams } from "../_shared/next-path";

const initial: AuthFormState = { ok: false };

export function SignupForm({ plan, initialError }: { plan: PlanParams; initialError?: string }) {
  const [state, action, pending] = useActionState(signUpWithPassword, initial);
  const error = state.error ?? initialError;

  if (state.ok && state.confirmEmail) {
    return (
      <Alert tone="success" title="Check your email" icon={<MailCheck className="h-5 w-5" />}>
        We sent a confirmation link. Click it and we&apos;ll take you straight to choosing your plan.
      </Alert>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {plan.plan ? <input type="hidden" name="plan" value={plan.plan} /> : null}
      {plan.interval ? <input type="hidden" name="interval" value={plan.interval} /> : null}
      {plan.path ? <input type="hidden" name="path" value={plan.path} /> : null}
      {plan.ref ? <input type="hidden" name="ref" value={plan.ref} /> : null}
      {plan.setup ? <input type="hidden" name="setup" value={plan.setup} /> : null}
      {error ? (
        <Alert tone="error" icon={<AlertCircle className="h-4 w-4" />}>
          {error}{" "}
          {error.includes("Sign in") ? (
            <Link href="/login" className="font-semibold underline underline-offset-2">
              Go to sign in
            </Link>
          ) : null}
        </Alert>
      ) : null}
      <Input label="Work email" name="email" type="email" autoComplete="email" inputMode="email" required placeholder="you@yourcompany.com" error={state.fieldErrors?.email} />
      <Input
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        placeholder="At least 8 characters"
        hint="8+ characters. A passphrase works great."
        error={state.fieldErrors?.password}
      />
      <Button type="submit" loading={pending} block size="lg" rightIcon={<ArrowRight className="h-4 w-4" aria-hidden />}>
        Create account
      </Button>
    </form>
  );
}
