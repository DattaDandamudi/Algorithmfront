/**
 * Coach header (task item 1) — the only fixed furniture above the transcript:
 * the screen title in the display face, one sentence-case status line saying
 * who is answering ("Claude Opus 5" / "Offline coach, add a key in Settings" —
 * both open Settings, both ≥ 44 px), the Conversational / Direct tone toggle
 * (§4, a SegmentedControl: a well with the chosen segment raised out of it) and
 * the clear-conversation action (task item 8; the screen owns the confirm).
 *
 * No pill, no uppercase, no middle dot: the status is a line of prose with a
 * lamp beside it, so the colour is never the only thing carrying the state
 * (DESIGN.md "Copy rules" and "Quality floor").
 *
 * Purely presentational; the screen wires the store.
 */
import { ChevronRight, Trash2 } from 'lucide-react';
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
  /** "Claude Opus 5" or the offline line. */
  statusLabel: string;
  configured: boolean;
  onOpenSettings: () => void;
  canClear: boolean;
  onClear: () => void;
}

export default function CoachHeader({ appName, tone, onTone, statusLabel, configured, onOpenSettings, canClear, onClear }: CoachHeaderProps) {
  return (
    <header className="shrink-0 px-4 pt-5 pb-3 flex flex-col gap-2 border-b border-hx-border bg-hx-base/90 backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        {/* flex-1: the status line may use the full header width, not just the title's (review R6-17). */}
        <div className="min-w-0 flex-1">
          <h1 className="hx-display text-[22px] leading-7 font-semibold text-hx-text truncate">{appName} Coach</h1>
          {/* A line of text, with a 44 px hit area around it. */}
          <button
            type="button"
            onClick={onOpenSettings}
            className="-mx-1 px-1 min-h-11 flex items-center gap-2 max-w-full text-left rounded-ctl"
            aria-label={`${statusLabel}. Open Settings`}
          >
            <span className={`w-2 h-2 rounded-full shrink-0 ${configured ? 'bg-hx-blue' : 'bg-hx-neutral'}`} aria-hidden />
            <span className="min-w-0 truncate text-[13px] leading-[18px] text-hx-text2">{statusLabel}</span>
            <ChevronRight className="w-4 h-4 shrink-0 text-hx-muted" aria-hidden />
          </button>
        </div>
        <button
          type="button"
          onClick={onClear}
          disabled={!canClear}
          aria-label="Clear conversation"
          className="shrink-0 w-11 h-11 -mr-2 inline-flex items-center justify-center rounded-ctl text-hx-text2 hover:text-hx-text hover:bg-hx-card2 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
        >
          <Trash2 className="w-5 h-5" aria-hidden />
        </button>
      </div>
      {/* md = 44 px segments: the touch-target floor (review R2-13). */}
      <SegmentedControl<CoachTone> options={TONES} value={tone} onChange={onTone} size="md" ariaLabel="Coach tone" className="w-full" />
    </header>
  );
}
