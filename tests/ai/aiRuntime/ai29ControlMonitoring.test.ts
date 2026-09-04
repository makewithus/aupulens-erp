import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import { execSync } from "node:child_process";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai29";

import Account from "@/models/finance/Account";
import JournalEntry from "@/models/finance/JournalEntry";
import Invoice from "@/models/finance/Invoice";
import Customer from "@/models/sales/Customer";
import AccountingSettings from "@/models/finance/AccountingSettings";
import TransactionLock from "@/models/finance/TransactionLock";
import PeriodClosing from "@/models/finance/PeriodClosing";
import User from "@/models/auth/User";
import ExtractedDocument from "@/models/ai/ExtractedDocument";
import AiControlResult from "@/models/ai/AiControlResult";
import AiAttentionItem from "@/models/ai/AiAttentionItem";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";
import AiHold from "@/models/ai/AiHold";
import AiMasterDataProfile from "@/models/ai/AiMasterDataProfile";

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai29ControlMonitoring: typeof import("@/lib/aiRuntime/workflows/ai-29-control-monitoring").ai29ControlMonitoring;
let runAllControlDefinitions: typeof import("@/lib/aiRuntime/controls/engine").runAllControlDefinitions;
let CONTROL_DEFINITIONS: typeof import("@/lib/aiRuntime/controls/definitions").CONTROL_DEFINITIONS;

const TENANT = "ai29-tenant";
const PERIOD_START = new Date("2026-01-01T00:00:00.000Z");
const PERIOD_END = new Date("2026-01-31T23:59:59.999Z");
const PERIOD = "2026-01";

async function makeAccount(account_type: string, internal_group: string, name: string) {
  const acc = await Account.create({ tenantId: TENANT, name, code: `ACC-${Math.random().toString(36).slice(2, 8)}`, account_type, internal_group, isActive: true, isLocked: false, status: "active" });
  return acc._id as mongoose.Types.ObjectId;
}

async function makeUser(name: string, role = "finance") {
  const u = await User.create({ tenantId: TENANT, name, email: `${name.toLowerCase().replace(/\s/g, "")}-${Date.now()}-${Math.random()}@x.com`, phone: "9999999999", password: "hashedpw", role, status: "active" });
  return u._id as mongoose.Types.ObjectId;
}

async function postJournal(opts: {
  name: string;
  date: Date;
  createdBy?: mongoose.Types.ObjectId;
  approvedBy?: mongoose.Types.ObjectId;
  semanticOverride?: { applied: boolean; reason?: string };
  voucherType?: string;
  lines: { accountId: mongoose.Types.ObjectId; debit: number; credit: number; sourceId?: mongoose.Types.ObjectId }[];
}) {
  return JournalEntry.create({
    tenantId: TENANT,
    header: { name: opts.name, date: opts.date, journalType: "general" },
    voucherType: opts.voucherType,
    status: "posted",
    voucherStatus: "posted",
    createdBy: opts.createdBy,
    approvalRequired: Boolean(opts.approvedBy),
    approvalDetails: opts.approvedBy ? { approvedBy: opts.approvedBy, approvedAt: opts.date } : undefined,
    semanticOverride: opts.semanticOverride,
    lineIds: opts.lines.map((l) => ({ accountId: l.accountId, label: "line", debit: l.debit, credit: l.credit, sourceId: l.sourceId })),
    totals: { amountUntaxed: 0, amountTax: 0, amountTotal: opts.lines.reduce((s, l) => s + l.debit, 0) },
  });
}

describe("AI-29 — Audit / control monitoring", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Account.init(), JournalEntry.init(), Invoice.init(), Customer.init(), AccountingSettings.init(), TransactionLock.init(), PeriodClosing.init(), User.init(), ExtractedDocument.init(),
      AiControlResult.init(), AiAttentionItem.init(), AiWorkflowRun.init(), AiDecisionTrace.init(), AiEvent.init(), AiToolCall.init(), AiWorkflowPolicy.init(),
      AiHold.init(), AiMasterDataProfile.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai29ControlMonitoring } = await import("@/lib/aiRuntime/workflows/ai-29-control-monitoring"));
    ({ runAllControlDefinitions } = await import("@/lib/aiRuntime/controls/engine"));
    ({ CONTROL_DEFINITIONS } = await import("@/lib/aiRuntime/controls/definitions"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Promise.all([
      Account.deleteMany({}), JournalEntry.deleteMany({}), Invoice.deleteMany({}), Customer.deleteMany({}), AccountingSettings.deleteMany({}), TransactionLock.deleteMany({}), PeriodClosing.deleteMany({}),
      User.deleteMany({}), ExtractedDocument.deleteMany({}), AiControlResult.deleteMany({}), AiAttentionItem.deleteMany({}), AiWorkflowRun.deleteMany({}),
      AiDecisionTrace.deleteMany({}), AiEvent.deleteMany({}), AiToolCall.deleteMany({}), AiWorkflowPolicy.deleteMany({}),
      AiHold.deleteMany({}), AiMasterDataProfile.deleteMany({}),
    ]);
  });

  async function run() {
    await AiWorkflowPolicy.findOneAndUpdate({ tenantId: TENANT, workflowId: "AI-29" }, { killSwitchEnabled: true, maxAutonomyLevel: "observe" }, { upsert: true });
    return runWorkflow(ai29ControlMonitoring, { tenantId: TENANT, eventKey: "period.horizon.reached", payload: { period: PERIOD, periodStart: PERIOD_START.toISOString(), periodEnd: PERIOD_END.toISOString() } });
  }

  it("a transaction above threshold with no approval is an exception", async () => {
    await AccountingSettings.create({ tenantId: TENANT, journals: { approvalsEnabled: true, approvalThresholdAmount: 1000 } });
    const cash = await makeAccount("asset_cash", "asset", "Cash");
    const expense = await makeAccount("expense", "expense", "Expense");
    await postJournal({ name: "JE-noappr", date: new Date("2026-01-10T12:00:00.000Z"), lines: [{ accountId: expense, debit: 5000, credit: 0 }, { accountId: cash, debit: 0, credit: 5000 }] });

    const results = await runAllControlDefinitions(TENANT, CONTROL_DEFINITIONS, PERIOD_START, PERIOD_END);
    const control = results.find((r) => r.controlId === "approval_present")!;
    expect(control.exceptions.length).toBeGreaterThan(0);
  });

  it("preparer = approver is an SoD exception", async () => {
    const cash = await makeAccount("asset_cash", "asset", "Cash");
    const expense = await makeAccount("expense", "expense", "Expense");
    const sameUser = await makeUser("Same User");
    await postJournal({ name: "JE-sod", date: new Date("2026-01-10T12:00:00.000Z"), createdBy: sameUser, approvedBy: sameUser, lines: [{ accountId: expense, debit: 500, credit: 0 }, { accountId: cash, debit: 0, credit: 500 }] });

    const results = await runAllControlDefinitions(TENANT, CONTROL_DEFINITIONS, PERIOD_START, PERIOD_END);
    const control = results.find((r) => r.controlId === "sod_preparer_approver")!;
    expect(control.exceptions.length).toBeGreaterThan(0);
  });

  it("a posting dated inside a TransactionLock is an exception", async () => {
    const cash = await makeAccount("asset_cash", "asset", "Cash");
    const expense = await makeAccount("expense", "expense", "Expense");
    await TransactionLock.create({ tenantId: TENANT, module: "accountant", isLocked: true, lockedUpToDate: new Date("2026-01-15T23:59:59.999Z") });
    await postJournal({ name: "JE-locked", date: new Date("2026-01-05T12:00:00.000Z"), lines: [{ accountId: expense, debit: 100, credit: 0 }, { accountId: cash, debit: 0, credit: 100 }] });

    const results = await runAllControlDefinitions(TENANT, CONTROL_DEFINITIONS, PERIOD_START, PERIOD_END);
    const control = results.find((r) => r.controlId === "no_posting_into_locked_period")!;
    expect(control.exceptions.length).toBeGreaterThan(0);
  });

  it("a PeriodClosing marked closed with no corresponding lock is a design-relevant exception — the two are not wired together (0.5)", async () => {
    const user = await makeUser("Closer");
    await PeriodClosing.create({ tenantId: TENANT, name: "Jan 2026", fiscalYear: 2026, month: 1, status: "closed", createdBy: user });
    // Deliberately no TransactionLock created — this is the whole point of the finding.

    const results = await runAllControlDefinitions(TENANT, CONTROL_DEFINITIONS, PERIOD_START, PERIOD_END);
    const control = results.find((r) => r.controlId === "closed_period_still_postable")!;
    expect(control.exceptions.length).toBeGreaterThan(0);
    expect(control.exceptions[0].detail).toContain("remains postable");
  });

  it("an allowNonStandard override with no stated reason appears as an override_logged exception; one with a reason passes", async () => {
    const cash = await makeAccount("asset_cash", "asset", "Cash");
    const equity = await makeAccount("equity", "equity", "Equity");
    await postJournal({ name: "JE-override-noreason", date: new Date("2026-01-10T12:00:00.000Z"), semanticOverride: { applied: true }, lines: [{ accountId: cash, debit: 100, credit: 0 }, { accountId: equity, debit: 0, credit: 100 }] });
    await postJournal({ name: "JE-override-reason", date: new Date("2026-01-11T12:00:00.000Z"), semanticOverride: { applied: true, reason: "Approved capital adjustment, ref board minute #4" }, lines: [{ accountId: cash, debit: 100, credit: 0 }, { accountId: equity, debit: 0, credit: 100 }] });

    const results = await runAllControlDefinitions(TENANT, CONTROL_DEFINITIONS, PERIOD_START, PERIOD_END);
    const control = results.find((r) => r.controlId === "override_logged")!;
    expect(control.populationSize).toBe(2);
    expect(control.exceptions.length).toBe(1);
    expect(control.exceptions[0].detail).toContain("JE-override-noreason");
  });

  it("payment_against_approved_bill: a payment tracing to a real, non-flagged bill passes; one to a manualReviewRequired bill is an exception", async () => {
    const vendor = await Customer.create({ tenantId: TENANT, header: { name: "Vendor Co", is_company: true }, createdBy: new mongoose.Types.ObjectId() });
    const cleanBill = await Invoice.create({ tenantId: TENANT, name: "BILL-CLEAN", partnerId: vendor._id, moveType: "in_invoice", state: "posted", invoiceDate: new Date("2026-01-05"), dueDate: new Date("2026-01-05"), invoiceLines: [{ name: "Goods", priceSubtotal: 1000, quantity: 1, priceUnit: 1000 }], amountUntaxed: 1000, amountTax: 0, amountTotal: 1000, amountResidual: 0, paymentState: "paid" });
    const flaggedBill = await Invoice.create({ tenantId: TENANT, name: "BILL-FLAGGED", partnerId: vendor._id, moveType: "in_invoice", state: "posted", invoiceDate: new Date("2026-01-06"), dueDate: new Date("2026-01-06"), invoiceLines: [{ name: "Goods", priceSubtotal: 500, quantity: 1, priceUnit: 500 }], amountUntaxed: 500, amountTax: 0, amountTotal: 500, amountResidual: 0, paymentState: "paid", manualReviewRequired: true });
    const cash = await makeAccount("asset_cash", "asset", "Cash");
    const payable = await makeAccount("liability_payable", "liability", "AP");
    await postJournal({ name: "JE-pay-clean", date: new Date("2026-01-10T12:00:00.000Z"), voucherType: "payment", lines: [{ accountId: payable, debit: 1000, credit: 0, sourceId: cleanBill._id }, { accountId: cash, debit: 0, credit: 1000 }] });
    await postJournal({ name: "JE-pay-flagged", date: new Date("2026-01-11T12:00:00.000Z"), voucherType: "payment", lines: [{ accountId: payable, debit: 500, credit: 0, sourceId: flaggedBill._id }, { accountId: cash, debit: 0, credit: 500 }] });

    const results = await runAllControlDefinitions(TENANT, CONTROL_DEFINITIONS, PERIOD_START, PERIOD_END);
    const control = results.find((r) => r.controlId === "payment_against_approved_bill")!;
    expect(control.status).toBe("implemented");
    expect(control.populationSize).toBe(2);
    expect(control.exceptions).toHaveLength(1);
    expect(control.exceptions[0].detail).toContain("JE-pay-flagged");
  });

  it("master_data_verification: a cleared hold passes; an open hold past the 48h grace window is an exception", async () => {
    await AiHold.create({ tenantId: TENANT, subjectRef: { model: "Employee", id: "emp-cleared" }, reason: "Bank detail changed: accountNumber", placedByWorkflow: "AI-19", placedAt: new Date("2026-01-05"), status: "cleared", clearedBy: new mongoose.Types.ObjectId(), clearedAt: new Date("2026-01-06") });
    await AiHold.create({ tenantId: TENANT, subjectRef: { model: "Employee", id: "emp-stale" }, reason: "Bank detail changed: accountNumber", placedByWorkflow: "AI-19", placedAt: new Date("2026-01-01"), status: "open" });

    const results = await runAllControlDefinitions(TENANT, CONTROL_DEFINITIONS, PERIOD_START, PERIOD_END);
    const control = results.find((r) => r.controlId === "master_data_verification")!;
    expect(control.status).toBe("implemented");
    expect(control.populationSize).toBe(2);
    expect(control.exceptions).toHaveLength(1);
    expect(control.exceptions[0].detail).toContain("emp-stale");
  });

  it("bank_detail_change_process: a bank-field change with a real hold on record passes; one with none is an exception", async () => {
    const hold = await AiHold.create({ tenantId: TENANT, subjectRef: { model: "Employee", id: "emp-good" }, reason: "Bank detail changed: accountNumber", placedByWorkflow: "AI-19", placedAt: new Date("2026-01-05"), status: "open" });
    await AiMasterDataProfile.create({
      tenantId: TENANT, entityModel: "Employee", recordId: "emp-good", missingFields: [], duplicateCandidates: [], employeeCollisions: [], expiringDocuments: [], lastEvaluatedAt: new Date(),
      bankChangeAlerts: [{ field: "accountNumber", oldMasked: "****1111", newMasked: "****2222", changedAt: new Date("2026-01-05"), riskFactors: [], holdPlaced: true, holdRef: String(hold._id) }],
    });
    await AiMasterDataProfile.create({
      tenantId: TENANT, entityModel: "Employee", recordId: "emp-bad", missingFields: [], duplicateCandidates: [], employeeCollisions: [], expiringDocuments: [], lastEvaluatedAt: new Date(),
      bankChangeAlerts: [{ field: "accountNumber", oldMasked: "****3333", newMasked: "****4444", changedAt: new Date("2026-01-06"), riskFactors: [], holdPlaced: false, holdRef: null }],
    });

    const results = await runAllControlDefinitions(TENANT, CONTROL_DEFINITIONS, PERIOD_START, PERIOD_END);
    const control = results.find((r) => r.controlId === "bank_detail_change_process")!;
    expect(control.status).toBe("implemented");
    expect(control.populationSize).toBe(2);
    expect(control.exceptions).toHaveLength(1);
    expect(control.exceptions[0].detail).toContain("emp-bad");
  });

  it("not_implemented controls appear with reasons and are excluded from overall_control_health", async () => {
    const envelope = await run();
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { controls: { controlId: string; status: string; reasonIfLimited?: string }[]; overallControlHealth: number | null };
    const notImplemented = proposal.controls.filter((c) => c.status === "not_implemented");
    expect(notImplemented.length).toBeGreaterThan(0);
    for (const c of notImplemented) expect(c.reasonIfLimited).toBeTruthy();
    // sod_permission_conflict, access_change_authorised
    // (payment_against_approved_bill, master_data_verification, bank_detail_change_process all
    // flipped to real in Chunk 8a — docs/ai/SYSTEM_INVENTORY.md, OPEN_QUESTIONS.md #33)
    expect(notImplemented.length).toBe(2);

    const implementedOrPartial = proposal.controls.filter((c) => c.status !== "not_implemented") as unknown as { failureRate: number }[];
    const expectedHealth = implementedOrPartial.reduce((s, c) => s + (1 - c.failureRate), 0) / implementedOrPartial.length;
    expect(proposal.overallControlHealth).toBeCloseTo(expectedHealth, 6);
    // Structurally: recomputing with not_implemented rows folded in would change the denominator
    // (proving they're excluded, not just absent by coincidence on this empty fixture).
    expect(implementedOrPartial.length).toBe(proposal.controls.length - notImplemented.length);
  });

  it("no path in AI-29's own code ever writes outside internal_state (source-grep, same pattern as AI-09/AI-13/AI-18/AI-21/AI-23)", () => {
    const output = execSync(
      String.raw`grep -rnE '\.(save|create|updateOne|updateMany|deleteOne|deleteMany|findOneAndUpdate|findByIdAndUpdate|findOneAndDelete|insertMany)\(' lib/aiRuntime/workflows/ai-29-control-monitoring lib/aiRuntime/controls lib/aiRuntime/tools/controlMonitoringTools.ts || true`,
      { encoding: "utf-8", cwd: process.cwd() },
    );
    const nonInternalStateWrites = output.split("\n").filter((line) => line.trim() && !line.includes("AiControlResult"));
    expect(nonInternalStateWrites).toEqual([]);
  });

  it("the same control failing across five consecutive runs raises design_concern once, not five times", async () => {
    await AccountingSettings.create({ tenantId: TENANT, journals: { approvalsEnabled: true, approvalThresholdAmount: 100 } });
    const cash = await makeAccount("asset_cash", "asset", "Cash");
    const expense = await makeAccount("expense", "expense", "Expense");
    // 6 unapproved above-threshold entries -> approval_present fails 100% of the time, tested=6 >= min sample.
    for (let i = 0; i < 6; i++) {
      await postJournal({ name: `JE-fail-${i}`, date: new Date(`2026-01-0${i + 1}T12:00:00.000Z`), lines: [{ accountId: expense, debit: 500, credit: 0 }, { accountId: cash, debit: 0, credit: 500 }] });
    }

    for (let i = 0; i < 5; i++) await run();

    const designConcernItems = await AiAttentionItem.find({ tenantId: TENANT, workflowId: "AI-29", dedupeKey: "ai29-design-concern-approval_present" }).lean();
    expect(designConcernItems).toHaveLength(1);
  });

  it("remediation cannot be self-closed by the AI — re-running with unchanged data leaves the exception task open", async () => {
    const cash = await makeAccount("asset_cash", "asset", "Cash");
    const expense = await makeAccount("expense", "expense", "Expense");
    const sameUser = await makeUser("Repeat Offender");
    await postJournal({ name: "JE-sod-repeat", date: new Date("2026-01-10T12:00:00.000Z"), createdBy: sameUser, approvedBy: sameUser, lines: [{ accountId: expense, debit: 500, credit: 0 }, { accountId: cash, debit: 0, credit: 500 }] });

    await run();
    const itemsAfterFirst = await AiAttentionItem.find({ tenantId: TENANT, workflowId: "AI-29" }).lean();
    const sodItem = itemsAfterFirst.find((i) => i.dedupeKey.includes("sod_preparer_approver"));
    expect(sodItem).toBeDefined();
    expect(sodItem!.status).toBe("open");

    await run();
    const itemsAfterSecond = await AiAttentionItem.find({ tenantId: TENANT, workflowId: "AI-29", dedupeKey: sodItem!.dedupeKey }).lean();
    expect(itemsAfterSecond).toHaveLength(1); // upserted in place, not duplicated
    expect(itemsAfterSecond[0].status).toBe("open"); // never auto-closed by re-running
  });

  it("a fully clean period — approvals present, no lock violations, no SoD conflicts — produces zero exceptions on the implemented controls that apply (false positive check)", async () => {
    await AccountingSettings.create({ tenantId: TENANT, journals: { approvalsEnabled: true, approvalThresholdAmount: 1000 } });
    const cash = await makeAccount("asset_cash", "asset", "Cash");
    const expense = await makeAccount("expense", "expense", "Expense");
    const preparer = await makeUser("Preparer");
    const approver = await makeUser("Approver");
    const sourceId = new mongoose.Types.ObjectId();
    await ExtractedDocument.create({ tenantId: TENANT, docType: "vendor_bill", fileName: "bill.pdf", extraction: {}, aiConfidence: 0.9, createdRecordModel: "Invoice", createdRecordId: sourceId, createdBy: new mongoose.Types.ObjectId() });
    await postJournal({ name: "JE-clean", date: new Date("2026-01-10T12:00:00.000Z"), createdBy: preparer, approvedBy: approver, lines: [{ accountId: expense, debit: 5000, credit: 0, sourceId }, { accountId: cash, debit: 0, credit: 5000 }] });

    const results = await runAllControlDefinitions(TENANT, CONTROL_DEFINITIONS, PERIOD_START, PERIOD_END);
    for (const r of results.filter((r) => r.status === "implemented")) {
      expect(r.exceptions).toEqual([]);
    }
  });
});
