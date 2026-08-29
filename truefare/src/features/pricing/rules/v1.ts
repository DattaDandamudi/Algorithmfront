import type { FeeRuleSet } from '../types';

/**
 * FEE RULES v1 — versioned DATA, not code. Sources: researched 2025–26
 * fee structures (platform help pages, fee-comparison studies, regulatory
 * news). Real-world rules change quarterly (Grubhub's Feb-2026 $50+
 * waiver, indexed CO/NYC values), which is exactly why this lives in one
 * swappable, versioned table. Every quote stamps this version.
 */
export const FEE_RULES_V1: FeeRuleSet = {
  version: 'v1-2026-08',
  effectiveDate: '2026-08-29',

  platforms: {
    doordash: {
      // 2024 fee-model change: delivery fee is FIXED per merchant;
      // distance and surge variability live in the service fee.
      serviceFee: {
        bps: 1500,
        minCents: 300,
        capCents: 900,
        distanceBump: { thresholdMiles: 5, bps: 200 },
        surgeBpsByDaypart: { lunch: 150, dinner: 250, latenight: 100 },
      },
      deliveryFee: { minCents: 199, maxCents: 549, stepCents: 50, fixedPerMerchant: true },
      smallOrder: { thresholdCents: 1200, feeCents: 250 },
      membership: {
        id: 'dashpass',
        label: 'DashPass',
        deliveryWaiverMinCents: 1200,
        serviceBpsOverride: { bps: 500, minCents: 100 },
      },
      etaBiasMinutes: 2,
    },

    ubereats: {
      serviceFee: { bps: 1500, minCents: 300, capCents: 900 },
      deliveryFee: {
        minCents: 49,
        maxCents: 699,
        stepCents: 50,
        surgeMultiplierByDaypart: { lunch: 1.15, dinner: 1.25, latenight: 1.1 },
        longRange: { thresholdMiles: 7, feeCents: 299 },
      },
      smallOrder: { thresholdCents: 1000, feeCents: 200 },
      membership: {
        id: 'uber_one',
        label: 'Uber One',
        deliveryWaiverMinCents: 1500,
        subtotalDiscount: { bps: 1000, capCents: 1000 },
      },
      etaBiasMinutes: -3, // consistently the fastest in field studies
    },

    grubhub: {
      // Lowest service fees of the majors; less surge-driven.
      serviceFee: { bps: 800, minCents: 200, capCents: 900 },
      deliveryFee: { minCents: 199, maxCents: 549, stepCents: 50, fixedPerMerchant: true },
      smallOrder: { thresholdCents: 1000, feeCents: 200 },
      membership: {
        id: 'grubhub_plus',
        label: 'Grubhub+',
        deliveryWaiverMinCents: 1200,
        serviceMultiplier: 0.7,
      },
      // Feb 2026: delivery AND service fees waived on $50+ orders, for everyone.
      feeWaiverSubtotalCents: 5000,
      etaBiasMinutes: 5,
    },

    postmates: {
      // Runs on the Uber Eats backend: same catalog prices and service
      // fee; delivery fee mirrors ubereats plus a small cosmetic delta.
      serviceFee: { bps: 1500, minCents: 300, capCents: 900 },
      deliveryFee: {
        minCents: 49,
        maxCents: 699,
        stepCents: 50,
        surgeMultiplierByDaypart: { lunch: 1.15, dinner: 1.25, latenight: 1.1 },
        longRange: { thresholdMiles: 7, feeCents: 299 },
        mirrorsUberEatsWithDeltaCents: 50,
      },
      smallOrder: { thresholdCents: 1200, feeCents: 199 },
      membership: {
        id: 'uber_one',
        label: 'Uber One',
        deliveryWaiverMinCents: 1500,
        subtotalDiscount: { bps: 1000, capCents: 1000 },
      },
      etaBiasMinutes: -2,
    },
  },

  metros: {
    nyc: {
      id: 'nyc',
      label: 'New York City',
      taxRate: 0.08875,
      feesTaxable: true, // NY: delivery charges are part of the taxable receipt
      regulatory: {
        doordash: [{ label: 'Regulatory Response Fee', feeCents: 199, taxable: true }],
        ubereats: [{ label: 'NYC Regulatory Fee', feeCents: 149, taxable: true }],
        postmates: [{ label: 'NYC Regulatory Fee', feeCents: 149, taxable: true }],
      },
      note: 'On the real apps in NYC, tips are prompted after checkout — totals here include your tip for comparability.',
    },
    la: {
      id: 'la',
      label: 'Los Angeles',
      taxRate: 0.0975,
      feesTaxable: false, // CA: separately-stated delivery charges exempt
      regulatory: {
        ubereats: [{ label: 'CA Driver Benefits', feeCents: 99, taxable: false }],
        postmates: [{ label: 'CA Driver Benefits', feeCents: 99, taxable: false }],
        grubhub: [{ label: 'CA Driver Benefits', feeCents: 150, taxable: false }],
      },
      serviceBumpBps: { doordash: 150 }, // DD folds CA driver benefits into the service fee
    },
    sf: {
      id: 'sf',
      label: 'San Francisco',
      taxRate: 0.08625,
      feesTaxable: false,
      regulatory: {
        ubereats: [{ label: 'CA Driver Benefits', feeCents: 200, taxable: false }],
        postmates: [{ label: 'CA Driver Benefits', feeCents: 200, taxable: false }],
        grubhub: [{ label: 'CA Driver Benefits', feeCents: 150, taxable: false }],
      },
      serviceBumpBps: { doordash: 150 },
    },
    seattle: {
      id: 'seattle',
      label: 'Seattle',
      taxRate: 0.1035,
      feesTaxable: true, // WA taxes the full selling price incl. fees
      regulatory: {
        doordash: [{ label: 'Local Operating Fee', feeCents: 499, taxable: true }],
        ubereats: [{ label: 'Local Operating Fee', feeCents: 499, taxable: true }],
        grubhub: [{ label: 'Local Operating Fee', feeCents: 499, taxable: true }],
        postmates: [{ label: 'Local Operating Fee', feeCents: 499, taxable: true }],
      },
      note: 'Seattle-area regulatory fees are the highest in the country right now.',
    },
    chicago: {
      id: 'chicago',
      label: 'Chicago',
      taxRate: 0.1175, // incl. restaurant tax
      feesTaxable: false,
      regulatory: {},
    },
    austin: {
      id: 'austin',
      label: 'Austin',
      taxRate: 0.0825,
      feesTaxable: true, // TX generally taxes delivery charges on taxable sales
      regulatory: {},
    },
    denver: {
      id: 'denver',
      label: 'Denver',
      taxRate: 0.0881,
      feesTaxable: false,
      regulatory: {
        doordash: [{ label: 'CO Retail Delivery Fee', feeCents: 30, taxable: false }],
        ubereats: [{ label: 'CO Retail Delivery Fee', feeCents: 30, taxable: false }],
        grubhub: [{ label: 'CO Retail Delivery Fee', feeCents: 30, taxable: false }],
        postmates: [{ label: 'CO Retail Delivery Fee', feeCents: 30, taxable: false }],
      },
    },
  },
};

/** Seattle-only: DoorDash long-distance add-on past 6 miles. */
export const SEATTLE_DD_LONG_DISTANCE = { thresholdMiles: 6, feeCents: 199 };
