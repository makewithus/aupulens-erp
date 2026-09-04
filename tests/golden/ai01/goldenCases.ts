import mongoose from "mongoose";

/**
 * AI-01's golden dataset (docs/ai/BRIEF-09-VERIFICATION.md 0.3), built to the same standard as
 * AI-27's (`tests/golden/ai27/goldenCases.ts`).
 *
 * **Why this doesn't need real sample documents or a tolerance band** (correcting an
 * over-cautious note in `docs/ai/GOLDEN_DATASETS.md`): AI-01 reacts to `document.received`
 * against an already-extracted `ExtractedDocument` row (`models/ai/ExtractedDocument.ts`,
 * `lib/docIntel/extractionSchemas.ts`). The LLM/OCR extraction itself happens upstream in
 * `lib/docIntel/` — NOT inside this workflow (see `lib/aiRuntime/workflows/ai-01-document-ingestion/index.ts`'s
 * own doc comment: "Extends `lib/docIntel/`, does not duplicate it"). So this workflow's own
 * `extract`/`reason` logic — duplicate check, arithmetic reconciliation, currency check, vendor
 * match, tax-rate tolerance check — is 100% deterministic given a seeded `ExtractedDocument`,
 * exactly like AI-27's finding logic is deterministic given seeded `Invoice` rows. No binary
 * documents, no live model call, no tolerance band needed.
 *
 * `tests/golden/ai01.golden.test.ts` is the harness that seeds each case (a `Vendor`, optionally
 * a prior `Invoice` for the duplicate case and a `TaxRate` for the tax cases, then an
 * `ExtractedDocument`), runs the real workflow through `runWorkflow()`, and reports a pass rate.
 */

export interface GoldenExtractionSeed {
  vendorName: string;
  billNumber: string;
  currency: string;
  lineItems: { description: string; quantity: number; unitPrice: number; amount: number }[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  confidence?: number;
}

export interface GoldenCase {
  id: string;
  description: string;
  /** Whether a Vendor record matching `extraction.vendorName` (case-insensitive, exact) already exists. */
  seedVendor: boolean;
  /** Whether an active TaxRate (18% GST, appliesTo "purchase") should be seeded for the tenant. */
  seedTaxRate: boolean;
  /** When set, seeds one existing posted-shape Invoice (moveType in_invoice) for the SAME vendor
   *  with this sourceDocument + amountTotal, so the duplicate check has something to match against. */
  seedPriorBill?: { billNumber: string; amountTotal: number };
  /** Whether the triggering event carries a real acting user (needed to reach DRAFT autonomy and
   *  actually write an Invoice — see the workflow's `act()`: no acting user falls back to
   *  propose-only). All cases here use a real acting user so the DRAFT-autonomy write path is
   *  actually exercised for the happy-path cases. */
  extraction: GoldenExtractionSeed;
  /** What a correct run of AI-01 must produce. */
  expected: {
    status: "completed" | "escalated";
    /** The dominant AI_FINDING_TYPE of findings[0] — "proposal" (a draft bill is proposed / created)
     *  or "exception" (blocked, escalated for human review). */
    findingType: "proposal" | "exception";
    /** A substring that must appear in findings[0].title — proves the SPECIFIC branch fired,
     *  not just "some finding fired". */
    titleContains: string;
    /** Whether a new Invoice (moveType in_invoice) must exist after the run. */
    invoiceCreated: boolean;
  };
}

export const AI01_GOLDEN_CASES: GoldenCase[] = [
  {
    id: "clean-known-vendor-happy-path",
    description: "Known vendor, arithmetic reconciles, INR, no tax — must draft a bill (the correct-detection case)",
    seedVendor: true,
    seedTaxRate: false,
    extraction: {
      vendorName: "Golden Vendor Alpha",
      billNumber: "ALPHA-INV-001",
      currency: "INR",
      lineItems: [{ description: "Widgets", quantity: 2, unitPrice: 500, amount: 1000 }],
      subtotal: 1000,
      taxAmount: 0,
      totalAmount: 1000,
      confidence: 92,
    },
    expected: { status: "completed", findingType: "proposal", titleContains: "ready to draft", invoiceCreated: true },
  },
  {
    id: "duplicate-bill-flagged",
    description: "Same vendor + same bill number as an existing Invoice — must escalate as a possible duplicate, not draft",
    seedVendor: true,
    seedTaxRate: false,
    seedPriorBill: { billNumber: "DUP-100", amountTotal: 5000 },
    extraction: {
      vendorName: "Golden Vendor Bravo",
      billNumber: "DUP-100",
      currency: "INR",
      lineItems: [{ description: "Services", quantity: 1, unitPrice: 5000, amount: 5000 }],
      subtotal: 5000,
      taxAmount: 0,
      totalAmount: 5000,
      confidence: 90,
    },
    expected: { status: "escalated", findingType: "exception", titleContains: "duplicate", invoiceCreated: false },
  },
  {
    id: "arithmetic-mismatch-escalates",
    description: "Line items / subtotal / total don't reconcile — must escalate, not guess",
    seedVendor: true,
    seedTaxRate: false,
    extraction: {
      vendorName: "Golden Vendor Charlie",
      billNumber: "CHARLIE-001",
      currency: "INR",
      lineItems: [{ description: "Misc", quantity: 1, unitPrice: 100, amount: 100 }],
      subtotal: 100,
      taxAmount: 0,
      totalAmount: 9999,
      confidence: 88,
    },
    expected: { status: "escalated", findingType: "exception", titleContains: "reconcile", invoiceCreated: false },
  },
  {
    id: "non-inr-escalates",
    description: "Non-INR currency, no FX rate source exists — must escalate rather than guess a conversion",
    seedVendor: true,
    seedTaxRate: false,
    extraction: {
      vendorName: "Golden Vendor Delta",
      billNumber: "DELTA-001",
      currency: "USD",
      lineItems: [{ description: "Consulting", quantity: 1, unitPrice: 1000, amount: 1000 }],
      subtotal: 1000,
      taxAmount: 0,
      totalAmount: 1000,
      confidence: 91,
    },
    expected: { status: "escalated", findingType: "exception", titleContains: "Non-INR", invoiceCreated: false },
  },
  {
    id: "unknown-vendor-escalates",
    description: "Vendor not found in the Vendor directory — must propose for review, must NOT auto-create a Vendor or an Invoice",
    seedVendor: false,
    seedTaxRate: false,
    extraction: {
      vendorName: "Totally Unknown Golden Vendor Ltd",
      billNumber: "UNK-001",
      currency: "INR",
      lineItems: [{ description: "Goods", quantity: 1, unitPrice: 2000, amount: 2000 }],
      subtotal: 2000,
      taxAmount: 0,
      totalAmount: 2000,
      confidence: 85,
    },
    expected: { status: "escalated", findingType: "exception", titleContains: "Unknown vendor", invoiceCreated: false },
  },
  {
    id: "tax-mismatch-escalates",
    description: "Stated tax disagrees materially with the best-matching active TaxRate's implied tax — must escalate",
    seedVendor: true,
    seedTaxRate: true,
    extraction: {
      vendorName: "Golden Vendor Echo",
      billNumber: "ECHO-001",
      currency: "INR",
      lineItems: [{ description: "Equipment", quantity: 1, unitPrice: 1000, amount: 1000 }],
      subtotal: 1000,
      taxAmount: 50, // 18% GST implies ~180; |180-50|=130, tolerance is max(1, 1000*0.01)=10 — well outside
      totalAmount: 1050,
      confidence: 87,
    },
    expected: { status: "escalated", findingType: "exception", titleContains: "disagrees", invoiceCreated: false },
  },
  {
    id: "rounding-and-tax-within-tolerance-silent",
    description:
      "The mandatory false-positive check: a ₹0.50 subtotal rounding difference (within the ₹1 tolerance) and tax within the 1% TaxRate tolerance — looks borderline but must NOT escalate; must draft normally",
    seedVendor: true,
    seedTaxRate: true,
    extraction: {
      vendorName: "Golden Vendor Foxtrot",
      billNumber: "FOX-001",
      currency: "INR",
      // lineItems sum to 1000 exactly; subtotal is stated as 1000.5 — a 0.5 rounding gap, within the ±1 tolerance.
      lineItems: [{ description: "Parts", quantity: 1, unitPrice: 1000, amount: 1000 }],
      subtotal: 1000.5,
      // 18% of 1000.5 implies ~180.09; stated tax 182 is within tolerance max(1, 1000.5*0.01)=10.005.
      taxAmount: 182,
      totalAmount: 1182.5, // = subtotal + taxAmount exactly, so the total-reconciliation check also passes.
      confidence: 93,
    },
    expected: { status: "completed", findingType: "proposal", titleContains: "ready to draft", invoiceCreated: true },
  },
];

export const GOLDEN_TENANT_PREFIX = "ai01-golden";
export const GOLDEN_CREATOR = new mongoose.Types.ObjectId();
