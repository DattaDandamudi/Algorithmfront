/**
 * Today header — SPEC §1 hierarchy #1: the date, a day-type chip from the
 * training split ("Lift · Upper" / "Rest"), and the header banners chosen by
 * screens/today/banners.ts (physician escalation → storage/backup → retest,
 * at most two). Banner actions deep-link into a Settings section; dismissals
 * are persisted by the screen (per marker+value, or a 7-day backup snooze).
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
  if (dayType === 'lift') return `Lift · ${SESSION_LABEL[session] ?? 'Session'}`;
  return session === 'cardio' ? 'Cardio' : 'Rest';
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
      <header className="sticky top-0 z-20 bg-hx-base/95 backdrop-blur px-4 pt-4 pb-3 flex items-center justify-between gap-3">
        <h1 className="text-[17px] leading-6 font-semibold text-hx-text truncate">{formatDateLong(today)}</h1>
        <span
          className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-[13px] font-medium whitespace-nowrap ${
            lift ? 'bg-hx-blue/15 text-hx-blue border-hx-blue/40' : 'bg-hx-card2 text-hx-text2 border-hx-border'
          }`}
        >
          {lift ? <Dumbbell className="w-4 h-4" aria-hidden /> : <Moon className="w-4 h-4" aria-hidden />}
          {dayTypeLabel(dayType, session)}
        </span>
      </header>
      {banners.length > 0 && (
        <div className="px-4 pb-2 flex flex-col gap-2" aria-label="Notices">
          {banners.map((b) => (
            <Banner
              key={b.id}
              kind={b.tone}
              action={{ label: b.action.label, onClick: () => onOpenSettings(b.action.target) }}
              onDismiss={b.dismiss ? () => onDismissBanner(b) : undefined}
            >
              {b.kind === 'escalation' && <span className="font-semibold">Physician follow-up · </span>}
              {b.message}
            </Banner>
          ))}
        </div>
      )}
    </>
  );
}
