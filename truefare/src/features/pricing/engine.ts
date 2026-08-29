import { createRng } from '../../lib/rng';
import { applyBps, clampCents, formatCents } from '../../lib/money';
import { corePlatformOf, type Platform } from '../catalog/types';
import type { MealPeriod } from '../../lib/time';
import type {
  FeeRuleSet,
  PlatformFeeRules,
  ProviderQuote,
  QuoteInput,
  QuoteLine,
} from './types';
import { SEATTLE_DD_LONG_DISTANCE } from './rules/v1';

/**
 * The deterministic quote pipeline. Money math is ALWAYS code — ordered,
 * auditable, reproducible: the same (rules version, restaurant, platform,
 * metro, daypart) always yields the same quote within a session, and a
 * daypart rollover re-rolls it (prices feel alive, never random).
 *
 * Composition order is fixed and load-bearing:
 *  1 resolve platform prices → subtotal      8 regulatory lines
 *  2 seed RNG                                9 membership discount line
 *  3 delivery fee                           10 tax
 *  4 Grubhub $50+ fee waiver                11 tip
 *  5 membership delivery waiver             12 total + lines
 *  6 service fee                            13 membership counterfactual
 *  7 small-order fee                        14 ETA
 */

const ETA_SURGE: Partial<Record<MealPeriod, number>> = {
  lunch: 5,
  dinner: 8,
  latenight: 3,
};

/** Style a fee like real checkout screens: .x9 endings. */
function to99(cents: number): number {
  if (cents <= 0) return 0;
  return Math.max(49, Math.round(cents / 10) * 10 - 1);
}

function merchantDeliveryBase(
  rules: FeeRuleSet,
  platformRules: PlatformFeeRules,
  restaurantId: string,
  platform: Platform
): number {
  const { minCents, maxCents, stepCents } = platformRules.deliveryFee;
  const rng = createRng(`${rules.version}:${restaurantId}:${platform}:delivery`);
  return to99(rng.range(minCents, maxCents, stepCents));
}

export function computeQuote(
  rules: FeeRuleSet,
  input: QuoteInput,
  platform: Platform,
  now: Date = new Date(),
  withCounterfactual = true
): ProviderQuote {
  const { restaurant, lines: cartLines, metro, memberships, tipPercent, daypart } = input;
  const platformRules = rules.platforms[platform];
  const seedKey = `${rules.version}:${restaurant.id}:${platform}:${metro.id}:${daypart}`;

  if (!restaurant.platforms.includes(platform)) {
    return emptyQuote(platform, rules.version, seedKey, now);
  }

  // 1 — subtotal from this platform's price vector
  const core = corePlatformOf(platform);
  const subtotal = cartLines.reduce(
    (sum, l) => sum + l.item.platformPrices[core] * l.qty,
    0
  );

  // 2 — seeded randomness for this (restaurant, platform, metro, daypart)
  const rng = createRng(seedKey);

  const membership = platformRules.membership;
  const isMember = memberships.includes(membership.id);

  // 3 — delivery fee
  let deliveryFee: number;
  const df = platformRules.deliveryFee;
  if (df.mirrorsUberEatsWithDeltaCents != null) {
    const ueRules = rules.platforms.ubereats;
    let base = merchantDeliveryBase(rules, ueRules, restaurant.id, 'ubereats');
    const surge = ueRules.deliveryFee.surgeMultiplierByDaypart?.[daypart] ?? 1;
    base = to99(Math.round(base * surge));
    const delta = createRng(`${seedKey}:pmdelta`).range(0, df.mirrorsUberEatsWithDeltaCents, 10);
    deliveryFee = to99(base + Math.round(delta));
  } else {
    let base = merchantDeliveryBase(rules, platformRules, restaurant.id, platform);
    if (!df.fixedPerMerchant) {
      const surge = df.surgeMultiplierByDaypart?.[daypart] ?? 1;
      base = to99(Math.round(base * surge));
    }
    deliveryFee = base;
  }
  let deliveryNote: string | undefined;
  if (df.longRange && restaurant.distanceMiles > df.longRange.thresholdMiles) {
    deliveryFee += df.longRange.feeCents;
    deliveryNote = `Includes ${formatCents(df.longRange.feeCents)} long-range fee`;
  }

  // 4 — Grubhub $50+ waiver: delivery AND service fees to $0 for everyone
  const feeWaiverApplies =
    platformRules.feeWaiverSubtotalCents != null &&
    subtotal >= platformRules.feeWaiverSubtotalCents;
  if (feeWaiverApplies) {
    deliveryFee = 0;
    deliveryNote = 'Fees waived on $50+ orders';
  }

  // 5 — membership delivery waiver
  let membershipApplied = false;
  if (!feeWaiverApplies && isMember && subtotal >= membership.deliveryWaiverMinCents) {
    deliveryFee = 0;
    deliveryNote = `$0 with ${membership.label}`;
    membershipApplied = true;
  }

  // 6 — service fee (percentage of the marked-up subtotal, min/cap clamped)
  let serviceFee = 0;
  let serviceNote: string | undefined;
  if (!feeWaiverApplies) {
    const sf = platformRules.serviceFee;
    let bps: number;
    let minCents = sf.minCents;
    if (isMember && membership.serviceBpsOverride) {
      bps = membership.serviceBpsOverride.bps;
      minCents = membership.serviceBpsOverride.minCents;
      serviceNote = `${bps / 100}% with ${membership.label}`;
      membershipApplied = true;
    } else {
      bps = sf.bps;
      if (sf.distanceBump && restaurant.distanceMiles > sf.distanceBump.thresholdMiles) {
        bps += sf.distanceBump.bps;
      }
      bps += sf.surgeBpsByDaypart?.[daypart] ?? 0;
      serviceNote = `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}% of subtotal`;
    }
    bps += metro.serviceBumpBps?.[platform] ?? 0;
    if (isMember && membership.serviceMultiplier) {
      bps = Math.round(bps * membership.serviceMultiplier);
      serviceNote = `Reduced with ${membership.label}`;
      membershipApplied = true;
    }
    serviceFee = clampCents(applyBps(subtotal, bps), minCents, sf.capCents);
  } else {
    serviceNote = 'Fees waived on $50+ orders';
  }

  // 7 — small-order fee
  let smallOrderFee = 0;
  let smallOrderNote: string | undefined;
  if (!feeWaiverApplies && subtotal < platformRules.smallOrder.thresholdCents) {
    smallOrderFee = platformRules.smallOrder.feeCents;
    smallOrderNote = `Add ${formatCents(platformRules.smallOrder.thresholdCents - subtotal)} more to remove`;
  }

  // 8 — regulatory lines
  const regulatoryLines: QuoteLine[] = (metro.regulatory[platform] ?? []).map((r, i) => ({
    id: `reg-${i}`,
    label: r.label,
    amountCents: r.feeCents,
    kind: 'regulatory',
    taxable: r.taxable,
    note: r.note,
  }));
  if (
    platform === 'doordash' &&
    metro.id === 'seattle' &&
    restaurant.distanceMiles > SEATTLE_DD_LONG_DISTANCE.thresholdMiles
  ) {
    regulatoryLines.push({
      id: 'reg-dd-longdist',
      label: 'Long-distance fee',
      amountCents: SEATTLE_DD_LONG_DISTANCE.feeCents,
      kind: 'regulatory',
      taxable: true,
    });
  }
  const regulatoryTotal = regulatoryLines.reduce((s, l) => s + l.amountCents, 0);

  // 9 — membership subtotal discount (Uber One)
  let discount = 0;
  if (isMember && membership.subtotalDiscount && subtotal >= membership.deliveryWaiverMinCents) {
    discount = Math.min(
      applyBps(subtotal, membership.subtotalDiscount.bps),
      membership.subtotalDiscount.capCents
    );
    membershipApplied = true;
  }

  // 10 — tax: rate × (subtotal − discount), plus fees where the state taxes them
  const taxableRegulatory = regulatoryLines
    .filter((l) => l.taxable)
    .reduce((s, l) => s + l.amountCents, 0);
  const taxBase =
    subtotal -
    discount +
    (metro.feesTaxable ? deliveryFee + serviceFee + smallOrderFee + taxableRegulatory : 0);
  const tax = Math.round(metro.taxRate * taxBase);

  // 11 — tip (on the pre-discount subtotal; never taxed)
  const tip = Math.round((tipPercent / 100) * subtotal);

  // 12 — total + display lines
  const total =
    subtotal - discount + deliveryFee + serviceFee + smallOrderFee + regulatoryTotal + tax + tip;

  const quoteLines: QuoteLine[] = [
    { id: 'subtotal', label: 'Subtotal', amountCents: subtotal, kind: 'subtotal', taxable: true },
  ];
  if (discount > 0) {
    quoteLines.push({
      id: 'discount',
      label: `${membership.label} discount`,
      amountCents: -discount,
      kind: 'discount',
      taxable: false,
    });
  }
  quoteLines.push(
    {
      id: 'delivery',
      label: 'Delivery fee',
      amountCents: deliveryFee,
      kind: 'fee',
      taxable: metro.feesTaxable,
      note: deliveryNote,
    },
    {
      id: 'service',
      label: 'Service fee',
      amountCents: serviceFee,
      kind: 'fee',
      taxable: metro.feesTaxable,
      note: serviceNote,
    }
  );
  if (smallOrderFee > 0) {
    quoteLines.push({
      id: 'small-order',
      label: 'Small order fee',
      amountCents: smallOrderFee,
      kind: 'fee',
      taxable: metro.feesTaxable,
      note: smallOrderNote,
    });
  }
  quoteLines.push(...regulatoryLines);
  quoteLines.push(
    { id: 'tax', label: 'Estimated tax', amountCents: tax, kind: 'tax', taxable: false },
    { id: 'tip', label: `Tip (${tipPercent}%)`, amountCents: tip, kind: 'tip', taxable: false }
  );

  // 13 — membership counterfactual: what does this platform's membership
  // save (or would it save) on this exact order?
  let membershipSavings = 0;
  if (withCounterfactual) {
    const toggled = isMember
      ? memberships.filter((m) => m !== membership.id)
      : [...memberships, membership.id];
    const other = computeQuote(
      rules,
      { ...input, memberships: toggled },
      platform,
      now,
      false
    );
    const totalWith = isMember ? total : other.total_cents;
    const totalWithout = isMember ? other.total_cents : total;
    membershipSavings = Math.max(0, totalWithout - totalWith);
  }

  // 14 — ETA
  const etaJitter = rng.int(-4, 4);
  const mid =
    restaurant.baseEtaMinutes +
    platformRules.etaBiasMinutes +
    (ETA_SURGE[daypart] ?? 0) +
    etaJitter;
  const etaMin = Math.max(8, mid - 4);

  return {
    platform,
    status: 'ok',
    subtotal_cents: subtotal,
    delivery_fee_cents: deliveryFee,
    service_fee_cents: serviceFee,
    small_order_fee_cents: smallOrderFee,
    regulatory_fees_cents: regulatoryTotal,
    discount_cents: discount,
    sales_tax_cents: tax,
    tip_cents: tip,
    total_cents: total,
    lines: quoteLines,
    etaMinutes: { min: etaMin, max: mid + 6 },
    membershipApplied: membershipApplied ? membership.id : null,
    membershipSavingsCents: membershipSavings,
    meta: {
      estimated: true,
      rulesVersion: rules.version,
      generatedAt: now.toISOString(),
      seedKey,
    },
  };
}

function emptyQuote(
  platform: Platform,
  rulesVersion: string,
  seedKey: string,
  now: Date
): ProviderQuote {
  return {
    platform,
    status: 'unavailable',
    subtotal_cents: 0,
    delivery_fee_cents: 0,
    service_fee_cents: 0,
    small_order_fee_cents: 0,
    regulatory_fees_cents: 0,
    discount_cents: 0,
    sales_tax_cents: 0,
    tip_cents: 0,
    total_cents: 0,
    lines: [],
    etaMinutes: { min: 0, max: 0 },
    membershipApplied: null,
    membershipSavingsCents: 0,
    meta: { estimated: true, rulesVersion, generatedAt: now.toISOString(), seedKey },
  };
}
