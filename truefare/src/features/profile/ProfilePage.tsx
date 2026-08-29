import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { Check, CloudOff, CloudUpload, MapPin } from 'lucide-react';
import clsx from 'clsx';
import { pageEnter, springs } from '../../design/motion';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { Chip } from '../../components/ui/Chip';
import { getDataStore } from '../../lib/datastore';
import { FEE_RULES_V1 } from '../pricing/rules/v1';
import { useAuth } from '../auth/AuthContext';
import type { Dietary, MembershipId, MetroId } from '../catalog/types';
import { useProfileStore, type Theme } from './store';

const METROS = Object.values(FEE_RULES_V1.metros);
const DIETARY: Dietary[] = ['vegetarian', 'vegan', 'gluten-free', 'halal', 'dairy-free'];

const MEMBERSHIPS: { id: MembershipId; label: string; blurb: string }[] = [
  { id: 'dashpass', label: 'DashPass', blurb: '$0 delivery over $12 · 5% service fee on DoorDash' },
  { id: 'uber_one', label: 'Uber One', blurb: '$0 delivery over $15 · 10% off on Uber Eats & Postmates' },
  { id: 'grubhub_plus', label: 'Grubhub+', blurb: '$0 delivery over $12 · reduced service fees on Grubhub' },
];

export default function ProfilePage() {
  const metroId = useProfileStore((s) => s.metroId);
  const setMetro = useProfileStore((s) => s.setMetro);
  const memberships = useProfileStore((s) => s.memberships);
  const toggleMembership = useProfileStore((s) => s.toggleMembership);
  const hasAmazonPrime = useProfileStore((s) => s.hasAmazonPrime);
  const setAmazonPrime = useProfileStore((s) => s.setAmazonPrime);
  const dietary = useProfileStore((s) => s.dietary);
  const toggleDietary = useProfileStore((s) => s.toggleDietary);
  const theme = useProfileStore((s) => s.theme);
  const setTheme = useProfileStore((s) => s.setTheme);
  const displayName = useProfileStore((s) => s.displayName);
  const { configured, session } = useAuth();

  // Mirror preferences to the account when signed in (debounced).
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (!session) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void getDataStore()
        .saveProfile({ displayName, metroId, dietary, memberships })
        .catch(() => {});
    }, 800);
    return () => clearTimeout(timer.current);
  }, [session, displayName, metroId, dietary, memberships]);

  return (
    <motion.div {...pageEnter} className="mx-auto max-w-3xl">
      <h1 className="py-4 text-4xl font-semibold">Profile</h1>

      {/* Account / data mode */}
      <section className="rounded-cell border border-hairline bg-surface p-6 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {session ? (
              <CloudUpload size={18} className="text-sage" aria-hidden="true" />
            ) : (
              <CloudOff size={18} className="text-muted" aria-hidden="true" />
            )}
            <div>
              <p className="text-[14px] font-semibold text-ink">
                {session ? session.user.email : 'Guest mode'}
              </p>
              <p className="text-[12px] text-muted">
                {session
                  ? 'Synced to your account across devices'
                  : 'Your data stays in this browser'}
              </p>
            </div>
          </div>
          <Link
            to="/auth"
            className="rounded-pill border border-hairline px-4 py-2 text-[13px] font-medium text-ink transition-colors hover:bg-blush"
          >
            {session ? 'Manage account' : configured ? 'Sign in' : 'About guest mode'}
          </Link>
        </div>
      </section>

      {/* City */}
      <section className="mt-6" aria-labelledby="city-heading">
        <h2 id="city-heading" className="text-2xl font-semibold">
          Your city
        </h2>
        <p className="mt-1 text-[13px] text-muted">
          Taxes and regulatory fees change the winner — quotes always use your city's rules.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {METROS.map((metro) => {
            const active = metro.id === metroId;
            const regCount = Object.values(metro.regulatory).flat().length;
            return (
              <motion.button
                key={metro.id}
                whileTap={{ scale: 0.97 }}
                transition={springs.snappy}
                onClick={() => setMetro(metro.id as MetroId)}
                aria-pressed={active}
                className={clsx(
                  'rounded-card border p-4 text-left transition-colors',
                  active
                    ? 'border-terracotta bg-blush/70'
                    : 'border-hairline bg-surface hover:bg-blush/40'
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-ink">
                    <MapPin size={13} className="text-terracotta" aria-hidden="true" />
                    {metro.label}
                  </span>
                  {active && <Check size={15} className="text-terracotta" aria-hidden="true" />}
                </div>
                <p className="tabular mt-1.5 text-[12px] text-muted">
                  {(metro.taxRate * 100).toFixed(2)}% tax
                  {metro.feesTaxable ? ' · fees taxed' : ''}
                  {regCount > 0 &&
                    ` · ${regCount} regulatory fee${regCount > 1 ? 's' : ''}`}
                </p>
              </motion.button>
            );
          })}
        </div>
      </section>

      {/* Memberships */}
      <section className="mt-8" aria-labelledby="memberships-heading">
        <h2 id="memberships-heading" className="text-2xl font-semibold">
          Memberships
        </h2>
        <p className="mt-1 text-[13px] text-muted">
          Tell TrueFare what you already pay for — totals and winners respect them.
        </p>
        <div className="mt-4 space-y-2.5">
          {MEMBERSHIPS.map((m) => {
            const viaPrime = m.id === 'grubhub_plus' && hasAmazonPrime;
            const active = memberships.includes(m.id) || viaPrime;
            return (
              <div
                key={m.id}
                className="flex items-center justify-between gap-4 rounded-card border border-hairline bg-surface px-4 py-3.5 shadow-card"
              >
                <div>
                  <p className="text-[14px] font-semibold text-ink">
                    {m.label}
                    {viaPrime && (
                      <span className="ml-2 rounded-pill bg-pistachio px-2 py-0.5 text-[11px] font-semibold text-savings">
                        free with Prime
                      </span>
                    )}
                  </p>
                  <p className="text-[12px] text-muted">{m.blurb}</p>
                </div>
                <button
                  role="switch"
                  aria-checked={active}
                  aria-label={`Toggle ${m.label}`}
                  disabled={viaPrime}
                  onClick={() => toggleMembership(m.id)}
                  className={clsx(
                    'relative h-6 w-11 shrink-0 rounded-pill transition-colors disabled:opacity-70',
                    active ? 'bg-sage' : 'bg-ink/15'
                  )}
                >
                  <motion.span
                    layout
                    transition={springs.snappy}
                    className={clsx(
                      'absolute top-0.5 h-5 w-5 rounded-pill bg-surface shadow-card',
                      active ? 'right-0.5' : 'left-0.5'
                    )}
                  />
                </button>
              </div>
            );
          })}
          <label className="flex cursor-pointer items-center gap-2.5 px-1 pt-1 text-[13px] text-muted">
            <input
              type="checkbox"
              checked={hasAmazonPrime}
              onChange={(e) => setAmazonPrime(e.target.checked)}
              className="h-4 w-4 accent-[#C4502F]"
            />
            I have Amazon Prime (includes Grubhub+ at no cost)
          </label>
        </div>
      </section>

      {/* Dietary */}
      <section className="mt-8" aria-labelledby="dietary-heading">
        <h2 id="dietary-heading" className="text-2xl font-semibold">
          Dietary
        </h2>
        <p className="mt-1 text-[13px] text-muted">
          Hard filters — recommendations never show what you can't eat.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {DIETARY.map((d) => (
            <Chip key={d} active={dietary.includes(d)} onClick={() => toggleDietary(d)}>
              {d}
            </Chip>
          ))}
        </div>
      </section>

      {/* Theme */}
      <section className="mt-8 pb-8" aria-labelledby="theme-heading">
        <h2 id="theme-heading" className="text-2xl font-semibold">
          Appearance
        </h2>
        <div className="mt-4">
          <SegmentedControl<Theme>
            ariaLabel="Theme"
            layoutId="theme-pill"
            options={[
              { value: 'light', label: 'Light' },
              { value: 'system', label: 'System' },
              { value: 'dark', label: 'Dark' },
            ]}
            value={theme}
            onChange={setTheme}
          />
        </div>
      </section>
    </motion.div>
  );
}
