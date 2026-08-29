import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { TopNav, BottomTabs } from './NavBar';
import { CartBar } from '../features/cart/CartBar';
import { ReplaceCartModal } from '../features/cart/ReplaceCartModal';
import { useProfileStore } from '../features/profile/store';

function useThemeClass() {
  const theme = useProfileStore((s) => s.theme);
  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches);
      root.classList.toggle('dark', dark);
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', dark ? '#191410' : '#FAF6EF');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);
  return null;
}

export default function AppShell() {
  useThemeClass();
  return (
    <div className="min-h-screen bg-ground">
      <ScrollToTop />
      <div className="grain-overlay" aria-hidden="true" />
      <TopNav />
      <main className="mx-auto max-w-6xl px-4 pb-28 pt-24 sm:px-6 md:pb-16">
        <Outlet />
      </main>
      <CartBar />
      <ReplaceCartModal />
      <BottomTabs />
    </div>
  );
}
