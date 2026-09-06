import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type Tab = 'today' | 'log' | 'train' | 'trends' | 'coach' | 'settings';

/** Bottom-bar order. Train sits between Log (what you ate) and Trends (what happened). */
export const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'log', label: 'Log' },
  { id: 'train', label: 'Train' },
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
  /** Optional deep-link into the Log screen ('weight' | 'meal' | 'tobacco' | 'bedtime' | 'checkin'). */
  openLog(section?: LogSection): void;
  logSection: LogSection | null;
  consumeLogSection(): void;
  /**
   * Jump to Train, optionally selecting a sub-view and a session to open.
   * A `workoutId` with no view means "show me that session", i.e. History.
   */
  openTrain(view?: TrainView, workoutId?: string): void;
  /** Pending Train deep link; the Train screen consumes it once. */
  trainTarget: TrainTarget | null;
  consumeTrainTarget(): void;
  /** Deep-link into a Settings section (its Section id, e.g. 'whoop', 'bloodwork', 'data', 'coach'). */
  openSettings(section?: SettingsSection): void;
  settingsSection: SettingsSection | null;
  consumeSettingsSection(): void;
}

export type SettingsSection =
  | 'profile'
  | 'targets'
  | 'split'
  | 'training'
  | 'bloodwork'
  | 'food'
  | 'whoop'
  | 'imports'
  | 'checkin'
  | 'coach'
  | 'data'
  | 'about';

export type LogSection = 'meal' | 'weight' | 'tobacco' | 'bedtime' | 'caffeine' | 'water' | 'checkin';

/** The four Train sub-views (Phase 2a fills each one in). */
export type TrainView = 'today' | 'log' | 'history' | 'analysis';

export interface TrainTarget {
  view: TrainView;
  /** Set when the link points at one session (History opens its detail). */
  workoutId?: string;
  nonce: number;
}

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
      // Keep the app reachable after a reload: when the path is not /health the hash
      // must carry the `health/` prefix that main.tsx's router looks for.
      const underHealthPath = window.location.pathname === '/health' || window.location.pathname.startsWith('/health/');
      const hash = underHealthPath ? `#/${t}` : `#/health/${t}`;
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
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

  const [trainTarget, setTrainTarget] = useState<TrainTarget | null>(null);
  const openTrain = useCallback(
    (view?: TrainView, workoutId?: string) => {
      // Same one-shot idiom as openCoach: only set a target when the caller asked for
      // something specific, so a plain "go to Train" keeps whatever view was last open.
      if (view || workoutId) setTrainTarget({ view: view ?? 'history', workoutId, nonce: Date.now() });
      setTab('train');
    },
    [setTab],
  );

  const [settingsSection, setSettingsSection] = useState<SettingsSection | null>(null);
  const openSettings = useCallback(
    (section?: SettingsSection) => {
      if (section) setSettingsSection(section);
      setTab('settings');
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
      openTrain,
      trainTarget,
      consumeTrainTarget: () => setTrainTarget(null),
      openSettings,
      settingsSection,
      consumeSettingsSection: () => setSettingsSection(null),
    }),
    [tab, setTab, openCoach, coachPrefill, openLog, logSection, openTrain, trainTarget, openSettings, settingsSection],
  );

  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNav(): NavValue {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error('useNav must be used inside <NavProvider>');
  return ctx;
}
