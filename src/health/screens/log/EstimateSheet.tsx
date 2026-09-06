/**
 * EstimateSheet — the editable macro card (SPEC §2 / §9).
 *
 * One component serves every path so "edit" always looks like "log":
 *   - AI bar result: N items, clarify question, source note, re-estimate busy state
 *   - Favorites / Recents "portion": one item, grams stepper
 *   - Barcode: the label's serving, grams to confirm
 *   - Photo: N items with a mandatory grams confirm (`requireGramsConfirm`)
 *   - Meal edit: one item pre-filled from the stored meal, plus Delete
 *
 * §9 rules: confidence chip High ≥0.8 green / Med 0.5–0.79 yellow / Low <0.5
 * neutral (`confidenceBand`); low confidence shows each macro as value ±25 %
 * next to its editable field plus quick portion-confirm chips; `assumptions`
 * is a tappable subtitle that expands; every value is editable before save.
 *
 * Draft state lives in `estimateDraft.ts` rows: grams re-scale from an
 * immutable base (never from a zeroed item), each row keeps its own original
 * under a stable id, the stepper floor is one step and Save is disabled while
 * any item is 0 g. The macro fields are free number inputs so a label can be
 * typed in directly — a typed value becomes the new scaling base.
 *
 * Nested sheets are unsupported (INTEGRATION_NOTES) — this sheet never opens
 * another; the time picker is a native <input type="time">.
 */
import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import { ChevronDown, ChevronUp, Trash2, X } from 'lucide-react';
import type { FoodEstimateItem, HHMM } from '../../data/types';
import { confidenceBand } from '../../ai/foodLocal';
import { fmt, round } from '../../lib/format';
import { Button, Chip, Sheet, Stepper } from '../../ui';
import {
  GRAM_STEP,
  createDraft,
  draftItems,
  macroRange,
  portionFactor,
  removeRow,
  replaceRow,
  saveBlocker,
  setRowGrams,
  setRowMacros,
  setRowName,
  type DraftRow,
  type MacroKey,
} from './estimateDraft';
import { estimateTotals, normaliseTime } from './logUtils';

export interface EstimateSheetProps {
  open: boolean;
  title: string;
  /** Initial items; a new array identity resets the draft (re-estimate after a clarification). */
  items: FoodEstimateItem[];
  /** Initial time (HH:MM), defaults to now upstream. */
  time: HHMM;
  clarify?: string | null;
  /** Source note, e.g. "Local estimate — connect an AI key…". */
  note?: string | null;
  /** True while a re-estimate is in flight. */
  busy?: boolean;
  mode: 'new' | 'edit';
  /** Photo flow: the portion is a guess, so every item's grams must be set or confirmed before Save. */
  requireGramsConfirm?: boolean;
  onClose: () => void;
  onSave: (items: FoodEstimateItem[], time: HHMM) => void;
  onDelete?: () => void;
  /** Answer to the clarify question — the caller appends it and re-estimates. */
  onClarify?: (answer: string) => void;
}

/**
 * One-tap answers for the clarify question (§9: a single prompt with quick
 * answers). They cover the two things that move an estimate most — portion
 * size and home vs restaurant preparation; anything else goes in the box.
 */
const QUICK_ANSWERS = ['about 150 g', 'about 250 g', 'about 400 g', 'home-cooked', 'restaurant'] as const;

/** §9 confidence badge — a static pill, not a button (R6-11), same washes as Chip's active state. */
const BADGE: Record<'green' | 'yellow' | 'neutral', string> = {
  green: 'bg-hx-green/15 text-hx-green border-hx-green/40',
  yellow: 'bg-hx-yellow/15 text-hx-yellow border-hx-yellow/40',
  neutral: 'bg-hx-neutral/15 text-hx-text border-hx-neutral/40',
};

/** Quick portion-confirm multipliers relative to the original estimate (§2 small/medium/large vocabulary). */
const PORTIONS: Array<{ label: string; k: number }> = [
  { label: 'Small', k: 0.75 },
  { label: 'As estimated', k: 1 },
  { label: 'Large', k: 1.4 },
];

export default function EstimateSheet({ open, title, items, time, clarify, note, busy = false, mode, requireGramsConfirm = false, onClose, onSave, onDelete, onClarify }: EstimateSheetProps) {
  const [rows, setRows] = useState<DraftRow[]>(() => createDraft(items));
  const [draftTime, setDraftTime] = useState<HHMM>(time);
  const [answer, setAnswer] = useState('');

  // A fresh estimate (new identity) replaces the draft; the time only
  // follows the prop when the sheet (re)opens so a user-picked time survives
  // a clarification round-trip.
  useEffect(() => {
    setRows(createDraft(items));
    setAnswer('');
  }, [items]);
  useEffect(() => {
    if (open) setDraftTime(time);
  }, [open, time]);

  const update = (next: DraftRow) => setRows((d) => replaceRow(d, next));
  const remove = (id: string) => setRows((d) => removeRow(d, id));
  const totals = estimateTotals(draftItems(rows));
  const blocker = saveBlocker(rows, requireGramsConfirm);
  const canSave = !blocker && !busy;

  const submitAnswer = () => {
    const a = answer.trim();
    if (a && onClarify) onClarify(a);
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <div className="space-y-2">
          {blocker && rows.length > 0 && (
            <p className="text-[12px] leading-4 text-hx-yellow" role="status">
              {blocker}
            </p>
          )}
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 shrink-0">
              {/* Edit mode also carries Delete — the visible label gives way so "Save changes" stays on one line at 390 px. */}
              <span className={mode === 'edit' ? 'sr-only' : 'hx-label'}>Time</span>
              <input
                type="time"
                value={draftTime}
                onChange={(e) => setDraftTime(normaliseTime(e.target.value, draftTime))}
                className="h-11 px-2 text-[15px] font-semibold w-[136px]"
                aria-label="Time eaten"
              />
            </label>
            {mode === 'edit' && onDelete && (
              <Button variant="danger" size="md" onClick={onDelete} aria-label="Delete this entry" icon={<Trash2 aria-hidden />}>
                <span className="sr-only">Delete</span>
              </Button>
            )}
            <Button className="flex-1" size="md" loading={busy} disabled={!canSave} onClick={() => onSave(draftItems(rows), draftTime)}>
              {mode === 'edit' ? 'Save changes' : rows.length > 1 ? `Save ${rows.length} items` : 'Save'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-3" aria-busy={busy || undefined}>
        {note && <p className="text-[13px] leading-5 text-hx-yellow">{note}</p>}

        {clarify && onClarify && (
          <div className="rounded-2xl border border-hx-blue/40 bg-hx-blue/10 p-3">
            <p className="text-[14px] leading-5 text-hx-text">{clarify}</p>
            <div className="mt-2 flex gap-1.5 flex-wrap" role="group" aria-label="Quick answers">
              {QUICK_ANSWERS.map((a) => (
                <Chip key={a} size="sm" color="blue" onClick={() => onClarify(a)} disabled={busy}>
                  {a}
                </Chip>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    submitAnswer();
                  }
                }}
                placeholder="e.g. about 300 g, home-cooked"
                className="flex-1 h-11 px-3 text-[15px]"
                aria-label="Answer to the clarifying question"
                disabled={busy}
              />
              <Button variant="secondary" size="md" onClick={submitAnswer} loading={busy} disabled={!answer.trim()}>
                Re-estimate
              </Button>
            </div>
          </div>
        )}

        {rows.length === 0 && <p className="text-[14px] text-hx-muted py-6 text-center">Nothing left to save.</p>}

        {rows.map((row) => (
          <ItemEditor
            key={row.id}
            row={row}
            showConfidence={mode === 'new' || row.item.confidence < 1}
            forceRange={requireGramsConfirm}
            onChange={update}
            onRemove={mode === 'new' && rows.length > 1 ? () => remove(row.id) : undefined}
            disabled={busy}
          />
        ))}

        {rows.length > 1 && (
          <div className="flex items-baseline justify-between px-1 pt-1 text-[13px]">
            <span className="hx-label">Total</span>
            <span className="text-hx-text font-semibold">
              {fmt(totals.kc)} kcal · {fmt(totals.p)} g P · {fmt(totals.f)} g F · {fmt(totals.c)} g C · {fmt(totals.fi, 1)} g fiber
            </span>
          </div>
        )}
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// One item
// ---------------------------------------------------------------------------

interface ItemEditorProps {
  row: DraftRow;
  showConfidence: boolean;
  /** Show the ± range and portion chips regardless of band (photo flow). */
  forceRange: boolean;
  onChange: (next: DraftRow) => void;
  onRemove?: () => void;
  disabled?: boolean;
}

const FIELDS: Array<{ key: MacroKey; label: string; aria: string; dp: number }> = [
  { key: 'kcal', label: 'kcal', aria: 'Calories', dp: 0 },
  { key: 'protein_g', label: 'P g', aria: 'Protein grams', dp: 1 },
  { key: 'fat_g', label: 'F g', aria: 'Fat grams', dp: 1 },
  { key: 'carbs_g', label: 'C g', aria: 'Carb grams', dp: 1 },
  { key: 'fiber_g', label: 'Fiber', aria: 'Fiber grams', dp: 1 },
];

function ItemEditor({ row, showConfidence, forceRange, onChange, onRemove, disabled }: ItemEditorProps) {
  const [expanded, setExpanded] = useState(false);
  const { item } = row;
  const band = confidenceBand(item.confidence);
  const low = band.band === 'low';
  const showRange = low || forceRange;
  const k = portionFactor(row);
  const hint = low ? 'Low confidence — values shown ±25 %; confirm the portion' : forceRange ? 'From a photo — the portion is a guess; confirm the grams' : null;

  return (
    <div className="hx-card p-3.5 space-y-3">
      <div className="flex items-start gap-2">
        <input
          type="text"
          value={item.name}
          onChange={(e) => onChange(setRowName(row, e.target.value))}
          className="flex-1 min-w-0 h-11 px-3 text-[15px] font-semibold"
          aria-label="Food name"
          disabled={disabled}
        />
        {showConfidence && (
          <span className={`mt-1.5 shrink-0 inline-flex items-center h-8 px-3 rounded-full border text-[13px] font-medium ${BADGE[band.color]}`}>
            <span className="sr-only">Confidence </span>
            {band.label}
          </span>
        )}
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${item.name || 'item'}`}
            className="w-11 h-11 -mr-1.5 shrink-0 inline-flex items-center justify-center rounded-xl text-hx-muted hover:text-hx-text hover:bg-hx-card2"
            disabled={disabled}
          >
            <X className="w-4 h-4" aria-hidden />
          </button>
        )}
      </div>

      {item.assumptions && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="w-full flex items-start gap-1.5 text-left text-[13px] leading-5 text-hx-text2 min-h-[44px] py-2 -my-2"
        >
          <span className={expanded ? '' : 'line-clamp-1'}>{item.assumptions}</span>
          {expanded ? <ChevronUp className="w-4 h-4 mt-0.5 shrink-0 text-hx-muted" aria-hidden /> : <ChevronDown className="w-4 h-4 mt-0.5 shrink-0 text-hx-muted" aria-hidden />}
        </button>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Stepper value={item.grams} onChange={(g) => onChange(setRowGrams(row, g))} step={GRAM_STEP} min={GRAM_STEP} unit="g" label={`Grams of ${item.name || 'item'}`} disabled={disabled} />
        {hint && <span className="text-[12px] leading-4 text-hx-text2">{hint}</span>}
      </div>

      {showRange && row.estimatedGrams > 0 && (
        <div className="flex gap-2 flex-wrap" role="group" aria-label="Quick portion">
          {PORTIONS.map((p) => {
            const selected = Math.abs(k - p.k) < 0.02 && (!forceRange || row.gramsConfirmed);
            return (
              <Chip key={p.label} size="sm" active={selected} pressed={selected} onClick={() => onChange(setRowGrams(row, row.estimatedGrams * p.k))} disabled={disabled}>
                {p.label} · {fmt(round(row.estimatedGrams * p.k))} g
              </Chip>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-5 gap-1.5">
        {FIELDS.map((f) => (
          <NumField
            key={f.key}
            label={f.label}
            ariaLabel={f.aria}
            value={item[f.key]}
            dp={f.dp}
            range={showRange ? macroRange(item[f.key], f.dp) : undefined}
            onCommit={(v) => onChange(setRowMacros(row, { [f.key]: v }))}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Number field — commits on blur/Enter so partial typing never writes NaN
// ---------------------------------------------------------------------------

interface NumFieldProps {
  label: string;
  ariaLabel: string;
  value: number;
  dp: number;
  /** ± shown under the field (low confidence / photo), in the field's unit. */
  range?: number;
  onCommit: (v: number) => void;
  disabled?: boolean;
}

const plain = (n: number, dp: number) => fmt(n, dp).replace(/,/g, '');

function NumField({ label, ariaLabel, value, dp, range, onCommit, disabled }: NumFieldProps) {
  const rangeId = useId();
  const [draft, setDraft] = useState(() => plain(value, dp));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setDraft(plain(value, dp));
  }, [value, dp, editing]);

  const commit = () => {
    setEditing(false);
    const n = parseFloat(draft.replace(/,/g, ''));
    if (Number.isFinite(n)) onCommit(Math.max(0, round(n, dp)));
    else setDraft(plain(value, dp));
  };

  return (
    <label className="flex flex-col items-stretch gap-1 min-w-0">
      <span className="hx-label block text-center truncate">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={draft}
        disabled={disabled}
        onFocus={() => setEditing(true)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="h-11 w-full px-1 text-center text-[15px] font-semibold"
        aria-label={ariaLabel}
        aria-describedby={range !== undefined ? rangeId : undefined}
      />
      {range !== undefined && (
        <span id={rangeId} className="text-[11px] leading-3 text-center text-hx-text2 truncate">
          ±{fmt(range, dp)}
        </span>
      )}
    </label>
  );
}
