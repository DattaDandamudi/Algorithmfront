import type { MealPeriod } from '../../lib/time';
import type {
  MembershipId,
  MenuItem,
  MetroId,
  Platform,
  Restaurant,
} from '../catalog/types';

export type QuoteLineKind =
  | 'subtotal'
  | 'discount'
  | 'fee'
  | 'regulatory'
  | 'tax'
  | 'tip';

export interface QuoteLine {
  id: string;
  label: string;
  amountCents: number; // negative for discounts
  kind: QuoteLineKind;
  taxable: boolean;
  note?: string;
}

/**
 * MealMe-final_quote-shaped so a real aggregator adapter can fill this
 * with zero UI changes. Everything the Compare screen renders lives here.
 */
export interface ProviderQuote {
  platform: Platform;
  status: 'ok' | 'unavailable';
  subtotal_cents: number;
  delivery_fee_cents: number;
  service_fee_cents: number;
  small_order_fee_cents: number;
  regulatory_fees_cents: number;
  discount_cents: number; // positive number; rendered as negative line
  sales_tax_cents: number;
  tip_cents: number;
  total_cents: number;
  lines: QuoteLine[]; // ordered exactly as a checkout screen
  etaMinutes: { min: number; max: number };
  membershipApplied: MembershipId | null;
  /** What this platform's membership saves (or would save) on this order. */
  membershipSavingsCents: number;
  meta: {
    estimated: true;
    rulesVersion: string;
    generatedAt: string; // ISO
    seedKey: string;
  };
}

export interface QuoteCartLine {
  item: MenuItem;
  qty: number;
}

/** Fully-resolved input to the pure engine (no lookups inside). */
export interface QuoteInput {
  restaurant: Restaurant;
  lines: QuoteCartLine[];
  metro: MetroRules;
  memberships: MembershipId[];
  tipPercent: number;
  daypart: MealPeriod;
}

export interface QuoteRequest {
  restaurantId: string;
  items: { itemId: string; qty: number }[];
  metroId: MetroId;
  memberships: MembershipId[];
  tipPercent: number;
  daypart: MealPeriod;
}

/* ------------------------------------------------------------------ */
/* Versioned fee rules — data, not code. See rules/v1.ts               */
/* ------------------------------------------------------------------ */

export interface ServiceFeeRule {
  bps: number;
  minCents: number;
  capCents: number;
  /** Extra bps when restaurant distance exceeds threshold (DoorDash 2024 model). */
  distanceBump?: { thresholdMiles: number; bps: number };
  /** Surge folded into the service fee, by daypart (DoorDash). */
  surgeBpsByDaypart?: Partial<Record<MealPeriod, number>>;
}

export interface DeliveryFeeRule {
  /** Seeded per-merchant base range, cents. */
  minCents: number;
  maxCents: number;
  stepCents: number;
  /** Multiplier by daypart (Uber Eats surge expresses in the delivery fee). */
  surgeMultiplierByDaypart?: Partial<Record<MealPeriod, number>>;
  /** Long-range add-on past a distance threshold. */
  longRange?: { thresholdMiles: number; feeCents: number };
  /** Fee never re-rolls with daypart (DoorDash: fixed per merchant). */
  fixedPerMerchant?: boolean;
  /** Cosmetic delta added on top of the ubereats fee (Postmates skin). */
  mirrorsUberEatsWithDeltaCents?: number;
}

export interface MembershipRule {
  id: MembershipId;
  label: string;
  /** Delivery fee waived when subtotal meets this. */
  deliveryWaiverMinCents: number;
  /** Replace service fee bps entirely (DashPass → 5%). */
  serviceBpsOverride?: { bps: number; minCents: number };
  /** Multiply the service fee pct (Grubhub+ → ×0.7). */
  serviceMultiplier?: number;
  /** Subtotal discount line (Uber One 10%, capped). */
  subtotalDiscount?: { bps: number; capCents: number };
}

export interface PlatformFeeRules {
  serviceFee: ServiceFeeRule;
  deliveryFee: DeliveryFeeRule;
  smallOrder: { thresholdCents: number; feeCents: number };
  membership: MembershipRule;
  /** Grubhub Feb-2026: subtotal ≥ threshold ⇒ delivery AND service fees $0. */
  feeWaiverSubtotalCents?: number;
  etaBiasMinutes: number;
}

export interface RegulatoryLine {
  label: string;
  feeCents: number;
  taxable: boolean;
  note?: string;
}

export interface MetroRules {
  id: MetroId | 'custom';
  label: string;
  /** Combined state+local sales tax on prepared food, as a decimal. */
  taxRate: number;
  /** Whether delivery/service/small-order/regulatory fees are taxed. */
  feesTaxable: boolean;
  /** Flat per-order regulatory lines, per platform. */
  regulatory: Partial<Record<Platform, RegulatoryLine[]>>;
  /** Bps folded into the service fee instead of a line (DD in CA). */
  serviceBumpBps?: Partial<Record<Platform, number>>;
  /** Metro-wide note shown on the compare screen. */
  note?: string;
}

export interface FeeRuleSet {
  version: string;
  effectiveDate: string;
  platforms: Record<Platform, PlatformFeeRules>;
  metros: Record<MetroId, MetroRules>;
}
