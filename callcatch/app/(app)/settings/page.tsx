import type { Metadata } from "next";
import { getAppContext } from "@/components/dashboard/context";
import { PageHeader } from "@/components/dashboard/primitives";
import { Tabs } from "@/components/dashboard/Tabs";
import { BusinessTab } from "@/components/dashboard/settings/BusinessTab";
import { AiProfileTab } from "@/components/dashboard/settings/AiProfileTab";
import { HoursTab } from "@/components/dashboard/settings/HoursTab";
import { AlertsTab } from "@/components/dashboard/settings/AlertsTab";
import { BookingTab } from "@/components/dashboard/settings/BookingTab";
import { LeadSourcesTab } from "@/components/dashboard/settings/LeadSourcesTab";
import { UsageTab } from "@/components/dashboard/settings/UsageTab";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

const TABS = [
  { id: "business", label: "Business" },
  { id: "ai", label: "AI profile" },
  { id: "hours", label: "Hours & quiet hours" },
  { id: "alerts", label: "Alerts" },
  { id: "booking", label: "Booking" },
  { id: "sources", label: "Lead sources" },
  { id: "usage", label: "Usage" },
] as const;
type TabId = (typeof TABS)[number]["id"];

function periodKey(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export default async function SettingsPage(props: PageProps<"/settings">) {
  const ctx = await getAppContext();
  const { account, db } = ctx;
  const sp = await props.searchParams;
  const tab: TabId = TABS.some((t) => t.id === sp.tab) ? (sp.tab as TabId) : "business";
  const readOnly = ctx.impersonating;

  let body: React.ReactNode;
  switch (tab) {
    case "ai":
      body = <AiProfileTab account={account} readOnly={readOnly} />;
      break;
    case "hours":
      body = <HoursTab account={account} readOnly={readOnly} />;
      break;
    case "alerts":
      body = <AlertsTab account={account} readOnly={readOnly} />;
      break;
    case "booking":
      body = <BookingTab account={account} readOnly={readOnly} />;
      break;
    case "sources": {
      const { data } = await db.from("lead_sources").select("*").eq("account_id", account.id).order("created_at", { ascending: true });
      body = <LeadSourcesTab account={account} sources={data ?? []} readOnly={readOnly} />;
      break;
    }
    case "usage": {
      const period = periodKey();
      const [{ data: usage }, { count }] = await Promise.all([
        db.from("usage_monthly").select("*").eq("account_id", account.id).eq("period", period).maybeSingle(),
        db.from("conversations").select("id", { count: "exact", head: true }).eq("account_id", account.id).gte("created_at", `${period}T00:00:00Z`),
      ]);
      body = <UsageTab account={account} usage={usage ?? null} liveConversations={count ?? 0} period={period} />;
      break;
    }
    default:
      body = <BusinessTab account={account} readOnly={readOnly} />;
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader eyebrow="Settings" title="Your front desk, your rules" sub="Changes apply to new conversations immediately." />
      <Tabs ariaLabel="Settings sections" active={tab} items={TABS.map((t) => ({ id: t.id, label: t.label, href: `/settings?tab=${t.id}` }))} />
      <div className="mt-6">{body}</div>
    </div>
  );
}
