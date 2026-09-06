/**
 * Settings — SPEC §5 and §10. Twelve collapsible cards, top → bottom:
 *   1 Profile & goals   2 Targets    3 Training split  4 Training
 *   5 Daily check-in    6 Bloodwork  7 Food preferences
 *   8 WHOOP             9 Imports   10 Coach & AI     11 Data     12 About
 *
 * Every section reads/writes the store directly (`useHealth()`); this file
 * only composes them, supplies the shared clock (`useNow()` → today / now for
 * relative times and retest math) and hosts the single confirmation sheet
 * (`ConfirmProvider`) every destructive action awaits. All section and field
 * components are module-level, so inputs never remount while typing.
 *
 * Training, Daily check-in and Imports landed in Phase 2e: the progression
 * rule and the advisory volume table, the Hooper prompt's on/off and item
 * choice, and the three workout imports (the Apple export is streamed in
 * chunks by settings/appleStream, never read whole).
 *
 * The Data card opens by default when the durability layer has something to
 * say (quota warning, failed write, integrity problems, or a JSON backup
 * older than 14 days — §10 "prompt periodic export", review R2-6) — that is
 * where the Today header's "Open Settings" banner sends the user.
 *
 * Deep links: `nav.openSettings(section)` (Trends' "Open Settings" → WHOOP,
 * the coach status pill → Coach & AI) is consumed once here and handed to the
 * matching <Section> as a nonce so it expands and scrolls into view (R2-10).
 */
import { useEffect, useState } from 'react';
import { Bot, ClipboardCheck, Database, Dumbbell, FileUp, FlaskConical, Info, SlidersHorizontal, Target, User, Utensils, Watch } from 'lucide-react';
import { useHealth, useRecords, useWorkouts, useNow } from '../data/store';
import { toISODate } from '../lib/dates';
import { useNav, type SettingsSection } from '../nav';
import AboutSection from './settings/AboutSection';
import BloodworkSection from './settings/BloodworkSection';
import CheckInSection from './settings/CheckInSection';
import CoachSection from './settings/CoachSection';
import { ConfirmProvider } from './settings/confirm';
import DataSection from './settings/DataSection';
import FoodSection from './settings/FoodSection';
import ImportsSection from './settings/ImportsSection';
import ProfileSection from './settings/ProfileSection';
import SplitSection from './settings/SplitSection';
import TargetsSection from './settings/TargetsSection';
import TrainingSection from './settings/TrainingSection';
import WhoopSection from './settings/WhoopSection';
import {
  aboutCaption,
  bloodworkCaption,
  checkInCaption,
  coachCaption,
  dataCaption,
  foodCaption,
  importsCaption,
  profileCaption,
  splitCaption,
  targetsCaption,
  trainingCaption,
  whoopCaption,
} from './settings/captions';
import { Section } from './settings/fields';
import { backupOverdue } from './settings/util';

export default function Settings() {
  const { state } = useHealth();
  const records = useRecords();
  const workouts = useWorkouts();
  const nowDate = useNow();
  const { settingsSection, consumeSettingsSection } = useNav();
  const [focus, setFocus] = useState<{ section: SettingsSection; nonce: number } | null>(null);
  useEffect(() => {
    if (!settingsSection) return;
    setFocus((f) => ({ section: settingsSection, nonce: (f?.nonce ?? 0) + 1 }));
    consumeSettingsSection();
  }, [settingsSection, consumeSettingsSection]);
  const signal = (section: SettingsSection) => (focus?.section === section ? focus.nonce : undefined);
  // Minute-resolution clock (useNow ticks once a minute): relative times and "today" need nothing finer.
  const now = nowDate.getTime();
  const today = toISODate(nowDate);
  const { settings, storage } = state;

  const storageNeedsAttention =
    !storage.available ||
    !!storage.lastError ||
    storage.quotaWarning ||
    (storage.integrity?.problems.length ?? 0) > 0 ||
    backupOverdue(settings.lastExportAt, records.length, now);

  return (
    <ConfirmProvider>
      <div className="flex flex-col">
        <header className="sticky top-0 z-20 bg-hx-base/95 backdrop-blur px-4 pt-4 pb-3">
          <h1 className="text-[17px] leading-6 font-semibold text-hx-text">Settings</h1>
          <p className="text-[12px] leading-4 text-hx-muted">Saves as you edit · stored only in this browser</p>
        </header>

        <div className="px-4 pt-1 pb-5 flex flex-col gap-3">
          <Section id="hx-set-profile" title="Profile & goals" icon={<User aria-hidden />} caption={profileCaption(settings)} defaultOpen openSignal={signal('profile')}>
            <ProfileSection />
          </Section>

          <Section id="hx-set-targets" title="Targets" icon={<Target aria-hidden />} caption={targetsCaption(settings)} openSignal={signal('targets')}>
            <TargetsSection />
          </Section>

          <Section id="hx-set-split" title="Training split" icon={<Dumbbell aria-hidden />} caption={splitCaption(settings)} openSignal={signal('split')}>
            <SplitSection />
          </Section>

          <Section id="hx-set-training" title="Training" icon={<SlidersHorizontal aria-hidden />} caption={trainingCaption(settings)} openSignal={signal('training')}>
            <TrainingSection />
          </Section>

          <Section id="hx-set-checkin" title="Daily check-in" icon={<ClipboardCheck aria-hidden />} caption={checkInCaption(settings)} openSignal={signal('checkin')}>
            <CheckInSection />
          </Section>

          <Section id="hx-set-bloodwork" title="Bloodwork" icon={<FlaskConical aria-hidden />} caption={bloodworkCaption(settings, today)} openSignal={signal('bloodwork')}>
            <BloodworkSection today={today} />
          </Section>

          <Section id="hx-set-food" title="Food preferences" icon={<Utensils aria-hidden />} caption={foodCaption(settings)} openSignal={signal('food')}>
            <FoodSection />
          </Section>

          <Section id="hx-set-whoop" title="WHOOP" icon={<Watch aria-hidden />} caption={whoopCaption(settings, now)} openSignal={signal('whoop')}>
            <WhoopSection today={today} now={now} />
          </Section>

          <Section id="hx-set-imports" title="Imports" icon={<FileUp aria-hidden />} caption={importsCaption(settings, workouts.length, now)} openSignal={signal('imports')}>
            <ImportsSection now={now} />
          </Section>

          <Section id="hx-set-coach" title="Coach & AI" icon={<Bot aria-hidden />} caption={coachCaption(settings)} openSignal={signal('coach')}>
            <CoachSection />
          </Section>

          <Section id="hx-set-data" title="Data" icon={<Database aria-hidden />} caption={dataCaption(storage, records, now)} defaultOpen={storageNeedsAttention} openSignal={signal('data')}>
            <DataSection now={now} />
          </Section>

          <Section id="hx-set-about" title="About" icon={<Info aria-hidden />} caption={aboutCaption()} openSignal={signal('about')}>
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
