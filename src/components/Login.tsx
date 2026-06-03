import { useState } from 'react';
import { Sparkles, Mail, Lock, AlertCircle, Loader2, ArrowRight, ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Mode = 'signin' | 'signup';

interface LoginProps {
  onBack?: () => void;
}

export default function Login({ onBack }: LoginProps) {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data.user && !data.session) {
          setInfo('Account created. You can now sign in.');
          setMode('signin');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleAuth() {
    setError(null);
    setGoogleLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed.');
      setGoogleLoading(false);
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setInfo(null);
  }

  const isSignin = mode === 'signin';

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#fafaf8] flex items-center justify-center p-6 relative">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -left-32 w-[480px] h-[480px] rounded-full bg-gradient-to-br from-amber-200/40 to-transparent blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-[480px] h-[480px] rounded-full bg-gradient-to-tr from-rose-200/40 to-transparent blur-3xl" />
      </div>

      <div className="relative w-full max-w-[400px]">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="mb-4 inline-flex items-center gap-1.5 text-[12px] text-stone-500 hover:text-stone-800 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to home
          </button>
        )}
        <div className="flex flex-col items-center mb-10">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-rose-400 flex items-center justify-center mb-4 shadow-lg shadow-rose-200/50">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-[22px] font-semibold text-stone-800 tracking-tight">Samvaad</h1>
          <p className="text-[12px] text-stone-400 mt-1 tracking-wide">Voice Agent Studio</p>
        </div>

        <div className="bg-white border border-stone-100 rounded-3xl shadow-xl shadow-stone-200/30 p-8">
          <div className="mb-6">
            <h2 className="text-[18px] font-semibold text-stone-800 tracking-tight">
              {isSignin ? 'Welcome back' : 'Create your account'}
            </h2>
            <p className="text-[12.5px] text-stone-400 mt-1">
              {isSignin ? 'Sign in to continue to your studio.' : 'Get started in less than a minute.'}
            </p>
          </div>

          <button
            type="button"
            onClick={handleGoogleAuth}
            disabled={googleLoading || loading}
            className="w-full flex items-center justify-center gap-3 bg-white border border-stone-200 rounded-xl px-4 py-2.5 text-[13px] font-medium text-stone-700 hover:bg-stone-50 hover:border-stone-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {googleLoading ? (
              <Loader2 className="w-4 h-4 animate-spin text-stone-400" />
            ) : (
              <GoogleIcon />
            )}
            Continue with Google
          </button>

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-stone-100" />
            <span className="text-[10.5px] uppercase tracking-wider text-stone-400 font-medium">or</span>
            <div className="flex-1 h-px bg-stone-100" />
          </div>

          <form onSubmit={handleEmailAuth} className="space-y-3">
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-300" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                className="w-full bg-stone-50 border border-stone-100 rounded-xl pl-10 pr-3.5 py-2.5 text-[13px] text-stone-800 placeholder-stone-300 focus:outline-none focus:bg-white focus:border-stone-300 transition-all"
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-300" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isSignin ? 'Your password' : 'At least 6 characters'}
                autoComplete={isSignin ? 'current-password' : 'new-password'}
                className="w-full bg-stone-50 border border-stone-100 rounded-xl pl-10 pr-3.5 py-2.5 text-[13px] text-stone-800 placeholder-stone-300 focus:outline-none focus:bg-white focus:border-stone-300 transition-all"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
                <AlertCircle className="w-3.5 h-3.5 text-rose-400 mt-0.5 flex-shrink-0" />
                <p className="text-[12px] text-rose-600 leading-relaxed">{error}</p>
              </div>
            )}
            {info && (
              <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
                <p className="text-[12px] text-emerald-700 leading-relaxed">{info}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || googleLoading}
              className="w-full flex items-center justify-center gap-2 bg-stone-900 text-white rounded-xl px-4 py-2.5 text-[13px] font-medium hover:bg-stone-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-1"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  {isSignin ? 'Sign in' : 'Create account'}
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>

          <p className="text-[12px] text-stone-400 text-center mt-5">
            {isSignin ? "Don't have an account?" : 'Already have an account?'}{' '}
            <button
              type="button"
              onClick={() => switchMode(isSignin ? 'signup' : 'signin')}
              className="text-stone-700 font-medium hover:text-stone-900 transition-colors"
            >
              {isSignin ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>

        <p className="text-center text-[11px] text-stone-300 mt-6 tracking-wide">
          By continuing, you agree to our Terms and Privacy Policy.
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}
