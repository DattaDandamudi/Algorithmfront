import { NavLink, Link, useLocation } from 'react-router-dom';
import { motion } from 'motion/react';
import { Compass, Search, Scale, Package, User, Moon, Sun } from 'lucide-react';
import clsx from 'clsx';
import { springs } from '../design/motion';
import { useProfileStore } from '../features/profile/store';
import { useSearchStore } from '../features/search/recentStore';

const LINKS = [
  { to: '/', label: 'Discover', icon: Compass, end: true },
  { to: '/search', label: 'Search', icon: Search, end: false },
  { to: '/compare', label: 'Compare', icon: Scale, end: false },
  { to: '/orders', label: 'Orders', icon: Package, end: false },
] as const;

function ThemeToggle() {
  const theme = useProfileStore((s) => s.theme);
  const setTheme = useProfileStore((s) => s.setTheme);
  const isDark =
    theme === 'dark' ||
    (theme === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);
  return (
    <motion.button
      whileTap={{ scale: 0.92 }}
      transition={springs.snappy}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="flex h-9 w-9 items-center justify-center rounded-pill border border-hairline text-muted transition-colors hover:text-ink"
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </motion.button>
  );
}

function PaletteTrigger() {
  const setPaletteOpen = useSearchStore((s) => s.setPaletteOpen);
  return (
    <button
      onClick={() => setPaletteOpen(true)}
      className="hidden h-9 items-center gap-2 rounded-pill border border-hairline px-3 text-[13px] text-muted transition-colors hover:text-ink md:inline-flex"
    >
      <Search size={14} aria-hidden="true" />
      <span>Search</span>
      <kbd className="rounded-md border border-hairline px-1.5 text-[11px]">⌘K</kbd>
    </button>
  );
}

export function TopNav() {
  const { pathname } = useLocation();
  return (
    <header className="glass fixed inset-x-0 top-0 z-50">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link to="/" className="group flex items-baseline gap-1.5">
          <span className="blob mt-0.5 h-3 w-3 self-center bg-terracotta transition-transform group-hover:scale-110" />
          <span
            className="font-display text-[22px] font-semibold text-ink"
            style={{ fontVariationSettings: "'opsz' 60" }}
          >
            TrueFare
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          {LINKS.map(({ to, label, end }) => {
            const active = end ? pathname === to : pathname.startsWith(to);
            return (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={clsx(
                  'relative rounded-pill px-4 py-2 text-sm font-medium transition-colors',
                  active ? 'text-ink' : 'text-muted hover:text-ink'
                )}
              >
                {active && (
                  <motion.span
                    layoutId="nav-pill"
                    transition={springs.layout}
                    className="absolute inset-0 rounded-pill bg-blush"
                  />
                )}
                <span className="relative">{label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <PaletteTrigger />
          <ThemeToggle />
          <NavLink
            to="/profile"
            aria-label="Profile"
            className={({ isActive }) =>
              clsx(
                'flex h-9 w-9 items-center justify-center rounded-pill border border-hairline transition-colors',
                isActive ? 'bg-blush text-ink' : 'text-muted hover:text-ink'
              )
            }
          >
            <User size={16} />
          </NavLink>
        </div>
      </div>
    </header>
  );
}

export function BottomTabs() {
  const { pathname } = useLocation();
  const tabs = [...LINKS, { to: '/profile', label: 'You', icon: User, end: false }];
  return (
    <nav
      aria-label="Primary"
      className="glass-bottom fixed inset-x-0 bottom-0 z-50 pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <div className="mx-auto flex h-16 max-w-md items-stretch justify-around px-2">
        {tabs.map(({ to, label, icon: Icon, end }) => {
          const active = end ? pathname === to : pathname.startsWith(to);
          return (
            <NavLink
              key={to}
              to={to}
              end={end}
              className="relative flex flex-1 flex-col items-center justify-center gap-0.5"
            >
              {active && (
                <motion.span
                  layoutId="tab-dot"
                  transition={springs.layout}
                  className="absolute top-1.5 h-1 w-1 rounded-pill bg-terracotta"
                />
              )}
              <Icon
                size={20}
                className={clsx(
                  'transition-colors',
                  active ? 'text-terracotta' : 'text-muted'
                )}
              />
              <span
                className={clsx(
                  'text-[10px] font-medium',
                  active ? 'text-ink' : 'text-muted'
                )}
              >
                {label}
              </span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
