import { Suspense, lazy, useEffect, useState } from 'react';
import { Activity, BarChart3, MessageCircle, PlusCircle, Settings as SettingsIcon } from 'lucide-react';
import './health.css';
import { HealthStoreProvider, useHealth } from './data/store';
import { NavProvider, TABS, useNav, type Tab } from './nav';
import Onboarding from './screens/Onboarding';
import { ToastHost } from './ui/Toast';

const Today = lazy(() => import('./screens/Today'));
const Log = lazy(() => import('./screens/Log'));
const Trends = lazy(() => import('./screens/Trends'));
const Coach = lazy(() => import('./screens/Coach'));
const Settings = lazy(() => import('./screens/Settings'));

const ICONS: Record<Tab, typeof Activity> = {
  today: Activity,
  log: PlusCircle,
  trends: BarChart3,
  coach: MessageCircle,
  settings: SettingsIcon,
};

function Screen({ tab }: { tab: Tab }) {
  switch (tab) {
    case 'today':
      return <Today />;
    case 'log':
      return <Log />;
    case 'trends':
      return <Trends />;
    case 'coach':
      return <Coach />;
    case 'settings':
      return <Settings />;
  }
}

function TabBar() {
  const { tab, setTab } = useNav();
  return (
    <nav
      aria-label="Primary"
      className="hx-tabbar fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] border-t border-hx-border bg-hx-base/95 backdrop-blur px-2 pt-2 z-30"
    >
      <ul className="grid grid-cols-5">
        {TABS.map((t) => {
          const Icon = ICONS[t.id];
          const active = tab === t.id;
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => setTab(t.id)}
                aria-current={active ? 'page' : undefined}
                className={`w-full flex flex-col items-center gap-1 py-1.5 rounded-xl transition-colors ${
                  active ? 'text-hx-text' : 'text-hx-muted hover:text-hx-text2'
                }`}
              >
                <Icon className="w-5 h-5" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                <span className="text-[12px] leading-3 font-medium tracking-wide">{t.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function Frame() {
  const { tab } = useNav();
  const { state } = useHealth();
  // Visited screens stay mounted (hidden when inactive) so a half-typed meal, a coach draft or the
  // Trends range survives a glance at another tab (review R6-14). Only the active one animates in.
  const [visited, setVisited] = useState<Tab[]>(() => [tab]);
  useEffect(() => {
    setVisited((prev) => (prev.includes(tab) ? prev : [...prev, tab]));
  }, [tab]);

  useEffect(() => {
    document.title = 'Pulse — Health Log';
    const prev = document.body.style.background;
    document.body.style.background = '#0B0D0F';
    return () => {
      document.body.style.background = prev;
    };
  }, []);

  if (!state.settings.onboarded) {
    return (
      <div className="hx min-h-dvh flex justify-center">
        <div className="w-full max-w-[390px] min-h-dvh">
          <Onboarding />
        </div>
      </div>
    );
  }

  return (
    <div className="hx min-h-dvh flex justify-center">
      <div className="w-full max-w-[390px] min-h-dvh pb-24">
        <Suspense
          fallback={
            <div className="p-6 space-y-4" aria-busy="true">
              <div className="h-48 rounded-2xl bg-hx-card hx-pulse" />
              <div className="grid grid-cols-2 gap-3">
                <div className="h-28 rounded-2xl bg-hx-card hx-pulse" />
                <div className="h-28 rounded-2xl bg-hx-card hx-pulse" />
              </div>
            </div>
          }
        >
          {TABS.filter((t) => visited.includes(t.id)).map((t) => (
            <main key={t.id} hidden={t.id !== tab} className={t.id === tab ? 'hx-fade-up' : undefined}>
              <Screen tab={t.id} />
            </main>
          ))}
        </Suspense>
        <TabBar />
        <ToastHost />
      </div>
    </div>
  );
}

export default function HealthApp() {
  return (
    <HealthStoreProvider>
      <NavProvider>
        <Frame />
      </NavProvider>
    </HealthStoreProvider>
  );
}
