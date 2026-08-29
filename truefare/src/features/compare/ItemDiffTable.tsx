import clsx from 'clsx';
import { formatCents } from '../../lib/money';
import { platformColors } from '../../design/tokens';
import { corePlatformOf, type CartItem, type Catalog, type Platform, type Restaurant } from '../catalog/types';

/**
 * Per-item price diff: every cart item priced on every platform, next to
 * its in-store reference — markup as a column, not a mystery. The cheapest
 * cell per row is tinted pistachio.
 */
export function ItemDiffTable({
  catalog,
  restaurant,
  items,
}: {
  catalog: Catalog;
  restaurant: Restaurant;
  items: CartItem[];
}) {
  const platforms: Platform[] = ['doordash', 'ubereats', 'grubhub', 'postmates'];
  return (
    <div className="overflow-x-auto rounded-cell border border-hairline bg-surface shadow-card">
      <table className="w-full min-w-[560px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-hairline text-left">
            <th className="p-3.5 font-medium text-muted">Item</th>
            {platforms.map((p) => (
              <th key={p} className="p-3.5 text-right font-medium text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: platformColors[p].accent }}
                  />
                  {platformColors[p].short}
                </span>
              </th>
            ))}
            <th className="p-3.5 text-right font-medium text-muted">In-store</th>
          </tr>
        </thead>
        <tbody>
          {items.map(({ itemId, qty }) => {
            const item = catalog.itemsById.get(itemId);
            if (!item) return null;
            const prices = platforms.map((p) =>
              restaurant.platforms.includes(p)
                ? item.platformPrices[corePlatformOf(p)]
                : null
            );
            const cheapest = Math.min(...prices.filter((v): v is number => v != null));
            return (
              <tr key={itemId} className="border-b border-hairline last:border-0">
                <td className="p-3.5 font-medium text-ink">
                  {item.name}
                  {qty > 1 && <span className="ml-1 text-muted">×{qty}</span>}
                </td>
                {prices.map((price, i) => (
                  <td
                    key={platforms[i]}
                    className={clsx(
                      'tabular p-3.5 text-right',
                      price == null && 'text-muted/50',
                      price != null && price === cheapest
                        ? 'bg-pistachio/60 font-semibold text-savings'
                        : 'text-ink'
                    )}
                  >
                    {price == null ? '—' : formatCents(price * qty)}
                  </td>
                ))}
                <td className="tabular p-3.5 text-right text-muted">
                  {formatCents(item.basePriceCents * qty)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
