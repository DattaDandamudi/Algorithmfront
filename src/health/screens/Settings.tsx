/**
 * Settings — SPEC §5 and §10, set as the index page in DESIGN.md "Settings".
 *
 *  masthead      "Settings" in .hx-masthead, the save promise as the dateline
 *  index         twelve 56 px ledger rows divided by hairlines, each the
 *                disclosure button for its section, top to bottom:
 *                  1 Profile & goals   2 Targets    3 Training split  4 Training
 *                  5 Daily check-in    6 Bloodwork  7 Food preferences
 *                  8 WHOOP             9 Imports   10 Coach & AI     11 Data   12 About
 *  colophon      the medical line under a hairline
 *
 * No sticky header, no icons, no cards: the masthead scrolls with the page and
 * a section opens in place under its row. Every section reads/writes the store
 * directly (`useHealth()`); this file only composes them, supplies the shared
 * clock (`useNow()` for relative times and retest math) and hosts the single
 * confirmation sheet (`ConfirmProvider`) every destructive action awaits. All
 * section and field components are module-level, so inputs never remount while
 * typing.
 *
 * The Data section opens by default when the durability layer has something
 * to say (quota warning, failed write, integrity problems, or a JSON backup
 * older than 14 days, §10 "prompt periodic export", review R2-6): that is
 * where the Today notice "Open Settings" sends the user.
 *
 * Deep links: `nav.openSettings(section)` (Trends' "Open Settings" to WHOOP,
 * the coach status line to Coach & AI) is consumed once here and handed to the
 * matching <Section> as a nonce so it expands and scrolls into view (R2-10).
 */
import { useEffect, useState } from 'react';
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
      <div className="px-5 flex flex-col">
        <header className="pt-8 flex items-baseline justify-between gap-4">
          <h1 className="hx-masthead text-hx-text shrink-0">Settings</h1>
          <p className="hx-hedge min-w-0 flex-1 text-right">Saves as you edit, stored only in this browser.</p>
        </header>

        <div className="mt-6 flex flex-col">
          <Section id="hx-set-profile" title="Profile & goals" caption={profileCaption(settings)} openSignal={signal('profile')}>
            <ProfileSection />
          </Section>

          <Section id="hx-set-targets" title="Targets" caption={targetsCaption(settings)} openSignal={signal('targets')}>
            <TargetsSection />
          </Section>

          <Section id="hx-set-split" title="Training split" caption={splitCaption(settings)} openSignal={signal('split')}>
            <SplitSection />
          </Section>

          <Section id="hx-set-training" title="Training" caption={trainingCaption(settings)} openSignal={signal('training')}>
            <TrainingSection />
          </Section>

          <Section id="hx-set-checkin" title="Daily check-in" caption={checkInCaption(settings)} openSignal={signal('checkin')}>
            <CheckInSection />
          </Section>

          <Section id="hx-set-bloodwork" title="Bloodwork" caption={bloodworkCaption(settings, today)} openSignal={signal('bloodwork')}>
            <BloodworkSection today={today} />
          </Section>

          <Section id="hx-set-food" title="Food preferences" caption={foodCaption(settings)} openSignal={signal('food')}>
            <FoodSection />
          </Section>

          <Section id="hx-set-whoop" title="WHOOP" caption={whoopCaption(settings, now)} openSignal={signal('whoop')}>
            <WhoopSection today={today} now={now} />
          </Section>

          <Section id="hx-set-imports" title="Imports" caption={importsCaption(settings, workouts.length, now)} openSignal={signal('imports')}>
            <ImportsSection now={now} />
          </Section>

          <Section id="hx-set-coach" title="Coach & AI" caption={coachCaption(settings)} openSignal={signal('coach')}>
            <CoachSection />
          </Section>

          <Section id="hx-set-data" title="Data" caption={dataCaption(storage, records, now)} defaultOpen={storageNeedsAttention} openSignal={signal('data')}>
            <DataSection now={now} />
          </Section>

          <Section id="hx-set-about" title="About" caption={aboutCaption()} openSignal={signal('about')}>
            <AboutSection />
          </Section>
        </div>

        <div className="hx-hair mt-10" aria-hidden />
        <footer className="pt-3 pb-6">
          <p className="hx-hedge">Wellness information only, not medical advice.</p>
        </footer>
      </div>
    </ConfirmProvider>
  );
}
