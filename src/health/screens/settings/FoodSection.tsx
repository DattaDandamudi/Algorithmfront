/**
 * Settings §5 — Food preferences (SPEC §5 "food preferences/cuisine priors",
 * §9 food-AI priors) and the favorites manager.
 *
 * Cuisine chips and the notes textarea feed the food estimator's system
 * prompt and the coach PROFILE line. Favorites are the starred staples the
 * Log screen shows for one-tap adds; here the user edits the default portion
 * (grams) each favorite is added at, or unstars it. Unstarring is confirmed
 * because a favorite can only come back by starring it again from Recents.
 */
import { RotateCcw, Star } from 'lucide-react';
import { DEFAULT_FAVORITES } from '../../data/defaults';
import { useHealth } from '../../data/store';
import type { FoodItem } from '../../data/types';
import { fmt } from '../../lib/format';
import { Button, Chip, toast } from '../../ui';
import { useConfirm } from './useConfirm';
import { Field, Note, NumberField, SubHeading, TextField } from './fields';
import { CUISINE_OPTIONS } from './util';

function cuisineName(value: string): string {
  return CUISINE_OPTIONS.find((c) => c.value === value)?.label ?? value;
}

export default function FoodSection() {
  const { state, actions } = useHealth();
  const confirm = useConfirm();
  const p = state.settings.profile;
  const favorites = state.settings.favorites;
  const missingDefaults = DEFAULT_FAVORITES.filter((d) => !favorites.some((f) => f.id === d.id));

  const toggleCuisine = (value: string) => {
    const has = p.cuisines.includes(value);
    const cuisines = has ? p.cuisines.filter((c) => c !== value) : [...p.cuisines, value];
    actions.updateProfile({ cuisines });
  };

  const setGrams = (id: string, defaultGrams: number) =>
    actions.setSettings((s) => ({ ...s, favorites: s.favorites.map((f) => (f.id === id ? { ...f, defaultGrams } : f)) }));

  const unstar = async (item: FoodItem) => {
    const ok = await confirm({
      title: `Remove ${item.name} from favorites?`,
      body: 'It disappears from the Log screen’s Favorites row. You can star it again from Recents after you next log it.',
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    actions.toggleFavorite(item);
    toast(`Removed ${item.name} from favorites`);
  };

  const restoreDefaults = () => {
    if (!missingDefaults.length) return;
    actions.setSettings((s) => ({ ...s, favorites: [...s.favorites, ...missingDefaults.filter((d) => !s.favorites.some((f) => f.id === d.id))] }));
    toast(`Restored ${missingDefaults.length} default favorite${missingDefaults.length === 1 ? '' : 's'}`);
  };

  return (
    <>
      <Field label="Cuisine priors" hint="Tells the food estimator which dishes to assume first (e.g. “kebab” → seekh, not doner) and which portion sizes are typical.">
        <div className="flex flex-wrap gap-2">
          {CUISINE_OPTIONS.map((c) => (
            <Chip key={c.value} size="sm" color="blue" active={p.cuisines.includes(c.value)} pressed={p.cuisines.includes(c.value)} onClick={() => toggleCuisine(c.value)}>
              {c.label}
            </Chip>
          ))}
        </div>
      </Field>

      <TextField
        label="Food notes"
        value={p.foodNotes}
        multiline
        rows={3}
        maxLength={400}
        placeholder="e.g. Mostly restaurant food; weighs portions in grams; no pork."
        hint="Sent with every food estimate and coach turn. Allergies and dislikes go here."
        onChange={(foodNotes) => actions.updateProfile({ foodNotes })}
      />

      <SubHeading
        action={
          missingDefaults.length > 0 ? (
            <Button variant="ghost" size="sm" icon={<RotateCcw aria-hidden />} onClick={restoreDefaults}>
              Restore defaults
            </Button>
          ) : undefined
        }
      >
        Favorites ({favorites.length})
      </SubHeading>

      {favorites.length === 0 ? (
        <Note>No starred foods yet. Star a recent food on the Log screen (or restore the default staples) to keep one-tap adds here.</Note>
      ) : (
        <ul className="divide-y divide-hx-border/60">
          {favorites.map((f) => (
            <FavoriteRow key={f.id} item={f} onGrams={(g) => setGrams(f.id, g)} onUnstar={() => unstar(f)} />
          ))}
        </ul>
      )}
      <Note className="text-hx-muted">Portion is the gram amount added when you tap the favorite; macros scale from its per-100 g values.</Note>
    </>
  );
}

function FavoriteRow({ item, onGrams, onUnstar }: { item: FoodItem; onGrams: (g: number) => void; onUnstar: () => void }) {
  const g = item.defaultGrams > 0 ? item.defaultGrams : 100;
  const kcal = (item.per100.kc * g) / 100;
  const protein = (item.per100.p * g) / 100;
  const unit = item.unitName && item.unitGrams ? ` · 1 ${item.unitName} = ${fmt(item.unitGrams)} g` : '';
  return (
    <li className="flex items-center gap-3 py-2.5">
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-medium text-hx-text truncate">{item.name}</p>
        <p className="text-[12px] leading-4 text-hx-muted truncate">
          {fmt(kcal)} kcal · {fmt(protein)} g P per portion{item.cuisine ? ` · ${cuisineName(item.cuisine)}` : ''}
          {unit}
        </p>
      </div>
      <NumberField label={`${item.name} portion`} hideLabel value={item.defaultGrams} min={5} max={2000} step={5} unit="g" className="w-28 shrink-0" onCommit={onGrams} />
      <button
        type="button"
        onClick={onUnstar}
        aria-label={`Remove ${item.name} from favorites`}
        aria-pressed
        className="w-11 h-11 shrink-0 inline-flex items-center justify-center rounded-xl text-hx-yellow hover:bg-hx-card2"
      >
        <Star className="w-[18px] h-[18px]" fill="currentColor" aria-hidden />
      </button>
    </li>
  );
}
