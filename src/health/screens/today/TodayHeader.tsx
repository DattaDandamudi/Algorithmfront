/**
 * Today header — SPEC §1 hierarchy #1: the date as the screen's one display
 * heading, a day-type pill from the training split ("Upper day" / "Rest day"),
 * and the header banners chosen by screens/today/banners.ts (physician
 * escalation → storage/backup → retest, at most two). Banner actions deep-link
 * into a Settings section; dismissals are persisted by the screen (per
 * marker+value, or a 7-day backup snooze). Type on the ground, no card.
 */
import { Dumbbell, Moon } from 'lucide-react';
import type { SessionType } from '../../data/types';
import type { SettingsSection } from '../../nav';
import { formatDateLong } from '../../lib/dates';
import { Banner } from '../../ui';
import type { TodayBanner } from './banners';

/** Split slot → its display word. Shared with the training tile. */
export const SESSION_LABEL: Record<SessionType, string> = {
  upper: 'Upper',
  lower: 'Lower',
  push: 'Push',
  pull: 'Pull',
  legs: 'Legs',
  full: 'Full body',
  cardio: 'Cardio',
  rest: 'Rest',
};

export function dayTypeLabel(dayType: 'lift' | 'rest', session: SessionType): string {
  if (dayType === 'lift') return `${SESSION_LABEL[session] ?? 'Session'} day`;
  return session === 'cardio' ? 'Cardio day' : 'Rest day';
}

export interface TodayHeaderProps {
  today: string;
  dayType: 'lift' | 'rest';
  session: SessionType;
  banners: TodayBanner[];
  onOpenSettings: (section: SettingsSection) => void;
  onDismissBanner: (banner: TodayBanner) => void;
}

export default function TodayHeader({ today, dayType, session, banners, onOpenSettings, onDismissBanner }: TodayHeaderProps) {
  const lift = dayType === 'lift';

  return (
    <>
      <header className="sticky top-0 z-20 bg-hx-base/90 backdrop-blur px-4 pt-5 pb-3 flex items-center justify-between gap-3">
        <h1 className="hx-display text-[22px] leading-7 font-semibold text-hx-text truncate">{formatDateLong(today)}</h1>
        <span
          className={`inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border text-[13px] font-medium whitespace-nowrap ${
            lift ? 'bg-hx-blue/15 text-hx-blue border-hx-blue/40' : 'hx-well text-hx-text2 border-hx-border'
          }`}
        >
          {lift ? <Dumbbell className="w-4 h-4" aria-hidden /> : <Moon className="w-4 h-4" aria-hidden />}
          {dayTypeLabel(dayType, session)}
        </span>
      </header>
      {banners.length > 0 && (
        <div className="px-4 pb-3 flex flex-col gap-2" aria-label="Notices">
          {banners.map((b) => (
            <Banner
              key={b.id}
              kind={b.tone}
              action={{ label: b.action.label, onClick: () => onOpenSettings(b.action.target) }}
              onDismiss={b.dismiss ? () => onDismissBanner(b) : undefined}
            >
              {b.kind === 'escalation' && <span className="font-semibold">Physician follow-up: </span>}
              {b.message}
            </Banner>
          ))}
        </div>
      )}
    </>
  );
}
