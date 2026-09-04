import mongoose from "mongoose";

/**
 * AI-09's golden dataset (docs/ai/BRIEF-09-VERIFICATION.md Part 0.3) — realistic, tenant-
 * anonymised fixtures with a KNOWN-CORRECT expected outcome per case, mirroring
 * `tests/golden/ai27/goldenCases.ts`'s shape for AI-09's own fixture type (SaleOrder divergence).
 *
 * AI-09 (revenue recognition intelligence) is fully deterministic — the four-quantity divergence
 * (contracted/billed/delivered/recognised) is a straight comparison, no LLM call anywhere in the
 * workflow (see the workflow's own module doc comment). Each case seeds one SaleOrder (optionally
 * with a SalesInvoice and/or a stated recognition method) and runs `ai.sweep.hourly` once.
 *
 * `tests/golden/ai09.golden.test.ts` is the harness that runs these and reports a pass rate.
 */

export interface Ai09GoldenCase {
  id: string;
  description: string;
  customerName: string;
  amount: number;
  shipmentStatus?: "fulfilled";
  /** If set, a SalesInvoice for this amount is created and linked to the order. */
  billedAmount?: number;
  method?: "point_in_time" | "over_time" | "milestone";
  /** Only meaningful when `method` is set — stamps `revenueRecognition.recognizedAt` to now. */
  recognized?: boolean;
  /** Order name — used to test the subscription-keyword over_time inference when no `method` is stated. */
  orderName?: string;
  /** Whether income/asset_current/liability_current accounts exist for act() to draft against. */
  createAccounts: boolean;
  /** What a correct run of AI-09 must produce. */
  expected: {
    /** Exact set of finding titles expected (order-independent, exact match). */
    findingTitles: string[];
    journalCountAfterSweep: number;
    scheduleCreatedAfterSweep: boolean;
  };
}

export const AI09_GOLDEN_CASES: Ai09GoldenCase[] = [
  {
    id: "point-in-time-recognition-drafts-journal",
    description: "Delivered, billed 40000, stated point_in_time method, not yet recognised — a Deferred revenue finding (snapshot before the draft) AND a recognition journal drafted this same run",
    customerName: "Golden PIT Customer",
    amount: 40000,
    shipmentStatus: "fulfilled",
    billedAmount: 40000,
    method: "point_in_time",
    recognized: false,
    createAccounts: true,
    expected: { findingTitles: ["Deferred revenue"], journalCountAfterSweep: 1, scheduleCreatedAfterSweep: false },
  },
  {
    id: "fully-recognised-silent",
    description: "Fully delivered, fully billed, fully recognised — the mandatory false positive: must raise ZERO findings and draft nothing",
    customerName: "Golden Clean Customer",
    amount: 30000,
    shipmentStatus: "fulfilled",
    billedAmount: 30000,
    method: "point_in_time",
    recognized: true,
    createAccounts: true,
    expected: { findingTitles: [], journalCountAfterSweep: 0, scheduleCreatedAfterSweep: false },
  },
  {
    id: "revenue-leakage-no-accounts",
    description: "Delivered but never billed, no journal accounts configured — a revenue-leakage anomaly finding naming the customer, no journal drafted (no accounts to draft against)",
    customerName: "Golden Leakage Customer",
    amount: 50000,
    shipmentStatus: "fulfilled",
    createAccounts: false,
    expected: { findingTitles: ["Revenue leakage — Golden Leakage Customer delivered but never billed"], journalCountAfterSweep: 0, scheduleCreatedAfterSweep: false },
  },
  {
    id: "subscription-keyword-creates-schedule",
    description: "Order name contains 'Annual subscription' (no stated method) — inferred over_time basis, no divergence findings (nothing delivered/billed yet), a deferred_revenue AiSchedule is created",
    customerName: "Golden Subscription Customer",
    amount: 120000,
    orderName: "Annual subscription plan",
    createAccounts: true,
    expected: { findingTitles: [], journalCountAfterSweep: 0, scheduleCreatedAfterSweep: true },
  },
];

export const GOLDEN_TENANT_PREFIX = "ai09-golden";
export const GOLDEN_CREATOR = new mongoose.Types.ObjectId();
