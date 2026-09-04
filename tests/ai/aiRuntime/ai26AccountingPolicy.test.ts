import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import { execSync } from "node:child_process";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai26";

import Customer from "@/models/sales/Customer";
import Invoice from "@/models/finance/Invoice";
import Account from "@/models/finance/Account";
import JournalEntry from "@/models/finance/JournalEntry";
import AiMaterialityPolicy from "@/models/ai/AiMaterialityPolicy";
import AiAccountingPolicy from "@/models/ai/AiAccountingPolicy";
import AiPolicyFinding from "@/models/ai/AiPolicyFinding";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai26AccountingPolicy: typeof import("@/lib/aiRuntime/workflows/ai-26-accounting-policy").ai26AccountingPolicy;

const TENANT = "ai26-tenant";
const CREATOR = new mongoose.Types.ObjectId();

async function makeVendor(name: string) {
  const c = await Customer.create({ tenantId: TENANT, header: { name, is_company: true }, createdBy: CREATOR });
  return c._id as mongoose.Types.ObjectId;
}

async function makeAccount(account_type: string, code: string) {
  const a = await Account.create({ tenantId: TENANT, name: `Account ${code}`, code, account_type, isActive: true, isLocked: false, status: "active" });
  return a._id as mongoose.Types.ObjectId;
}

async function makeBill(vendorId: mongoose.Types.ObjectId, amount: number, accountId: mongoose.Types.ObjectId, date: Date, name: string) {
  const inv = await Invoice.create({
    tenantId: TENANT,
    name,
    partnerId: vendorId,
    moveType: "in_invoice",
    state: "posted",
    invoiceDate: date,
    dueDate: date,
    invoiceLines: [{ name: "line", priceSubtotal: amount, quantity: 1, priceUnit: amount, accountId }],
    amountUntaxed: amount,
    amountTax: 0,
    amountTotal: amount,
    amountResidual: amount,
    paymentState: "not_paid",
  });
  return inv._id as mongoose.Types.ObjectId;
}

describe("AI-26 — Accounting policy intelligence", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Customer.init(), Invoice.init(), Account.init(), JournalEntry.init(), AiMaterialityPolicy.init(), AiAccountingPolicy.init(), AiPolicyFinding.init(),
      AiWorkflowRun.init(), AiDecisionTrace.init(), AiEvent.init(), AiToolCall.init(), AiWorkflowPolicy.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai26AccountingPolicy } = await import("@/lib/aiRuntime/workflows/ai-26-accounting-policy"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Promise.all([
      Customer.deleteMany({}), Invoice.deleteMany({}), Account.deleteMany({}), JournalEntry.deleteMany({}), AiMaterialityPolicy.deleteMany({}), AiAccountingPolicy.deleteMany({}), AiPolicyFinding.deleteMany({}),
      AiWorkflowRun.deleteMany({}), AiDecisionTrace.deleteMany({}), AiEvent.deleteMany({}), AiToolCall.deleteMany({}), AiWorkflowPolicy.deleteMany({}),
    ]);
  });

  async function policy() {
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-26", killSwitchEnabled: true, maxAutonomyLevel: "observe" });
  }

  it("a purchase above the configured capitalisation threshold that was expensed raises an inconsistency with both examples cited", async () => {
    await AiMaterialityPolicy.create({ tenantId: TENANT, thresholds: [{ appliesTo: "capitalisation", absoluteAmount: 50000 }] });
    const vendor = await makeVendor("Equipment Co");
    const assetAcc = await makeAccount("asset_fixed", "1600");
    const expenseAcc = await makeAccount("expense", "6000");
    await makeBill(vendor, 80000, assetAcc, new Date("2026-01-05"), "CAPEX-1");
    await makeBill(vendor, 90000, expenseAcc, new Date("2026-01-10"), "CAPEX-2-MISCODED");
    await policy();

    const envelope = await runWorkflow(ai26AccountingPolicy, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: {} });
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { inconsistencies: { pattern: string; treatmentA: { examples: unknown[] }; treatmentB: { examples: unknown[] } }[] };
    expect(proposal.inconsistencies.length).toBe(1);
    expect(proposal.inconsistencies[0].treatmentA.examples.length).toBe(1);
    expect(proposal.inconsistencies[0].treatmentB.examples.length).toBe(1);

    const finding = envelope.findings.find((f) => f.title.startsWith("Inconsistent treatment"));
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe("high");
  });

  it("a transaction type with no policy configured raises a policy gap", async () => {
    await policy();
    const envelope = await runWorkflow(ai26AccountingPolicy, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: {} });
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { policyGaps: { gap: string }[] };
    expect(proposal.policyGaps.some((g) => g.gap.includes('no materiality/policy threshold configured for "capitalisation"'))).toBe(true);
  });

  it("all six A.3 inherited gaps appear as policy_gaps with their sources", async () => {
    await policy();
    const envelope = await runWorkflow(ai26AccountingPolicy, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: {} });
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { policyGaps: { gap: string; inheritedFrom: string }[] };
    const inherited = proposal.policyGaps.filter((g) => g.inheritedFrom.startsWith("Chunk"));
    expect(inherited.length).toBe(6);
    expect(inherited.every((g) => g.inheritedFrom.length > 0)).toBe(true);
  });

  it("cannot write to AccountingSettings or lib/accounting/smart-rules.ts at any confidence (source-grep)", () => {
    // No import of the AccountingSettings model anywhere in AI-26's own code — it never reads or
    // writes it.
    const importOutput = execSync(
      String.raw`grep -rn "models/finance/AccountingSettings" lib/aiRuntime/workflows/ai-26-accounting-policy lib/aiRuntime/policyIntelligence lib/aiRuntime/tools/policyTools.ts || true`,
      { encoding: "utf-8", cwd: process.cwd() },
    );
    expect(importOutput.trim()).toBe("");

    // lib/accounting/smart-rules.ts's own source text IS read (grepped, as live evidence for the
    // inherited gap) — but never mutated. Assert no mutation verb appears anywhere in this
    // workflow's own code, except on the two models it's allowed to write.
    const mutationOutput = execSync(
      String.raw`grep -rnE '\.(save|create|updateOne|updateMany|deleteOne|deleteMany|findOneAndUpdate|findByIdAndUpdate|findOneAndDelete|insertMany)\(' lib/aiRuntime/workflows/ai-26-accounting-policy lib/aiRuntime/policyIntelligence lib/aiRuntime/tools/policyTools.ts || true`,
      { encoding: "utf-8", cwd: process.cwd() },
    );
    const forbiddenWrites = mutationOutput
      .split("\n")
      .filter((line) => line.trim())
      .filter((line) => !/AiAccountingPolicy|AiPolicyFinding/.test(line));
    expect(forbiddenWrites).toEqual([]);
  });

  it("a tenant with consistent treatment produces zero inconsistencies (false positive, mandatory)", async () => {
    await AiMaterialityPolicy.create({ tenantId: TENANT, thresholds: [{ appliesTo: "capitalisation", absoluteAmount: 50000 }] });
    const vendor = await makeVendor("Consistent Equipment Co");
    const assetAcc = await makeAccount("asset_fixed", "1600");
    await makeBill(vendor, 80000, assetAcc, new Date("2026-02-01"), "CAPEX-A");
    await makeBill(vendor, 95000, assetAcc, new Date("2026-02-10"), "CAPEX-B");
    await policy();

    const envelope = await runWorkflow(ai26AccountingPolicy, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: {} });
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { inconsistencies: unknown[] };
    expect(proposal.inconsistencies).toEqual([]);
    expect(envelope.findings.filter((f) => f.title.startsWith("Inconsistent treatment"))).toEqual([]);
  });

  it("no path in AI-26's own code ever writes to Invoice/Account/JournalEntry (source-grep)", () => {
    const output = execSync(
      String.raw`grep -rnE '\.(save|create|updateOne|updateMany|deleteOne|deleteMany|findOneAndUpdate|findByIdAndUpdate|findOneAndDelete|insertMany)\(' lib/aiRuntime/workflows/ai-26-accounting-policy lib/aiRuntime/policyIntelligence lib/aiRuntime/tools/policyTools.ts || true`,
      { encoding: "utf-8", cwd: process.cwd() },
    );
    const forbiddenWrites = output
      .split("\n")
      .filter((line) => line.trim())
      .filter((line) => !/AiAccountingPolicy|AiPolicyFinding/.test(line));
    expect(forbiddenWrites).toEqual([]);
  });
});
