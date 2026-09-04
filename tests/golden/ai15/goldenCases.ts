import mongoose from "mongoose";

/**
 * AI-15's golden dataset (docs/ai/BRIEF-09-VERIFICATION.md Part 0.3) — realistic,
 * tenant-anonymised, versioned fixtures with a KNOWN-CORRECT expected outcome per case.
 * AI-15 is explicitly named as the workflow with the highest cost of a wrong answer
 * (docs/ai/BRIEF-08b-FINAL.md C.2 / docs/ai/BRIEF-09-VERIFICATION.md), so this is the most
 * important dataset in this batch — one clean correct-detection case per detector family
 * constructible from the same fixture patterns already relied on in
 * `tests/ai/aiRuntime/ai15AnomalyDetection.test.ts` (postEntryAt/weekdayBusinessHour/
 * afterHoursWithinWindow, plus faking an upstream AiDecisionTrace for the detectors that read
 * AI-14/AI-11/AI-19's own output rather than re-deriving it), PLUS one must-stay-silent case:
 * a year of healthy, consistent activity that must raise ZERO anomalies across all eleven
 * detectors — "the single most important test", per that same unit test file's own comment.
 *
 * Fixtures are declarative (accounts/vendors/entries/settings/upstream traces as data) so the
 * harness (`tests/golden/ai15.golden.test.ts`) can seed every case the same generic way, mirroring
 * AI-27's "case file describes data, harness seeds it via real Mongoose creates" shape — the
 * per-detector heterogeneity (some need JournalEntry history, some only need an upstream trace)
 * is handled by leaving unused fields empty rather than by one bespoke seed function per case.
 */

export interface GoldenAccountSeed {
  key: string;
  name: string;
  accountType: string; // Account.account_type
  internalGroup: string; // Account.internal_group
}

export interface GoldenVendorSeed {
  key: string;
  name: string;
}

export interface GoldenEntrySeed {
  accountKey: string;
  offsetAccountKey: string;
  amount: number;
  vendorKey?: string;
  /** Default "purchase" — a normal business-document journal, not "general" (manual). */
  journalType?: string;
  /** Days before "now" this entry's own header.date sits at. 0 = today. */
  dateDaysAgo: number;
  /** Days before "now" this entry was actually POSTED (createdAt). Defaults to dateDaysAgo (not
   *  backdated). 0 = lands inside AI-15's 24h scan window ("recent", actually evaluated by every
   *  detector this sweep); >=5 = historical baseline only (never scanned directly — only feeds
   *  the stats every detector compares the recent window against). */
  createdAtDaysAgo?: number;
  /** Recent (createdAtDaysAgo === 0) entries only — force after-hours/weekend timing instead of
   *  the default weekday business hour, to exercise the timing family. */
  afterHours?: boolean;
}

export interface GoldenAccountingSettingsSeed {
  approvalThresholdAmount: number;
}

export interface GoldenUpstreamTraceSeed {
  /** The upstream workflow whose most recent AiDecisionTrace this detector family reads directly
   *  (never re-derives) — AI-14 for ratio_trend_step_change, AI-11 for product_margin_step_change,
   *  AI-19 for vendor_shares_bank_or_address_with_employee. */
  workflowId: "AI-14" | "AI-11" | "AI-19";
  rawProposal: Record<string, unknown>;
}

export interface GoldenCase {
  id: string;
  description: string;
  accounts: GoldenAccountSeed[];
  vendors: GoldenVendorSeed[];
  entries: GoldenEntrySeed[];
  accountingSettings?: GoldenAccountingSettingsSeed;
  upstreamTraces?: GoldenUpstreamTraceSeed[];
  expected: {
    /** Detector ids that MUST appear at least once in this run's findings. Empty array = a
     *  must-stay-silent case: this run must raise ZERO anomalies across all eleven detectors. */
    mustFire: string[];
  };
}

// Six consecutive-ish historical months, well outside the 24h scan window but inside the 2-year
// baseline — never scanned directly, only used to build "what normal looks like" for a
// vendor/account pair. Natural, non-flat variance around 1000 (a zero-stddev history can't
// produce a meaningful z-score).
const AMOUNT_OUTLIER_HISTORY = [950, 1020, 980, 1050, 970, 1010];

export const AI15_GOLDEN_CASES: GoldenCase[] = [
  {
    id: "amount-outlier",
    description: "A transaction 8-10x a vendor/account pair's own historical mean (z >= 3) fires the amount_outlier detector",
    accounts: [
      { key: "expense", name: "Consulting", accountType: "expense", internalGroup: "expense" },
      { key: "cash", name: "Operating Cash", accountType: "asset_cash", internalGroup: "asset" },
    ],
    vendors: [{ key: "vendor", name: "Consulting Vendor" }],
    entries: [
      ...AMOUNT_OUTLIER_HISTORY.map((amount, i) => ({
        accountKey: "expense",
        offsetAccountKey: "cash",
        amount,
        vendorKey: "vendor",
        dateDaysAgo: (AMOUNT_OUTLIER_HISTORY.length - i) * 30,
      })),
      { accountKey: "expense", offsetAccountKey: "cash", amount: 10000, vendorKey: "vendor", dateDaysAgo: 0, createdAtDaysAgo: 0 },
    ],
    expected: { mustFire: ["amount_outlier"] },
  },
  {
    id: "amount-near-approval-threshold",
    description: "A posting at 95% of the tenant's own approval threshold fires amount_near_approval_threshold — never guessing at intent, just reporting proximity",
    accounts: [
      { key: "expense", name: "Office Supplies", accountType: "expense", internalGroup: "expense" },
      { key: "cash", name: "Operating Cash", accountType: "asset_cash", internalGroup: "asset" },
    ],
    vendors: [],
    entries: [{ accountKey: "expense", offsetAccountKey: "cash", amount: 9500, dateDaysAgo: 0, createdAtDaysAgo: 0 }],
    accountingSettings: { approvalThresholdAmount: 10000 },
    expected: { mustFire: ["amount_near_approval_threshold"] },
  },
  {
    id: "new-vendor-large-first-txn",
    description: "A brand-new counterparty's first transaction is 6x the typical first-transaction size (median across 5 established counterparties) — fires new_vendor_large_first_txn",
    accounts: [
      { key: "expense", name: "Consulting", accountType: "expense", internalGroup: "expense" },
      { key: "cash", name: "Operating Cash", accountType: "asset_cash", internalGroup: "asset" },
    ],
    vendors: [
      { key: "v1", name: "Established Vendor 1" },
      { key: "v2", name: "Established Vendor 2" },
      { key: "v3", name: "Established Vendor 3" },
      { key: "v4", name: "Established Vendor 4" },
      { key: "v5", name: "Established Vendor 5" },
      { key: "vNew", name: "Brand New Vendor" },
    ],
    entries: [
      { accountKey: "expense", offsetAccountKey: "cash", amount: 900, vendorKey: "v1", dateDaysAgo: 60 },
      { accountKey: "expense", offsetAccountKey: "cash", amount: 1000, vendorKey: "v2", dateDaysAgo: 60 },
      { accountKey: "expense", offsetAccountKey: "cash", amount: 1050, vendorKey: "v3", dateDaysAgo: 60 },
      { accountKey: "expense", offsetAccountKey: "cash", amount: 950, vendorKey: "v4", dateDaysAgo: 60 },
      { accountKey: "expense", offsetAccountKey: "cash", amount: 1100, vendorKey: "v5", dateDaysAgo: 60 },
      { accountKey: "expense", offsetAccountKey: "cash", amount: 6000, vendorKey: "vNew", dateDaysAgo: 0, createdAtDaysAgo: 0 },
    ],
    expected: { mustFire: ["new_vendor_large_first_txn"] },
  },
  {
    id: "dormant-vendor-reactivated",
    description: "A counterparty transacts again after 200 days of silence — fires dormant_vendor_reactivated",
    accounts: [
      { key: "expense", name: "Consulting", accountType: "expense", internalGroup: "expense" },
      { key: "cash", name: "Operating Cash", accountType: "asset_cash", internalGroup: "asset" },
    ],
    vendors: [{ key: "vendor", name: "Dormant Vendor" }],
    entries: [
      { accountKey: "expense", offsetAccountKey: "cash", amount: 2000, vendorKey: "vendor", dateDaysAgo: 200 },
      { accountKey: "expense", offsetAccountKey: "cash", amount: 2000, vendorKey: "vendor", dateDaysAgo: 0, createdAtDaysAgo: 0 },
    ],
    expected: { mustFire: ["dormant_vendor_reactivated"] },
  },
  {
    id: "rare-account-activity",
    description: "A posting to an account with only one prior posting in its 2-year history fires rare_account_activity",
    accounts: [
      { key: "rare", name: "Rarely Used Suspense Account", accountType: "expense", internalGroup: "expense" },
      { key: "cash", name: "Operating Cash", accountType: "asset_cash", internalGroup: "asset" },
    ],
    vendors: [],
    entries: [
      { accountKey: "rare", offsetAccountKey: "cash", amount: 500, dateDaysAgo: 60 },
      { accountKey: "rare", offsetAccountKey: "cash", amount: 500, dateDaysAgo: 0, createdAtDaysAgo: 0 },
    ],
    expected: { mustFire: ["rare_account_activity"] },
  },
  {
    id: "weekend-or-after-hours-posting",
    description: "A posting at 2am UTC to non-sensitive accounts fires weekend_or_after_hours_posting at LOW severity (isolated from manual_journal_to_sensitive_account by using non-sensitive accounts and a real business-document journal type)",
    accounts: [
      { key: "expense", name: "Office Supplies", accountType: "expense", internalGroup: "expense" },
      { key: "receivable", name: "Other Current Asset", accountType: "asset_current", internalGroup: "asset" },
    ],
    vendors: [],
    entries: [{ accountKey: "expense", offsetAccountKey: "receivable", amount: 1200, dateDaysAgo: 0, createdAtDaysAgo: 0, afterHours: true }],
    expected: { mustFire: ["weekend_or_after_hours_posting"] },
  },
  {
    id: "backdated-posting",
    description: "An entry dated 10 days before it was actually posted (>= the 7-day BACKDATED_THRESHOLD_DAYS) fires backdated_posting",
    accounts: [
      { key: "expense", name: "Office Supplies", accountType: "expense", internalGroup: "expense" },
      { key: "cash", name: "Operating Cash", accountType: "asset_cash", internalGroup: "asset" },
    ],
    vendors: [],
    entries: [{ accountKey: "expense", offsetAccountKey: "cash", amount: 3000, dateDaysAgo: 10, createdAtDaysAgo: 0 }],
    expected: { mustFire: ["backdated_posting"] },
  },
  {
    id: "manual-journal-to-sensitive-account",
    description: "A manual (general) journal entry posted directly to a revenue account, during business hours (isolated from weekend_or_after_hours_posting) fires manual_journal_to_sensitive_account",
    accounts: [
      { key: "revenue", name: "Sales Revenue", accountType: "income", internalGroup: "income" },
      { key: "receivable", name: "Accounts Receivable", accountType: "asset_current", internalGroup: "asset" },
    ],
    vendors: [],
    entries: [{ accountKey: "revenue", offsetAccountKey: "receivable", amount: 15000, journalType: "general", dateDaysAgo: 0, createdAtDaysAgo: 0 }],
    expected: { mustFire: ["manual_journal_to_sensitive_account"] },
  },
  {
    id: "ratio-trend-step-change",
    description: "A material flux (AI-14) that's 60% unexplained by named drivers fires ratio_trend_step_change — read directly from AI-14's own most recent trace, never recomputed",
    accounts: [],
    vendors: [],
    entries: [],
    upstreamTraces: [
      {
        workflowId: "AI-14",
        rawProposal: {
          comparisons: [
            { line: "Golden Revenue Account", accountId: "golden-acct-1", variance: 100000, variancePct: 40, unexplainedAmount: 60000, materialityVerdict: "material" },
          ],
        },
      },
    ],
    expected: { mustFire: ["ratio_trend_step_change"] },
  },
  {
    id: "product-margin-step-change",
    description: "A product's margin drops 25 points month over month (AI-11) fires product_margin_step_change — read directly from AI-11's own most recent trace, never recomputed",
    accounts: [],
    vendors: [],
    entries: [],
    upstreamTraces: [
      {
        workflowId: "AI-11",
        rawProposal: {
          marginAlerts: [{ productId: "golden-prod-1", productName: "Golden Widget", currentMarginPercent: 10, priorMarginPercent: 35 }],
        },
      },
    ],
    expected: { mustFire: ["product_margin_step_change"] },
  },
  {
    id: "vendor-shares-bank-or-address-with-employee",
    description: "A vendor/employee identity collision (AI-19) fires vendor_shares_bank_or_address_with_employee — read directly from AI-19's own most recent trace, never a second matching implementation",
    accounts: [],
    vendors: [],
    entries: [],
    upstreamTraces: [
      { workflowId: "AI-19", rawProposal: { employeeCollisions: [{ vendorId: "golden-vendor-1", employeeId: "golden-employee-1", matchedOn: ["email"] }] } },
    ],
    expected: { mustFire: ["vendor_shares_bank_or_address_with_employee"] },
  },
  {
    id: "healthy-activity-must-stay-silent",
    description: "A year of normal, consistent, weekday/business-hours activity across two established vendors — must raise ZERO anomalies across all eleven detectors. The single most important case in this dataset (docs/ai/BRIEF-09-VERIFICATION.md: AI-15 has the highest cost of a wrong answer).",
    accounts: [
      { key: "expense", name: "Office Supplies", accountType: "expense", internalGroup: "expense" },
      { key: "cash", name: "Operating Cash", accountType: "asset_cash", internalGroup: "asset" },
    ],
    vendors: [
      { key: "vendorA", name: "Steady Vendor A" },
      { key: "vendorB", name: "Steady Vendor B" },
    ],
    entries: [
      ...Array.from({ length: 10 }, (_, i) => (i + 1) * 30).flatMap((daysAgo) => [
        { accountKey: "expense", offsetAccountKey: "cash", amount: 5000, vendorKey: "vendorA", dateDaysAgo: daysAgo },
        { accountKey: "expense", offsetAccountKey: "cash", amount: 3000, vendorKey: "vendorB", dateDaysAgo: daysAgo },
      ]),
      { accountKey: "expense", offsetAccountKey: "cash", amount: 5000, vendorKey: "vendorA", dateDaysAgo: 0, createdAtDaysAgo: 0 },
      { accountKey: "expense", offsetAccountKey: "cash", amount: 3000, vendorKey: "vendorB", dateDaysAgo: 0, createdAtDaysAgo: 0 },
    ],
    expected: { mustFire: [] },
  },
];

export const GOLDEN_TENANT_PREFIX = "ai15-golden";
export const GOLDEN_CREATOR = new mongoose.Types.ObjectId();
