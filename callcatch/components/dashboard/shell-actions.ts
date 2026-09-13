"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/db/client";
import { ADMIN_VIEW_COOKIE } from "./context";

/** Signs the current user out (clears the Supabase session cookies) and returns to /login. */
export async function signOutAction(): Promise<void> {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  const store = await cookies();
  store.set(ADMIN_VIEW_COOKIE, "", { maxAge: 0, path: "/" });
  redirect("/login");
}

/** Ends an admin "view as" session. Safe for anyone to call: it only clears a cookie. */
export async function stopImpersonatingAction(): Promise<void> {
  const store = await cookies();
  store.set(ADMIN_VIEW_COOKIE, "", { maxAge: 0, path: "/" });
  redirect("/admin");
}
