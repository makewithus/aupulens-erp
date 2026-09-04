import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import { execSync } from "node:child_process";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai27";

import Customer from "@/models/sales/Customer";
import Invoice from "@/models/finance/Invoice";
import Expense from "@/models/finance/Expense";
import BankStatement from "@/models/finance/BankStatement";
import Account from "@/models/finance/Account";
import JournalEntry from "@/models/finance/JournalEntry";
import ExtractedDocument from "@/models/ai/ExtractedDocument";
import AiHold from "@/models/ai/AiHold";
import AiDuplicateFinding from "@/models/ai/AiDuplicateFinding";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai27DuplicateDetection: typeof import("@/lib/aiRuntime/workflows/ai-27-duplicate-detection").ai27DuplicateDetection;
let getTool: typeof import("@/lib/aiRuntime/tools/registry").getTool;
let findDuplicates: typeof import("@/lib/docIntel/duplicateCheck").findDuplicates;

const TENANT = "ai27-tenant";
const CREATOR = new mongoose.Types.ObjectId();

async function makeVendor(name: string, gstin?: string) {
  const c = await Customer.create({ tenantId: TENANT, header: { name, is_company: true }, gstin, createdBy: CREATOR });
  return c._id as mongoose.Types.ObjectId;
}

async function makeBill(vendorId: mongoose.Types.ObjectId, opts: { sourceDocument?: string; poReference?: string; amount: number; date: Date; paymentState?: string }) {
  const inv = await Invoice.create({
    tenantId: TENANT,
    name: `INV-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    partnerId: vendorId,
    moveType: "in_invoice",
    state: "posted",
    invoiceDate: opts.date,
    dueDate: opts.date,
    sourceDocument: opts.sourceDocument,
    poReference: opts.poReference,
    invoiceLines: [{ name: "Goods", priceSubtotal: opts.amount, quantity: 1, priceUnit: opts.amount }],
    amountUntaxed: opts.amount,
    amountTax: 0,
    amountTotal: opts.amount,
    amountResidual: opts.paymentState === "paid" ? 0 : opts.amount,
    paymentState: opts.paymentState ?? "not_paid",
  });
  return inv._id as mongoose.Types.ObjectId;
}

async function makeAccount(account_type: string) {
  const a = await Account.create({ tenantId: TENANT, name: `Account ${account_type}`, code: `ACC-${Math.random().toString(36).slice(2, 8)}`, account_type, isActive: true, isLocked: false, status: "active" });
  return a._id as mongoose.Types.ObjectId;
}

async function postPayment(billId: mongoose.Types.ObjectId, amount: number, date: Date, payable: mongoose.Types.ObjectId, cash: mongoose.Types.ObjectId) {
  return JournalEntry.create({
    tenantId: TENANT,
    header: { name: `JE-pay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, date, journalType: "general" },
    status: "posted",
    voucherStatus: "posted",
    voucherType: "payment",
    lineIds: [
      { accountId: payable, label: "line", debit: amount, credit: 0, sourceId: billId },
      { accountId: cash, label: "line", debit: 0, credit: amount },
    ],
    totals: { amountUntaxed: amount, amountTax: 0, amountTotal: amount },
  });
}

describe("AI-27 — Duplicate & duplicate-payment intelligence", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Customer.init(), Invoice.init(), Expense.init(), BankStatement.init(), ExtractedDocument.init(), Account.init(), JournalEntry.init(),
      AiHold.init(), AiDuplicateFinding.init(), AiWorkflowRun.init(), AiDecisionTrace.init(), AiEvent.init(), AiToolCall.init(), AiWorkflowPolicy.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai27DuplicateDetection } = await import("@/lib/aiRuntime/workflows/ai-27-duplicate-detection"));
    ({ getTool } = await import("@/lib/aiRuntime/tools/registry"));
    ({ findDuplicates } = await import("@/lib/docIntel/duplicateCheck"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Promise.all([
      Customer.deleteMany({}), Invoice.deleteMany({}), Expense.deleteMany({}), BankStatement.deleteMany({}), ExtractedDocument.deleteMany({}), Account.deleteMany({}), JournalEntry.deleteMany({}),
      AiHold.deleteMany({}), AiDuplicateFinding.deleteMany({}), AiWorkflowRun.deleteMany({}), AiDecisionTrace.deleteMany({}), AiEvent.deleteMany({}), AiToolCall.deleteMany({}), AiWorkflowPolicy.deleteMany({}),
    ]);
  });

  async function policy() {
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-27", killSwitchEnabled: true, maxAutonomyLevel: "recommend" });
  }

  it("the same invoice number formatted differently is detected (certain, hold placed)", async () => {
    const vendor = await makeVendor("Acme Supplies");
    const dupId = await makeBill(vendor, { sourceDocument: "INV-001", amount: 5000, date: new Date("2026-01-05") });
    await makeBill(vendor, { sourceDocument: "inv 0001", amount: 5000, date: new Date("2026-01-06") });
    await policy();

    const envelope = await runWorkflow(ai27DuplicateDetection, { tenantId: TENANT, eventKey: "bill.created", payload: {} });
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { candidates: { classification: string; matchedOn: string[]; holdPlaced: boolean; duplicateRef: string }[] };
    const certain = proposal.candidates.find((c) => c.classification === "certain" && c.matchedOn.includes("document_number"));
    expect(certain).toBeDefined();
    expect(certain!.holdPlaced).toBe(true);

    const finding = envelope.findings.find((f) => f.title.includes("Likely duplicate bill (certain)"));
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe("critical");

    const hold = await AiHold.findOne({ tenantId: TENANT, "subjectRef.model": "Invoice" }).lean();
    expect(hold).toBeDefined();
    expect(hold!.status).toBe("open");
    void dupId;
  });

  it("the same bill paid twice via two posted payment postings is detected directly from sourceId — certain, hold placed (Chunk 8b 0.1)", async () => {
    const vendor = await makeVendor("Overpaid Vendor Co");
    const bill = await makeBill(vendor, { sourceDocument: "BILL-OVERPAY", amount: 10000, date: new Date("2026-03-01") });
    const payable = await makeAccount("liability_payable");
    const cash = await makeAccount("asset_cash");
    await postPayment(bill, 10000, new Date("2026-03-05"), payable, cash);
    await postPayment(bill, 10000, new Date("2026-03-06"), payable, cash); // the same bill, paid again
    await policy();

    const envelope = await runWorkflow(ai27DuplicateDetection, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: {} });
    const finding = envelope.findings.find((f) => f.title.includes("Bill paid twice"));
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe("critical");
    expect(finding!.amount).toBe(10000); // the overpaid amount

    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { duplicatePayments: { billId: string; holdPlaced: boolean; totalPaid: number }[]; retrospective: { found: number; recoverable: number } | null };
    expect(proposal.duplicatePayments).toHaveLength(1);
    expect(proposal.duplicatePayments[0].holdPlaced).toBe(true);
    expect(proposal.duplicatePayments[0].totalPaid).toBe(20000);
    expect(proposal.retrospective!.recoverable).toBeGreaterThanOrEqual(10000);

    const hold = await AiHold.findOne({ tenantId: TENANT, "subjectRef.model": "Invoice", "subjectRef.id": String(bill) }).lean();
    expect(hold).toBeDefined();
  });

  it("two legitimate instalments summing exactly to the bill total do NOT flag as a duplicate payment", async () => {
    const vendor = await makeVendor("Instalment Vendor Co");
    const bill = await makeBill(vendor, { sourceDocument: "BILL-INSTALMENT", amount: 10000, date: new Date("2026-03-01") });
    const payable = await makeAccount("liability_payable");
    const cash = await makeAccount("asset_cash");
    await postPayment(bill, 6000, new Date("2026-03-05"), payable, cash);
    await postPayment(bill, 4000, new Date("2026-03-20"), payable, cash); // sums to exactly the bill total
    await policy();

    const envelope = await runWorkflow(ai27DuplicateDetection, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: {} });
    expect(envelope.findings.find((f) => f.title.includes("Bill paid twice"))).toBeUndefined();
  });

  it("the same bill entered under two vendor records is detected via AI-19's duplicate-vendor matching", async () => {
    const vendorA = await makeVendor("Beta Traders Pvt Ltd", "29ABCDE1234F1Z5");
    const vendorB = await makeVendor("Beta Traders Pvt Limited", "29ABCDE1234F1Z5");
    await makeBill(vendorA, { sourceDocument: "BILL-A", amount: 8000, date: new Date("2026-02-01") });
    await makeBill(vendorB, { sourceDocument: "BILL-B", amount: 8000, date: new Date("2026-02-03") });
    await policy();

    const envelope = await runWorkflow(ai27DuplicateDetection, { tenantId: TENANT, eventKey: "bill.created", payload: {} });
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { candidates: { classification: string; matchedOn: string[] }[] };
    const viaVendorDup = proposal.candidates.find((c) => c.matchedOn.includes("duplicate_vendor"));
    expect(viaVendorDup).toBeDefined();
  });

  it("twelve monthly subscription invoices — same vendor, same amount, consecutive months — raise zero flags (false positive, mandatory)", async () => {
    const vendor = await makeVendor("Monthly SaaS Co");
    for (let m = 0; m < 12; m++) {
      await makeBill(vendor, { sourceDocument: `SUB-2026-${String(m + 1).padStart(2, "0")}`, amount: 999, date: new Date(Date.UTC(2026, m, 5)) });
    }
    await policy();

    const envelope = await runWorkflow(ai27DuplicateDetection, { tenantId: TENANT, eventKey: "bill.created", payload: {} });
    const duplicateFindings = envelope.findings.filter((f) => f.title.includes("duplicate bill"));
    expect(duplicateFindings).toEqual([]);
  });

  it("a legitimate second instalment on the same PO (different amount) does not flag", async () => {
    const vendor = await makeVendor("PO Vendor Co");
    await makeBill(vendor, { sourceDocument: "PO-BILL-1", poReference: "PO-100", amount: 3000, date: new Date("2026-03-01") });
    await makeBill(vendor, { sourceDocument: "PO-BILL-2", poReference: "PO-100", amount: 4500, date: new Date("2026-03-15") });
    await policy();

    const envelope = await runWorkflow(ai27DuplicateDetection, { tenantId: TENANT, eventKey: "bill.created", payload: {} });
    const duplicateFindings = envelope.findings.filter((f) => f.title.includes("duplicate bill"));
    expect(duplicateFindings).toEqual([]);
  });

  it("a hold cannot be released by the AI at any autonomy level", () => {
    expect(getTool("release_hold")).toBeUndefined();
  });

  it("lib/docIntel/duplicateCheck.ts's existing findDuplicates() behaves identically (unchanged by this workflow)", () => {
    const matches = findDuplicates(
      { vendorName: "Gamma Co", billNumber: "B-100", totalAmount: 1200 },
      [{ id: "x1", vendorName: "Gamma Co", billNumber: "B-100", totalAmount: 1200 }, { id: "x2", vendorName: "Other Co", billNumber: "B-999", totalAmount: 500 }],
    );
    expect(matches).toEqual([{ id: "x1", reason: 'Same bill number "B-100" from this vendor' }]);
  });

  it("retrospective sweep finds an already-paid duplicate and quantifies the recoverable amount", async () => {
    const vendor = await makeVendor("Retro Vendor");
    await makeBill(vendor, { sourceDocument: "RETRO-1", amount: 15000, date: new Date("2026-04-01"), paymentState: "paid" });
    await makeBill(vendor, { sourceDocument: "retro-1", amount: 15000, date: new Date("2026-04-02"), paymentState: "paid" });
    await policy();

    const envelope = await runWorkflow(ai27DuplicateDetection, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: {} });
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { retrospective: { scanned: number; found: number; recoverable: number; byClassification: Record<string, number> } };
    expect(proposal.retrospective).toBeDefined();
    expect(proposal.retrospective.found).toBeGreaterThan(0);
    expect(proposal.retrospective.recoverable).toBeGreaterThan(0);

    const stored = await AiDuplicateFinding.findOne({ tenantId: TENANT }).lean();
    expect(stored).toBeDefined();
    expect((stored!.retrospective as { found: number }).found).toBeGreaterThan(0);
  });

  it("no path in AI-27's own code ever writes to Invoice/Expense/BankStatement/Customer (source-grep)", () => {
    const output = execSync(
      String.raw`grep -rnE '\.(save|create|updateOne|updateMany|deleteOne|deleteMany|findOneAndUpdate|findByIdAndUpdate|findOneAndDelete|insertMany)\(' lib/aiRuntime/workflows/ai-27-duplicate-detection lib/aiRuntime/duplicates lib/aiRuntime/tools/duplicateTools.ts || true`,
      { encoding: "utf-8", cwd: process.cwd() },
    );
    const forbiddenWrites = output
      .split("\n")
      .filter((line) => line.trim())
      .filter((line) => !/AiDuplicateFinding/.test(line));
    expect(forbiddenWrites).toEqual([]);
  });
});
