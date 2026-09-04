import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import { execSync } from "node:child_process";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai18";

import Account from "@/models/finance/Account";
import JournalEntry from "@/models/finance/JournalEntry";
import Invoice from "@/models/finance/Invoice";
import Customer from "@/models/sales/Customer";
import AccountingSettings from "@/models/finance/AccountingSettings";
import ExtractedDocument from "@/models/ai/ExtractedDocument";
import User from "@/models/auth/User";
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
import AiEvidencePack from "@/models/ai/AiEvidencePack";

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai18AuditEvidence: typeof import("@/lib/aiRuntime/workflows/ai-18-audit-evidence").ai18AuditEvidence;
let makeClaim: typeof import("@/lib/aiRuntime/audit/citations").makeClaim;
let traceAccountEvidence: typeof import("@/lib/aiRuntime/audit/traceEvidence").traceAccountEvidence;
let traceDecisionForRecord: typeof import("@/lib/aiRuntime/audit/decisionTrace").traceDecisionForRecord;
let sampleItems: typeof import("@/lib/aiRuntime/audit/sampling").sampleItems;

const TENANT = "ai18-tenant";
const PERIOD = "2026-01";
const PERIOD_END = new Date("2026-01-31T23:59:59.999Z");

async function makeAccount(account_type: string, internal_group: string, name: string) {
  const acc = await Account.create({ tenantId: TENANT, name, code: `ACC-${Math.random().toString(36).slice(2, 8)}`, account_type, internal_group, isActive: true, isLocked: false, status: "active" });
  return acc._id as mongoose.Types.ObjectId;
}

async function seedAi14Comparison(accountId: string, materialityVerdict: string) {
  const run = await AiWorkflowRun.create({
    tenantId: TENANT, workflowId: "AI-14", workflowVersion: "1.0.0", entityId: TENANT, status: "completed", autonomyApplied: "observe", summary: "seed",
    findings: [], metrics: { scanned: 1, matched: 0, exceptions: 0, autoActioned: 0, policy_overrides: 0 }, startedAt: new Date(), finishedAt: new Date(),
  });
  await AiDecisionTrace.create({
    tenantId: TENANT, runId: run._id, workflowId: "AI-14", workflowVersion: "1.0.0", inputsHash: "seed", reasonChain: [],
    rawProposal: { comparisons: [{ accountId, materialityVerdict, variance: 5000, unexplainedAmount: 5000, drivers: [] }] },
    confidenceComponents: {}, finalOutcome: "completed",
  });
}

describe("AI-18 — Audit / evidence intelligence", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Account.init(), JournalEntry.init(), Invoice.init(), Customer.init(), AccountingSettings.init(), ExtractedDocument.init(), User.init(),
      AiWorkflowRun.init(), AiDecisionTrace.init(), AiEvent.init(), AiToolCall.init(), AiWorkflowPolicy.init(), AiCloseState.init(), PeriodClosing.init(),
      BankStatement.init(), Asset.init(), TaxRate.init(), AiSchedule.init(), AiTaxTransaction.init(), AiComplianceProfile.init(), AiMaterialityPolicy.init(),
      AiEvidencePack.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai18AuditEvidence } = await import("@/lib/aiRuntime/workflows/ai-18-audit-evidence"));
    ({ makeClaim } = await import("@/lib/aiRuntime/audit/citations"));
    ({ traceAccountEvidence } = await import("@/lib/aiRuntime/audit/traceEvidence"));
    ({ traceDecisionForRecord } = await import("@/lib/aiRuntime/audit/decisionTrace"));
    ({ sampleItems } = await import("@/lib/aiRuntime/audit/sampling"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Promise.all([
      Account.deleteMany({}), JournalEntry.deleteMany({}), Invoice.deleteMany({}), Customer.deleteMany({}), AccountingSettings.deleteMany({}),
      ExtractedDocument.deleteMany({}), User.deleteMany({}), AiWorkflowRun.deleteMany({}), AiDecisionTrace.deleteMany({}), AiEvent.deleteMany({}),
      AiToolCall.deleteMany({}), AiWorkflowPolicy.deleteMany({}), AiCloseState.deleteMany({}), PeriodClosing.deleteMany({}), BankStatement.deleteMany({}),
      Asset.deleteMany({}), TaxRate.deleteMany({}), AiSchedule.deleteMany({}), AiTaxTransaction.deleteMany({}), AiComplianceProfile.deleteMany({}),
      AiMaterialityPolicy.deleteMany({}), AiEvidencePack.deleteMany({}),
    ]);
  });

  it("an uncited claim cannot be constructed — makeClaim throws on an empty citations array", () => {
    expect(() => makeClaim("some fact", [])).toThrow(/uncited claim/i);
    expect(makeClaim("a fact", [{ model: "Account", id: "x", label: "x" }]).citations.length).toBeGreaterThan(0);
  });

  it("'no evidence found' cites the query performed, never a bare narrative", async () => {
    const result = await traceDecisionForRecord(TENANT, "Invoice", String(new mongoose.Types.ObjectId()));
    expect(result.found).toBe(false);
    expect(result.claims.length).toBeGreaterThan(0);
    expect(result.claims[0].citations[0].model).toBe("Query");
  });

  it("a balance with a missing source document reports the gap, not a plausible substitute", async () => {
    const vendor = await Customer.create({ tenantId: TENANT, header: { name: "Vendor Co", is_company: true }, createdBy: new mongoose.Types.ObjectId() });
    const controlAcc = await makeAccount("liability_payable", "liability", "AP Control No Doc");
    const bill = await Invoice.create({
      tenantId: TENANT, name: `BILL-${Date.now()}`, partnerId: vendor._id, moveType: "in_invoice", state: "posted",
      invoiceDate: new Date("2026-01-10"), dueDate: new Date("2026-01-10"),
      invoiceLines: [{ name: "Goods", priceSubtotal: 1000, quantity: 1, priceUnit: 1000 }],
      amountUntaxed: 1000, amountTax: 0, amountTotal: 1000, amountResidual: 1000, paymentState: "not_paid",
    });
    await JournalEntry.create({
      tenantId: TENANT, header: { name: "JE-nodoc", date: new Date("2026-01-10"), journalType: "purchase" }, status: "posted", voucherStatus: "posted",
      lineIds: [
        { accountId: controlAcc, label: "line", debit: 0, credit: 1000, sourceId: bill._id },
        { accountId: await makeAccount("expense", "expense", "Expense NoDoc"), label: "line", debit: 1000, credit: 0 },
      ],
      totals: { amountUntaxed: 1000, amountTax: 0, amountTotal: 1000 },
    });
    // No ExtractedDocument created for this bill — the gap.

    const trace = await traceAccountEvidence(TENANT, String(controlAcc), "AP Control No Doc", PERIOD);
    expect(trace.missingEvidence.some((m) => m.what.includes("ExtractedDocument"))).toBe(true);
  });

  it("the trace from an account reaches real document records when they exist", async () => {
    const vendor = await Customer.create({ tenantId: TENANT, header: { name: "Vendor Co", is_company: true }, createdBy: new mongoose.Types.ObjectId() });
    const controlAcc = await makeAccount("liability_payable", "liability", "AP Control With Doc");
    const bill = await Invoice.create({
      tenantId: TENANT, name: `BILL-${Date.now()}`, partnerId: vendor._id, moveType: "in_invoice", state: "posted",
      invoiceDate: new Date("2026-01-10"), dueDate: new Date("2026-01-10"),
      invoiceLines: [{ name: "Goods", priceSubtotal: 1000, quantity: 1, priceUnit: 1000 }],
      amountUntaxed: 1000, amountTax: 0, amountTotal: 1000, amountResidual: 1000, paymentState: "not_paid",
    });
    await ExtractedDocument.create({ tenantId: TENANT, docType: "vendor_bill", fileName: "bill.pdf", extraction: {}, aiConfidence: 0.9, createdRecordModel: "Invoice", createdRecordId: bill._id, createdBy: new mongoose.Types.ObjectId() });
    await JournalEntry.create({
      tenantId: TENANT, header: { name: "JE-doc", date: new Date("2026-01-10"), journalType: "purchase" }, status: "posted", voucherStatus: "posted",
      lineIds: [
        { accountId: controlAcc, label: "line", debit: 0, credit: 1000, sourceId: bill._id },
        { accountId: await makeAccount("expense", "expense", "Expense WithDoc"), label: "line", debit: 1000, credit: 0 },
      ],
      totals: { amountUntaxed: 1000, amountTax: 0, amountTotal: 1000 },
    });

    const trace = await traceAccountEvidence(TENANT, String(controlAcc), "AP Control With Doc", PERIOD);
    expect(trace.documents.length).toBeGreaterThan(0);
    expect(trace.documents[0].citations.some((c) => c.model === "ExtractedDocument")).toBe(true);
    expect(trace.missingEvidence.some((m) => m.what.includes("ExtractedDocument"))).toBe(false);
  });

  it("the decision trace for an AI-touched record returns workflow, version, autonomy, reasoning and tool calls", async () => {
    const targetId = String(new mongoose.Types.ObjectId());
    const run = await AiWorkflowRun.create({
      tenantId: TENANT, workflowId: "AI-01", workflowVersion: "1.0.0", entityId: "some-extracted-doc-id", status: "completed", autonomyApplied: "draft",
      summary: "drafted a bill", findings: [], metrics: { scanned: 1, matched: 1, exceptions: 0, autoActioned: 0, policy_overrides: 0 }, startedAt: new Date(), finishedAt: new Date(),
    });
    await AiDecisionTrace.create({
      tenantId: TENANT, runId: run._id, workflowId: "AI-01", workflowVersion: "1.0.0", inputsHash: "seed", reasonChain: ["extracted a vendor bill", "matched vendor by name"],
      toolCalls: [{ tool: "draft_bill", args: { extractedDocumentId: "x" }, result: { invoiceId: targetId }, error: null, startedAt: new Date(), durationMs: 5 }],
      rawProposal: { invoiceId: targetId }, confidenceComponents: { extraction: 0.9 }, finalOutcome: "completed", finalizedAt: new Date("2026-01-05"),
    });

    const result = await traceDecisionForRecord(TENANT, "Invoice", targetId, new Date("2026-01-10"));
    expect(result.found).toBe(true);
    expect(result.workflowId).toBe("AI-01");
    expect(result.workflowVersion).toBe("1.0.0");
    expect(result.autonomyApplied).toBe("draft");
    expect(result.toolCalls?.length).toBeGreaterThan(0);
    expect(result.reasonChain?.length).toBeGreaterThan(0);
    expect(result.humanEditDetected).toBe(true); // recordUpdatedAt (Jan 10) is after finalizedAt (Jan 5)
    expect(result.claims.length).toBeGreaterThan(0);
  });

  it("the same sample parameters and seed produce an identical sample twice", () => {
    const population = Array.from({ length: 20 }, (_, i) => ({ id: `item-${i}`, weight: i }));
    const a = sampleItems(population, (p) => p.id, 5, "risk_weighted", "fixed-seed-123", (p) => p.weight);
    const b = sampleItems(population, (p) => p.id, 5, "risk_weighted", "fixed-seed-123", (p) => p.weight);
    expect(a.map((p) => p.id)).toEqual(b.map((p) => p.id));
  });

  it("a fully evidenced, fully approved, fully reconciled balance produces zero missing_evidence entries (false positive check)", async () => {
    const vendor = await Customer.create({ tenantId: TENANT, header: { name: "Vendor Co", is_company: true }, createdBy: new mongoose.Types.ObjectId() });
    const controlAcc = await makeAccount("liability_payable", "liability", "AP Control Clean");
    const bill = await Invoice.create({
      tenantId: TENANT, name: `BILL-${Date.now()}`, partnerId: vendor._id, moveType: "in_invoice", state: "posted",
      invoiceDate: new Date("2026-01-10"), dueDate: new Date("2026-01-10"),
      invoiceLines: [{ name: "Goods", priceSubtotal: 1000, quantity: 1, priceUnit: 1000 }],
      amountUntaxed: 1000, amountTax: 0, amountTotal: 1000, amountResidual: 1000, paymentState: "not_paid",
    });
    await ExtractedDocument.create({ tenantId: TENANT, docType: "vendor_bill", fileName: "bill.pdf", extraction: {}, aiConfidence: 0.9, createdRecordModel: "Invoice", createdRecordId: bill._id, createdBy: new mongoose.Types.ObjectId() });
    await AccountingSettings.create({ tenantId: TENANT, journals: { approvalsEnabled: true, approvalThresholdAmount: 500 } });
    const approver = await User.create({ tenantId: TENANT, name: "Approver", email: `appr-${Date.now()}@x.com`, phone: "9999999999", password: "hashedpw", role: "finance", status: "active" });
    await JournalEntry.create({
      tenantId: TENANT, header: { name: "JE-clean", date: new Date("2026-01-10"), journalType: "purchase" }, status: "posted", voucherStatus: "posted",
      approvalRequired: true, approvalDetails: { approvedBy: approver._id, approvedAt: new Date("2026-01-10") },
      lineIds: [
        { accountId: controlAcc, label: "line", debit: 0, credit: 1000, sourceId: bill._id },
        { accountId: await makeAccount("expense", "expense", "Expense Clean"), label: "line", debit: 1000, credit: 0 },
      ],
      totals: { amountUntaxed: 1000, amountTax: 0, amountTotal: 1000 },
    });

    const trace = await traceAccountEvidence(TENANT, String(controlAcc), "AP Control Clean", PERIOD);
    expect(trace.missingEvidence).toEqual([]);
    expect(trace.documents.length).toBeGreaterThan(0);
    expect(trace.approvals.length).toBeGreaterThan(0);
  });

  it("the workflow sweep persists an evidence pack and raises HIGH findings for unsupported material lines", async () => {
    const vendor = await Customer.create({ tenantId: TENANT, header: { name: "Vendor Co", is_company: true }, createdBy: new mongoose.Types.ObjectId() });
    const controlAcc = await makeAccount("liability_payable", "liability", "AP Control Sweep");
    const bill = await Invoice.create({
      tenantId: TENANT, name: `BILL-${Date.now()}`, partnerId: vendor._id, moveType: "in_invoice", state: "posted",
      invoiceDate: new Date("2026-01-10"), dueDate: new Date("2026-01-10"),
      invoiceLines: [{ name: "Goods", priceSubtotal: 1000, quantity: 1, priceUnit: 1000 }],
      amountUntaxed: 1000, amountTax: 0, amountTotal: 1000, amountResidual: 1000, paymentState: "not_paid",
    });
    // GL nets to 0 (offsetting lines) vs a real 1000 open invoice -> unreconciled. sourceId set
    // with no ExtractedDocument behind it -> a real missing-evidence gap for the sweep to find.
    await JournalEntry.create({
      tenantId: TENANT, header: { name: "JE-sweep", date: new Date("2026-01-10"), journalType: "purchase" }, status: "posted", voucherStatus: "posted",
      lineIds: [
        { accountId: controlAcc, label: "line", debit: 100, credit: 0, sourceId: bill._id },
        { accountId: controlAcc, label: "line", debit: 0, credit: 100 },
      ],
      totals: { amountUntaxed: 100, amountTax: 0, amountTotal: 100 },
    });
    await seedAi14Comparison(String(controlAcc), "material");
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-18", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    const envelope = await runWorkflow(ai18AuditEvidence, { tenantId: TENANT, eventKey: "period.horizon.reached", payload: { period: PERIOD, periodEnd: PERIOD_END.toISOString() } });
    const finding = envelope.findings.find((f) => f.title.startsWith("Missing evidence"));
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe("high");

    const pack = await AiEvidencePack.findOne({ tenantId: TENANT, packId: `${PERIOD}-sweep` }).lean();
    expect(pack).toBeDefined();
    expect(pack!.completenessScore).toBeLessThan(1);
  });

  it("no path in AI-18's own code ever writes outside internal_state (source-grep, same pattern as AI-09/AI-13/AI-21)", () => {
    // Scoped to AI-18's own new files only — lib/aiRuntime/audit/ also holds pre-existing,
    // unrelated core infrastructure (auditTrace.ts, the executor's own AiDecisionTrace writer)
    // that legitimately writes directly; including the whole directory would be a false positive.
    const output = execSync(
      String.raw`grep -rnE '\.(save|create|updateOne|updateMany|deleteOne|deleteMany|findOneAndUpdate|findByIdAndUpdate|findOneAndDelete|insertMany)\(' lib/aiRuntime/workflows/ai-18-audit-evidence lib/aiRuntime/audit/citations.ts lib/aiRuntime/audit/traceEvidence.ts lib/aiRuntime/audit/decisionTrace.ts lib/aiRuntime/audit/sampling.ts lib/aiRuntime/tools/auditTools.ts || true`,
      { encoding: "utf-8", cwd: process.cwd() },
    );
    const nonInternalStateWrites = output.split("\n").filter((line) => line.trim() && !line.includes("AiEvidencePack"));
    expect(nonInternalStateWrites).toEqual([]);
  });
});
