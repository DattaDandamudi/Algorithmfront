/**
 * FastPaths — SPEC §2 priority order: Repeat yesterday, then Recents, Favorites,
 * Barcode (secondary) and Photo (secondary). Every path is ≤ 2 taps from the
 * tab: a food's block adds the default portion at "now"; "Portion" opens the
 * shared portion sheet; the star toggles Favorites.
 *
 * Set as the page grammar (DESIGN.md "Ledger"): "Repeat yesterday" is a 56 px
 * ledger row with its caption and the verb "Repeat" flush right; Recents and
 * Favorites sit under running heads as a row of food columns that scrolls
 * under both page margins, each column the add button (name in .hx-ui, the
 * portion in .hx-cap, the verb "Add") over a hairline with the "Portion" verb
 * and a 44 px star toggle (`aria-pressed`); Barcode and Photo are two more
 * ledger rows with a verb. No tiles, no icon wells.
 *
 * Barcode and Photo open their own sheets (BarcodeSheet / PhotoSheet), owned
 * by the Log screen so a result can flow into the shared EstimateSheet. The
 * browser probe finds those sheets through a button whose name starts with
 * "Barcode" / "Photo", so the row's title stays its first word.
 */
import { Star } from 'lucide-react';
import type { FoodItem, Meal } from '../../data/types';
import { fmt } from '../../lib/format';
import { mealOccasions } from '../../engine/nutrition';
import { Button, SectionHeader } from '../../ui';

export interface FastPathsProps {
  yesterdayMeals: Meal[];
  recents: FoodItem[];
  favorites: FoodItem[];
  onRepeatYesterday: () => void;
  /** Add the item's default portion at now with the given source. */
  onQuickAdd: (item: FoodItem, src: 'recent' | 'favorite') => void;
  /** Open the portion sheet for the item. */
  onPortion: (item: FoodItem, src: 'recent' | 'favorite') => void;
  onToggleFavorite: (item: FoodItem) => void;
  /** Open the barcode sheet (manual code / camera scan). */
  onBarcode: () => void;
  /** Open the photo sheet (camera capture, then the AI estimate). */
  onPhoto: () => void;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export default function FastPaths({ yesterdayMeals, recents, favorites, onRepeatYesterday, onQuickAdd, onPortion, onToggleFavorite, onBarcode, onPhoto }: FastPathsProps) {
  const favIds = new Set(favorites.map((f) => f.id));
  const yOcc = mealOccasions(yesterdayMeals).length;
  const yKcal = yesterdayMeals.reduce((s, m) => s + (Number(m.kc) || 0), 0);
  const hasYesterday = yesterdayMeals.length > 0;

  return (
    <section className="flex flex-col" aria-label="Fast paths">
      {/* 1. Repeat yesterday — one tap for a day you have already eaten before. */}
      <div className="hx-ledger mt-6">
        <button type="button" onClick={onRepeatYesterday} disabled={!hasYesterday} className="hx-row hx-press text-left disabled:cursor-not-allowed">
          <span className="w-full flex items-center justify-between gap-3">
            <span className={`hx-body min-w-0 ${hasYesterday ? '' : 'text-hx-text2'}`}>Repeat yesterday</span>
            {hasYesterday && <span className="hx-ui text-hx-text shrink-0">Repeat</span>}
          </span>
          <span className="hx-cap mt-0.5">
            {hasYesterday
              ? `Copies ${plural(yOcc, 'meal')}, ${plural(yesterdayMeals.length, 'item')}, ${fmt(yKcal)} kcal, at their original times.`
              : 'Nothing logged yesterday. Log a day first, then repeat it in one tap.'}
          </span>
        </button>
      </div>

      {/* 2. Recents */}
      <section className="mt-6 flex flex-col" aria-label="Recents">
        <SectionHeader as="h3" title="Recents" caption={recents.length ? plural(recents.length, 'food') : undefined} />
        {recents.length ? (
          <FoodRow items={recents} src="recent" favIds={favIds} onQuickAdd={onQuickAdd} onPortion={onPortion} onToggleFavorite={onToggleFavorite} />
        ) : (
          <p className="hx-hedge mt-3">Foods you log show up here for one-tap re-adds.</p>
        )}
      </section>

      {/* 3. Favorites */}
      <section className="mt-6 flex flex-col" aria-label="Favorites">
        <SectionHeader as="h3" title="Favorites" caption={favorites.length ? `${favorites.length} starred` : undefined} />
        {favorites.length ? (
          <FoodRow items={favorites} src="favorite" favIds={favIds} onQuickAdd={onQuickAdd} onPortion={onPortion} onToggleFavorite={onToggleFavorite} />
        ) : (
          <p className="hx-hedge mt-3">Star a recent food to keep it here.</p>
        )}
      </section>

      {/* 4–5. Barcode & Photo (secondary) — two ledger rows with a verb. */}
      <div className="hx-ledger mt-6">
        <PathRow title="Barcode" hint="Packaged food, read off the label" verb="Scan" onClick={onBarcode} />
        <PathRow title="Photo" hint="A plate, with the portion confirmed by you" verb="Take a photo" onClick={onPhoto} />
      </div>
    </section>
  );
}

function PathRow({ title, hint, verb, onClick }: { title: string; hint: string; verb: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="hx-row hx-press text-left">
      <span className="w-full flex items-center justify-between gap-3">
        <span className="hx-body min-w-0">{title}</span>
        <span className="hx-ui text-hx-text shrink-0">{verb}</span>
      </span>
      <span className="hx-cap mt-0.5">{hint}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Horizontal food row
// ---------------------------------------------------------------------------

interface FoodRowProps {
  items: FoodItem[];
  src: 'recent' | 'favorite';
  favIds: Set<string>;
  onQuickAdd: FastPathsProps['onQuickAdd'];
  onPortion: FastPathsProps['onPortion'];
  onToggleFavorite: FastPathsProps['onToggleFavorite'];
}

function FoodRow({ items, src, favIds, onQuickAdd, onPortion, onToggleFavorite }: FoodRowProps) {
  return (
    // The row bleeds to the page edges (-mx-5) and pads back in (px-5), so the
    // first column sits on the margin and the row scrolls under both margins.
    // Columns divide by a vertical hairline, as a box score does.
    <ul className="mt-3 -mx-5 px-5 flex overflow-x-auto hx-no-scrollbar" role="list">
      {items.map((it, i) => {
        const g = it.defaultGrams > 0 ? it.defaultGrams : 100;
        const kcal = (it.per100.kc * g) / 100;
        const p = (it.per100.p * g) / 100;
        const starred = favIds.has(it.id);
        return (
          <li key={it.id} className="shrink-0 flex">
            {i > 0 && <span className="w-px self-stretch bg-hx-border mx-4 shrink-0" aria-hidden />}
            <div className="w-[168px] flex flex-col">
              <button
                type="button"
                onClick={() => onQuickAdd(it, src)}
                className="hx-press flex-1 min-h-[56px] py-1 text-left flex flex-col"
                aria-label={`Add ${it.name}, ${fmt(g)} grams, ${fmt(kcal)} kilocalories`}
              >
                <span className="w-full flex items-baseline justify-between gap-2">
                  <span className="hx-ui text-hx-text min-w-0 line-clamp-2">{it.name}</span>
                  <span className="hx-ui text-hx-text2 shrink-0">Add</span>
                </span>
                <span className="hx-cap mt-0.5">
                  {fmt(g)} g, {fmt(kcal)} kcal
                </span>
                <span className="hx-cap">{fmt(p)} g protein</span>
              </button>
              <div className="hx-hair" aria-hidden />
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="sm" onClick={() => onPortion(it, src)} aria-label={`Change portion of ${it.name}`}>
                  Portion
                </Button>
                <button
                  type="button"
                  onClick={() => onToggleFavorite(it)}
                  aria-label={starred ? `Remove ${it.name} from favorites` : `Add ${it.name} to favorites`}
                  aria-pressed={starred}
                  className={`w-11 h-11 shrink-0 inline-flex items-center justify-center ${starred ? 'text-hx-yellow' : 'text-hx-text2 hover:text-hx-text'}`}
                >
                  <Star className="w-4 h-4" strokeWidth={1.5} fill={starred ? 'currentColor' : 'none'} aria-hidden />
                </button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
