"use client";

import { useActionState } from "react";
import { MailCheck, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Card";
import { requestPasswordReset, type AuthFormState } from "../actions";

const initial: AuthFormState = { ok: false };

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, initial);
  if (state.ok && state.sent) {
    return (
      <Alert tone="success" title="Check your email" icon={<MailCheck className="h-5 w-5" />}>
        If that address has an account, a reset link is on its way. It expires in an hour.
      </Alert>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <Input label="Email" name="email" type="email" autoComplete="email" inputMode="email" required placeholder="you@yourcompany.com" error={state.fieldErrors?.email} />
      <Button type="submit" loading={pending} block size="lg" leftIcon={<Send className="h-4 w-4" aria-hidden />}>
        Send reset link
      </Button>
    </form>
  );
}
