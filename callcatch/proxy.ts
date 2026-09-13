/**
 * Next.js 16 proxy (formerly middleware): refreshes the Supabase session cookie on every
 * matched request and applies optimistic auth redirects. Real authorization happens in the
 * layouts / Server Functions / Route Handlers (`getUser()`, `getSessionForApi()`).
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/app/(auth)/_shared/next-path";

const PROTECTED_PREFIXES = ["/onboarding", "/dashboard", "/inbox", "/leads", "/calls", "/settings", "/billing", "/admin", "/reset-password"];
const AUTH_PAGES = ["/login", "/signup"];

function startsWithAny(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const { pathname, search } = request.nextUrl;
  const isProtected = startsWithAny(pathname, PROTECTED_PREFIXES);
  const isAuthPage = startsWithAny(pathname, AUTH_PAGES);

  // Without Supabase configured (e.g. preview builds), let everything through untouched.
  if (!url || !key) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // Mirror onto the request (so downstream server code sees fresh tokens) and the response (so the browser stores them).
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // IMPORTANT: getUser() (not getSession()) — it validates the JWT with Supabase and refreshes the cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && isProtected) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    login.searchParams.set("next", `${pathname}${search}`);
    const redirect = NextResponse.redirect(login);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }

  if (user && isAuthPage) {
    const target = request.nextUrl.clone();
    target.search = "";
    const plan = request.nextUrl.searchParams.get("plan");
    if (pathname.startsWith("/signup") && plan) {
      // A signed-in visitor clicking a pricing CTA goes straight to checkout with the chosen plan.
      target.pathname = "/billing/checkout";
      for (const k of ["plan", "interval", "path", "setup", "ref"]) {
        const v = request.nextUrl.searchParams.get(k);
        if (v) target.searchParams.set(k, v);
      }
    } else {
      const next = safeNextPath(request.nextUrl.searchParams.get("next"));
      const nextUrl = new URL(next, request.nextUrl.origin);
      target.pathname = nextUrl.pathname;
      target.search = nextUrl.search;
    }
    const redirect = NextResponse.redirect(target);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except API routes, Next internals and static assets.
    "/((?!api/|_next/|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|css|js|map|woff2?|ttf)$).*)",
  ],
};
