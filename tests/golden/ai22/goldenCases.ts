import mongoose from "mongoose";
import Account from "@/models/finance/Account";
import JournalEntry from "@/models/finance/JournalEntry";
import BankStatement from "@/models/finance/BankStatement";
import Customer from "@/models/sales/Customer";
import Invoice from "@/models/finance/Invoice";
import Asset from "@/models/finance/Asset";
import AiSchedule, { AI_SCHEDULE_TYPE, AI_SCHEDULE_STATUS } from "@/models/ai/AiSchedule";
import StockMove from "@/models/inventory/StockMove";
import Payroll from "@/models/hr/Payroll";
import TaxRate from "@/models/finance/TaxRate";
import AiTaxTransaction from "@/models/ai/AiTaxTransaction";
import User from "@/models/auth/User";
import PeriodClosing from "@/models/finance/PeriodClosing";
import { DOCUMENT_STATUS, PAYROLL_STATUS, STOCK_MOVE_STATUS, PERIOD_CLOSING_STATUS } from "@/lib/constants/statuses";
import type { ReconciliationStatus } from "@/lib/aiRuntime/reconciliation/types";

/**
 * AI-22's golden dataset (docs/ai/BRIEF-10-PRE-QA.md P0.6) — realistic, tenant-anonymised,
 * versioned fixtures with a KNOWN-CORRECT expected outcome per case, following the same shape as
 * `tests/golden/ai27/goldenCases.ts` (a data file of cases + `tests/golden/ai22.golden.test.ts` as
 * the harness that runs them and reports a pass rate).
 *
 * AI-22 has no single "one input -> one classification" shape the way AI-27 does — it is "one
 * engine, many definitions" (`lib/aiRuntime/reconciliation/definitions.ts`), each reading a
 * completely different model. So unlike AI-27's pure-data case list, each case here carries its
 * own `seed()` — still a plain, readable fixture description, just one that necessarily creates
 * the specific documents its own definition reads, because no single generic "seed a bill" helper
 * could cover bank statements, asset registers, stock moves, payroll runs and tax transactions
 * alike. The harness calls `runAllReconciliationDefinitions()` (the same engine entry point AI-22
 * itself calls) and checks the ONE definition each case targets.
 *
 * Coverage: one correct-answer (real reconciled or real-difference) case + one
 * must-stay-silent case for every definition with a real `run()` — `bank`, `ap_control`,
 * `ar_control_finance`, `fixed_assets`, `inventory`, `payroll`, `suspense_clearing`, `tax`,
 * `prepaid`, `deferred_revenue` (10 real definitions; the task brief names 8 of these, but
 * `prepaid`/`deferred_revenue` are two more real, testable definitions in the actual registered
 * list — `lib/aiRuntime/reconciliation/definitions.ts`'s `RECONCILIATION_DEFINITIONS` export —
 * left with zero coverage would be exactly the kind of gap this task exists to close) — plus the
 * two permanently `not_implemented` siblings (`intercompany`, `processor_settlement`), plus
 * dedicated P0.5 coverage: a closed-period case for `ap_control` and for `ar_control_finance`
 * proving the new `"not_supported_for_closed_periods"` status is returned instead of a
 * confidently-wrong current-balance number.
 */

export interface GoldenExpected {
  status: ReconciliationStatus;
  leftTotal?: number;
  rightTotal?: number;
  difference?: number;
}

export interface GoldenCase {
  id: string;
  description: string;
  /** Which of RECONCILIATION_DEFINITIONS' entries this case's expectation targets. */
  definitionId: string;
  periodEnd: Date;
  period: string;
  seed: (tenantId: string) => Promise<void>;
  expected: GoldenExpected;
}

export const GOLDEN_TENANT_PREFIX = "ai22-golden";

// A fixed "current" instant used by every case that must land in the tenant's current open
// period (P0.5) — computed once at module load, same session the tests run in.
const NOW = new Date();
const CURRENT_PERIOD_END = NOW;
const CURRENT_PERIOD = `${NOW.getUTCFullYear()}-${String(NOW.getUTCMonth() + 1).padStart(2, "0")}`;
// Always in the past relative to any real clock this codebase will run on — used by every P0.5
// closed-period case.
const CLOSED_PERIOD_END = new Date("2020-01-31T23:59:59.000Z");
const CLOSED_PERIOD = "2020-01";

// P0.5 (revised, docs/ai/BRIEF-10-PRE-QA.md): "closed" is determined by the tenant's own real
// PeriodClosing record, never a calendar-vs-wall-clock heuristic — see
// lib/aiRuntime/reconciliation/definitions.ts's isClosedPeriod() for why. Every closed-period case
// must create one explicitly; a bare past date is no longer sufficient (and correctly so — most
// tenants never formally close a period at all, so a past date alone must stay OPEN by default).
async function closePeriod(tenantId: string, periodEnd: Date) {
  await PeriodClosing.create({
    tenantId,
    name: `${periodEnd.getUTCFullYear()}-${String(periodEnd.getUTCMonth() + 1).padStart(2, "0")}`,
    fiscalYear: periodEnd.getUTCFullYear(),
    month: periodEnd.getUTCMonth() + 1,
    status: PERIOD_CLOSING_STATUS.CLOSED,
    createdBy: new mongoose.Types.ObjectId(),
  });
}

async function makeAccount(tenantId: string, account_type: string, name = `Account ${account_type}`) {
  const acc = await Account.create({ tenantId, name, code: `ACC-${Math.random().toString(36).slice(2, 8)}`, account_type, isActive: true, isLocked: false, status: "active" });
  return String(acc._id);
}

async function makePostedJournalEntry(tenantId: string, name: string, lines: { accountId: string; debit: number; credit: number }[], date = new Date("2026-01-15")) {
  const total = lines.reduce((s, l) => s + l.debit, 0);
  await JournalEntry.create({
    tenantId,
    header: { name, date, journalType: "general" },
    status: DOCUMENT_STATUS.POSTED,
    voucherStatus: "posted",
    lineIds: lines.map((l) => ({ accountId: l.accountId, label: name, debit: l.debit, credit: l.credit })),
    totals: { amountUntaxed: total, amountTax: 0, amountTotal: total },
  });
}

async function makeVendorOrCustomer(tenantId: string, name: string) {
  const c = await Customer.create({ tenantId, header: { name, is_company: true }, createdBy: new mongoose.Types.ObjectId() });
  return c._id as mongoose.Types.ObjectId;
}

async function makeOpenInvoice(tenantId: string, partnerId: mongoose.Types.ObjectId, moveType: "in_invoice" | "out_invoice", amount: number, name: string) {
  await Invoice.create({
    tenantId,
    name,
    partnerId,
    moveType,
    state: DOCUMENT_STATUS.POSTED,
    invoiceDate: new Date("2026-01-10"),
    dueDate: new Date("2026-01-25"),
    invoiceLines: [{ name: "Line", priceSubtotal: amount, quantity: 1, priceUnit: amount }],
    amountUntaxed: amount,
    amountTax: 0,
    amountTotal: amount,
    amountResidual: amount,
    paymentState: "not_paid",
  });
}

export const AI22_GOLDEN_CASES: GoldenCase[] = [
  // ── bank ──────────────────────────────────────────────────────────────────────────────────
  {
    id: "bank-reconciled-clean",
    description: "Bank statement balance exactly matches the GL cash-account balance — must stay silent (reconciled)",
    definitionId: "bank",
    periodEnd: CURRENT_PERIOD_END,
    period: CURRENT_PERIOD,
    seed: async (tenantId) => {
      const bankAccountId = await makeAccount(tenantId, "asset_cash");
      const other = await makeAccount(tenantId, "income");
      await makePostedJournalEntry(tenantId, "JE-bank-clean", [
        { accountId: bankAccountId, debit: 500, credit: 0 },
        { accountId: other, debit: 0, credit: 500 },
      ]);
      await BankStatement.create({
        tenantId,
        header: { name: "STMT-clean", journalId: bankAccountId, date: new Date(), balance_start: 0, balance_end_real: 500 },
        lineIds: [{ date: new Date(), payment_ref: "ref", amount: 500, isReconciled: true }],
        status: "draft",
      });
    },
    expected: { status: "reconciled", leftTotal: 500, rightTotal: 500, difference: 0 },
  },
  {
    id: "bank-real-difference",
    description: "Bank statement reports 500 with no matching GL activity at all on the cash account — a real, unexplained gap",
    definitionId: "bank",
    periodEnd: CURRENT_PERIOD_END,
    period: CURRENT_PERIOD,
    seed: async (tenantId) => {
      const bankAccountId = await makeAccount(tenantId, "asset_cash");
      await BankStatement.create({
        tenantId,
        header: { name: "STMT-gap", journalId: bankAccountId, date: new Date(), balance_start: 0, balance_end_real: 500 },
        lineIds: [{ date: new Date(), payment_ref: "ref", amount: 500, isReconciled: false }],
        status: "draft",
      });
    },
    expected: { status: "unreconciled", leftTotal: 500, rightTotal: 0, difference: 500 },
  },

  // ── ap_control ────────────────────────────────────────────────────────────────────────────
  {
    id: "ap-control-reconciled",
    description: "Open vendor bill of 8000 ties exactly to the payable control account's GL balance — must stay silent (reconciled)",
    definitionId: "ap_control",
    periodEnd: CURRENT_PERIOD_END,
    period: CURRENT_PERIOD,
    seed: async (tenantId) => {
      const vendor = await makeVendorOrCustomer(tenantId, "Golden Vendor");
      await makeOpenInvoice(tenantId, vendor, "in_invoice", 8000, "BILL-ap-clean");
      const payable = await makeAccount(tenantId, "liability_payable", "Accounts Payable");
      const expense = await makeAccount(tenantId, "expense");
      // Real bill-posting convention (app/api/finance/bills/[id]/route.ts): expense debited,
      // payable credited — a credit-normal control account.
      await makePostedJournalEntry(tenantId, "JE-ap-clean", [
        { accountId: expense, debit: 8000, credit: 0 },
        { accountId: payable, debit: 0, credit: 8000 },
      ]);
    },
    expected: { status: "reconciled", leftTotal: 8000, rightTotal: 8000, difference: 0 },
  },
  {
    id: "ap-control-real-difference",
    description: "Open vendor bill of 8000 but the payable control account only carries 5000 — a real 3000 tie-out gap",
    definitionId: "ap_control",
    periodEnd: CURRENT_PERIOD_END,
    period: CURRENT_PERIOD,
    seed: async (tenantId) => {
      const vendor = await makeVendorOrCustomer(tenantId, "Golden Vendor 2");
      await makeOpenInvoice(tenantId, vendor, "in_invoice", 8000, "BILL-ap-gap");
      const payable = await makeAccount(tenantId, "liability_payable", "Accounts Payable");
      const expense = await makeAccount(tenantId, "expense");
      await makePostedJournalEntry(tenantId, "JE-ap-gap", [
        { accountId: expense, debit: 5000, credit: 0 },
        { accountId: payable, debit: 0, credit: 5000 },
      ]);
    },
    expected: { status: "unreconciled", leftTotal: 8000, rightTotal: 5000, difference: 3000 },
  },
  {
    id: "ap-control-closed-period-not-supported",
    description: "P0.5: the SAME real open AP balance as ap-control-real-difference, but requested for a CLOSED (past) period — must refuse to compute rather than report today's number under a stale label",
    definitionId: "ap_control",
    periodEnd: CLOSED_PERIOD_END,
    period: CLOSED_PERIOD,
    seed: async (tenantId) => {
      const vendor = await makeVendorOrCustomer(tenantId, "Golden Vendor 3");
      await makeOpenInvoice(tenantId, vendor, "in_invoice", 8000, "BILL-ap-closed");
      const payable = await makeAccount(tenantId, "liability_payable", "Accounts Payable");
      const expense = await makeAccount(tenantId, "expense");
      await makePostedJournalEntry(tenantId, "JE-ap-closed", [
        { accountId: expense, debit: 5000, credit: 0 },
        { accountId: payable, debit: 0, credit: 5000 },
      ]);
      await closePeriod(tenantId, CLOSED_PERIOD_END);
    },
    expected: { status: "not_supported_for_closed_periods", leftTotal: 0, rightTotal: 0, difference: 0 },
  },

  // ── ar_control_finance ───────────────────────────────────────────────────────────────────────
  {
    id: "ar-control-reconciled",
    description: "Open customer invoice of 6000 ties exactly to the receivable control account's GL balance — must stay silent (reconciled)",
    definitionId: "ar_control_finance",
    periodEnd: CURRENT_PERIOD_END,
    period: CURRENT_PERIOD,
    seed: async (tenantId) => {
      const customer = await makeVendorOrCustomer(tenantId, "Golden Customer");
      await makeOpenInvoice(tenantId, customer, "out_invoice", 6000, "INV-ar-clean");
      const receivable = await makeAccount(tenantId, "asset_receivable", "Accounts Receivable");
      const revenue = await makeAccount(tenantId, "income");
      // Real invoice-posting convention (app/api/accounting/invoices/[id]/route.ts): receivable
      // debited, revenue credited — a debit-normal control account, no sign flip needed.
      await makePostedJournalEntry(tenantId, "JE-ar-clean", [
        { accountId: receivable, debit: 6000, credit: 0 },
        { accountId: revenue, debit: 0, credit: 6000 },
      ]);
    },
    expected: { status: "reconciled", leftTotal: 6000, rightTotal: 6000, difference: 0 },
  },
  {
    id: "ar-control-real-difference",
    description: "Open customer invoice of 6000 but the receivable control account only carries 4000 — a real 2000 tie-out gap",
    definitionId: "ar_control_finance",
    periodEnd: CURRENT_PERIOD_END,
    period: CURRENT_PERIOD,
    seed: async (tenantId) => {
      const customer = await makeVendorOrCustomer(tenantId, "Golden Customer 2");
      await makeOpenInvoice(tenantId, customer, "out_invoice", 6000, "INV-ar-gap");
      const receivable = await makeAccount(tenantId, "asset_receivable", "Accounts Receivable");
      const revenue = await makeAccount(tenantId, "income");
      await makePostedJournalEntry(tenantId, "JE-ar-gap", [
        { accountId: receivable, debit: 4000, credit: 0 },
        { accountId: revenue, debit: 0, credit: 4000 },
      ]);
    },
    expected: { status: "unreconciled", leftTotal: 6000, rightTotal: 4000, difference: 2000 },
  },
  {
    id: "ar-control-closed-period-not-supported",
    description: "P0.5: the SAME real open AR balance as ar-control-real-difference, but requested for a CLOSED (past) period — must refuse to compute rather than report today's number under a stale label",
    definitionId: "ar_control_finance",
    periodEnd: CLOSED_PERIOD_END,
    period: CLOSED_PERIOD,
    seed: async (tenantId) => {
      const customer = await makeVendorOrCustomer(tenantId, "Golden Customer 3");
      await makeOpenInvoice(tenantId, customer, "out_invoice", 6000, "INV-ar-closed");
      const receivable = await makeAccount(tenantId, "asset_receivable", "Accounts Receivable");
      const revenue = await makeAccount(tenantId, "income");
      await makePostedJournalEntry(tenantId, "JE-ar-closed", [
        { accountId: receivable, debit: 4000, credit: 0 },
        { accountId: revenue, debit: 0, credit: 4000 },
      ]);
      await closePeriod(tenantId, CLOSED_PERIOD_END);
    },
    expected: { status: "not_supported_for_closed_periods", leftTotal: 0, rightTotal: 0, difference: 0 },
  },

  // ── fixed_assets ──────────────────────────────────────────────────────────────────────────
  {
    id: "fixed-assets-reconciled",
    description: "One posted asset's original value ties exactly to the GL balance on its asset account (no depreciation yet) — must stay silent (reconciled)",
    definitionId: "fixed_assets",
    periodEnd: CURRENT_PERIOD_END,
    period: CURRENT_PERIOD,
    seed: async (tenantId) => {
      const assetAccount = await makeAccount(tenantId, "asset_fixed", "Fixed Assets");
      const depAccount = await makeAccount(tenantId, "asset_fixed", "Accumulated Depreciation");
      const cash = await makeAccount(tenantId, "asset_cash");
      await Asset.create({
        tenantId,
        name: "Golden Machine",
        purchaseDate: new Date("2026-01-01"),
        originalValue: 10000,
        salvageValue: 0,
        durationYears: 5,
        accounts: { assetAccountId: assetAccount, depreciationAccountId: depAccount },
        status: DOCUMENT_STATUS.POSTED,
      });
      await makePostedJournalEntry(tenantId, "JE-fixed-clean", [
        { accountId: assetAccount, debit: 10000, credit: 0 },
        { accountId: cash, debit: 0, credit: 10000 },
      ]);
    },
    expected: { status: "reconciled", leftTotal: 10000, rightTotal: 10000, difference: 0 },
  },
  {
    id: "fixed-assets-real-difference",
    description: "The register says 10000 but the GL side of the asset account only shows 7000 — a real 3000 mismatch",
    definitionId: "fixed_assets",
    periodEnd: CURRENT_PERIOD_END,
    period: CURRENT_PERIOD,
    seed: async (tenantId) => {
      const assetAccount = await makeAccount(tenantId, "asset_fixed", "Fixed Assets 2");
      const depAccount = await makeAccount(tenantId, "asset_fixed", "Accumulated Depreciation 2");
      const cash = await makeAccount(tenantId, "asset_cash");
      await Asset.create({
        tenantId,
        name: "Golden Machine 2",
        purchaseDate: new Date("2026-01-01"),
        originalValue: 10000,
        salvageValue: 0,
        durationYears: 5,
        accounts: { assetAccountId: assetAccount, depreciationAccountId: depAccount },
        status: DOCUMENT_STATUS.POSTED,
      });
      await makePostedJournalEntry(tenantId, "JE-fixed-gap", [
        { accountId: assetAccount, debit: 7000, credit: 0 },
        { accountId: cash, debit: 0, credit: 7000 },
      ]);
    },
    expected: { status: "unreconciled", leftTotal: 10000, rightTotal: 7000, difference: 3000 },
  },

  // ── inventory ─────────────────────────────────────────────────────────────────────────────
  {
    id: "inventory-reconciled",
    description: "One incoming stock move valued at 5000 ties exactly to the GL inventory account — must stay silent (reconciled)",
    definitionId: "inventory",
    periodEnd: CURRENT_PERIOD_END,
    period: CURRENT_PERIOD,
    seed: async (tenantId) => {
      const inventoryAccount = await makeAccount(tenantId, "asset_current", "Inventory");
      const payable = await makeAccount(tenantId, "liability_payable");
      await StockMove.create({
        tenantId,
        reference: "SM-inv-clean",
        moveType: "incoming",
        sourceLocation: {},
        destinationLocation: {},
        lines: [{ productId: new mongoose.Types.ObjectId(), productName: "Widget", demand: 10, done: 10, unitCost: 500, totalValue: 5000 }],
        moveStatus: STOCK_MOVE_STATUS.ACCOUNTING_CREATED,
        valuation: { method: "standard", totalValue: 5000 },
        accounting: {},
      });
      await makePostedJournalEntry(tenantId, "JE-inv-clean", [
        { accountId: inventoryAccount, debit: 5000, credit: 0 },
        { accountId: payable, debit: 0, credit: 5000 },
      ]);
    },
    expected: { status: "reconciled", leftTotal: 5000, rightTotal: 5000, difference: 0 },
  },
  {
    id: "inventory-real-difference",
    description: "Stock moves value inventory at 5000 but the GL inventory account only shows 3000 — a real 2000 mismatch",
    definitionId: "inventory",
    periodEnd: CURRENT_PERIOD_END,
    period: CURRENT_PERIOD,
    seed: async (tenantId) => {
      const inventoryAccount = await makeAccount(tenantId, "asset_current", "Inventory 2");
      const payable = await makeAccount(tenantId, "liability_payable");
      await StockMove.create({
        tenantId,
        reference: "SM-inv-gap",
        moveType: "incoming",
        sourceLocation: {},
        destinationLocation: {},
        lines: [{ productId: new mongoose.Types.ObjectId(), productName: "Widget", demand: 10, done: 10, unitCost: 500, totalValue: 5000 }],
        moveStatus: STOCK_MOVE_STATUS.ACCOUNTING_CREATED,
        valuation: { method: "standard", totalValue: 5000 },
        accounting: {},
      });
      await makePostedJournalEntry(tenantId, "JE-inv-gap", [
        { accountId: inventoryAccount, debit: 3000, credit: 0 },
        { accountId: payable, debit: 0, credit: 3000 },
      ]);
    },
    expected: { status: "unreconciled", leftTotal: 5000, rightTotal: 3000, difference: 2000 },
  },

  // ── payroll ───────────────────────────────────────────────────────────────────────────────
  {
    id: "payroll-reconciled",
    description: "A posted payroll run's net total ties exactly to its linked, posted disbursement journal — must stay silent (reconciled)",
    definitionId: "payroll",
    periodEnd: CURRENT_PERIOD_END,
    period: CURRENT_PERIOD,
    seed: async (tenantId) => {
      const bank = await makeAccount(tenantId, "asset_cash");
      const expense = await makeAccount(tenantId, "expense");
      const je = await JournalEntry.create({
        tenantId,
        header: { name: "JE-payroll-clean", date: new Date("2026-01-31"), journalType: "general" },
        status: DOCUMENT_STATUS.POSTED,
        voucherStatus: "posted",
        lineIds: [
          { accountId: expense, label: "salary", debit: 5000, credit: 0 },
          { accountId: bank, label: "salary", debit: 0, credit: 5000 },
        ],
        totals: { amountUntaxed: 5000, amountTax: 0, amountTotal: 5000 },
      });
      await Payroll.create({
        tenantId,
        payrollCode: `PR-clean-${Math.random().toString(36).slice(2, 8)}`,
        payrollPeriod: { month: 1, year: 2026, startDate: new Date("2026-01-01"), endDate: new Date("2026-01-31") },
        lineItems: [],
        totals: { totalGross: 5000, totalDeductions: 0, totalNet: 5000, totalOvertime: 0, totalLOP: 0, currency: "INR" },
        status: PAYROLL_STATUS.POSTED_TO_GL,
        disbursementJournalId: je._id,
      });
    },
    expected: { status: "reconciled", leftTotal: 5000, rightTotal: 5000, difference: 0 },
  },
  {
    id: "payroll-real-difference",
    description: "A posted payroll run has no linked journal entry at all — a real, unposted gap between payroll and the GL",
    definitionId: "payroll",
    periodEnd: CURRENT_PERIOD_END,
    period: CURRENT_PERIOD,
    seed: async (tenantId) => {
      await Payroll.create({
        tenantId,
        payrollCode: `PR-gap-${Math.random().toString(36).slice(2, 8)}`,
        payrollPeriod: { month: 1, year: 2026, startDate: new Date("2026-01-01"), endDate: new Date("2026-01-31") },
        lineItems: [],
        totals: { totalGross: 4000, totalDeductions: 0, totalNet: 4000, totalOvertime: 0, totalLOP: 0, currency: "INR" },
        status: PAYROLL_STATUS.APPROVED,
      });
    },
    expected: { status: "unreconciled", leftTotal: 4000, rightTotal: 0, difference: 4000 },
  },

  // ── suspense_clearing ─────────────────────────────────────────────────────────────────────
  {
    id: "suspense-clearing-clean",
    description: "A named suspense account exists with a zero balance — exactly what a healthy suspense account should look like — must stay silent (reconciled)",
    definitionId: "suspense_clearing",
    periodEnd: CURRENT_PERIOD_END,
    period: CURRENT_PERIOD,
    seed: async (tenantId) => {
      await makeAccount(tenantId, "liability_current", "Suspense Account");
      // No journal activity at all against it — glBalanceForAccount returns 0.
    },
    expected: { status: "reconciled", leftTotal: 0, rightTotal: 0, difference: 0 },
  },
  {
    id: "suspense-clearing-real-difference",
    description: "A named clearing account carries a real, non-zero balance — suspense/clearing accounts should always net to zero, so this is a real exception",
    definitionId: "suspense_clearing",
    periodEnd: CURRENT_PERIOD_END,
    period: CURRENT_PERIOD,
    seed: async (tenantId) => {
      const clearing = await makeAccount(tenantId, "liability_current", "Clearing Account");
      const other = await makeAccount(tenantId, "expense");
      await makePostedJournalEntry(tenantId, "JE-clearing-stuck", [
        { accountId: other, debit: 900, credit: 0 },
        { accountId: clearing, debit: 0, credit: 900 },
      ]);
    },
    expected: { status: "unreconciled", leftTotal: -900, rightTotal: 0, difference: -900 },
  },

  // ── tax ───────────────────────────────────────────────────────────────────────────────────
  {
    id: "tax-reconciled",
    description: "Projected output tax transactions tie exactly to the GST payable control account — must stay silent (reconciled)",
    definitionId: "tax",
    periodEnd: new Date("2026-01-31T23:59:59.000Z"),
    period: "2026-01",
    seed: async (tenantId) => {
      const user = await User.create({ tenantId, name: "Golden Finance", email: `golden-tax-clean-${Date.now()}@x.com`, phone: "9999999998", password: "hashedpw", role: "finance", status: "active" });
      const taxControlAcc = await makeAccount(tenantId, "liability_current", "GST Payable Clean");
      const other = await makeAccount(tenantId, "expense");
      await TaxRate.create({ tenantId, name: "GST 18% Clean", type: "gst", ratePercent: 18, appliesTo: "both", accountId: taxControlAcc, status: "active", createdBy: user._id });
      await makePostedJournalEntry(
        tenantId,
        "JE-tax-clean",
        [
          { accountId: other, debit: 1000, credit: 0 },
          { accountId: taxControlAcc, debit: 0, credit: 1000 },
        ],
        new Date("2026-01-15"),
      );
      await AiTaxTransaction.create({
        tenantId,
        sourceRef: { model: "Invoice", id: new mongoose.Types.ObjectId() },
        direction: "output",
        jurisdiction: null,
        taxableAmount: 5555,
        taxAmount: 1000,
        documentDate: new Date("2026-01-15"),
        periodKey: "2026-01",
        projectedAt: new Date(),
        projectionVersion: 1,
      });
    },
    expected: { status: "reconciled", leftTotal: -1000, rightTotal: -1000, difference: 0 },
  },
  {
    id: "tax-real-difference",
    description: "The GL control account shows 1000 of output tax but projected transactions only capture 900 — a real 100-unit gap",
    definitionId: "tax",
    periodEnd: new Date("2026-01-31T23:59:59.000Z"),
    period: "2026-01",
    seed: async (tenantId) => {
      const user = await User.create({ tenantId, name: "Golden Finance 2", email: `golden-tax-gap-${Date.now()}@x.com`, phone: "9999999997", password: "hashedpw", role: "finance", status: "active" });
      const taxControlAcc = await makeAccount(tenantId, "liability_current", "GST Payable Gap");
      const other = await makeAccount(tenantId, "expense");
      await TaxRate.create({ tenantId, name: "GST 18% Gap", type: "gst", ratePercent: 18, appliesTo: "both", accountId: taxControlAcc, status: "active", createdBy: user._id });
      await makePostedJournalEntry(
        tenantId,
        "JE-tax-gap",
        [
          { accountId: other, debit: 1000, credit: 0 },
          { accountId: taxControlAcc, debit: 0, credit: 1000 },
        ],
        new Date("2026-01-15"),
      );
      await AiTaxTransaction.create({
        tenantId,
        sourceRef: { model: "Invoice", id: new mongoose.Types.ObjectId() },
        direction: "output",
        jurisdiction: null,
        taxableAmount: 5000,
        taxAmount: 900,
        documentDate: new Date("2026-01-15"),
        periodKey: "2026-01",
        projectedAt: new Date(),
        projectionVersion: 1,
      });
    },
    expected: { status: "unreconciled", leftTotal: -900, rightTotal: -1000, difference: 100 },
  },

  // ── prepaid ───────────────────────────────────────────────────────────────────────────────
  {
    id: "prepaid-reconciled",
    description: "A prepaid schedule's remaining balance ties exactly to the prepaid asset account's GL balance — must stay silent (reconciled)",
    definitionId: "prepaid",
    periodEnd: CURRENT_PERIOD_END,
    period: CURRENT_PERIOD,
    seed: async (tenantId) => {
      const prepaidAsset = await makeAccount(tenantId, "asset_current", "Prepaid Insurance");
      const expense = await makeAccount(tenantId, "expense");
      await makePostedJournalEntry(tenantId, "JE-prepaid-clean", [
        { accountId: prepaidAsset, debit: 3000, credit: 0 },
        { accountId: expense, debit: 0, credit: 3000 },
      ]);
      await AiSchedule.create({
        tenantId,
        scheduleType: AI_SCHEDULE_TYPE.PREPAID,
        sourceRef: { model: "Invoice", id: String(new mongoose.Types.ObjectId()) },
        status: AI_SCHEDULE_STATUS.APPROVED,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-12-31"),
        frequency: "monthly",
        totalAmount: 3600,
        debitAccountId: expense,
        creditAccountId: prepaidAsset,
        basis: "stated",
        periods: [],
        recognisedToDate: 600,
        remaining: 3000,
        createdByWorkflow: "golden-fixture",
      });
    },
    expected: { status: "reconciled", leftTotal: 3000, rightTotal: 3000, difference: 0 },
  },
  {
    id: "prepaid-real-difference",
    description: "A prepaid schedule reports 3000 remaining but the GL prepaid asset account only shows 2000 — a real 1000 mismatch",
    definitionId: "prepaid",
    periodEnd: CURRENT_PERIOD_END,
    period: CURRENT_PERIOD,
    seed: async (tenantId) => {
      const prepaidAsset = await makeAccount(tenantId, "asset_current", "Prepaid Insurance 2");
      const expense = await makeAccount(tenantId, "expense");
      await makePostedJournalEntry(tenantId, "JE-prepaid-gap", [
        { accountId: prepaidAsset, debit: 2000, credit: 0 },
        { accountId: expense, debit: 0, credit: 2000 },
      ]);
      await AiSchedule.create({
        tenantId,
        scheduleType: AI_SCHEDULE_TYPE.PREPAID,
        sourceRef: { model: "Invoice", id: String(new mongoose.Types.ObjectId()) },
        status: AI_SCHEDULE_STATUS.APPROVED,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-12-31"),
        frequency: "monthly",
        totalAmount: 3600,
        debitAccountId: expense,
        creditAccountId: prepaidAsset,
        basis: "stated",
        periods: [],
        recognisedToDate: 600,
        remaining: 3000,
        createdByWorkflow: "golden-fixture",
      });
    },
    expected: { status: "unreconciled", leftTotal: 3000, rightTotal: 2000, difference: 1000 },
  },

  // ── deferred_revenue ──────────────────────────────────────────────────────────────────────
  {
    id: "deferred-revenue-reconciled",
    description: "A deferred-revenue schedule's remaining liability ties exactly to the GL deferred-revenue account — must stay silent (reconciled)",
    definitionId: "deferred_revenue",
    periodEnd: CURRENT_PERIOD_END,
    period: CURRENT_PERIOD,
    seed: async (tenantId) => {
      const deferredRevenueLiability = await makeAccount(tenantId, "liability_current", "Deferred Revenue");
      const revenue = await makeAccount(tenantId, "income");
      // A liability, credit-normal: crediting it 2000 records the still-unearned obligation.
      await makePostedJournalEntry(tenantId, "JE-deferred-clean", [
        { accountId: revenue, debit: 0, credit: 0 },
        { accountId: deferredRevenueLiability, debit: 0, credit: 2000 },
      ]);
      await AiSchedule.create({
        tenantId,
        scheduleType: AI_SCHEDULE_TYPE.DEFERRED_REVENUE,
        sourceRef: { model: "Invoice", id: String(new mongoose.Types.ObjectId()) },
        status: AI_SCHEDULE_STATUS.APPROVED,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-12-31"),
        frequency: "monthly",
        totalAmount: 2400,
        debitAccountId: deferredRevenueLiability,
        creditAccountId: revenue,
        basis: "stated",
        periods: [],
        recognisedToDate: 400,
        remaining: 2000,
        createdByWorkflow: "golden-fixture",
      });
    },
    expected: { status: "reconciled", leftTotal: 2000, rightTotal: 2000, difference: 0 },
  },
  {
    id: "deferred-revenue-real-difference",
    description: "A deferred-revenue schedule reports 2000 remaining but the GL deferred-revenue account only carries 1500 — a real 500 mismatch",
    definitionId: "deferred_revenue",
    periodEnd: CURRENT_PERIOD_END,
    period: CURRENT_PERIOD,
    seed: async (tenantId) => {
      const deferredRevenueLiability = await makeAccount(tenantId, "liability_current", "Deferred Revenue 2");
      const revenue = await makeAccount(tenantId, "income");
      await makePostedJournalEntry(tenantId, "JE-deferred-gap", [
        { accountId: revenue, debit: 0, credit: 0 },
        { accountId: deferredRevenueLiability, debit: 0, credit: 1500 },
      ]);
      await AiSchedule.create({
        tenantId,
        scheduleType: AI_SCHEDULE_TYPE.DEFERRED_REVENUE,
        sourceRef: { model: "Invoice", id: String(new mongoose.Types.ObjectId()) },
        status: AI_SCHEDULE_STATUS.APPROVED,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-12-31"),
        frequency: "monthly",
        totalAmount: 2400,
        debitAccountId: deferredRevenueLiability,
        creditAccountId: revenue,
        basis: "stated",
        periods: [],
        recognisedToDate: 400,
        remaining: 2000,
        createdByWorkflow: "golden-fixture",
      });
    },
    expected: { status: "unreconciled", leftTotal: 2000, rightTotal: 1500, difference: 500 },
  },

  // ── not_implemented siblings ──────────────────────────────────────────────────────────────
  {
    id: "intercompany-not-implemented",
    description: "intercompany is permanently not_implemented regardless of data — must report a live, registry-sourced reason, never be silently omitted",
    definitionId: "intercompany",
    periodEnd: CURRENT_PERIOD_END,
    period: CURRENT_PERIOD,
    seed: async () => {},
    expected: { status: "not_implemented" },
  },
  {
    id: "processor-settlement-not-implemented",
    description: "processor_settlement is permanently not_implemented regardless of data — must report a live, registry-sourced reason, never be silently omitted",
    definitionId: "processor_settlement",
    periodEnd: CURRENT_PERIOD_END,
    period: CURRENT_PERIOD,
    seed: async () => {},
    expected: { status: "not_implemented" },
  },
];
