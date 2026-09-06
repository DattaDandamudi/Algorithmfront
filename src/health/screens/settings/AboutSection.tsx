/**
 * Settings §9 — About: versions, the evidence anchors behind the rules the
 * app applies (SPEC §6 / Section 2), and the medical disclaimer. The anchor
 * list is the spec's constants; the user's *current* values for the editable
 * ones live in Targets, so the caption says so rather than repeating them.
 */
import { DISCLAIMER } from '../../ai/guardrails';
import { SCHEMA_VERSION } from '../../data/types';
import { ENGINE_VERSION } from '../../engine/context';
import { KV, Note, SubHeading } from './fields';

/** Bump with user-visible releases of the health app (independent of the host repo's package version). */
export const APP_VERSION = '1.0.0';

const ANCHORS: Array<{ title: string; body: string }> = [
  { title: 'Readiness bands', body: 'Mirror WHOOP recovery: green ≥ 67 %, yellow 34–66 %, red < 34 %. WHOOP recovery drives the ring when present; otherwise the HRV band does.' },
  { title: 'Weight trend', body: 'EWMA with α = 0.10 (Hacker’s Diet default, ≈ 20-day smoothing), adjustable 0.10–0.25. Weekly rate targets 0.5–1.0 % of body weight per week; trust the trend, never one weigh-in.' },
  { title: 'Expenditure', body: 'MacroFactor pattern: TDEE ≈ mean intake − Δtrend × 3,500 kcal/lb ÷ days, recalibrated weekly, valid only with ≥ 5 weigh-ins in the week, nudged in 100–200 kcal steps.' },
  { title: 'HRV baseline', body: 'ln(rMSSD) 7-day rolling mean; smallest worthwhile change (SWC) = mean ± 0.5 SD (Plews / Buchheit). Balanced inside, Low below, Unbalanced when the CV drifts.' },
  { title: 'Sleep need', body: 'WHOOP model: baseline + f(strain) + f(debt) − naps. Bedtime regularity (7-day SD > 30–60 min) matters more than one long night.' },
  { title: 'Protein per meal', body: '0.4–0.55 g/kg per meal across ≥ 4 meals (Schoenfeld & Aragon) — ~31–43 g per meal at 78 kg — with protein remaining shown first.' },
  { title: 'Fat floor', body: '60 g/day (~0.77 g/kg) is a hard floor for sex-hormone and fat-soluble-vitamin support; calorie cuts never go below it.' },
  { title: 'Carbs, fiber, water', body: 'Carb cycling 150–175 g on lift days / 70–100 g on rest days, 30 g fiber, 30–35 ml/kg water plus more on high-strain days.' },
  { title: 'Labs', body: 'Vitamin D, ferritin, omega-3 index, zinc and testosterone get general ranges and retest reminders only; elevated blood lead escalates to a physician.' },
];

export default function AboutSection() {
  return (
    <>
      <div>
        <KV k="App" v={`Pulse v${APP_VERSION}`} />
        <KV k="Engine" v={`v${ENGINE_VERSION}`} />
        <KV k="Data schema" v={`v${SCHEMA_VERSION}`} />
        <KV k="Build" v={import.meta.env.MODE === 'production' ? 'production' : import.meta.env.MODE} />
        <KV k="Storage" v="localStorage · month shards" />
      </div>

      <SubHeading>Evidence anchors</SubHeading>
      <Note className="text-hx-muted -mt-2">The rules the tiles, insights and coach apply. Editable values (targets, α, split) live in the sections above.</Note>
      <ul className="space-y-3">
        {ANCHORS.map((a) => (
          <li key={a.title} className="text-[13px] leading-5">
            <span className="font-semibold text-hx-text">{a.title}. </span>
            <span className="text-hx-text2">{a.body}</span>
          </li>
        ))}
      </ul>

      <SubHeading>Medical disclaimer</SubHeading>
      <Note>
        {DISCLAIMER} This app gives wellness information from your own logged numbers. It never diagnoses, prescribes, or interprets labs as disease, and it is not a substitute for professional medical advice.
        If something feels acutely wrong — chest pain, fainting, trouble breathing — stop and seek care.
      </Note>
    </>
  );
}
