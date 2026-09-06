/**
 * Settings — SPEC §5 and §10. Nine collapsible cards, top → bottom:
 *   1 Profile & goals   2 Targets   3 Training split   4 Bloodwork
 *   5 Food preferences  6 WHOOP     7 Coach & AI       8 Data      9 About
 *
 * Every section reads/writes the store directly (`useHealth()`); this file
 * only composes them, supplies the shared clock (`useNow()` → today / now for
 * relative times and retest math) and hosts the single confirmation sheet
 * (`ConfirmProvider`) every destructive action awaits. All section and field
 * components are module-level, so inputs never remount while typing.
 *
 * The Data card opens by default when the durability layer has something to
 * say (quota warning, failed write, integrity problems) — that is where the
 * Today header's "Open Settings" banner sends the user.
 */
import { Bot, Database, Dumbbell, FlaskConical, Info, Target, User, Utensils, Watch } from 'lucide-react';
import { useHealth, useRecords, useNow } from '../data/store';
import { toISODate } from '../lib/dates';
import AboutSection from './settings/AboutSection';
import BloodworkSection from './settings/BloodworkSection';
import CoachSection from './settings/CoachSection';
import { ConfirmProvider } from './settings/confirm';
import DataSection from './settings/DataSection';
import FoodSection from './settings/FoodSection';
import ProfileSection from './settings/ProfileSection';
import SplitSection from './settings/SplitSection';
import TargetsSection from './settings/TargetsSection';
import WhoopSection from './settings/WhoopSection';
import { aboutCaption, bloodworkCaption, coachCaption, dataCaption, foodCaption, profileCaption, splitCaption, targetsCaption, whoopCaption } from './settings/captions';
import { Section } from './settings/fields';

export default function Settings() {
  const { state } = useHealth();
  const records = useRecords();
  const nowDate = useNow();
  // Minute-resolution clock (useNow ticks once a minute): relative times and "today" need nothing finer.
  const now = nowDate.getTime();
  const today = toISODate(nowDate);
  const { settings, storage } = state;

  const storageNeedsAttention = !storage.available || !!storage.lastError || storage.quotaWarning || (storage.integrity?.problems.length ?? 0) > 0;

  return (
    <ConfirmProvider>
      <div className="flex flex-col">
        <header className="sticky top-0 z-20 bg-hx-base/95 backdrop-blur px-4 pt-4 pb-3">
          <h1 className="text-[17px] leading-6 font-semibold text-hx-text">Settings</h1>
          <p className="text-[12px] leading-4 text-hx-muted">Saves as you edit · stored only in this browser</p>
        </header>

        <div className="px-4 pt-1 pb-5 flex flex-col gap-3">
          <Section id="hx-set-profile" title="Profile & goals" icon={<User aria-hidden />} caption={profileCaption(settings)} defaultOpen>
            <ProfileSection />
          </Section>

          <Section id="hx-set-targets" title="Targets" icon={<Target aria-hidden />} caption={targetsCaption(settings)}>
            <TargetsSection />
          </Section>

          <Section id="hx-set-split" title="Training split" icon={<Dumbbell aria-hidden />} caption={splitCaption(settings)}>
            <SplitSection />
          </Section>

          <Section id="hx-set-bloodwork" title="Bloodwork" icon={<FlaskConical aria-hidden />} caption={bloodworkCaption(settings, today)}>
            <BloodworkSection today={today} />
          </Section>

          <Section id="hx-set-food" title="Food preferences" icon={<Utensils aria-hidden />} caption={foodCaption(settings)}>
            <FoodSection />
          </Section>

          <Section id="hx-set-whoop" title="WHOOP" icon={<Watch aria-hidden />} caption={whoopCaption(settings, now)}>
            <WhoopSection today={today} now={now} />
          </Section>

          <Section id="hx-set-coach" title="Coach & AI" icon={<Bot aria-hidden />} caption={coachCaption(settings)}>
            <CoachSection />
          </Section>

          <Section id="hx-set-data" title="Data" icon={<Database aria-hidden />} caption={dataCaption(storage, records, now)} defaultOpen={storageNeedsAttention}>
            <DataSection now={now} />
          </Section>

          <Section id="hx-set-about" title="About" icon={<Info aria-hidden />} caption={aboutCaption()}>
            <AboutSection />
          </Section>
        </div>

        <footer className="px-4 pb-2 text-center">
          <p className="text-[11px] leading-4 text-hx-muted">Wellness information only — not medical advice.</p>
        </footer>
      </div>
    </ConfirmProvider>
  );
}
