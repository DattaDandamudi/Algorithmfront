import { useEffect, useRef, useState } from 'react';
import { Sparkles, Mic, BarChart3, Settings, LogOut, LogIn, ArrowLeft } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export type Page = 'studio' | 'dashboard' | 'settings';

interface HeaderProps {
  currentPage: Page;
  onPageChange: (page: Page) => void;
  user: User | null;
  demoMode?: boolean;
  onExitDemo?: () => void;
  onSignIn?: () => void;
  onCrafted?: () => void;
}

const NAV_ITEMS: { key: Page; label: string; icon: typeof Mic }[] = [
  { key: 'studio', label: 'Studio', icon: Mic },
  { key: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { key: 'settings', label: 'Settings', icon: Settings },
];

function getDisplayName(user: User | null): string {
  if (!user) return '';
  const meta = user.user_metadata as Record<string, string> | undefined;
  return meta?.full_name || meta?.name || user.email || '';
}

function getInitial(user: User | null): string {
  const name = getDisplayName(user);
  return name.charAt(0).toUpperCase() || 'U';
}

function getAvatarUrl(user: User | null): string | null {
  if (!user) return null;
  const meta = user.user_metadata as Record<string, string> | undefined;
  return meta?.avatar_url || meta?.picture || null;
}

export default function Header({
  currentPage,
  onPageChange,
  user,
  demoMode = false,
  onExitDemo,
  onSignIn,
  onCrafted,
}: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [menuOpen]);

  async function handleSignOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    setSigningOut(false);
    setMenuOpen(false);
  }

  const displayName = getDisplayName(user);
  const avatarUrl = getAvatarUrl(user);
  const navItems = demoMode ? NAV_ITEMS.filter((i) => i.key === 'studio') : NAV_ITEMS;

  return (
    <header className="flex items-center justify-between px-10 py-5">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-rose-400 flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        <div>
          <h1 className="text-[15px] font-semibold text-stone-800 tracking-tight leading-none">
            Algoritm
          </h1>
          <p className="text-[11px] text-stone-400 mt-0.5 tracking-wide">
            {demoMode ? 'Live preview' : 'Voice Agent Studio'}
          </p>
        </div>
      </div>

      <nav className="flex items-center bg-stone-100/60 rounded-full p-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onPageChange(item.key)}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-[13px] font-medium transition-all duration-300 ${
                isActive
                  ? 'bg-white text-stone-800 shadow-sm'
                  : 'text-stone-400 hover:text-stone-600'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {item.label}
            </button>
          );
        })}
        {demoMode && (
          <span className="ml-2 mr-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-amber-100 text-amber-700">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 live-dot" />
            Demo
          </span>
        )}
      </nav>

      {demoMode ? (
        <div className="flex items-center gap-2">
          {onCrafted && (
            <button
              type="button"
              onClick={onCrafted}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12.5px] font-medium text-stone-500 hover:text-stone-800 transition-colors"
            >
              Crafted by
            </button>
          )}
          <button
            type="button"
            onClick={onExitDemo}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12.5px] font-medium text-stone-500 hover:text-stone-800 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back
          </button>
          <button
            type="button"
            onClick={onSignIn}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12.5px] font-medium bg-stone-900 text-white hover:bg-stone-800 transition-all"
          >
            <LogIn className="w-3.5 h-3.5" />
            Sign in
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          {onCrafted && (
            <button
              type="button"
              onClick={onCrafted}
              className="hidden sm:inline-flex items-center px-3 py-1.5 rounded-full text-[12.5px] font-medium text-stone-500 hover:text-stone-800 transition-colors"
            >
              Crafted by
            </button>
          )}
          <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-2.5 pl-1 pr-3 py-1 rounded-full hover:bg-stone-100/60 transition-all"
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-stone-700 to-stone-900 flex items-center justify-center text-white text-[11px] font-semibold">
                {getInitial(user)}
              </div>
            )}
            <span className="text-[12.5px] font-medium text-stone-700 max-w-[140px] truncate hidden sm:inline">
              {displayName}
            </span>
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-2 w-60 bg-white border border-stone-100 rounded-2xl shadow-xl shadow-stone-200/50 overflow-hidden z-50">
              <div className="px-4 py-3 border-b border-stone-100">
                <p className="text-[12px] font-medium text-stone-800 truncate">{displayName}</p>
                {user?.email && user.email !== displayName && (
                  <p className="text-[11px] text-stone-400 truncate mt-0.5">{user.email}</p>
                )}
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[12.5px] font-medium text-stone-600 hover:bg-stone-50 hover:text-stone-900 transition-all disabled:opacity-50"
              >
                <LogOut className="w-3.5 h-3.5" />
                {signingOut ? 'Signing out...' : 'Sign out'}
              </button>
            </div>
          )}
        </div>
        </div>
      )}
    </header>
  );
}
