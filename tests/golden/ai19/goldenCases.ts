import mongoose from "mongoose";

/**
 * AI-19's golden dataset (docs/ai/BRIEF-09-VERIFICATION.md Part 0.3) — realistic,
 * tenant-anonymised fixtures with a KNOWN-CORRECT expected outcome per case, mirroring
 * `tests/golden/ai27/goldenCases.ts`'s shape for AI-19's own fixture types.
 *
 * AI-19 implements FIVE distinct real checks (per its own module doc comment and
 * `tests/ai/aiRuntime/ai19MasterData.test.ts`): duplicate vendor/customer entities, duplicate
 * inventory items, missing critical fields, employee/vendor collisions, and the bank-detail
 * change hold mechanism. Each gets its own correct-answer + must-stay-silent pair below — one
 * pair for "AI-19" as a whole would hide a regression in four of its five checks, since they run
 * independent detectors over independent data.
 *
 * All five checks are deterministic (string/set comparisons, no LLM call anywhere in this
 * workflow — proven by the source-grep test in the unit suite), so 100% is the honest bar.
 *
 * `tests/golden/ai19.golden.test.ts` is the harness that runs these and reports a pass rate.
 */

export type Ai19CheckType = "duplicate_vendor" | "duplicate_item" | "missing_fields" | "employee_collision" | "bank_change_hold";

export interface Ai19DuplicateVendorCase {
  checkType: "duplicate_vendor";
  vendors: { name: string; gstin?: string }[];
  expected: { duplicateFindingCount: number; classification?: string };
}

export interface Ai19DuplicateItemCase {
  checkType: "duplicate_item";
  items: { name: string; itemCode: string }[];
  expected: { duplicateCount: number };
}

export interface Ai19MissingFieldsCase {
  checkType: "missing_fields";
  vendor: { name: string; hasAddress: boolean; hasDefaultAccount: boolean };
  expected: { missingFieldsCount: number; missingContains: string[] };
}

export interface Ai19EmployeeCollisionCase {
  checkType: "employee_collision";
  employee: { firstName: string; lastName: string; email: string };
  vendor: { name: string; sameEmailAsEmployee: boolean };
  expected: { collisionFindingCount: number };
}

export interface Ai19BankChangeHoldCase {
  checkType: "bank_change_hold";
  employee: { firstName: string; lastName: string; email: string; bankName: string; accountNumber: string };
  /** If set, the account number is changed to this value on the second run — a real bank-detail
   *  change. If omitted, the second run re-observes the SAME record unchanged (the "quiet,
   *  stable master data must not conjure a finding" case). */
  changedAccountNumber?: string;
  expected: { alertFindingCount: number; holdPlaced: boolean };
}

export type Ai19GoldenCase = { id: string; description: string } & (
  | Ai19DuplicateVendorCase
  | Ai19DuplicateItemCase
  | Ai19MissingFieldsCase
  | Ai19EmployeeCollisionCase
  | Ai19BankChangeHoldCase
);

export const AI19_GOLDEN_CASES: Ai19GoldenCase[] = [
  // ── 1. Duplicate vendor/customer entities (findDuplicateEntities) ──
  {
    id: "duplicate-vendor-same-gstin",
    description: "Two vendors differing only by Ltd/Limited, identical GSTIN — must flag as a certain duplicate, never auto-merged",
    checkType: "duplicate_vendor",
    vendors: [
      { name: "Golden Trading Pvt Ltd", gstin: "29ABCDE1234F1Z5" },
      { name: "Golden Trading Pvt Limited", gstin: "29ABCDE1234F1Z5" },
    ],
    expected: { duplicateFindingCount: 1, classification: "certain" },
  },
  {
    id: "distinct-vendors-silent",
    description: "Two genuinely unrelated vendors, different names and tax IDs — the mandatory false positive, must raise ZERO duplicate findings",
    checkType: "duplicate_vendor",
    vendors: [
      { name: "Northbridge Components Co", gstin: "11AAAAA1111A1Z1" },
      { name: "Silverline Logistics Group", gstin: "22BBBBB2222B1Z2" },
    ],
    expected: { duplicateFindingCount: 0 },
  },

  // ── 2. Duplicate inventory items (findDuplicateItems) ──
  {
    id: "duplicate-item-same-normalized-name",
    description: "Same item name differing only by case/whitespace, different item codes — must flag as a probable duplicate",
    checkType: "duplicate_item",
    items: [
      { name: "Steel Rod 10mm", itemCode: "GOLD-SR-001" },
      { name: "steel   rod 10mm", itemCode: "GOLD-SR-002" },
    ],
    expected: { duplicateCount: 1 },
  },
  {
    id: "distinct-items-silent",
    description: "Two genuinely different items — must raise ZERO duplicate findings",
    checkType: "duplicate_item",
    items: [
      { name: "Steel Rod 10mm", itemCode: "GOLD-SR-101" },
      { name: "Copper Wire 5mm", itemCode: "GOLD-CW-101" },
    ],
    expected: { duplicateCount: 0 },
  },

  // ── 3. Missing critical fields (findMissingFields) ──
  {
    id: "vendor-missing-address-and-account",
    description: "Vendor with no address and no default payable account configured — must report both gaps by name",
    checkType: "missing_fields",
    vendor: { name: "Golden Incomplete Vendor Co", hasAddress: false, hasDefaultAccount: false },
    expected: { missingFieldsCount: 1, missingContains: ["address", "default_account"] },
  },
  {
    id: "vendor-complete-silent",
    description: "Vendor with address and default payable account both set — the mandatory false positive, must report ZERO missing-field gaps",
    checkType: "missing_fields",
    vendor: { name: "Golden Complete Vendor Co", hasAddress: true, hasDefaultAccount: true },
    expected: { missingFieldsCount: 0, missingContains: [] },
  },

  // ── 4. Employee/vendor collisions (findEmployeeVendorCollisions) ──
  {
    id: "vendor-shares-employee-email",
    description: "A vendor record whose contact email exactly matches a real employee's — the classic shell-vendor / conflict-of-interest signal, must flag HIGH",
    checkType: "employee_collision",
    employee: { firstName: "Golden", lastName: "Insider", email: "golden-insider-collision@example.com" },
    vendor: { name: "Golden Insider Trading Co", sameEmailAsEmployee: true },
    expected: { collisionFindingCount: 1 },
  },
  {
    id: "vendor-no-employee-relation-silent",
    description: "A vendor with no name/email relation to any employee — the mandatory false positive, must raise ZERO collision findings",
    checkType: "employee_collision",
    employee: { firstName: "Regular", lastName: "Staffmember", email: "regular-staffmember@example.com" },
    vendor: { name: "Totally Unrelated Supplies Co", sameEmailAsEmployee: false },
    expected: { collisionFindingCount: 0 },
  },

  // ── 5. Bank-detail change hold mechanism (record_change mode) ──
  {
    id: "employee-bank-account-changed",
    description: "An employee's bank account number changes after a baseline snapshot exists — must raise a CRITICAL alert and place a hold the AI cannot lift",
    checkType: "bank_change_hold",
    employee: { firstName: "Golden", lastName: "Payee", email: "golden-payee-changed@example.com", bankName: "HDFC Bank", accountNumber: "111122223333" },
    changedAccountNumber: "999988887777",
    expected: { alertFindingCount: 1, holdPlaced: true },
  },
  {
    id: "employee-bank-unchanged-silent",
    description: "An employee's bank details are re-observed twice with NO change between runs — the mandatory false positive, must raise ZERO alerts and place NO hold",
    checkType: "bank_change_hold",
    employee: { firstName: "Golden", lastName: "Stable", email: "golden-stable-unchanged@example.com", bankName: "ICICI Bank", accountNumber: "444455556666" },
    expected: { alertFindingCount: 0, holdPlaced: false },
  },
];

export const GOLDEN_TENANT_PREFIX = "ai19-golden";
export const GOLDEN_CREATOR = new mongoose.Types.ObjectId();
