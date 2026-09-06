/**
 * Coach header (task item 1): "<appName> Coach", the provider status pill
 * ("Claude · Opus 5" or "Offline · add a key in Settings" — both open
 * Settings; the pill's column is flex-1 so it never truncates at 390 px,
 * review R6-17), the
 * Conversational / Direct tone toggle (§4, Oura pattern) and
 * the clear-conversation action (task item 8; the screen owns the confirm).
 *
 * Purely presentational; the screen wires the store.
 */
import { Trash2 } from 'lucide-react';
import type { CoachTone } from '../../data/types';
import { SegmentedControl, type SegmentedOption } from '../../ui';

const TONES: Array<SegmentedOption<CoachTone>> = [
  { value: 'conversational', label: 'Conversational' },
  { value: 'direct', label: 'Direct' },
];

export interface CoachHeaderProps {
  appName: string;
  tone: CoachTone;
  onTone: (tone: CoachTone) => void;
  /** "Claude · Opus 5" or the offline hint. */
  statusLabel: string;
  configured: boolean;
  onOpenSettings: () => void;
  canClear: boolean;
  onClear: () => void;
}

export default function CoachHeader({ appName, tone, onTone, statusLabel, configured, onOpenSettings, canClear, onClear }: CoachHeaderProps) {
  return (
    <header className="shrink-0 px-4 pt-4 pb-3 border-b border-hx-border bg-hx-base/95 backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        {/* flex-1: the pill may use the full header width, not just the title's (it truncated at 390 px — review R6-17). */}
        <div className="min-w-0 flex-1">
          <h1 className="text-[20px] leading-6 font-semibold text-hx-text truncate">{appName} Coach</h1>
          {/* 44 px hit area around a compact pill. */}
          <button
            type="button"
            onClick={onOpenSettings}
            className="-ml-2 mt-1 h-11 px-2 inline-flex items-center max-w-full text-left"
            aria-label={`${statusLabel}. Open Settings`}
          >
            <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-hx-border bg-hx-card text-[12px] leading-4 text-hx-text2 min-w-0">
              <span className={`w-2 h-2 rounded-full shrink-0 ${configured ? 'bg-hx-blue' : 'bg-hx-neutral'}`} aria-hidden />
              <span className="truncate">{statusLabel}</span>
            </span>
          </button>
        </div>
        <button
          type="button"
          onClick={onClear}
          disabled={!canClear}
          aria-label="Clear conversation"
          className="shrink-0 w-11 h-11 -mr-2 inline-flex items-center justify-center rounded-xl text-hx-text2 hover:text-hx-text hover:bg-hx-card2 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
        >
          <Trash2 className="w-5 h-5" aria-hidden />
        </button>
      </div>
      {/* md = 44 px segments: the touch-target floor (review R2-13). */}
      <SegmentedControl<CoachTone> options={TONES} value={tone} onChange={onTone} size="md" ariaLabel="Coach tone" className="mt-2 w-full" />
    </header>
  );
}
