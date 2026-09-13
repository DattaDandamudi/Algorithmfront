import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAccountForUser, getUser } from "@/lib/auth/session";
import { getPlan } from "@/lib/plans";
import { businessName, getAppContext, loadNumbers, overallVerification } from "@/components/dashboard/context";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { TopBar } from "@/components/dashboard/TopBar";
import { signOutAction } from "@/components/dashboard/shell-actions";

export const metadata: Metadata = {
  title: { default: "Dashboard", template: "%s · CallCatch" },
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Signed-in app shell. Signed-out users go to /login. The onboarding gate itself lives in each
 * dashboard page (`ensureOnboarded`) because this layout also wraps /onboarding and /billing/**,
 * which must stay reachable while `accounts.status === 'onboarding'` — those users (and users
 * whose account row has not been created yet) get a slim shell without navigation.
 */
function SlimShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex h-14 items-center justify-between border-b border-brand-100 bg-white px-4 sm:px-6">
        <span className="text-lg font-extrabold tracking-tight text-brand-900">
          Call<span className="text-accent-500">Catch</span>
        </span>
        <form action={signOutAction}>
          <button type="submit" className="text-sm font-medium text-brand-600 hover:text-brand-900">
            Sign out
          </button>
        </form>
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

export default async function AppLayout({ children }: LayoutProps<"/">) {
  // No redirect loop: /onboarding lives under this layout, so a user whose account row has not
  // landed yet (signup trigger) gets the slim shell and the onboarding page handles the rest.
  const user = await getUser();
  if (!user) redirect("/login");
  const summary = await getAccountForUser(user.id);
  if (!summary) return <SlimShell>{children}</SlimShell>;

  const ctx = await getAppContext({ gate: false });
  const name = businessName(ctx.account);
  if (ctx.account.status === "onboarding" && !ctx.impersonating) return <SlimShell>{children}</SlimShell>;

  const [numbers, openConvs, newLeads] = await Promise.all([
    loadNumbers(ctx.db, ctx.account.id),
    ctx.db.from("conversations").select("id", { count: "exact", head: true }).eq("account_id", ctx.account.id).eq("status", "open"),
    ctx.db.from("leads").select("id", { count: "exact", head: true }).eq("account_id", ctx.account.id).eq("status", "new"),
  ]);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        isAdmin={ctx.isAdmin}
        counts={{ inbox: openConvs.count ?? 0, leads: newLeads.count ?? 0 }}
        businessName={name}
        signOut={signOutAction}
      />
      <div className="flex min-h-screen flex-col lg:pl-64">
        <TopBar
          businessName={name}
          verification={overallVerification(numbers)}
          planLabel={getPlan(ctx.account.plan).name}
          impersonating={ctx.impersonating}
          email={ctx.user.email ?? null}
        />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
