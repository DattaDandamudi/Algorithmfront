/**
 * Coach header — the masthead of the printed interview (DESIGN.md "Coach").
 *
 * "Coach" in .hx-masthead flush left; the status line ("Offline coach, add a
 * key in Settings", or the configured model's name) is the dateline flush
 * right in .hx-hedge, and it is still the 44 px button that opens Settings
 * (its aria-label adds "Open Settings"). Under it the Conversational / Direct
 * tone toggle is two words on a hairline (SegmentedControl) with the clear-
 * conversation verb sitting at the right end of the same hairline as a ghost
 * verb; the screen owns the confirm. No lamp, no pill, no icon, no sticky
 * position: the masthead scrolls away with the page.
 *
 * Purely presentational; the screen wires the store.
 */
import type { CoachTone } from '../../data/types';
import { Button, SegmentedControl, type SegmentedOption } from '../../ui';

const TONES: Array<SegmentedOption<CoachTone>> = [
  { value: 'conversational', label: 'Conversational' },
  { value: 'direct', label: 'Direct' },
];

export interface CoachHeaderProps {
  tone: CoachTone;
  onTone: (tone: CoachTone) => void;
  /** The configured model's name, or the offline line. */
  statusLabel: string;
  onOpenSettings: () => void;
  canClear: boolean;
  onClear: () => void;
}

export default function CoachHeader({ tone, onTone, statusLabel, onOpenSettings, canClear, onClear }: CoachHeaderProps) {
  return (
    <header className="flex flex-col">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="hx-masthead text-hx-text shrink-0">Coach</h1>
        {/* The dateline is the status, and the status opens Settings: an underlined line of italic with a 44 px hit area. */}
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label={`${statusLabel}. Open Settings`}
          className="hx-hedge min-h-11 min-w-0 flex-1 text-right underline decoration-1 underline-offset-[3px] hover:text-hx-text"
        >
          {statusLabel}
        </button>
      </div>
      <div className="relative mt-4">
        {/* md = 44 px words: the touch-target floor. w-full stretches the hairline under the whole row. */}
        <SegmentedControl<CoachTone> options={TONES} value={tone} onChange={onTone} size="md" ariaLabel="Coach tone" className="w-full" />
        <Button variant="ghost" size="sm" onClick={onClear} disabled={!canClear} aria-label="Clear conversation" className="absolute right-0 top-0">
          Clear
        </Button>
      </div>
    </header>
  );
}
