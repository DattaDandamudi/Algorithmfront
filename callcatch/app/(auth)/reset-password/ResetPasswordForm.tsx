"use client";

import { useActionState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Card";
import { updatePassword, type AuthFormState } from "../actions";

const initial: AuthFormState = { ok: false };

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, initial);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <Input label="New password" name="password" type="password" autoComplete="new-password" required minLength={8} placeholder="At least 8 characters" error={state.fieldErrors?.password} />
      <Input label="Confirm new password" name="confirm" type="password" autoComplete="new-password" required minLength={8} placeholder="Type it again" error={state.fieldErrors?.confirm} />
      <Button type="submit" loading={pending} block size="lg" leftIcon={<KeyRound className="h-4 w-4" aria-hidden />}>
        Update password
      </Button>
    </form>
  );
}
