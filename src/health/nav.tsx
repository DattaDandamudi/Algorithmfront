import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type Tab = 'today' | 'log' | 'trends' | 'coach' | 'settings';

export const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'log', label: 'Log' },
  { id: 'trends', label: 'Trends' },
  { id: 'coach', label: 'Coach' },
  { id: 'settings', label: 'Settings' },
];

interface NavValue {
  tab: Tab;
  setTab(tab: Tab): void;
  /** Jump to Coach, optionally pre-filling the composer (and auto-sending when `send` is true). */
  openCoach(prompt?: string, send?: boolean): void;
  /** Pending coach prefill; the Coach screen consumes it once. */
  coachPrefill: { prompt: string; send: boolean; nonce: number } | null;
  consumeCoachPrefill(): void;
  /** Optional deep-link into the Log screen ('weight' | 'meal' | 'tobacco' | 'bedtime'). */
  openLog(section?: LogSection): void;
  logSection: LogSection | null;
  consumeLogSection(): void;
}

export type LogSection = 'meal' | 'weight' | 'tobacco' | 'bedtime' | 'caffeine' | 'water';

const NavContext = createContext<NavValue | null>(null);

function initialTab(): Tab {
  if (typeof window === 'undefined') return 'today';
  const hash = window.location.hash.replace(/^#\/?health\/?/, '').replace(/^#\/?/, '');
  const seg = hash.split('/')[0] as Tab;
  return TABS.some((t) => t.id === seg) ? seg : 'today';
}

export function NavProvider({ children }: { children: ReactNode }) {
  const [tab, setTabState] = useState<Tab>(initialTab);
  const [coachPrefill, setCoachPrefill] = useState<NavValue['coachPrefill']>(null);
  const [logSection, setLogSection] = useState<LogSection | null>(null);

  const setTab = useCallback((t: Tab) => {
    setTabState(t);
    if (typeof window !== 'undefined') {
      const base = window.location.pathname.startsWith('/health') ? '' : '/health';
      window.history.replaceState(null, '', `${window.location.pathname}${base ? '' : ''}#/${t}`);
    }
  }, []);

  const openCoach = useCallback(
    (prompt?: string, send = false) => {
      if (prompt) setCoachPrefill({ prompt, send, nonce: Date.now() });
      setTab('coach');
    },
    [setTab],
  );

  const openLog = useCallback(
    (section?: LogSection) => {
      if (section) setLogSection(section);
      setTab('log');
    },
    [setTab],
  );

  const value = useMemo<NavValue>(
    () => ({
      tab,
      setTab,
      openCoach,
      coachPrefill,
      consumeCoachPrefill: () => setCoachPrefill(null),
      openLog,
      logSection,
      consumeLogSection: () => setLogSection(null),
    }),
    [tab, setTab, openCoach, coachPrefill, openLog, logSection],
  );

  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNav(): NavValue {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error('useNav must be used inside <NavProvider>');
  return ctx;
}
