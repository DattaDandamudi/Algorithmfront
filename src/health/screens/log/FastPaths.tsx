/**
 * FastPaths — SPEC §2 priority order: Repeat yesterday → Recents → Favorites
 * → Barcode (secondary) → Photo (secondary). Every path is ≤ 2 taps from the
 * tab: a food card's main area adds the default portion at "now"; the small
 * scale button opens the shared portion sheet; the star toggles Favorites.
 *
 * Rendered as a fragment of bento cells (DESIGN.md "Bento rules"), so the Log
 * screen owns the grid: "Repeat yesterday" is a span-2 raised action tile,
 * Recents and Favorites are span-2 sections whose row scrolls inside itself,
 * and Barcode / Photo are the screen's 1×1 pair — never a lone 1×1.
 *
 * Barcode and Photo open their own sheets (BarcodeSheet / PhotoSheet), owned
 * by the Log screen so a result can flow into the shared EstimateSheet.
 */
import type { ReactNode } from 'react';
import { Barcode, Camera, ChevronRight, History, Scale, Star } from 'lucide-react';
import type { FoodItem, Meal } from '../../data/types';
import { fmt } from '../../lib/format';
import { mealOccasions } from '../../engine/nutrition';
import { SectionHeader } from '../../ui';

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
  /** Open the photo sheet (camera capture → AI estimate). */
  onPhoto: () => void;
}

export default function FastPaths({ yesterdayMeals, recents, favorites, onRepeatYesterday, onQuickAdd, onPortion, onToggleFavorite, onBarcode, onPhoto }: FastPathsProps) {
  const favIds = new Set(favorites.map((f) => f.id));
  const yOcc = mealOccasions(yesterdayMeals).length;
  const yKcal = yesterdayMeals.reduce((s, m) => s + (Number(m.kc) || 0), 0);
  const hasYesterday = yesterdayMeals.length > 0;

  return (
    // A nested bento: the same two columns and 12 px gutter as the screen's
    // grid, so the cells line up while the group keeps its landmark name.
    <section className="hx-span-2 hx-bento" aria-label="Fast paths">
      {/* 1. Repeat yesterday — one tap for a day you have already eaten before. */}
      <button
        type="button"
        onClick={onRepeatYesterday}
        disabled={!hasYesterday}
        className="hx-raised hx-press hx-span-2 p-4 flex items-center gap-3 text-left disabled:opacity-60 disabled:cursor-not-allowed hover:border-hx-neutral"
      >
        <span className="w-10 h-10 shrink-0 rounded-full hx-well inline-flex items-center justify-center text-hx-text2" aria-hidden>
          <History className="w-5 h-5" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="hx-display block text-[17px] leading-6 font-semibold text-hx-text">Repeat yesterday</span>
          <span className="block text-[13px] leading-[18px] text-hx-text2">
            {hasYesterday
              ? `Copies ${yOcc} ${yOcc === 1 ? 'meal' : 'meals'}, ${yesterdayMeals.length} items, ${fmt(yKcal)} kcal, at their original times.`
              : 'Nothing logged yesterday. Log a day first, then repeat it in one tap.'}
          </span>
        </span>
        {hasYesterday && <ChevronRight className="w-5 h-5 shrink-0 text-hx-muted" aria-hidden />}
      </button>

      {/* 2. Recents */}
      <section className="hx-span-2 flex flex-col gap-2" aria-labelledby="hx-recents">
        <SectionHeader title="Recents" caption={recents.length ? 'Tap to add the usual portion, or the scale to change it' : undefined} />
        <span id="hx-recents" className="sr-only">
          Recents
        </span>
        {recents.length ? (
          <FoodRow items={recents} src="recent" favIds={favIds} onQuickAdd={onQuickAdd} onPortion={onPortion} onToggleFavorite={onToggleFavorite} />
        ) : (
          <p className="text-[15px] leading-[22px] text-hx-text2">Foods you log show up here for one-tap re-adds.</p>
        )}
      </section>

      {/* 3. Favorites */}
      <section className="hx-span-2 flex flex-col gap-2" aria-labelledby="hx-favorites">
        <SectionHeader title="Favorites" caption={favorites.length ? 'Starred staples, tap to add' : undefined} />
        <span id="hx-favorites" className="sr-only">
          Favorites
        </span>
        {favorites.length ? (
          <FoodRow items={favorites} src="favorite" favIds={favIds} onQuickAdd={onQuickAdd} onPortion={onPortion} onToggleFavorite={onToggleFavorite} />
        ) : (
          <p className="text-[15px] leading-[22px] text-hx-text2">Star a recent food to keep it here.</p>
        )}
      </section>

      {/* 4–5. Barcode & Photo (secondary) — the screen's 1×1 pair. */}
      <SecondaryPath icon={<Barcode className="w-5 h-5" />} title="Barcode" hint="Packaged food, read off the label" onClick={onBarcode} />
      <SecondaryPath icon={<Camera className="w-5 h-5" />} title="Photo" hint="A plate, with the portion confirmed by you" onClick={onPhoto} />
    </section>
  );
}

function SecondaryPath({ icon, title, hint, onClick }: { icon: ReactNode; title: string; hint: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="hx-raised hx-press p-4 flex flex-col items-start gap-2 text-left hover:border-hx-neutral">
      <span className="w-10 h-10 shrink-0 rounded-full hx-well inline-flex items-center justify-center text-hx-text2" aria-hidden>
        {icon}
      </span>
      <span className="hx-display text-[17px] leading-6 font-semibold text-hx-text">{title}</span>
      <span className="text-[13px] leading-[18px] text-hx-text2">{hint}</span>
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
    // scroll-pl-4 keeps the first card's snap position inside the page gutter —
    // without it the row lands scrolled 16 px in and the first card reads clipped.
    <ul className="-mx-4 px-4 scroll-pl-4 flex gap-2 overflow-x-auto hx-no-scrollbar snap-x snap-mandatory" role="list">
      {items.map((it) => {
        const g = it.defaultGrams > 0 ? it.defaultGrams : 100;
        const kcal = (it.per100.kc * g) / 100;
        const p = (it.per100.p * g) / 100;
        const starred = favIds.has(it.id);
        return (
          <li key={it.id} className="snap-start shrink-0 w-[168px] hx-raised flex flex-col overflow-hidden">
            <button
              type="button"
              onClick={() => onQuickAdd(it, src)}
              className="flex-1 text-left p-3 min-h-[64px] rounded-t-tile hover:bg-hx-card2/70 active:bg-hx-card2 transition-colors"
              aria-label={`Add ${it.name}, ${fmt(g)} grams, ${fmt(kcal)} kilocalories`}
            >
              <span className="block text-[15px] leading-5 font-semibold text-hx-text line-clamp-2">{it.name}</span>
              <span className="hx-display block mt-1 text-[13px] leading-[18px] text-hx-text2">
                {fmt(g)} g, {fmt(kcal)} kcal
              </span>
              <span className="hx-display block text-[13px] leading-[18px] text-hx-muted">{fmt(p)} g protein</span>
            </button>
            <div className="flex border-t border-hx-border/70">
              <button
                type="button"
                onClick={() => onPortion(it, src)}
                aria-label={`Change portion of ${it.name}`}
                className="flex-1 h-11 inline-flex items-center justify-center gap-1.5 text-[13px] font-medium text-hx-text2 hover:text-hx-text hover:bg-hx-card2/70"
              >
                <Scale className="w-4 h-4" aria-hidden /> Portion
              </button>
              <button
                type="button"
                onClick={() => onToggleFavorite(it)}
                aria-label={starred ? `Remove ${it.name} from favorites` : `Add ${it.name} to favorites`}
                aria-pressed={starred}
                className={`w-11 h-11 inline-flex items-center justify-center border-l border-hx-border/70 hover:bg-hx-card2/70 ${starred ? 'text-hx-yellow' : 'text-hx-muted hover:text-hx-text'}`}
              >
                <Star className="w-4 h-4" fill={starred ? 'currentColor' : 'none'} aria-hidden />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
