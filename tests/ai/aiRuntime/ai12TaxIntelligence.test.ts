import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import { execSync } from "node:child_process";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai12";

import Customer from "@/models/sales/Customer";
import Invoice from "@/models/finance/Invoice";
import Account from "@/models/finance/Account";
import TaxRate from "@/models/finance/TaxRate";
import JournalEntry from "@/models/finance/JournalEntry";
import User from "@/models/auth/User";
import AiTaxTransaction from "@/models/ai/AiTaxTransaction";
import AiComplianceProfile from "@/models/ai/AiComplianceProfile";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai12TaxIntelligence: typeof import("@/lib/aiRuntime/workflows/ai-12-tax-intelligence").ai12TaxIntelligence;
let rebuildTaxProjection: typeof import("@/lib/aiRuntime/tax/rebuildTaxProjection").rebuildTaxProjection;
let getTool: typeof import("@/lib/aiRuntime/tools/registry").getTool;
let listTools: typeof import("@/lib/aiRuntime/tools/registry").listTools;

const TENANT = "ai12-tenant";
const PERIOD = "2026-01";
const PERIOD_END = new Date("2026-01-31T23:59:59.999Z");

async function makeCustomer(gstin?: string) {
  const c = await Customer.create({ tenantId: TENANT, header: { name: "Acme Co", is_company: true }, gstin, createdBy: new mongoose.Types.ObjectId() });
  return c._id as mongoose.Types.ObjectId;
}

async function makeInvoice(opts: { moveType: "in_invoice" | "out_invoice"; partnerId: mongoose.Types.ObjectId; amountUntaxed: number; amountTax: number; invoiceDate: Date }) {
  const inv = await Invoice.create({
    tenantId: TENANT,
    name: `INV-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    partnerId: opts.partnerId,
    moveType: opts.moveType,
    state: "posted",
    invoiceDate: opts.invoiceDate,
    dueDate: opts.invoiceDate,
    invoiceLines: [{ name: "Goods", priceSubtotal: opts.amountUntaxed, quantity: 1, priceUnit: opts.amountUntaxed }],
    amountUntaxed: opts.amountUntaxed,
    amountTax: opts.amountTax,
    amountTotal: opts.amountUntaxed + opts.amountTax,
  });
  return inv;
}

async function makeAccount(account_type: string, name = `Account ${account_type}`) {
  const acc = await Account.create({ tenantId: TENANT, name, code: `ACC-${Math.random().toString(36).slice(2, 8)}`, account_type, isActive: true, isLocked: false, status: "active" });
  return acc._id as mongoose.Types.ObjectId;
}

async function runAi12() {
  return runWorkflow(ai12TaxIntelligence, { tenantId: TENANT, eventKey: "period.horizon.reached", payload: { period: PERIOD, periodEnd: PERIOD_END.toISOString() } });
}

describe("AI-12 — Tax intelligence", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Customer.init(),
      Invoice.init(),
      Account.init(),
      TaxRate.init(),
      JournalEntry.init(),
      User.init(),
      AiTaxTransaction.init(),
      AiComplianceProfile.init(),
      AiWorkflowRun.init(),
      AiDecisionTrace.init(),
      AiEvent.init(),
      AiToolCall.init(),
      AiWorkflowPolicy.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai12TaxIntelligence } = await import("@/lib/aiRuntime/workflows/ai-12-tax-intelligence"));
    ({ rebuildTaxProjection } = await import("@/lib/aiRuntime/tax/rebuildTaxProjection"));
    ({ getTool, listTools } = await import("@/lib/aiRuntime/tools/registry"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Promise.all([
      Customer.deleteMany({}),
      Invoice.deleteMany({}),
      Account.deleteMany({}),
      TaxRate.deleteMany({}),
      JournalEntry.deleteMany({}),
      User.deleteMany({}),
      AiTaxTransaction.deleteMany({}),
      AiComplianceProfile.deleteMany({}),
      AiWorkflowRun.deleteMany({}),
      AiDecisionTrace.deleteMany({}),
      AiEvent.deleteMany({}),
      AiToolCall.deleteMany({}),
      AiWorkflowPolicy.deleteMany({}),
    ]);
  });

  it("rebuild is idempotent — running it twice on the same source data produces identical rows", async () => {
    const vendor = await makeCustomer("29ABCDE1234F1Z5");
    await makeInvoice({ moveType: "in_invoice", partnerId: vendor, amountUntaxed: 1000, amountTax: 180, invoiceDate: new Date("2026-01-10") });

    await rebuildTaxProjection(TENANT, PERIOD);
    const first = await AiTaxTransaction.find({ tenantId: TENANT, periodKey: PERIOD }).sort({ "sourceRef.id": 1 }).lean();

    await rebuildTaxProjection(TENANT, PERIOD);
    const second = await AiTaxTransaction.find({ tenantId: TENANT, periodKey: PERIOD }).sort({ "sourceRef.id": 1 }).lean();

    expect(second).toHaveLength(first.length);
    const strip = (rows: typeof first) =>
      rows.map((r) => ({
        ...r,
        _id: undefined,
        createdAt: undefined,
        updatedAt: undefined,
        projectedAt: undefined,
        projectionVersion: undefined,
        evidenceRefs: r.evidenceRefs.map((e) => ({ ...e, _id: undefined })),
      }));
    expect(strip(second)).toEqual(strip(first));
  });

  it("rebuild is self-healing — a corrupted row is replaced, not patched, by the next rebuild", async () => {
    const vendor = await makeCustomer("29ABCDE1234F1Z5");
    await makeInvoice({ moveType: "in_invoice", partnerId: vendor, amountUntaxed: 1000, amountTax: 180, invoiceDate: new Date("2026-01-10") });
    await rebuildTaxProjection(TENANT, PERIOD);

    const row = await AiTaxTransaction.findOne({ tenantId: TENANT, periodKey: PERIOD });
    await AiTaxTransaction.collection.updateOne({ _id: row!._id }, { $set: { taxAmount: 999999 } });

    await rebuildTaxProjection(TENANT, PERIOD);
    const healed = await AiTaxTransaction.findOne({ tenantId: TENANT, periodKey: PERIOD }).lean();
    expect(healed!.taxAmount).toBe(180);
  });

  it("box values equal the sum of their supporting transactions exactly", async () => {
    const customer = await makeCustomer();
    const vendor = await makeCustomer();
    await makeInvoice({ moveType: "out_invoice", partnerId: customer, amountUntaxed: 2000, amountTax: 360, invoiceDate: new Date("2026-01-05") });
    await makeInvoice({ moveType: "in_invoice", partnerId: vendor, amountUntaxed: 1000, amountTax: 180, invoiceDate: new Date("2026-01-10") });
    await rebuildTaxProjection(TENANT, PERIOD);

    const tool = getTool("build_tax_workpaper")!;
    const workpaper = (await tool.handler({ tenantId: TENANT, period: PERIOD, returnType: "monthly_return" }, { tenantId: TENANT, runId: "test-run", requestedAutonomy: "controlled_autonomous" })) as {
      boxes: { code: string; value: number; supporting_refs: string[] }[];
    };

    const rows = await AiTaxTransaction.find({ tenantId: TENANT, periodKey: PERIOD }).lean();
    for (const box of workpaper.boxes) {
      const sum = rows.filter((r) => box.supporting_refs.includes(String(r._id))).reduce((s, r) => s + (box.code === "net_payable" ? (r.direction === "output" ? r.taxAmount : -r.taxAmount) : r.taxAmount), 0);
      expect(Math.round(box.value * 100)).toBe(Math.round(sum * 100));
    }
  });

  it("a seeded 1-unit control-account difference between the ledger and the projection is detected and traced", async () => {
    const user = await User.create({ tenantId: TENANT, name: "F", email: `f-${Date.now()}@x.com`, phone: "9999999999", password: "hashedpw", role: "finance", status: "active" });
    const taxControlAcc = await makeAccount("liability_current", "GST Payable");
    const otherAcc = await makeAccount("expense");
    await TaxRate.create({ tenantId: TENANT, name: "GST 18%", type: "gst", ratePercent: 18, appliesTo: "both", accountId: taxControlAcc, status: "active", createdBy: user._id });

    // Ledger says the control account carries a credit (liability) of 100.01.
    await JournalEntry.create({
      tenantId: TENANT,
      header: { name: "JE-tax-ai12", date: new Date("2026-01-15"), journalType: "sale" },
      status: "posted",
      voucherStatus: "posted",
      lineIds: [
        { accountId: otherAcc, label: "line", debit: 100.01, credit: 0 },
        { accountId: taxControlAcc, label: "line", debit: 0, credit: 100.01 },
      ],
      totals: { amountUntaxed: 100.01, amountTax: 0, amountTotal: 100.01 },
    });

    // Projected output tax only captures 99.01 — a real, seeded 1-unit gap.
    const customer = await makeCustomer();
    await makeInvoice({ moveType: "out_invoice", partnerId: customer, amountUntaxed: 550, amountTax: 99.01, invoiceDate: new Date("2026-01-15") });

    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-12", killSwitchEnabled: true, maxAutonomyLevel: "recommend" });
    const envelope = await runAi12();

    const finding = envelope.findings.find((f) => f.title.includes("ledger_vs_transactions".replace(/_/g, " ")));
    expect(finding).toBeDefined();
    expect(finding!.type).toBe("exception");

    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { threeWay: { ledger: number; transactions: number; differences: { pair: string; amount: number; tracedRefs: string[] }[] } };
    const ledgerVsTx = proposal.threeWay.differences.find((d) => d.pair === "ledger_vs_transactions")!;
    expect(ledgerVsTx).toBeDefined();
    expect(Math.abs(ledgerVsTx.amount)).toBeCloseTo(1, 2);
    expect(ledgerVsTx.tracedRefs.length).toBeGreaterThan(0);
  });

  it("an input credit with no counterparty tax registration number is flagged as missing evidence", async () => {
    const vendor = await makeCustomer(); // no gstin
    await makeInvoice({ moveType: "in_invoice", partnerId: vendor, amountUntaxed: 1000, amountTax: 180, invoiceDate: new Date("2026-01-10") });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-12", killSwitchEnabled: true, maxAutonomyLevel: "recommend" });

    const envelope = await runAi12();
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { missingEvidence: { what: string }[] };
    expect(proposal.missingEvidence.length).toBeGreaterThan(0);
    expect(proposal.missingEvidence[0].what).toContain("registration number");
  });

  it("a clean, fully-registered, reconciled period produces zero three-way findings (false positive check)", async () => {
    const user = await User.create({ tenantId: TENANT, name: "F", email: `f-${Date.now()}@x.com`, phone: "9999999999", password: "hashedpw", role: "finance", status: "active" });
    const taxControlAcc = await makeAccount("liability_current", "GST Payable Clean");
    const otherAcc = await makeAccount("expense", "Expense Clean");
    await TaxRate.create({ tenantId: TENANT, name: "GST 18% clean", type: "gst", ratePercent: 18, appliesTo: "both", accountId: taxControlAcc, status: "active", createdBy: user._id });

    const vendor = await makeCustomer("29ABCDE1234F1Z5");
    await makeInvoice({ moveType: "in_invoice", partnerId: vendor, amountUntaxed: 1000, amountTax: 180, invoiceDate: new Date("2026-01-10") });
    // Ledger ties out exactly: input tax is debit-normal (+180), so the control account carries a debit balance of 180.
    await JournalEntry.create({
      tenantId: TENANT,
      header: { name: "JE-tax-clean", date: new Date("2026-01-10"), journalType: "purchase" },
      status: "posted",
      voucherStatus: "posted",
      lineIds: [
        { accountId: taxControlAcc, label: "line", debit: 180, credit: 0 },
        { accountId: otherAcc, label: "line", debit: 0, credit: 180 },
      ],
      totals: { amountUntaxed: 180, amountTax: 0, amountTotal: 180 },
    });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-12", killSwitchEnabled: true, maxAutonomyLevel: "recommend" });

    const envelope = await runAi12();
    const exceptionFindings = envelope.findings.filter((f) => f.type === "exception" && f.title.startsWith("Tax three-way"));
    expect(exceptionFindings).toHaveLength(0);
  });

  it("real tax activity with no TaxRate.accountId configured is a blocker, never not_applicable (docs/ai/BRIEF-07-BATCH-F.md 0.3)", async () => {
    const vendor = await makeCustomer("29ABCDE1234F1Z5");
    await makeInvoice({ moveType: "in_invoice", partnerId: vendor, amountUntaxed: 1000, amountTax: 180, invoiceDate: new Date("2026-01-10") });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-12", killSwitchEnabled: true, maxAutonomyLevel: "recommend" });

    const envelope = await runAi12();
    const ledgerFinding = envelope.findings.find((f) => f.title.includes("ledger vs transactions"));
    expect(ledgerFinding).toBeDefined();
    expect(ledgerFinding!.severity).toBe("high");

    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { threeWay: { ledger: number; transactions: number } };
    // Ledger reads 0 (no control account to sum), never "not_applicable" swallowing the ₹180 of real activity.
    expect(proposal.threeWay.ledger).toBe(0);
    expect(proposal.threeWay.transactions).toBe(180);
  });

  it("no TaxRate.accountId configured AND no tax activity this period → genuinely not_applicable, empty population", async () => {
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-12", killSwitchEnabled: true, maxAutonomyLevel: "recommend" });
    const envelope = await runAi12();
    const threeWayFindings = envelope.findings.filter((f) => f.title.startsWith("Tax three-way"));
    expect(threeWayFindings).toHaveLength(0);
  });

  it("no compliance profile → not_configured everywhere, never an assumed default", async () => {
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-12", killSwitchEnabled: true, maxAutonomyLevel: "recommend" });
    const envelope = await runAi12();
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { profileConfigured: boolean; returnDataset: unknown };
    expect(proposal.profileConfigured).toBe(false);
    expect(proposal.returnDataset).toBeNull();
  });

  it("a configured profile drives a real workpaper with the profile's own returnType, never a hard-coded one", async () => {
    await AiComplianceProfile.create({
      tenantId: TENANT,
      registrations: [{ jurisdiction: "IN-KA", taxType: "gst", registrationNumber: "29ABCDE1234F1Z5", effectiveFrom: new Date("2020-01-01") }],
      obligations: [{ jurisdiction: "IN-KA", taxType: "gst", returnType: "monthly_gst_return", frequency: "monthly", dueDayOffset: 20, firstPeriod: "2020-01" }],
    });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-12", killSwitchEnabled: true, maxAutonomyLevel: "recommend" });

    const envelope = await runAi12();
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { profileConfigured: boolean; jurisdiction: string | null; returnDataset: { returnType: string } | null };
    expect(proposal.profileConfigured).toBe(true);
    expect(proposal.jurisdiction).toBe("IN-KA");
    expect(proposal.returnDataset).not.toBeNull();
    expect(proposal.returnDataset!.returnType).toBe("monthly_gst_return");
  });

  it("cannot mutate TaxRate at any confidence (source-grep, no ORM write-method call to TaxRate anywhere in AI-12's own folder or its tools)", () => {
    const output = execSync(
      String.raw`grep -rnE '\.(save|create|updateOne|updateMany|deleteOne|deleteMany|findOneAndUpdate|findByIdAndUpdate|findOneAndDelete|insertMany)\(' lib/aiRuntime/workflows/ai-12-tax-intelligence lib/aiRuntime/tools/taxTools.ts lib/aiRuntime/tax || true`,
      { encoding: "utf-8", cwd: process.cwd() },
    );
    const taxRateWrite = output.split("\n").filter((line) => /TaxRate/.test(line));
    expect(taxRateWrite).toEqual([]);
  });

  it("no registered tool anywhere can write TaxRate or AiComplianceProfile — both are structurally read-only to the AI", () => {
    for (const tool of listTools()) {
      expect(tool.name).not.toMatch(/set_tax_rate|update_tax_rate|create_tax_rate|write_compliance_profile|update_compliance_profile|set_compliance_profile/i);
    }
  });

  it("submit_filing does not exist — no tool anywhere has an external-submission side effect", () => {
    expect(getTool("submit_filing")).toBeUndefined();
    expect(getTool("file_return")).toBeUndefined();
    expect(getTool("submit_return")).toBeUndefined();
  });
});
