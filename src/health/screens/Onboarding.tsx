/**
 * Onboarding — the first-run gate, and the one screen where the design allows
 * a little theatre: the instrument switching on (DESIGN.md "Motion").
 *
 * The theatre is a single decorative dial, wrapped in `aria-hidden` because it
 * reads nothing — it is the Ring's existing sweep and nothing more (no glow:
 * the phosphor is reserved for a real reading). Everything else is the quiet
 * gate: the product name in the display face, what the app is in one sentence,
 * what it promises about your data, and the choice — demo data as the primary
 * lume key, an empty log as the secondary path. Left-aligned, sentence case.
 *
 * Both buttons keep their exact labels and behaviour: `loadDemoData()` is the
 * accessible name the render tests and the Playwright probes click by.
 */
import { useHealth } from '../data/store';
import { Button, Ring } from '../ui';

/** Band words the first line names; the dots stay neutral because a colour here would mean nothing. */
const POINTS = [
  'Readiness mirrors WHOOP recovery bands (green ≥67, yellow 34–66, red <34).',
  'Logging takes seconds: type a meal, repeat yesterday, or tap a favorite.',
  'Trends need ~30 days of data before baselines and expenditure are trustworthy.',
];

/** First-run choice: start fresh or explore with 45 days of demo data. */
export default function Onboarding() {
  const { actions } = useHealth();
  return (
    <div className="min-h-dvh flex flex-col px-4 pt-12 pb-8 text-left">
      {/* Decorative: a dial at half sweep, no glow, hidden from assistive tech — it carries no reading. */}
      <div aria-hidden className="mb-6">
        <Ring value={50} band="neutral" size={120} stroke={12} glow={false} />
      </div>

      <h1 className="hx-display text-[36px] leading-10 font-semibold text-hx-text">Pulse</h1>
      <p className="mt-3 text-[15px] leading-[22px] text-hx-text2">
        One readiness ring, protein-first macros, an EWMA weight trend, and a coach that only ever cites your own numbers.
      </p>
      <p className="mt-2 text-[13px] leading-[18px] text-hx-muted">
        Everything stays in this browser — nothing is sent anywhere unless you connect an AI key.
      </p>

      <ul className="mt-7 flex flex-col gap-3">
        {POINTS.map((p) => (
          <li key={p} className="flex gap-2.5 text-[13px] leading-[18px] text-hx-text2">
            <span className="mt-[6px] w-1.5 h-1.5 rounded-full bg-hx-neutral shrink-0" aria-hidden />
            <span className="min-w-0">{p}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-10 flex flex-col gap-3">
        <Button size="lg" fullWidth onClick={() => actions.loadDemoData()}>
          Explore with 45 days of demo data
        </Button>
        <Button variant="secondary" size="lg" fullWidth onClick={() => actions.setSettings({ onboarded: true })}>
          Start fresh
        </Button>
        <p className="pt-1 text-[12px] leading-4 text-hx-muted">Wellness information only — not medical advice.</p>
      </div>
    </div>
  );
}
