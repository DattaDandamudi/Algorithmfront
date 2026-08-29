import { formatCents } from '../../../lib/money';
import { platformColors, platformAccentVar } from '../../../design/tokens';
import type { CorePlatform, MenuItem, Restaurant } from '../types';

const CORE: CorePlatform[] = ['doordash', 'ubereats', 'grubhub'];

/**
 * The per-item price vector, worn on the sleeve: each platform's menu
 * price for this item next to its in-store reference. The quiet heart of
 * the product — markup made visible at the item level.
 */
export function PriceVectorChips({
  item,
  restaurant,
}: {
  item: MenuItem;
  restaurant: Restaurant;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {CORE.filter(
        (p) => restaurant.platforms.includes(p) || restaurant.platforms.includes('postmates')
      ).map((p) => {
        const c = platformColors[p];
        const markupPct = Math.round(
          ((item.platformPrices[p] - item.basePriceCents) / item.basePriceCents) * 100
        );
        return (
          <span
            key={p}
            className="inline-flex items-center gap-1 text-[12px] font-medium text-muted"
            title={`${c.label}: ${formatCents(item.platformPrices[p])} (+${markupPct}% vs in-store)`}
          >
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: platformAccentVar(p) }}
            />
            <span className="tabular">{formatCents(item.platformPrices[p])}</span>
          </span>
        );
      })}
      <span className="text-[12px] text-muted/70">
        in-store <span className="tabular">{formatCents(item.basePriceCents)}</span>
      </span>
    </div>
  );
}
