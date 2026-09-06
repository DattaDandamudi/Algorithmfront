import { Sparkles, Zap } from 'lucide-react';
import { useHealth } from '../data/store';

/** First-run choice: start fresh or explore with 45 days of demo data. */
export default function Onboarding() {
  const { actions } = useHealth();
  return (
    <div className="min-h-dvh flex flex-col px-6 pt-16 pb-10">
      <div className="flex-1">
        <div className="w-12 h-12 rounded-2xl bg-hx-card border border-hx-border flex items-center justify-center mb-6">
          <Zap className="w-6 h-6 text-hx-green" aria-hidden />
        </div>
        <h1 className="text-[32px] leading-9 font-semibold tracking-tight">Pulse</h1>
        <p className="mt-3 text-hx-text2 text-[15px] leading-6">
          One readiness ring, protein-first macros, an EWMA weight trend, and a coach that only ever cites your own numbers.
          Everything stays in this browser — nothing is sent anywhere unless you connect an AI key.
        </p>
        <ul className="mt-8 space-y-3 text-[14px] text-hx-text2">
          <li className="flex gap-3">
            <span className="text-hx-green">●</span> Readiness mirrors WHOOP recovery bands (green ≥67, yellow 34–66, red &lt;34).
          </li>
          <li className="flex gap-3">
            <span className="text-hx-yellow">●</span> Logging takes seconds: type a meal, repeat yesterday, or tap a favorite.
          </li>
          <li className="flex gap-3">
            <span className="text-hx-blue">●</span> Trends need ~30 days of data before baselines and expenditure are trustworthy.
          </li>
        </ul>
      </div>
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => actions.loadDemoData()}
          className="w-full h-14 rounded-2xl bg-hx-text text-hx-base font-semibold text-[15px] flex items-center justify-center gap-2 active:scale-[0.99] transition"
        >
          <Sparkles className="w-4 h-4" aria-hidden /> Explore with 45 days of demo data
        </button>
        <button
          type="button"
          onClick={() => actions.setSettings({ onboarded: true })}
          className="w-full h-14 rounded-2xl bg-hx-card border border-hx-border text-hx-text font-medium text-[15px] active:scale-[0.99] transition"
        >
          Start fresh
        </button>
        <p className="text-center text-[12px] text-hx-muted pt-2">Wellness information only — not medical advice.</p>
      </div>
    </div>
  );
}
