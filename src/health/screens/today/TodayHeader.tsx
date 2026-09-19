/**
 * Today masthead — the date in `.hx-head` flush left, the day type as a
 * `.hx-tag` flush right ("Upper day" / "Rest day" / "Cardio day"), then the
 * ink rule that draws left to right on mount (`.hx-rule-in`). No sticky
 * header: the masthead scrolls with the page. The notices chosen by
 * screens/today/banners.ts (physician escalation, storage or backup, retest;
 * at most two) follow the rule as notes; their actions deep-link into a
 * Settings section and their dismissals are persisted by the screen.
 */
import type { ISODate, SessionType } from '../../data/types';
import type { SettingsSection } from '../../nav';
import { parseISODate } from '../../lib/dates';
import { Banner } from '../../ui';
import type { TodayBanner } from './banners';

/** Split slot to its display word. Shared with the training fixture row. */
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

const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "Saturday 19 September" — the masthead date in full; the year is not news. */
export function mastheadDate(d: ISODate): string {
  const dt = parseISODate(d);
  return `${WEEKDAY_LONG[dt.getDay()]} ${dt.getDate()} ${MONTH_LONG[dt.getMonth()]}`;
}

export interface TodayHeaderProps {
  today: ISODate;
  dayType: 'lift' | 'rest';
  session: SessionType;
  banners: TodayBanner[];
  onOpenSettings: (section: SettingsSection) => void;
  onDismissBanner: (banner: TodayBanner) => void;
}

export default function TodayHeader({ today, dayType, session, banners, onOpenSettings, onDismissBanner }: TodayHeaderProps) {
  return (
    <>
      <header className="pt-5 pb-2 flex items-center justify-between gap-3">
        <h1 className="hx-head text-hx-text min-w-0">{mastheadDate(today)}</h1>
        <span className="hx-tag hx-label shrink-0">{dayTypeLabel(dayType, session)}</span>
      </header>
      <div className="hx-rule hx-rule-in" aria-hidden />
      {banners.length > 0 && (
        <div className="pt-4 flex flex-col gap-3" aria-label="Notices">
          {banners.map((b) => (
            <Banner
              key={b.id}
              kind={b.tone}
              lead={b.kind === 'escalation' ? 'Physician follow-up:' : undefined}
              action={{ label: b.action.label, onClick: () => onOpenSettings(b.action.target) }}
              onDismiss={b.dismiss ? () => onDismissBanner(b) : undefined}
            >
              {b.message}
            </Banner>
          ))}
        </div>
      )}
    </>
  );
}
