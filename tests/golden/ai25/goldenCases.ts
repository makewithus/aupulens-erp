import mongoose from "mongoose";

/**
 * AI-25's golden dataset (docs/ai/BRIEF-10-PRE-QA.md P0.6) — realistic, tenant-anonymised
 * fixtures with a KNOWN-CORRECT expected outcome per case, mirroring
 * `tests/golden/ai27/goldenCases.ts`'s shape for AI-25's own fixture type.
 *
 * AI-25 reads `tests/ai/aiRuntime/ai25WorkingCapitalIntelligence.test.ts` in full before writing
 * this — its formulas (DSO/DPO/DIO/CCC, stated once in `index.ts`'s own `FORMULA_USED` constant)
 * are plain arithmetic over `buildAgedPartnerReport()`/`buildPostedJournalReport()`, no LLM call
 * anywhere (read-only by construction — no write tool exists for this workflow at all). Each case
 * below reuses the exact fixture shapes the base unit test already proved correct to the unit
 * (e.g. `DSO = (32000/20000) x 28`, `DIO = (4000/2000) x 28 = 56`), formalised into the golden
 * harness rather than re-derived with new numbers.
 */

export interface Ai25JournalPosting {
  debitAccountKey: string;
  creditAccountKey: string;
  amount: number;
  date: string; // ISO date
  partnerKey?: string;
}

export interface Ai25AccountSeed {
  key: string;
  internalGroup: string;
  accountType: string;
  name: string;
}

export interface Ai25GoldenCase {
  id: string;
  description: string;
  accounts: Ai25AccountSeed[];
  partners: string[]; // partner keys to create as Customer records
  postings: Ai25JournalPosting[];
  period: string; // the period AI-25 evaluates
  expected: {
    dso?: number;
    dio?: number | null;
    /** When set, the dominant AR/AP driver's exact entity name and cash impact (to 2dp). */
    dominantDriver?: { type: "customer" | "vendor"; entityName: string; cashImpact: number };
    driverCount?: number;
    recommendedActionCount?: number;
  };
}

export const AI25_GOLDEN_CASES: Ai25GoldenCase[] = [
  {
    id: "dominant-late-customer-driver",
    description: "A single large late customer books a big new balance while everyone else is unchanged — must be identified as the dominant AR driver with driver cash impacts summing exactly to the AR movement",
    accounts: [
      { key: "ar", internalGroup: "asset", accountType: "asset_receivable", name: "Accounts Receivable" },
      { key: "income", internalGroup: "income", accountType: "income", name: "Sales Revenue" },
    ],
    partners: ["custA", "custB", "custC"],
    postings: [
      { debitAccountKey: "ar", creditAccountKey: "income", amount: 5000, date: "2026-01-10", partnerKey: "custA" },
      { debitAccountKey: "ar", creditAccountKey: "income", amount: 2000, date: "2026-01-10", partnerKey: "custB" },
      { debitAccountKey: "ar", creditAccountKey: "income", amount: 3000, date: "2026-01-10", partnerKey: "custC" },
      { debitAccountKey: "ar", creditAccountKey: "income", amount: 50000, date: "2026-02-05", partnerKey: "custB" },
    ],
    period: "2026-02",
    expected: { dominantDriver: { type: "customer", entityName: "custB", cashImpact: 50000 }, driverCount: 1, recommendedActionCount: 1 },
  },
  {
    id: "dio-computable-after-inventory-mapping",
    description: "Opening stock plus a period COGS movement, with AI-11's inventory-account mapping resolved unambiguously — DIO must compute to the exact expected value, not stay not_computable",
    accounts: [
      { key: "inventory", internalGroup: "asset", accountType: "asset_current", name: "Inventory" },
      { key: "cogs", internalGroup: "expense", accountType: "expense_direct_cost", name: "COGS" },
      { key: "equity", internalGroup: "equity", accountType: "equity", name: "Opening Equity" },
    ],
    partners: [],
    postings: [
      { debitAccountKey: "inventory", creditAccountKey: "equity", amount: 6000, date: "2026-01-15" },
      { debitAccountKey: "cogs", creditAccountKey: "inventory", amount: 2000, date: "2026-02-10" },
    ],
    period: "2026-02",
    expected: { dio: 56 },
  },
  {
    id: "stable-ar-ap-silent",
    description: "A single AR balance established well before either period comparison window, unchanged in both period-end snapshots — the mandatory false positive, must raise ZERO drivers and ZERO recommended actions",
    accounts: [
      { key: "ar", internalGroup: "asset", accountType: "asset_receivable", name: "Accounts Receivable" },
      { key: "income", internalGroup: "income", accountType: "income", name: "Sales Revenue" },
    ],
    partners: ["steadyCust"],
    postings: [{ debitAccountKey: "ar", creditAccountKey: "income", amount: 5000, date: "2025-11-01", partnerKey: "steadyCust" }],
    period: "2026-02",
    expected: { driverCount: 0, recommendedActionCount: 0 },
  },
];

export const GOLDEN_TENANT_PREFIX = "ai25-golden";
