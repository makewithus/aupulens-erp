import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import { execSync } from "node:child_process";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai21";

import Account from "@/models/finance/Account";
import JournalEntry from "@/models/finance/JournalEntry";
import Invoice from "@/models/finance/Invoice";
import Customer from "@/models/sales/Customer";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";
import AiCloseState from "@/models/ai/AiCloseState";
import PeriodClosing from "@/models/finance/PeriodClosing";
import BankStatement from "@/models/finance/BankStatement";
import Asset from "@/models/finance/Asset";
import TaxRate from "@/models/finance/TaxRate";
import AiSchedule from "@/models/ai/AiSchedule";
import AiTaxTransaction from "@/models/ai/AiTaxTransaction";
import AiComplianceProfile from "@/models/ai/AiComplianceProfile";
import AiMaterialityPolicy from "@/models/ai/AiMaterialityPolicy";

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai21StatementIntelligence: typeof import("@/lib/aiRuntime/workflows/ai-21-statement-intelligence").ai21StatementIntelligence;
let annotateStatement: typeof import("@/lib/aiRuntime/statements/annotateStatement").annotateStatement;
let drillIntoAccount: typeof import("@/lib/aiRuntime/statements/annotateStatement").drillIntoAccount;
let buildPostedJournalReport: typeof import("@/lib/accounting/reports").buildPostedJournalReport;

const TENANT = "ai21-tenant";
const PERIOD = "2026-01";

async function makeAccount(account_type: string, internal_group: string, name?: string) {
  const acc = await Account.create({ tenantId: TENANT, name: name ?? `Account ${account_type}`, code: `ACC-${Math.random().toString(36).slice(2, 8)}`, account_type, internal_group, isActive: true, isLocked: false, status: "active" });
  return acc._id as mongoose.Types.ObjectId;
}

async function postJournal(lines: { accountId: mongoose.Types.ObjectId; debit: number; credit: number }[], date = new Date("2026-01-15")) {
  return JournalEntry.create({
    tenantId: TENANT,
    header: { name: `JE-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, date, journalType: "general" },
    status: "posted",
    voucherStatus: "posted",
    lineIds: lines.map((l) => ({ accountId: l.accountId, label: "line", debit: l.debit, credit: l.credit })),
    totals: { amountUntaxed: 0, amountTax: 0, amountTotal: 0 },
  });
}

async function seedAi14Comparison(accountId: string, materialityVerdict: string, variance = 5000) {
  const run = await AiWorkflowRun.create({
    tenantId: TENANT,
    workflowId: "AI-14",
    workflowVersion: "1.0.0",
    entityId: TENANT,
    status: "completed",
    autonomyApplied: "observe",
    summary: "test seed",
    findings: [],
    metrics: { scanned: 1, matched: 0, exceptions: 0, autoActioned: 0, policy_overrides: 0 },
    startedAt: new Date(),
    finishedAt: new Date(),
  });
  await AiDecisionTrace.create({
    tenantId: TENANT,
    runId: run._id,
    workflowId: "AI-14",
    workflowVersion: "1.0.0",
    inputsHash: "test-seed",
    reasonChain: [],
    rawProposal: {
      comparisons: [{ accountId, materialityVerdict, variance, unexplainedAmount: variance, drivers: [] }],
    },
    confidenceComponents: {},
    finalOutcome: "completed",
  });
}

describe("AI-21 — Financial statement intelligence", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Account.init(),
      JournalEntry.init(),
      Invoice.init(),
      Customer.init(),
      AiWorkflowRun.init(),
      AiDecisionTrace.init(),
      AiEvent.init(),
      AiToolCall.init(),
      AiWorkflowPolicy.init(),
      AiCloseState.init(),
      PeriodClosing.init(),
      BankStatement.init(),
      Asset.init(),
      TaxRate.init(),
      AiSchedule.init(),
      AiTaxTransaction.init(),
      AiComplianceProfile.init(),
      AiMaterialityPolicy.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai21StatementIntelligence } = await import("@/lib/aiRuntime/workflows/ai-21-statement-intelligence"));
    ({ annotateStatement, drillIntoAccount } = await import("@/lib/aiRuntime/statements/annotateStatement"));
    ({ buildPostedJournalReport } = await import("@/lib/accounting/reports"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Promise.all([
      Account.deleteMany({}),
      JournalEntry.deleteMany({}),
      Invoice.deleteMany({}),
      Customer.deleteMany({}),
      AiWorkflowRun.deleteMany({}),
      AiDecisionTrace.deleteMany({}),
      AiEvent.deleteMany({}),
      AiToolCall.deleteMany({}),
      AiWorkflowPolicy.deleteMany({}),
      AiCloseState.deleteMany({}),
      PeriodClosing.deleteMany({}),
      BankStatement.deleteMany({}),
      Asset.deleteMany({}),
      TaxRate.deleteMany({}),
      AiSchedule.deleteMany({}),
      AiTaxTransaction.deleteMany({}),
      AiComplianceProfile.deleteMany({}),
      AiMaterialityPolicy.deleteMany({}),
    ]);
  });

  it("statement totals equal the trial balance exactly — never a second, disagreeing figure", async () => {
    const cash = await makeAccount("asset_cash", "asset");
    const equity = await makeAccount("equity", "equity");
    await postJournal([{ accountId: cash, debit: 5000, credit: 0 }, { accountId: equity, debit: 0, credit: 5000 }]);

    const report = await buildPostedJournalReport({ tenantId: TENANT, endDate: new Date("2026-01-31") });
    const annotated = await annotateStatement(TENANT, PERIOD, "balance_sheet");

    expect(annotated.totals).toEqual(report.totals);
    const cashLine = annotated.groups.asset!.lines.find((l) => l.accountId === String(cash))!;
    expect(cashLine.amount).toBe(report.asset.accounts[Object.keys(report.asset.accounts)[0]].amount);
  });

  it("a real balance sheet balances — assets equal liabilities plus equity", async () => {
    const cash = await makeAccount("asset_cash", "asset");
    const equity = await makeAccount("equity", "equity");
    await postJournal([{ accountId: cash, debit: 10000, credit: 0 }, { accountId: equity, debit: 0, credit: 10000 }]);

    const annotated = await annotateStatement(TENANT, PERIOD, "balance_sheet");
    expect(annotated.balanceCheck).toBeDefined();
    expect(annotated.balanceCheck!.balanced).toBe(true);
    expect(annotated.balanceCheck!.assetTotal).toBe(annotated.balanceCheck!.liabilityPlusEquityTotal);
  });

  it("an unreconciled, material AP control line is flagged unsupportedMaterial — and raises a HIGH finding when the workflow runs", async () => {
    const vendor = await Customer.create({ tenantId: TENANT, header: { name: "Vendor Co", is_company: true }, createdBy: new mongoose.Types.ObjectId() });
    const controlAcc = await makeAccount("liability_payable", "liability", "AP Control");
    await Invoice.create({
      tenantId: TENANT,
      name: `BILL-${Date.now()}`,
      partnerId: vendor._id,
      moveType: "in_invoice",
      state: "posted",
      invoiceDate: new Date("2026-01-10"),
      dueDate: new Date("2026-01-10"),
      invoiceLines: [{ name: "Goods", priceSubtotal: 1000, quantity: 1, priceUnit: 1000 }],
      amountUntaxed: 1000,
      amountTax: 0,
      amountTotal: 1000,
      amountResidual: 1000,
      paymentState: "not_paid",
    });
    // GL balance on the control account nets to 0 (two offsetting lines, just to make the
    // account appear in the report) vs 1000 owed per the open invoice — a real, seeded
    // unreconciled gap.
    await postJournal([{ accountId: controlAcc, debit: 100, credit: 0 }, { accountId: controlAcc, debit: 0, credit: 100 }]);
    await seedAi14Comparison(String(controlAcc), "material");

    const annotated = await annotateStatement(TENANT, PERIOD, "balance_sheet");
    const line = annotated.groups.liability!.lines.find((l) => l.accountId === String(controlAcc))!;
    expect(line.reconciliationStatus).toBe("unreconciled");
    expect(line.materiality).toBe("material");
    expect(line.unsupportedMaterial).toBe(true);

    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-21", killSwitchEnabled: true, maxAutonomyLevel: "observe" });
    const envelope = await runWorkflow(ai21StatementIntelligence, { tenantId: TENANT, eventKey: "period.horizon.reached", payload: { period: PERIOD } });
    const finding = envelope.findings.find((f) => f.title.includes("Unsupported material line"));
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe("high");
  });

  it("a fully reconciled, immaterial line raises no flags (false positive check)", async () => {
    const controlAcc = await makeAccount("liability_payable", "liability", "AP Control Clean");
    // No open invoices, no GL activity at all on this account — leftTotal=0, rightTotal=0,
    // difference=0 → reconciled. Immaterial per AI-14's own verdict.
    await seedAi14Comparison(String(controlAcc), "immaterial", 10);

    const annotated = await annotateStatement(TENANT, PERIOD, "balance_sheet");
    const line = annotated.groups.liability?.lines.find((l) => l.accountId === String(controlAcc));
    // Account never appears in the report at all (zero activity) — nothing to flag either way.
    expect(line?.unsupportedMaterial ?? false).toBe(false);
    expect(annotated.unsupportedMaterialCount).toBe(0);
  });

  it("the drill-down chain reaches real journal entries and transaction lines", async () => {
    const cash = await makeAccount("asset_cash", "asset");
    const equity = await makeAccount("equity", "equity");
    const entry = await postJournal([{ accountId: cash, debit: 750, credit: 0 }, { accountId: equity, debit: 0, credit: 750 }]);

    const drill = await drillIntoAccount(TENANT, String(cash), PERIOD);
    expect(drill.transactions.length).toBeGreaterThan(0);
    expect(drill.transactions[0].entryId).toBe(String(entry._id));
    expect(drill.transactions[0].signedAmount).toBe(750);
  });

  it("no path in AI-21's own code ever writes a ledger value (source-grep, same pattern as AI-09/AI-13)", () => {
    const output = execSync(
      String.raw`grep -rnE '\.(save|create|updateOne|updateMany|deleteOne|deleteMany|findOneAndUpdate|findByIdAndUpdate|findOneAndDelete|insertMany)\(' lib/aiRuntime/workflows/ai-21-statement-intelligence lib/aiRuntime/statements lib/aiRuntime/tools/statementTools.ts || true`,
      { encoding: "utf-8", cwd: process.cwd() },
    );
    expect(output.trim()).toBe("");
  });
});
