/**
 * Today header — SPEC §1 hierarchy #1: the date, a day-type chip from the
 * training split ("Lift · Upper" / "Rest"), and a storage warning when the
 * durability layer (§10) has something to say: quota above the 70 % warn
 * ratio, a failed write, or integrity problems found on load. The warning
 * links to Settings, where the integrity panel and export live.
 */
import { Dumbbell, Moon } from 'lucide-react';
import type { SessionType, StorageStatus } from '../../data/types';
import { QUOTA_BYTES } from '../../data/storage';
import { formatDateLong } from '../../lib/dates';
import { fmt } from '../../lib/format';
import { Banner } from '../../ui';

const SESSION_LABEL: Record<SessionType, string> = {
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
  storage: StorageStatus;
  onOpenSettings: () => void;
}

export default function TodayHeader({ today, dayType, session, storage, onOpenSettings }: TodayHeaderProps) {
  const integrityProblems = storage.integrity?.problems.length ?? 0;
  const warn = storage.quotaWarning || Boolean(storage.lastError) || integrityProblems > 0;
  const lift = dayType === 'lift';

  let message = '';
  let kind: 'warn' | 'error' = 'warn';
  if (storage.lastError) {
    kind = 'error';
    message = storage.lastError;
  } else if (storage.quotaWarning) {
    message = `Storage is ${fmt((storage.bytesUsed / QUOTA_BYTES) * 100)}% full — export a backup before it fills.`;
  } else if (integrityProblems > 0) {
    message = `${integrityProblems} data integrity ${integrityProblems === 1 ? 'problem' : 'problems'} found on load — review in Settings.`;
  }

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
      {warn && (
        <div className="px-4 pb-2">
          <Banner kind={kind} action={{ label: 'Open Settings', onClick: onOpenSettings }}>
            {message}
          </Banner>
        </div>
      )}
    </>
  );
}
