/**
 * GET /auth/callback — finishes Supabase auth redirects:
 *  - OAuth / magic-link PKCE: ?code=… → exchangeCodeForSession
 *  - Email templates using token_hash: ?token_hash=…&type=… → verifyOtp
 *  - Provider errors: ?error=…&error_description=…
 * Then redirects to a safe `next` (checkout after signup, /reset-password for recovery, else /dashboard).
 */
import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { checkoutPathFor, safeNextPath } from "@/app/(auth)/_shared/next-path";
import { recordSignup } from "@/app/(auth)/_shared/record-signup";

export const runtime = "nodejs";

const OTP_TYPES: ReadonlySet<string> = new Set(["signup", "invite", "magiclink", "recovery", "email_change", "email"]);

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const flow = searchParams.get("flow");
  const providerError = searchParams.get("error_description") ?? searchParams.get("error");

  const fallback = flow === "recovery" ? "/reset-password" : flow === "signup" ? checkoutPathFor({}) : "/dashboard";
  const next = safeNextPath(searchParams.get("next"), fallback);
  const loginWithError = (message: string) => {
    const u = new URL("/login", origin);
    u.searchParams.set("error", message);
    if (next !== "/dashboard") u.searchParams.set("next", next);
    return NextResponse.redirect(u);
  };

  if (providerError) return loginWithError(providerError);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return loginWithError("Auth is not configured.");

  const response = NextResponse.redirect(new URL(next, origin));
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  let userId: string | null = null;
  let email: string | null = null;
  let createdAt: string | null = null;

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return loginWithError(error.message);
    userId = data.user?.id ?? null;
    email = data.user?.email ?? null;
    createdAt = data.user?.created_at ?? null;
  } else if (tokenHash && type && OTP_TYPES.has(type)) {
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as EmailOtpType });
    if (error) return loginWithError(error.message);
    userId = data.user?.id ?? null;
    email = data.user?.email ?? null;
    createdAt = data.user?.created_at ?? null;
  } else {
    return loginWithError("That sign-in link is invalid or has expired.");
  }

  // A brand-new user (Google signup or confirmed email) → record the signup with the plan they chose.
  const isNew = createdAt ? Date.now() - Date.parse(createdAt) < 10 * 60 * 1000 : false;
  if (userId && (flow === "signup" || type === "signup") && isNew) {
    const nextUrl = new URL(next, origin);
    await recordSignup(
      userId,
      email,
      { plan: nextUrl.searchParams.get("plan") ?? undefined, interval: nextUrl.searchParams.get("interval") ?? undefined, path: nextUrl.searchParams.get("path") ?? undefined },
      code ? "google" : "password"
    );
  }

  return response;
}
