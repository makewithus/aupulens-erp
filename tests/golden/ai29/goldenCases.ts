import mongoose from "mongoose";

/**
 * AI-29's golden dataset (docs/ai/BRIEF-10-PRE-QA.md P0.6) — realistic, tenant-anonymised
 * fixtures with a KNOWN-CORRECT expected outcome per case, following `tests/golden/ai22/`'s
 * shape (AI-29, like AI-22, is "one engine, many definitions" — `runAllControlDefinitions()` is
 * the one entry point, and each case targets exactly one named control).
 *
 * Coverage: one correct-answer (real exception) case for three of AI-29's implemented controls
 * (`approval_present`, `sod_preparer_approver`, `no_posting_into_locked_period` — the three most
 * load-bearing per docs/ai/verification/AI-29.md), plus one full-period must-stay-silent case
 * (a clean period producing zero exceptions across every *implemented* control at once — the
 * mandatory false-positive check every workflow in this project needs).
 */

export interface GoldenAccountSeed {
  key: string;
  accountType: string;
  internalGroup: string;
  name: string;
}

export interface GoldenJournalLineSeed {
  accountKey: string;
  debit: number;
  credit: number;
  sourceId?: boolean;
}

export interface GoldenJournalSeed {
  name: string;
  date: string; // ISO
  createdByKey?: string;
  approvedByKey?: string;
  lines: GoldenJournalLineSeed[];
}

export interface GoldenCase {
  id: string;
  description: string;
  /** Which control this case's expectation targets — omitted for the all-controls silent case. */
  controlId?: string;
  accountingSettings?: { approvalsEnabled: boolean; approvalThresholdAmount: number };
  accounts: GoldenAccountSeed[];
  users: string[]; // keys, plain finance-role users
  journals: GoldenJournalSeed[];
  transactionLock?: { lockedUpToDate: string };
  extractedDocumentForSourceId?: boolean;
  /** How many exceptions the targeted control must raise. Absent + no controlId = the silent case. */
  expectedExceptionCount?: number;
}

export const AI29_GOLDEN_CASES: GoldenCase[] = [
  {
    id: "approval-present-exception",
    description: "A transaction above the configured approval threshold with no approval on record — must be an approval_present exception",
    controlId: "approval_present",
    accountingSettings: { approvalsEnabled: true, approvalThresholdAmount: 1000 },
    accounts: [
      { key: "cash", accountType: "asset_cash", internalGroup: "asset", name: "Golden Cash" },
      { key: "expense", accountType: "expense", internalGroup: "expense", name: "Golden Expense" },
    ],
    users: [],
    journals: [
      { name: "JE-golden-noappr", date: "2026-01-10T12:00:00.000Z", lines: [{ accountKey: "expense", debit: 5000, credit: 0 }, { accountKey: "cash", debit: 0, credit: 5000 }] },
    ],
    expectedExceptionCount: 1,
  },
  {
    id: "sod-preparer-approver-exception",
    description: "The same user both prepared and approved a journal — must be an sod_preparer_approver exception",
    controlId: "sod_preparer_approver",
    accounts: [
      { key: "cash", accountType: "asset_cash", internalGroup: "asset", name: "Golden Cash" },
      { key: "expense", accountType: "expense", internalGroup: "expense", name: "Golden Expense" },
    ],
    users: ["sameUser"],
    journals: [
      { name: "JE-golden-sod", date: "2026-01-10T12:00:00.000Z", createdByKey: "sameUser", approvedByKey: "sameUser", lines: [{ accountKey: "expense", debit: 500, credit: 0 }, { accountKey: "cash", debit: 0, credit: 500 }] },
    ],
    expectedExceptionCount: 1,
  },
  {
    id: "locked-period-posting-exception",
    description: "A journal dated inside a TransactionLock's locked window — must be a no_posting_into_locked_period exception",
    controlId: "no_posting_into_locked_period",
    accounts: [
      { key: "cash", accountType: "asset_cash", internalGroup: "asset", name: "Golden Cash" },
      { key: "expense", accountType: "expense", internalGroup: "expense", name: "Golden Expense" },
    ],
    users: [],
    journals: [
      { name: "JE-golden-locked", date: "2026-01-05T12:00:00.000Z", lines: [{ accountKey: "expense", debit: 100, credit: 0 }, { accountKey: "cash", debit: 0, credit: 100 }] },
    ],
    transactionLock: { lockedUpToDate: "2026-01-15T23:59:59.999Z" },
    expectedExceptionCount: 1,
  },
  {
    id: "fully-clean-period-silent",
    description: "Approvals present, no lock violations, no SoD conflicts, real document evidence — must produce zero exceptions across every implemented control at once",
    accountingSettings: { approvalsEnabled: true, approvalThresholdAmount: 1000 },
    accounts: [
      { key: "cash", accountType: "asset_cash", internalGroup: "asset", name: "Golden Cash" },
      { key: "expense", accountType: "expense", internalGroup: "expense", name: "Golden Expense" },
    ],
    users: ["preparer", "approver"],
    journals: [
      { name: "JE-golden-clean", date: "2026-01-10T12:00:00.000Z", createdByKey: "preparer", approvedByKey: "approver", lines: [{ accountKey: "expense", debit: 5000, credit: 0, sourceId: true }, { accountKey: "cash", debit: 0, credit: 5000 }] },
    ],
    extractedDocumentForSourceId: true,
  },
];

export const GOLDEN_TENANT_PREFIX = "ai29-golden";
export const GOLDEN_CREATOR = new mongoose.Types.ObjectId();
export const GOLDEN_PERIOD = "2026-01";
export const GOLDEN_PERIOD_START = new Date("2026-01-01T00:00:00.000Z");
export const GOLDEN_PERIOD_END = new Date("2026-01-31T23:59:59.999Z");
