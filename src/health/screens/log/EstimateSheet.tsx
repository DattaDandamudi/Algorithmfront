/**
 * EstimateSheet — the editable macro card (SPEC §2 / §9).
 *
 * One component serves every path so "edit" always looks like "log":
 *   - AI bar result: N items, clarify question, source note, re-estimate busy state
 *   - Favorites / Recents "portion": one item, grams stepper
 *   - Meal edit: one item pre-filled from the stored meal, plus Delete
 *
 * §9 rules: confidence chip High ≥0.8 green / Med 0.5–0.79 yellow / Low <0.5
 * neutral (`confidenceBand`); low confidence shows a "±" hint plus quick
 * portion-confirm chips; `assumptions` is a tappable subtitle that expands;
 * every value is editable before save. Grams re-scale macros via `scaleItem`
 * (±10 g steps — he weighs food); the macro fields are free number inputs so
 * a known label can be typed in directly.
 *
 * Nested sheets are unsupported (INTEGRATION_NOTES) — this sheet never opens
 * another; the time picker is a native <input type="time">.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronDown, ChevronUp, Trash2, X } from 'lucide-react';
import type { FoodEstimateItem, HHMM } from '../../data/types';
import { confidenceBand, scaleItem } from '../../ai/foodLocal';
import { fmt, round } from '../../lib/format';
import { Button, Chip, Sheet, Stepper } from '../../ui';
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

/** Quick portion-confirm multipliers relative to the original estimate (§2 small/medium/large vocabulary). */
const PORTIONS: Array<{ label: string; k: number }> = [
  { label: 'Small', k: 0.75 },
  { label: 'As estimated', k: 1 },
  { label: 'Large', k: 1.4 },
];

export default function EstimateSheet({ open, title, items, time, clarify, note, busy = false, mode, onClose, onSave, onDelete, onClarify }: EstimateSheetProps) {
  const [draft, setDraft] = useState<FoodEstimateItem[]>(items);
  const [draftTime, setDraftTime] = useState<HHMM>(time);
  const [answer, setAnswer] = useState('');
  const original = useRef<FoodEstimateItem[]>(items);

  // A fresh estimate (new identity) replaces the draft; the time only
  // follows the prop when the sheet (re)opens so a user-picked time survives
  // a clarification round-trip.
  useEffect(() => {
    setDraft(items);
    original.current = items;
    setAnswer('');
  }, [items]);
  useEffect(() => {
    if (open) setDraftTime(time);
  }, [open, time]);

  const update = (i: number, next: FoodEstimateItem) => setDraft((d) => d.map((it, j) => (j === i ? next : it)));
  const remove = (i: number) => setDraft((d) => d.filter((_, j) => j !== i));
  const totals = estimateTotals(draft);
  const canSave = draft.length > 0 && !busy;

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
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 shrink-0">
            <span className="hx-label">Time</span>
            <input
              type="time"
              value={draftTime}
              onChange={(e) => setDraftTime(normaliseTime(e.target.value, draftTime))}
              className="h-11 px-2.5 text-[15px] font-semibold w-[112px]"
              aria-label="Time eaten"
            />
          </label>
          {mode === 'edit' && onDelete && (
            <Button variant="danger" size="md" onClick={onDelete} aria-label="Delete this entry" icon={<Trash2 aria-hidden />}>
              Delete
            </Button>
          )}
          <Button className="flex-1" size="md" loading={busy} disabled={!canSave} onClick={() => onSave(draft, draftTime)}>
            {mode === 'edit' ? 'Save changes' : draft.length > 1 ? `Save ${draft.length} items` : 'Save'}
          </Button>
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

        {draft.length === 0 && <p className="text-[14px] text-hx-muted py-6 text-center">Nothing left to save.</p>}

        {draft.map((it, i) => (
          <ItemEditor
            key={i}
            item={it}
            original={original.current[i] ?? it}
            showConfidence={mode === 'new' || it.confidence < 1}
            onChange={(next) => update(i, next)}
            onRemove={mode === 'new' && draft.length > 1 ? () => remove(i) : undefined}
            disabled={busy}
          />
        ))}

        {draft.length > 1 && (
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
  item: FoodEstimateItem;
  original: FoodEstimateItem;
  showConfidence: boolean;
  onChange: (next: FoodEstimateItem) => void;
  onRemove?: () => void;
  disabled?: boolean;
}

function ItemEditor({ item, original, showConfidence, onChange, onRemove, disabled }: ItemEditorProps) {
  const [expanded, setExpanded] = useState(false);
  const band = confidenceBand(item.confidence);
  const low = band.band === 'low';
  const portionK = original.grams > 0 ? round(item.grams / original.grams, 2) : 1;

  return (
    <div className="hx-card p-3.5 space-y-3">
      <div className="flex items-start gap-2">
        <input
          type="text"
          value={item.name}
          onChange={(e) => onChange({ ...item, name: e.target.value })}
          className="flex-1 min-w-0 h-11 px-3 text-[15px] font-semibold"
          aria-label="Food name"
          disabled={disabled}
        />
        {showConfidence && (
          <Chip size="sm" active color={band.color} aria-label={`Confidence ${band.label}`} className="pointer-events-none mt-0.5" tabIndex={-1}>
            {band.label}
          </Chip>
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
        <Stepper value={item.grams} onChange={(g) => onChange(scaleItem(item, g))} step={10} min={0} unit="g" label={`Grams of ${item.name || 'item'}`} disabled={disabled} />
        {low && <span className="text-[12px] leading-4 text-hx-text2">± values could be ~25 % off — confirm the portion</span>}
      </div>

      {low && (
        <div className="flex gap-2 flex-wrap" role="group" aria-label="Quick portion">
          {PORTIONS.map((p) => (
            <Chip key={p.label} size="sm" active={Math.abs(portionK - p.k) < 0.02} onClick={() => onChange(scaleItem(item, original.grams * p.k))} disabled={disabled}>
              {p.label} · {fmt(round(original.grams * p.k))} g
            </Chip>
          ))}
        </div>
      )}

      <div className="grid grid-cols-5 gap-1.5">
        <NumField label="kcal" value={item.kcal} dp={0} onCommit={(v) => onChange({ ...item, kcal: v })} disabled={disabled} />
        <NumField label="P g" value={item.protein_g} dp={1} onCommit={(v) => onChange({ ...item, protein_g: v })} disabled={disabled} />
        <NumField label="F g" value={item.fat_g} dp={1} onCommit={(v) => onChange({ ...item, fat_g: v })} disabled={disabled} />
        <NumField label="C g" value={item.carbs_g} dp={1} onCommit={(v) => onChange({ ...item, carbs_g: v })} disabled={disabled} />
        <NumField label="Fiber" value={item.fiber_g} dp={1} onCommit={(v) => onChange({ ...item, fiber_g: v })} disabled={disabled} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Number field — commits on blur/Enter so partial typing never writes NaN
// ---------------------------------------------------------------------------

interface NumFieldProps {
  label: string;
  value: number;
  dp: number;
  onCommit: (v: number) => void;
  disabled?: boolean;
}

const plain = (n: number, dp: number) => fmt(n, dp).replace(/,/g, '');

function NumField({ label, value, dp, onCommit, disabled }: NumFieldProps) {
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
      <span className="text-[11px] leading-3 uppercase tracking-wider text-hx-muted text-center truncate">{label}</span>
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
        aria-label={label === 'kcal' ? 'Calories' : label === 'P g' ? 'Protein grams' : label === 'F g' ? 'Fat grams' : label === 'C g' ? 'Carb grams' : 'Fiber grams'}
      />
    </label>
  );
}
