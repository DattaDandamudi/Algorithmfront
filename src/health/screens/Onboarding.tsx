/**
 * Onboarding — the cover, then four steps (DESIGN.md "Onboarding").
 *
 * The cover: "Pulse" in .hx-cover, the deck, the data promise, and under one
 * ink rule a contents list of what the four steps set up. The choice is one
 * ink-key "Continue" and "Load demo data" as an outline key (that name is
 * what the render test and the browser probe click by). Each step page is a
 * small "Pulse" masthead, a ruled running head with the dateline "Step N of
 * 4" (the one honest count in the app), a lede, the underline fields from
 * ./OnboardingSteps, then Back as a ghost verb and Continue as the ink key.
 * The last Continue marks the profile onboarded; every field before it wrote
 * to the store as it was edited. No cards, no sticky header, no progress
 * dots, no motion on load. The medical line is the colophon on every page.
 */
import { useEffect, useRef, useState } from 'react';
import { useHealth } from '../data/store';
import { Button, SectionHeader } from '../ui';
import { ONBOARDING_STEPS, STEP_COUNT, stepDateline } from './onboardingPlan';
import OnboardingStep from './OnboardingSteps';

function Colophon() {
  return (
    <>
      <div className="hx-hair mt-10" aria-hidden />
      <p className="hx-hedge mt-3">Wellness information only, not medical advice.</p>
    </>
  );
}

function Cover({ onContinue, onDemo }: { onContinue: () => void; onDemo: () => void }) {
  return (
    <div className="min-h-dvh flex flex-col px-5 pt-16 pb-8">
      <h1 className="hx-cover text-hx-text">Pulse</h1>
      <p className="hx-deck text-hx-text mt-6">One readiness score, protein-first macros, a smoothed weight trend, and a coach that only ever cites your own numbers.</p>
      <p className="hx-body text-hx-text2 mt-4">Everything stays in this browser. Nothing is sent anywhere unless you add an AI key in Settings.</p>

      <SectionHeader title="Contents" caption="Four steps" className="mt-10" />
      <ol className="hx-ledger mt-1">
        {ONBOARDING_STEPS.map((s) => (
          <li key={s.id} className="hx-row flex-row items-baseline gap-4">
            <span className="hx-body w-36 shrink-0">{s.title}</span>
            <span className="hx-cap min-w-0 flex-1">{s.sets}</span>
          </li>
        ))}
      </ol>

      <div className="mt-auto pt-10 flex flex-col gap-3">
        <Button size="lg" fullWidth onClick={onContinue}>
          Continue
        </Button>
        <Button variant="secondary" size="lg" fullWidth onClick={onDemo}>
          Load demo data
        </Button>
        <p className="hx-cap">45 days of a sample athlete, so every page has something to read. Clear it any time from Settings.</p>
      </div>
      <Colophon />
    </div>
  );
}

/** First run: the cover, then the four steps; demo data skips the steps. */
export default function Onboarding() {
  const { actions } = useHealth();
  /** 0 is the cover; 1 to STEP_COUNT are the steps. */
  const [step, setStep] = useState(0);
  const head = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);

  // A page turn: back to the top, focus on the new running head so a screen
  // reader announces where it landed. Not on mount, where the cover is read from the top.
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    window.scrollTo(0, 0);
    head.current?.focus({ preventScroll: true });
  }, [step]);

  if (step === 0) return <Cover onContinue={() => setStep(1)} onDemo={() => actions.loadDemoData()} />;

  const s = ONBOARDING_STEPS[step - 1];
  const lastStep = step === STEP_COUNT;
  const next = () => {
    if (lastStep) actions.setSettings({ onboarded: true });
    else setStep(step + 1);
  };

  return (
    <div className="min-h-dvh flex flex-col px-5 pt-8 pb-8">
      <p className="hx-masthead text-hx-text">Pulse</p>
      <div ref={head} tabIndex={-1} className="mt-10 outline-none">
        <SectionHeader title={s.title} caption={stepDateline(step)} />
      </div>
      <p className="hx-body text-hx-text2 mt-4">{s.lede}</p>

      <div className="mt-6 flex flex-col gap-6">
        <OnboardingStep key={s.id} id={s.id} />
      </div>

      <div className="mt-10 flex items-center gap-6">
        <Button variant="ghost" size="lg" onClick={() => setStep(step - 1)}>
          Back
        </Button>
        <Button size="lg" onClick={next} className="flex-1">
          Continue
        </Button>
      </div>
      <Colophon />
    </div>
  );
}
