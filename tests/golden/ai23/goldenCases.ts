/**
 * AI-23's golden dataset (docs/ai/BRIEF-09-VERIFICATION.md 0.3) — realistic, tenant-anonymised
 * journal-review fixtures with a KNOWN-CORRECT expected outcome per case, mirroring
 * `tests/golden/ai27/goldenCases.ts`'s shape for AI-23's own fixture type (accounts + baseline
 * journals + one target journal, scored by the real `scoreJournalRisk` dimensions in
 * `lib/aiRuntime/journalReview/scoreJournalRisk.ts`).
 *
 * `tests/golden/ai23.golden.test.ts` is the harness that seeds these, runs the real workflow, and
 * reports a pass rate.
 */

export interface GoldenAccountSeed {
  /** Local key used to reference this account from journal lines below. */
  key: string;
  accountType: string;
  internalGroup: string;
  name: string;
}

export interface GoldenLineSeed {
  accountKey: string;
  debit: number;
  credit: number;
  label?: string;
}

export interface GoldenJournalSeed {
  name: string;
  /** ISO datetime — used as both `header.date` and (force-set) `createdAt`, matching the pattern
   *  already established in `tests/ai/aiRuntime/ai23JournalReview.test.ts`. */
  date: string;
  journalType: string;
  lines: GoldenLineSeed[];
  /** When true, a single user is created and set as both createdBy and approvalDetails.approvedBy
   *  — the real SoD-conflict shape `checkSod()` looks for. */
  samePreparerApprover?: boolean;
}

export interface GoldenCase {
  id: string;
  description: string;
  accounts: GoldenAccountSeed[];
  /** Prior-period journals establishing this tenant's own normal pattern — a journal is judged
   *  against ITS OWN tenant's history, not a global heuristic (scoreJournalRisk.ts's own doc
   *  comment). Kept empty or small for the "single anomalous dimension" cases so `rare_poster` /
   *  `unusual_account_combination` (both gated on totalPostedJournals >= 10) never bury the signal
   *  under test — those two dimensions are already covered directly in the unit suite. */
  baselineJournals: GoldenJournalSeed[];
  target: GoldenJournalSeed;
  periodStart: string;
  periodEnd: string;
  /** What a correct run of AI-23 must produce for `target`. */
  expected: {
    findingRaised: boolean;
    severity?: "high" | "medium";
    /** Risk dimensions (scoreJournalRisk.ts's `flags[].dimension`) the finding's reasonChain must
     *  name — the "risk 0.82 tells a reviewer nothing" bar from that file's own doc comment. */
    dimensions?: string[];
  };
}

export const AI23_GOLDEN_CASES: GoldenCase[] = [
  {
    id: "weekend-manual-entry-to-sensitive-account",
    description:
      "Manual (general) journal posted on a Saturday, straight to a revenue account, with no line description — must escalate, high severity, naming all three real flags",
    accounts: [
      { key: "suspense", accountType: "asset_current", internalGroup: "asset", name: "Suspense" },
      { key: "revenue", accountType: "income", internalGroup: "income", name: "Sales Revenue" },
    ],
    baselineJournals: [],
    target: {
      name: "GOLDEN-JE-WEEKEND",
      date: "2026-01-03T15:00:00.000Z", // a Saturday
      journalType: "general",
      lines: [
        { accountKey: "suspense", debit: 5000, credit: 0 },
        { accountKey: "revenue", debit: 0, credit: 5000 },
      ],
    },
    periodStart: "2026-01-01T00:00:00.000Z",
    periodEnd: "2026-01-31T23:59:59.999Z",
    expected: {
      findingRaised: true,
      severity: "high",
      dimensions: ["manual_journal_to_sensitive_account", "weekend_or_after_hours_posting", "thin_or_missing_description"],
    },
  },
  {
    id: "sod-preparer-equals-approver",
    description:
      "Same user both created and approved a weekday, described, non-sensitive purchase journal — the only anomalous signal is the SoD conflict itself, must escalate on that dimension alone",
    accounts: [
      { key: "expense", accountType: "expense", internalGroup: "expense", name: "Office Supplies Expense" },
      { key: "cash", accountType: "asset_cash", internalGroup: "asset", name: "Cash" },
    ],
    baselineJournals: [],
    target: {
      name: "GOLDEN-JE-SOD",
      date: "2026-01-13T12:00:00.000Z", // a Tuesday, business hours
      journalType: "purchase", // not "general" — the sensitive-account dimension requires a manual/general entry, kept out of scope here so the SoD signal isn't muddied
      lines: [
        { accountKey: "expense", debit: 500, credit: 0, label: "Office supplies purchase" },
        { accountKey: "cash", debit: 0, credit: 500, label: "Office supplies purchase" },
      ],
      samePreparerApprover: true,
    },
    periodStart: "2026-01-01T00:00:00.000Z",
    periodEnd: "2026-01-31T23:59:59.999Z",
    expected: {
      findingRaised: true,
      severity: "high",
      dimensions: ["sod_preparer_approver"],
    },
  },
  {
    id: "routine-recurring-journal-matches-history",
    description:
      "A weekday, business-hours, described cash-sale journal that repeats this tenant's own well-established account pair and amount pattern — the mandatory false-positive check, must NOT raise a finding",
    accounts: [
      { key: "cash", accountType: "asset_cash", internalGroup: "asset", name: "Cash" },
      { key: "revenue", accountType: "income", internalGroup: "income", name: "Sales Revenue" },
    ],
    baselineJournals: Array.from({ length: 10 }, (_, i) => ({
      name: `GOLDEN-JE-BASE-${i}`,
      date: `2025-12-0${(i % 8) + 1}T12:00:00.000Z`,
      journalType: "sale",
      lines: [
        { accountKey: "cash", debit: 1000 + i, credit: 0, label: "Cash sale receipt" },
        { accountKey: "revenue", debit: 0, credit: 1000 + i, label: "Cash sale receipt" },
      ],
    })),
    target: {
      name: "GOLDEN-JE-ROUTINE",
      date: "2026-01-15T12:00:00.000Z", // a Thursday, business hours
      journalType: "sale",
      lines: [
        { accountKey: "cash", debit: 1005, credit: 0, label: "Cash sale receipt" },
        { accountKey: "revenue", debit: 0, credit: 1005, label: "Cash sale receipt" },
      ],
    },
    periodStart: "2026-01-01T00:00:00.000Z",
    periodEnd: "2026-01-31T23:59:59.999Z",
    expected: {
      findingRaised: false,
    },
  },
];

export const GOLDEN_TENANT_PREFIX = "ai23-golden";
