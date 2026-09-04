import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai22";

import Account from "@/models/finance/Account";
import BankStatement from "@/models/finance/BankStatement";
import JournalEntry from "@/models/finance/JournalEntry";
import AiMaterialityPolicy from "@/models/ai/AiMaterialityPolicy";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";
import TaxRate from "@/models/finance/TaxRate";
import AiTaxTransaction from "@/models/ai/AiTaxTransaction";
import User from "@/models/auth/User";

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai22ContinuousReconciliation: typeof import("@/lib/aiRuntime/workflows/ai-22-continuous-reconciliation").ai22ContinuousReconciliation;
let runAllReconciliationDefinitions: typeof import("@/lib/aiRuntime/reconciliation/engine").runAllReconciliationDefinitions;
let computeBankPosition: typeof import("@/lib/aiRuntime/workflows/ai-03-bank-reconciliation/position").computeBankPosition;

const TENANT = "ai22-tenant";

async function makeAccount(account_type: string, name = `Account ${account_type}`) {
  const acc = await Account.create({ tenantId: TENANT, name, code: `ACC-${Math.random().toString(36).slice(2, 8)}`, account_type, isActive: true, isLocked: false, status: "active" });
  return String(acc._id);
}

async function makeBankStatement(accountId: string, lines: { date: Date; payment_ref: string; amount: number }[], balanceEndReal?: number) {
  const stmt = await BankStatement.create({
    tenantId: TENANT,
    header: { name: `STMT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, journalId: accountId, date: new Date(), balance_start: 0, balance_end_real: balanceEndReal ?? lines.reduce((s, l) => s + l.amount, 0) },
    lineIds: lines.map((l) => ({ ...l, isReconciled: false })),
    status: "draft",
  });
  return String(stmt._id);
}

describe("AI-22 — Continuous reconciliation controller", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Account.init(),
      BankStatement.init(),
      JournalEntry.init(),
      AiMaterialityPolicy.init(),
      AiWorkflowRun.init(),
      AiDecisionTrace.init(),
      AiEvent.init(),
      AiToolCall.init(),
      AiWorkflowPolicy.init(),
      TaxRate.init(),
      AiTaxTransaction.init(),
      User.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai22ContinuousReconciliation } = await import("@/lib/aiRuntime/workflows/ai-22-continuous-reconciliation"));
    ({ runAllReconciliationDefinitions } = await import("@/lib/aiRuntime/reconciliation/engine"));
    ({ computeBankPosition } = await import("@/lib/aiRuntime/workflows/ai-03-bank-reconciliation/position"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Promise.all([
      Account.deleteMany({}),
      BankStatement.deleteMany({}),
      JournalEntry.deleteMany({}),
      AiMaterialityPolicy.deleteMany({}),
      AiWorkflowRun.deleteMany({}),
      AiDecisionTrace.deleteMany({}),
      AiEvent.deleteMany({}),
      AiToolCall.deleteMany({}),
      AiWorkflowPolicy.deleteMany({}),
      TaxRate.deleteMany({}),
      AiTaxTransaction.deleteMany({}),
      User.deleteMany({}),
    ]);
  });

  it("the bank definition produces the same numbers as AI-03's existing position function on the same fixture", async () => {
    const bankAccountId = await makeAccount("asset_cash");
    const bankStatementId = await makeBankStatement(bankAccountId, [{ date: new Date(), payment_ref: "ref", amount: 500 }]);

    const directPosition = await computeBankPosition(TENANT, bankStatementId);
    const results = await runAllReconciliationDefinitions(TENANT, new Date(), "2026-01");
    const bankResult = results.find((r) => r.definitionId === "bank")!;

    expect(bankResult.leftTotal).toBe(directPosition!.bankBalance);
    expect(bankResult.rightTotal).toBe(directPosition!.glBalance);
  });

  it("not_implemented definitions (intercompany, processor_settlement) appear with their reason and never count as reconciled — tax flipped to implemented in Chunk 6", async () => {
    const results = await runAllReconciliationDefinitions(TENANT, new Date(), "2026-01");
    const notImplemented = results.filter((r) => r.status === "not_implemented");
    expect(notImplemented.map((r) => r.definitionId).sort()).toEqual(["intercompany", "processor_settlement"]);
    for (const r of notImplemented) {
      expect(r.notImplementedReason).toBeTruthy();
    }
    const tax = results.find((r) => r.definitionId === "tax")!;
    expect(tax.status).not.toBe("not_implemented");
  });

  it("all 12 definitions are always present in the output (10 registered + 2 not_implemented, since tax flipped in Chunk 6)", async () => {
    const results = await runAllReconciliationDefinitions(TENANT, new Date(), "2026-01");
    expect(results).toHaveLength(12);
  });

  it("a zero-balance suspense/clearing scan with no matching accounts → not_applicable, not silently omitted", async () => {
    const results = await runAllReconciliationDefinitions(TENANT, new Date(), "2026-01");
    const suspense = results.find((r) => r.definitionId === "suspense_clearing")!;
    expect(suspense.status).toBe("not_applicable");
  });

  it("an explicitly configured AiAccountMapping overrides the suspense/clearing name-regex heuristic (Chunk 8b 0.2)", async () => {
    const oddlyNamedAcc = await makeAccount("liability_current", "Holding Bucket"); // does NOT match /suspense|clearing/i
    const other = await makeAccount("expense");
    await JournalEntry.create({
      tenantId: TENANT,
      header: { name: "JE-holding", date: new Date("2026-01-15"), journalType: "general" },
      status: "posted",
      voucherStatus: "posted",
      lineIds: [
        { accountId: other, label: "line", debit: 250, credit: 0 },
        { accountId: oddlyNamedAcc, label: "line", debit: 0, credit: 250 },
      ],
      totals: { amountUntaxed: 250, amountTax: 0, amountTotal: 250 },
    });

    const { default: AiAccountMapping } = await import("@/models/ai/AiAccountMapping");
    await AiAccountMapping.create({ tenantId: TENANT, role: "suspense_clearing", accountIds: [oddlyNamedAcc], source: "configured", basis: "this tenant's holding account is really a clearing account" });

    const results = await runAllReconciliationDefinitions(TENANT, new Date("2026-01-31"), "2026-01");
    const suspense = results.find((r) => r.definitionId === "suspense_clearing")!;
    expect(suspense.status).not.toBe("not_applicable");
    expect(suspense.leftTotal).toBe(-250);
    await AiAccountMapping.deleteMany({ tenantId: TENANT });
  });

  it("workflow run: an unreconciled bank definition raises an exception finding", async () => {
    const bankAccountId = await makeAccount("asset_cash");
    // No GL entries posted against this account at all, but the bank says 500 — a real gap.
    await makeBankStatement(bankAccountId, [{ date: new Date(), payment_ref: "ref", amount: 500 }], 500);
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-22", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    const envelope = await runWorkflow(ai22ContinuousReconciliation, { tenantId: TENANT, eventKey: "period.horizon.reached", payload: { period: "2026-01", periodEnd: new Date("2026-01-31").toISOString() } });

    const finding = envelope.findings.find((f) => f.title.includes("Bank vs GL"));
    expect(finding).toBeDefined();
    expect(finding!.type).toBe("exception");
  });

  it("tax: no TaxRate.accountId configured -> not_applicable, never a guessed control account", async () => {
    const results = await runAllReconciliationDefinitions(TENANT, new Date("2026-01-31"), "2026-01");
    const tax = results.find((r) => r.definitionId === "tax")!;
    expect(tax.status).toBe("not_applicable");
  });

  it("tax: a real 1-unit difference between the GL control account and the projected transactions is detected and traced", async () => {
    const user = await User.create({ tenantId: TENANT, name: "F", email: `f-${Date.now()}@x.com`, phone: "9999999999", password: "hashedpw", role: "finance", status: "active" });
    const taxControlAcc = await makeAccount("liability_current", "GST Payable");
    const otherAcc = await makeAccount("expense");
    await TaxRate.create({ tenantId: TENANT, name: "GST 18%", type: "gst", ratePercent: 18, appliesTo: "both", accountId: taxControlAcc, status: "active", createdBy: user._id });

    // GL says the control account carries a credit (liability) of 1000 (debit-credit = -1000).
    await JournalEntry.create({
      tenantId: TENANT,
      header: { name: "JE-tax", date: new Date("2026-01-15"), journalType: "sale" },
      status: "posted",
      voucherStatus: "posted",
      lineIds: [
        { accountId: otherAcc, label: "line", debit: 1000, credit: 0 },
        { accountId: taxControlAcc, label: "line", debit: 0, credit: 1000 },
      ],
      totals: { amountUntaxed: 1000, amountTax: 0, amountTotal: 1000 },
    });
    // Projected transactions only capture an output tax of 900 — a real, seeded 100-unit gap.
    await AiTaxTransaction.create({
      tenantId: TENANT,
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

    const results = await runAllReconciliationDefinitions(TENANT, new Date("2026-01-31"), "2026-01");
    const tax = results.find((r) => r.definitionId === "tax")!;
    expect(tax.rightTotal).toBeCloseTo(-1000, 2); // GL: debit(0) - credit(1000)
    expect(tax.leftTotal).toBeCloseTo(-900, 2); // input(0) - output(900)
    expect(tax.difference).toBeCloseTo(100, 2);
    expect(tax.status).toBe("unreconciled");
    expect(tax.differences.length).toBeGreaterThan(0);
  });
});
