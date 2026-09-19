import { Suspense, lazy, useEffect, useState } from 'react';
import { Activity, BarChart3, Dumbbell, MessageCircle, PlusCircle, Settings as SettingsIcon } from 'lucide-react';
import './health.css';
import { HealthStoreProvider, useHealth } from './data/store';
import { NavProvider, TABS, useNav, type Tab } from './nav';
import Onboarding from './screens/Onboarding';
import { ToastHost } from './ui/Toast';

const Today = lazy(() => import('./screens/Today'));
const Log = lazy(() => import('./screens/Log'));
const Train = lazy(() => import('./screens/Train'));
const Trends = lazy(() => import('./screens/Trends'));
const Coach = lazy(() => import('./screens/Coach'));
const Settings = lazy(() => import('./screens/Settings'));

/** The stock, as main.tsx paints it before this chunk arrives. */
const STOCK = '#100E0B';

const ICONS: Record<Tab, typeof Activity> = {
  today: Activity,
  log: PlusCircle,
  train: Dumbbell,
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
    case 'train':
      return <Train />;
    case 'trends':
      return <Trends />;
    case 'coach':
      return <Coach />;
    case 'settings':
      return <Settings />;
  }
}

/**
 * The running foot: the only fixed element. Stock at 96 percent with a
 * hairline above, six 48 px items, 20 px icons at a 1.5 stroke, agate words.
 * The active item is bone with a 20 by 2 px lume underline under its icon;
 * the others are muted. The icons are the one centred thing in the app.
 */
function TabBar() {
  const { tab, setTab } = useNav();
  return (
    <nav aria-label="Primary" className="hx-tabbar fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] z-30">
      <ul className="grid grid-cols-6">
        {TABS.map((t) => {
          const Icon = ICONS[t.id];
          const active = tab === t.id;
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => setTab(t.id)}
                aria-current={active ? 'page' : undefined}
                className={`w-full h-12 flex flex-col items-center justify-center gap-1 transition-colors ${active ? 'text-hx-text' : 'text-hx-muted hover:text-hx-text2'}`}
              >
                <span className="flex flex-col items-center gap-0.5">
                  <Icon className="w-5 h-5" strokeWidth={1.5} aria-hidden />
                  <span className={`block w-5 h-0.5 ${active ? 'bg-hx-lume' : 'bg-transparent'}`} aria-hidden />
                </span>
                <span className="hx-agate text-inherit whitespace-nowrap">{t.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** While a screen's chunk loads: a few hairlines and text2 bars where its type will land. No tiles. */
function Skeleton() {
  return (
    <div className="px-5 pt-8 flex flex-col gap-5" aria-busy="true">
      <div className="h-5 w-44 bg-hx-text2/25 hx-pulse" />
      <div className="hx-rule" />
      <div className="h-10 w-28 bg-hx-text2/25 hx-pulse" />
      <div className="h-4 w-60 bg-hx-text2/25 hx-pulse" />
      <div className="hx-hair" />
      <div className="h-4 w-52 bg-hx-text2/25 hx-pulse" />
      <div className="hx-hair" />
      <div className="h-4 w-40 bg-hx-text2/25 hx-pulse" />
    </div>
  );
}

function Frame() {
  const { tab } = useNav();
  const { state } = useHealth();
  // Visited screens stay mounted (hidden when inactive) so a half-typed meal, a coach draft or the
  // Trends range survives a glance at another tab (review R6-14).
  const [visited, setVisited] = useState<Tab[]>(() => [tab]);
  useEffect(() => {
    setVisited((prev) => (prev.includes(tab) ? prev : [...prev, tab]));
  }, [tab]);

  useEffect(() => {
    document.title = 'Pulse — Health Log';
    const prev = document.body.style.background;
    document.body.style.background = STOCK;
    return () => {
      document.body.style.background = prev;
    };
  }, []);

  // overflow-x-clip: the ink rule bleeds past the page margin by design; clip (not hidden) keeps
  // the column from ever widening the page while leaving sticky headers and the fixed foot alone.
  if (!state.settings.onboarded) {
    return (
      <div className="hx min-h-dvh flex justify-center">
        <div className="w-full max-w-[390px] min-h-dvh overflow-x-clip">
          <Onboarding />
        </div>
      </div>
    );
  }

  return (
    <div className="hx min-h-dvh flex justify-center">
      <div className="w-full max-w-[390px] min-h-dvh pb-24 overflow-x-clip">
        <Suspense fallback={<Skeleton />}>
          {TABS.filter((t) => visited.includes(t.id)).map((t) => (
            <main key={t.id} hidden={t.id !== tab}>
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
