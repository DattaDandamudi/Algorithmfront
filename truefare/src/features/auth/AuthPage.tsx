import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowLeft, KeyRound } from 'lucide-react';
import { pageEnter } from '../../design/motion';
import { Button } from '../../components/ui/Button';
import { useAuth } from './AuthContext';

const inputCls =
  'h-11 w-full rounded-control border border-hairline bg-surface px-3.5 text-[14px] text-ink outline-none transition-colors placeholder:text-muted/60 focus:border-terracotta';

export default function AuthPage() {
  const { configured, session, signIn, signUp, signInWithGoogle, signOut } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  if (!configured) {
    return (
      <motion.div {...pageEnter} className="mx-auto max-w-md py-10 text-center">
        <div className="blob blob-breathe mx-auto h-20 w-20 bg-pistachio" />
        <h1 className="mt-5 text-3xl font-semibold">Guest mode</h1>
        <p className="mt-3 text-[14px] leading-relaxed text-muted">
          TrueFare is running without a backend — your cart, orders, and taste
          profile live safely in this browser. To enable accounts and
          cross-device history, add <code className="rounded bg-blush px-1.5 py-0.5 text-[12px]">VITE_SUPABASE_URL</code>{' '}
          and <code className="rounded bg-blush px-1.5 py-0.5 text-[12px]">VITE_SUPABASE_ANON_KEY</code>{' '}
          to <code className="rounded bg-blush px-1.5 py-0.5 text-[12px]">.env</code> and apply the
          bundled migrations.
        </p>
        <Link
          to="/profile"
          className="mt-6 inline-flex items-center gap-1.5 font-medium text-terracotta"
        >
          <ArrowLeft size={15} aria-hidden="true" /> Back to profile
        </Link>
      </motion.div>
    );
  }

  if (session) {
    return (
      <motion.div {...pageEnter} className="mx-auto max-w-md py-10 text-center">
        <h1 className="text-3xl font-semibold">You're signed in</h1>
        <p className="mt-2 text-muted">{session.user.email}</p>
        <div className="mt-6 flex justify-center gap-3">
          <Button variant="ghost" onClick={() => signOut()}>
            Sign out
          </Button>
          <Button onClick={() => navigate('/profile')}>Go to profile</Button>
        </div>
      </motion.div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const err =
      mode === 'signin' ? await signIn(email, password) : await signUp(email, password);
    setBusy(false);
    if (err) setError(err);
    else navigate('/profile');
  };

  return (
    <motion.div {...pageEnter} className="mx-auto max-w-md py-8">
      <h1 className="text-center text-4xl font-semibold">
        {mode === 'signin' ? 'Welcome back' : 'Create your account'}
      </h1>
      <p className="mt-2 text-center text-[14px] text-muted">
        Sync your taste profile, orders and savings across devices.
      </p>

      <form onSubmit={submit} className="mt-8 space-y-3">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          aria-label="Email"
          className={inputCls}
        />
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          aria-label="Password"
          className={inputCls}
        />
        {error && <p className="text-[13px] text-terracotta">{error}</p>}
        <Button size="lg" className="w-full" disabled={busy} type="submit">
          <KeyRound size={16} aria-hidden="true" />
          {mode === 'signin' ? 'Sign in' : 'Sign up'}
        </Button>
      </form>

      <div className="my-5 flex items-center gap-3 text-[12px] text-muted">
        <span className="h-px flex-1 bg-ink/10" /> or <span className="h-px flex-1 bg-ink/10" />
      </div>

      <Button
        variant="ghost"
        size="lg"
        className="w-full"
        onClick={async () => setError(await signInWithGoogle())}
      >
        Continue with Google
      </Button>

      <p className="mt-6 text-center text-[13px] text-muted">
        {mode === 'signin' ? 'New to TrueFare?' : 'Already have an account?'}{' '}
        <button
          onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
          className="font-medium text-terracotta"
        >
          {mode === 'signin' ? 'Create an account' : 'Sign in'}
        </button>
      </p>
    </motion.div>
  );
}
