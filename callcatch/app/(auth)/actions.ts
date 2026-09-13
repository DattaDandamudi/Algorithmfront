"use server";

/**
 * Auth Server Functions (email/password, Google OAuth, password reset). Called from the auth
 * forms via useActionState / <form action>. All inputs are zod-validated here; Supabase sets the
 * session cookies through createServerSupabase()'s cookie adapter.
 */
import { redirect } from "next/navigation";
import { z } from "zod";
import { createServerSupabase } from "@/lib/db/client";
import { getAccountForUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { track } from "@/lib/events";
import { recordSignup } from "./_shared/record-signup";
import { checkoutPathFor, safeNextPath, type PlanParams } from "./_shared/next-path";

export type AuthFormState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Signup with email confirmation enabled: tell the user to check their inbox. */
  confirmEmail?: boolean;
  /** Forgot password: always "sent" to avoid account enumeration. */
  sent?: boolean;
};

const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address");
const passwordSchema = z.string().min(8, "Use at least 8 characters").max(72, "Max 72 characters");

const loginSchema = z.object({ email: emailSchema, password: z.string().min(1, "Enter your password"), next: z.string().optional() });

const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  plan: z.string().optional(),
  interval: z.string().optional(),
  path: z.string().optional(),
  ref: z.string().optional(),
  setup: z.string().optional(),
});

const resetRequestSchema = z.object({ email: emailSchema });
const updatePasswordSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((d) => d.password === d.confirm, { message: "Passwords don't match", path: ["confirm"] });

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "_";
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

function str(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  return typeof v === "string" ? v : undefined;
}

function planParamsFrom(formData: FormData): PlanParams {
  return { plan: str(formData, "plan"), interval: str(formData, "interval"), path: str(formData, "path"), ref: str(formData, "ref"), setup: str(formData, "setup") };
}

export async function signInWithPassword(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse({ email: str(formData, "email"), password: str(formData, "password"), next: str(formData, "next") });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
  if (error) {
    return { ok: false, error: error.message.toLowerCase().includes("confirm") ? "Please confirm your email first — check your inbox for the link." : "Invalid email or password." };
  }
  redirect(safeNextPath(parsed.data.next));
}

export async function signUpWithPassword(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = signupSchema.safeParse({ email: str(formData, "email"), password: str(formData, "password"), ...planParamsFrom(formData) });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const plan = planParamsFrom(formData);
  const checkoutPath = checkoutPathFor(plan);

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${env.appUrl()}/auth/callback?flow=signup&next=${encodeURIComponent(checkoutPath)}`,
      data: { signup_plan: plan.plan ?? null, signup_interval: plan.interval ?? null, signup_path: plan.path ?? null },
    },
  });
  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("already") || msg.includes("registered")) return { ok: false, error: "That email already has an account. Sign in instead." };
    return { ok: false, error: error.message };
  }
  // Supabase returns a user with an empty identities array when the email is already registered (confirmation on).
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    return { ok: false, error: "That email already has an account. Sign in instead." };
  }

  if (!data.session) return { ok: true, confirmEmail: true };

  await recordSignup(data.user?.id ?? null, parsed.data.email, plan, "password");
  redirect(checkoutPath);
}

export async function signInWithGoogle(formData: FormData): Promise<void> {
  const flow = str(formData, "flow") === "signup" ? "signup" : "login";
  const plan = planParamsFrom(formData);
  const next = flow === "signup" ? checkoutPathFor(plan) : safeNextPath(str(formData, "next"));
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${env.appUrl()}/auth/callback?flow=${flow}&next=${encodeURIComponent(next)}`,
      skipBrowserRedirect: true,
      queryParams: { access_type: "offline", prompt: "select_account" },
    },
  });
  if (error || !data.url) redirect(`/${flow}?error=${encodeURIComponent("Google sign-in is unavailable right now.")}`);
  redirect(data.url);
}

export async function requestPasswordReset(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = resetRequestSchema.safeParse({ email: str(formData, "email") });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${env.appUrl()}/auth/callback?flow=recovery&next=${encodeURIComponent("/reset-password")}`,
  });
  if (error) console.error("[auth] resetPasswordForEmail", error.message);
  // Always report success: don't reveal whether an email is registered.
  return { ok: true, sent: true };
}

export async function updatePassword(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = updatePasswordSchema.safeParse({ password: str(formData, "password"), confirm: str(formData, "confirm") });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createServerSupabase();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login?next=%2Freset-password&error=" + encodeURIComponent("Your reset link expired. Request a new one."));
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, error: error.message };
  const account = await getAccountForUser(userData.user.id).catch(() => null);
  await track("password_updated", {}, { userId: userData.user.id, accountId: account?.id ?? null });
  redirect("/dashboard?password=updated");
}

export async function signOut(): Promise<void> {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect("/login");
}
