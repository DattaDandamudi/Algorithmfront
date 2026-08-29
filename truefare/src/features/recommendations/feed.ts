import { DAYPART_LABEL } from '../../lib/time';
import { formatCents } from '../../lib/money';
import type { Catalog, Dietary, MenuItem } from '../catalog/types';
import {
  COLD_START_EVENT_THRESHOLD,
  DECAY_HALF_LIFE_DAYS,
  DIVERSITY,
  FEED,
} from './constants';
import type { TasteProfile } from './profile';
import {
  coldStartScore,
  itemSimilarity,
  scoreItem,
  violatesDietary,
  type ScoreContext,
} from './score';

export interface FeedRowData {
  key: string;
  title: string;
  subtitle?: string;
  items: MenuItem[];
}

/**
 * The 2-D feed: rank items within each row, rows stacked in fixed
 * priority, items deduped first-appearance-wins, cuisines diversified.
 */
export function buildFeed(
  catalog: Catalog,
  profile: TasteProfile,
  ctx: ScoreContext,
  now = Date.now()
): FeedRowData[] {
  const cold = profile.eventCount < COLD_START_EVENT_THRESHOLD;
  const eligible = catalog.items.filter((i) => !violatesDietary(i, ctx.dietary));
  const restaurantOf = (i: MenuItem) => catalog.restaurantsById.get(i.restaurantId)!;
  const score = (i: MenuItem) =>
    cold
      ? coldStartScore(i, restaurantOf(i), ctx)
      : scoreItem(i, restaurantOf(i), profile, ctx);

  const ranked = [...eligible].sort((a, b) => score(b) - score(a));
  const used = new Set<string>();

  const take = (
    pool: MenuItem[],
    max: number = FEED.rowMaxItems,
    ordered = false
  ): MenuItem[] => {
    const sorted = ordered ? pool : [...pool].sort((a, b) => score(b) - score(a));
    const fresh = sorted.filter((i) => !used.has(i.id));
    const diversified = diversify(fresh, restaurantOf).slice(0, max);
    diversified.forEach((i) => used.add(i.id));
    return diversified;
  };

  const rows: FeedRowData[] = [];
  const push = (row: FeedRowData) => {
    if (row.items.length >= FEED.rowMinItems && rows.length < FEED.maxRows) rows.push(row);
    else row.items.forEach((i) => used.delete(i.id)); // release for later rows
  };

  // 1 — Order again (frecency; always first when history exists)
  if (profile.orderHistory.size > 0) {
    const frecency = (i: MenuItem) => {
      const h = profile.orderHistory.get(i.id);
      if (!h) return 0;
      const daysSince = (now - h.lastAt) / 86_400_000;
      return h.count * Math.pow(0.5, daysSince / DECAY_HALF_LIFE_DAYS);
    };
    const pool = eligible
      .filter((i) => profile.orderHistory.has(i.id))
      .sort((a, b) => frecency(b) - frecency(a));
    const row = { key: 'order-again', title: 'Order again', items: [] as MenuItem[] };
    row.items = pool.filter((i) => !used.has(i.id)).slice(0, FEED.rowMaxItems);
    row.items.forEach((i) => used.add(i.id));
    if (row.items.length >= 1 && rows.length < FEED.maxRows) rows.push(row);
  }

  // 2 — Daypart hero row
  push({
    key: 'daypart',
    title: `Good ${DAYPART_LABEL[ctx.daypart]}`,
    subtitle: `What eats well right now`,
    items: take(eligible.filter((i) => i.mealPeriods.includes(ctx.daypart))),
  });

  // 3 — Picks for you (warm profiles only)
  if (!cold) {
    push({
      key: 'picks',
      title: 'Picks for you',
      subtitle: 'Ranked from what you view, cart and order',
      items: take(ranked, FEED.rowMaxItems, true),
    });
  }

  // 4 — Trending
  push({
    key: 'trending',
    title: 'Trending right now',
    items: take(
      [...eligible].sort(
        (a, b) => (ctx.trending.get(b.id) ?? 0) - (ctx.trending.get(a.id) ?? 0)
      ),
      8,
      true
    ),
  });

  // 5 — Because you ordered {item} (anchor = most recent order)
  if (!cold) {
    const lastOrderedId = [...profile.orderHistory.entries()].sort(
      (a, b) => b[1].lastAt - a[1].lastAt
    )[0]?.[0];
    const anchor = lastOrderedId ? catalog.itemsById.get(lastOrderedId) : undefined;
    if (anchor) {
      const anchorCuisine = restaurantOf(anchor).cuisine;
      const bySimilarity = [...eligible]
        .filter((i) => i.id !== anchor.id)
        .sort(
          (a, b) =>
            itemSimilarity(anchor, anchorCuisine, b, restaurantOf(b).cuisine) -
            itemSimilarity(anchor, anchorCuisine, a, restaurantOf(a).cuisine)
        );
      push({
        key: 'similar',
        title: `Because you ordered ${anchor.name}`,
        items: take(bySimilarity, 8, true),
      });
    }
  }

  // 6 — Try something new (exploration: cuisines never ordered)
  if (profile.orderedCuisines.size > 0) {
    push({
      key: 'explore',
      title: 'Try something new',
      subtitle: 'Loved elsewhere, new to you',
      items: take(
        eligible
          .filter((i) => !profile.orderedCuisines.has(restaurantOf(i).cuisine))
          .sort((a, b) => b.popularity - a.popularity),
        8,
        true
      ),
    });
  }

  // 7 — Fits your budget
  if (profile.priceMedianCents != null) {
    const cap = Math.ceil((profile.priceMedianCents * 1.1) / 500) * 500;
    push({
      key: 'budget',
      title: `Under ${formatCents(cap)}`,
      subtitle: 'Around your usual spend',
      items: take(eligible.filter((i) => i.platformPrices.ubereats <= cap)),
    });
  }

  // 8 — Dietary rows
  for (const d of ctx.dietary.slice(0, 1)) {
    push({
      key: `diet-${d}`,
      title: `${d[0].toUpperCase()}${d.slice(1)} for you`,
      items: take(eligible.filter((i) => i.dietary.includes(d as Dietary))),
    });
  }

  // 9 — Popular this week (fallback; leads cold-start feeds)
  push({
    key: 'popular',
    title: 'Popular this week',
    items: take(
      [...eligible].sort((a, b) => b.popularity - a.popularity),
      FEED.rowMaxItems,
      true
    ),
  });

  return rows;
}

/** Max 2 consecutive same-cuisine, ≤3 per cuisine per 10 slots. */
function diversify(
  items: MenuItem[],
  restaurantOf: (i: MenuItem) => { cuisine: string }
): MenuItem[] {
  const out: MenuItem[] = [];
  const deferred: MenuItem[] = [];
  for (const item of items) {
    const cuisine = restaurantOf(item).cuisine;
    const lastTwoSame =
      out.length >= DIVERSITY.maxConsecutiveSameCuisine &&
      out
        .slice(-DIVERSITY.maxConsecutiveSameCuisine)
        .every((i) => restaurantOf(i).cuisine === cuisine);
    const windowCount = out
      .slice(-10)
      .filter((i) => restaurantOf(i).cuisine === cuisine).length;
    if (lastTwoSame || windowCount >= DIVERSITY.maxPerCuisinePerTen) {
      deferred.push(item);
    } else {
      out.push(item);
    }
  }
  return [...out, ...deferred];
}

export type { ScoreContext };
