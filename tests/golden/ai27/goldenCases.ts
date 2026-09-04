import mongoose from "mongoose";

/**
 * AI-27's golden dataset (docs/ai/BRIEF-08b-FINAL.md C.2) — realistic, tenant-anonymised,
 * versioned fixtures with a KNOWN-CORRECT expected classification per case. Formalises the exact
 * false-positive fixtures this project already built and relied on throughout Chunk 8a
 * (`tests/ai/aiRuntime/ai27DuplicateDetection.test.ts`) into a reusable golden-dataset shape,
 * rather than writing a second, different set of fixtures (C.2: "formalise them into the harness
 * rather than rewriting them").
 *
 * `tests/golden/ai27.golden.test.ts` is the harness that runs these and reports a pass rate.
 */

export interface GoldenBillSeed {
  vendorName: string;
  sourceDocument?: string;
  amount: number;
  date: string; // ISO date
  poReference?: string;
}

export interface GoldenCase {
  id: string;
  description: string;
  bills: GoldenBillSeed[];
  /** What a correct run of AI-27 must produce. */
  expected: {
    /** How many "duplicate bill" (certain/probable) findings should be raised — the version=1
     *  baseline other versions get diffed against. */
    duplicateFindingCount: number;
  };
}

export const AI27_GOLDEN_CASES: GoldenCase[] = [
  {
    id: "same-number-different-formatting",
    description: "Same vendor, same document number formatted differently (INV-001 vs inv 0001) — must flag as certain",
    bills: [
      { vendorName: "Golden Vendor A", sourceDocument: "INV-001", amount: 5000, date: "2026-01-05" },
      { vendorName: "Golden Vendor A", sourceDocument: "inv 0001", amount: 5000, date: "2026-01-06" },
    ],
    expected: { duplicateFindingCount: 1 },
  },
  {
    id: "twelve-monthly-subscriptions",
    description: "Twelve identical monthly subscription invoices, same vendor, same amount, consecutive months — the mandatory false positive, must raise ZERO",
    bills: Array.from({ length: 12 }, (_, m) => ({
      vendorName: "Golden SaaS Vendor",
      sourceDocument: `SUB-2026-${String(m + 1).padStart(2, "0")}`,
      amount: 999,
      date: `2026-${String(m + 1).padStart(2, "0")}-05`,
    })),
    expected: { duplicateFindingCount: 0 },
  },
  {
    id: "legitimate-po-instalments",
    description: "Two legitimate instalments against the same PO, different amounts — must not flag",
    bills: [
      { vendorName: "Golden Instalment Vendor", sourceDocument: "PO-BILL-1", poReference: "PO-500", amount: 3000, date: "2026-03-01" },
      { vendorName: "Golden Instalment Vendor", sourceDocument: "PO-BILL-2", poReference: "PO-500", amount: 4500, date: "2026-03-15" },
    ],
    expected: { duplicateFindingCount: 0 },
  },
  {
    id: "same-vendor-same-amount-same-date",
    description: "Same vendor, same amount, exact same date, different document numbers — a real duplicate-entry pattern, must flag",
    bills: [
      { vendorName: "Golden Repeat Vendor", sourceDocument: "A-100", amount: 12000, date: "2026-04-10" },
      { vendorName: "Golden Repeat Vendor", sourceDocument: "B-200", amount: 12000, date: "2026-04-10" },
    ],
    expected: { duplicateFindingCount: 1 },
  },
];

export const GOLDEN_TENANT_PREFIX = "ai27-golden";
export const GOLDEN_CREATOR = new mongoose.Types.ObjectId();
