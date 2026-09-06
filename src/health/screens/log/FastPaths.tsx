/**
 * FastPaths — SPEC §2 priority order: Repeat yesterday → Recents → Favorites
 * → Barcode (secondary) → Photo (secondary). Every path is ≤ 2 taps from the
 * tab: a food card's main area adds the default portion at "now"; the small
 * scale button opens the shared portion sheet; the star toggles Favorites.
 *
 * Barcode and Photo are honest placeholders: a Sheet explains they are coming
 * later and hands the user back to the text bar (no fake scanning). The photo
 * sheet carries the depth/portion caveat from the spec's Cal AI evidence.
 */
import { useState } from 'react';
import { Barcode, Camera, History, Scale, Star } from 'lucide-react';
import type { FoodItem, Meal } from '../../data/types';
import { fmt } from '../../lib/format';
import { mealOccasions } from '../../engine/nutrition';
import { Button, SectionHeader, Sheet } from '../../ui';

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
  /** Close any placeholder sheet and focus the text bar. */
  onUseTextBar: () => void;
}

type Placeholder = 'barcode' | 'photo' | null;

export default function FastPaths({ yesterdayMeals, recents, favorites, onRepeatYesterday, onQuickAdd, onPortion, onToggleFavorite, onUseTextBar }: FastPathsProps) {
  const [placeholder, setPlaceholder] = useState<Placeholder>(null);
  const favIds = new Set(favorites.map((f) => f.id));
  const yOcc = mealOccasions(yesterdayMeals).length;
  const yKcal = yesterdayMeals.reduce((s, m) => s + (Number(m.kc) || 0), 0);
  const hasYesterday = yesterdayMeals.length > 0;

  return (
    <div className="space-y-5">
      {/* 1. Repeat yesterday */}
      <div>
        <Button
          variant="secondary"
          size="lg"
          fullWidth
          icon={<History aria-hidden />}
          onClick={onRepeatYesterday}
          disabled={!hasYesterday}
          aria-describedby="hx-repeat-hint"
        >
          Repeat yesterday
        </Button>
        <p id="hx-repeat-hint" className="mt-1.5 px-1 text-[12px] leading-4 text-hx-muted">
          {hasYesterday
            ? `Copies ${yOcc} ${yOcc === 1 ? 'meal' : 'meals'} (${yesterdayMeals.length} items · ${fmt(yKcal)} kcal) onto today at their original times.`
            : 'Nothing logged yesterday — log a day first, then repeat it in one tap.'}
        </p>
      </div>

      {/* 2. Recents */}
      <section aria-labelledby="hx-recents">
        <SectionHeader title="Recents" caption={recents.length ? 'Tap to add the usual portion · scale to change it' : undefined} />
        <span id="hx-recents" className="sr-only">
          Recents
        </span>
        {recents.length ? (
          <FoodRow items={recents} src="recent" favIds={favIds} onQuickAdd={onQuickAdd} onPortion={onPortion} onToggleFavorite={onToggleFavorite} />
        ) : (
          <p className="mt-2 text-[13px] leading-5 text-hx-muted">Foods you log show up here for one-tap re-adds.</p>
        )}
      </section>

      {/* 3. Favorites */}
      <section aria-labelledby="hx-favorites">
        <SectionHeader title="Favorites" caption={favorites.length ? 'Starred staples · tap to add' : undefined} />
        <span id="hx-favorites" className="sr-only">
          Favorites
        </span>
        {favorites.length ? (
          <FoodRow items={favorites} src="favorite" favIds={favIds} onQuickAdd={onQuickAdd} onPortion={onPortion} onToggleFavorite={onToggleFavorite} />
        ) : (
          <p className="mt-2 text-[13px] leading-5 text-hx-muted">Star a recent food to keep it here.</p>
        )}
      </section>

      {/* 4–5. Barcode & Photo (secondary) */}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" size="md" icon={<Barcode aria-hidden />} onClick={() => setPlaceholder('barcode')}>
          Barcode
        </Button>
        <Button variant="secondary" size="md" icon={<Camera aria-hidden />} onClick={() => setPlaceholder('photo')}>
          Photo
        </Button>
      </div>

      <Sheet
        open={placeholder !== null}
        onClose={() => setPlaceholder(null)}
        title={placeholder === 'photo' ? 'Photo logging — coming later' : 'Barcode scanning — coming later'}
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setPlaceholder(null)}>
              Close
            </Button>
            <Button
              className="flex-1"
              onClick={() => {
                setPlaceholder(null);
                onUseTextBar();
              }}
            >
              Type it instead
            </Button>
          </div>
        }
      >
        {placeholder === 'photo' ? (
          <div className="space-y-3 text-[14px] leading-6 text-hx-text2">
            <p>Photo estimates aren't in this build yet, and we won't fake one.</p>
            <p>
              Even when they land, a photo can't see depth: a plate of biryani looks the same at 250 g and 450 g, and hidden oil or ghee never shows. Portion size is the biggest
              error in food logging, so photo estimates will always ask you to confirm grams.
            </p>
            <p className="text-hx-text">The fastest accurate path today is the text bar with a weight — "320 g chicken biryani" — which you can then edit before saving.</p>
          </div>
        ) : (
          <div className="space-y-3 text-[14px] leading-6 text-hx-text2">
            <p>Barcode scanning isn't in this build yet, and there's no camera access to pretend otherwise.</p>
            <p>Most of what you eat is restaurant food without a barcode anyway. For packaged items, type the label values into the text bar, e.g. "whey scoop 30 g" or "200 g Greek yogurt".</p>
            <p className="text-hx-text">You can edit any number before saving, so a label is easy to copy across.</p>
          </div>
        )}
      </Sheet>
    </div>
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
    <ul className="mt-2 -mx-4 px-4 flex gap-2 overflow-x-auto hx-no-scrollbar snap-x snap-mandatory" role="list">
      {items.map((it) => {
        const g = it.defaultGrams > 0 ? it.defaultGrams : 100;
        const kcal = (it.per100.kc * g) / 100;
        const p = (it.per100.p * g) / 100;
        const starred = favIds.has(it.id);
        return (
          <li key={it.id} className="snap-start shrink-0 w-[156px] hx-card flex flex-col overflow-hidden">
            <button
              type="button"
              onClick={() => onQuickAdd(it, src)}
              className="flex-1 text-left p-3 min-h-[64px] hover:bg-hx-card2 active:bg-hx-border transition-colors"
              aria-label={`Add ${it.name}, ${fmt(g)} grams, ${fmt(kcal)} kilocalories`}
            >
              <span className="block text-[14px] leading-5 font-semibold text-hx-text line-clamp-2">{it.name}</span>
              <span className="block mt-1 text-[12px] leading-4 text-hx-text2">
                {fmt(g)} g · {fmt(kcal)} kcal · {fmt(p)} g P
              </span>
            </button>
            <div className="flex border-t border-hx-border">
              <button
                type="button"
                onClick={() => onPortion(it, src)}
                aria-label={`Change portion of ${it.name}`}
                className="flex-1 h-11 inline-flex items-center justify-center gap-1.5 text-[12px] font-medium text-hx-text2 hover:text-hx-text hover:bg-hx-card2"
              >
                <Scale className="w-4 h-4" aria-hidden /> Portion
              </button>
              <button
                type="button"
                onClick={() => onToggleFavorite(it)}
                aria-label={starred ? `Remove ${it.name} from favorites` : `Add ${it.name} to favorites`}
                aria-pressed={starred}
                className={`w-11 h-11 inline-flex items-center justify-center border-l border-hx-border hover:bg-hx-card2 ${starred ? 'text-hx-yellow' : 'text-hx-muted hover:text-hx-text'}`}
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
