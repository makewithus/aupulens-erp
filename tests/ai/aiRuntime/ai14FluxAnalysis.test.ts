import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import { execSync } from "node:child_process";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai14";

import Account from "@/models/finance/Account";
import JournalEntry from "@/models/finance/JournalEntry";
import Invoice from "@/models/finance/Invoice";
import PurchaseOrder from "@/models/finance/PurchaseOrder";
import StockMove from "@/models/inventory/StockMove";
import Customer from "@/models/sales/Customer";
import User from "@/models/auth/User";
import AiMaterialityPolicy from "@/models/ai/AiMaterialityPolicy";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai14FluxAnalysis: typeof import("@/lib/aiRuntime/workflows/ai-14-flux-analysis").ai14FluxAnalysis;

const TENANT = "ai14-tenant";
const PERIOD = "2026-02";
const PRIOR_PERIOD = "2026-01";

async function makeUser() {
  const u = await User.create({ tenantId: TENANT, name: "Finance User", email: `f-${Date.now()}-${Math.random()}@example.com`, phone: "9999999999", password: "hashed", role: "finance", status: "active" });
  return String(u._id);
}

async function makeAccount(internal_group: string) {
  return Account.create({ tenantId: TENANT, name: `Account ${internal_group}`, code: `ACC-${Math.random().toString(36).slice(2, 8)}`, account_type: internal_group === "expense" ? "expense" : "income", internal_group, isActive: true, isLocked: false, status: "active" });
}

async function makeCustomer(userId: string, name: string) {
  return Customer.create({ tenantId: TENANT, header: { name }, contact_details: {}, createdBy: userId });
}

async function postEntry(accountId: string, offsetAccountId: string, amount: number, date: Date, partnerId?: string, label?: string) {
  return JournalEntry.create({
    tenantId: TENANT,
    header: { name: `JE-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, date, journalType: "general" },
    status: "posted",
    voucherStatus: "posted",
    lineIds: [
      { accountId, label: label ?? "line", debit: amount, credit: 0, partnerId }, // expense/asset — increase is a debit
      { accountId: offsetAccountId, label: label ?? "line", debit: 0, credit: amount }, // cash — decrease is a credit
    ],
    totals: { amountUntaxed: amount, amountTax: 0, amountTotal: amount },
  });
}

async function runAi14(actingUserId?: string, period: string = PERIOD) {
  return runWorkflow(ai14FluxAnalysis, {
    tenantId: TENANT,
    eventKey: "period.horizon.reached",
    payload: { period, periodEnd: new Date(`${period}-28T23:59:59Z`).toISOString(), actingUserId },
  });
}

describe("AI-14 — Flux analysis", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Account.init(),
      JournalEntry.init(),
      Invoice.init(),
      PurchaseOrder.init(),
      StockMove.init(),
      Customer.init(),
      User.init(),
      AiMaterialityPolicy.init(),
      AiWorkflowRun.init(),
      AiDecisionTrace.init(),
      AiEvent.init(),
      AiToolCall.init(),
      AiWorkflowPolicy.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai14FluxAnalysis } = await import("@/lib/aiRuntime/workflows/ai-14-flux-analysis"));
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
      PurchaseOrder.deleteMany({}),
      StockMove.deleteMany({}),
      Customer.deleteMany({}),
      User.deleteMany({}),
      AiMaterialityPolicy.deleteMany({}),
      AiWorkflowRun.deleteMany({}),
      AiDecisionTrace.deleteMany({}),
      AiEvent.deleteMany({}),
      AiToolCall.deleteMany({}),
      AiWorkflowPolicy.deleteMany({}),
    ]);
  });

  it("read-only by construction: no write path exists in this workflow (source-grep)", () => {
    const output = execSync(
      String.raw`grep -rnE '\.(save|create|updateOne|updateMany|deleteOne|deleteMany|findOneAndUpdate|findByIdAndUpdate|findOneAndDelete|insertMany)\(' lib/aiRuntime/workflows/ai-14-flux-analysis || true`,
      { cwd: process.cwd(), encoding: "utf-8" },
    );
    expect(output.trim()).toBe("");
  });

  it("a single vendor-bill transaction whose posted date and receipt evidence disagree is labelled 'timing' via AI-28's evaluateCutoff() (docs/ai/BRIEF-06-BATCH-E.md Part 0.4)", async () => {
    const userId = await makeUser();
    const expenseAcc = await makeAccount("expense");
    const cash = await makeAccount("asset");
    const vendor = await makeCustomer(userId, "Late-Receipt Vendor");

    // Goods actually received in January (StockMove evidence), but the bill is dated/posted in
    // February — a genuine timing difference, not a real change in spend.
    const move = await StockMove.create({
      tenantId: TENANT,
      reference: `SM-${Date.now()}`,
      moveType: "incoming",
      sourceLocation: {},
      destinationLocation: {},
      effectiveDate: new Date("2026-01-28"),
      lines: [],
      moveStatus: "move_executed",
    });
    const po = await PurchaseOrder.create({
      tenantId: TENANT,
      name: `PO-${Date.now()}`,
      partnerId: vendor._id,
      orderLines: [{ productId: new mongoose.Types.ObjectId(), name: "Goods", productQty: 1, receivedQty: 1, billedQty: 0, priceUnit: 9000, priceSubtotal: 9000 }],
      stockMoveIds: [move._id],
      createdBy: userId,
    });
    const bill = await Invoice.create({
      tenantId: TENANT,
      name: `BILL-${Date.now()}`,
      partnerId: vendor._id,
      moveType: "in_invoice",
      state: "posted",
      invoiceDate: new Date("2026-02-05"),
      dueDate: new Date("2026-02-05"),
      invoiceLines: [],
      amountTotal: 9000,
    });
    await PurchaseOrder.updateOne({ _id: po._id }, { $set: { invoiceIds: [bill._id] } });

    // A small January baseline for the same vendor/account — without any prior-period activity
    // for this vendor, the group would classify as "new" before decomposeVariance() ever gets to
    // its "one_off" -> "timing" reclassification check, which only applies to a group that is
    // otherwise a one-off spike against existing history, not a brand-new counterparty.
    await JournalEntry.create({
      tenantId: TENANT,
      header: { name: `JE-baseline-${Date.now()}`, date: new Date("2026-01-08"), journalType: "purchase" },
      status: "posted",
      voucherStatus: "posted",
      lineIds: [
        { accountId: expenseAcc._id, label: "line", debit: 500, credit: 0, partnerId: vendor._id },
        { accountId: cash._id, label: "line", debit: 0, credit: 500 },
      ],
      totals: { amountUntaxed: 500, amountTax: 0, amountTotal: 500 },
    });

    // The GL entry itself, dated in February (matches the bill), with sourceId set the same way
    // the real posting route sets it (app/api/accounting/invoices/[id]/route.ts).
    await JournalEntry.create({
      tenantId: TENANT,
      header: { name: `JE-${Date.now()}`, date: new Date("2026-02-05"), journalType: "purchase" },
      status: "posted",
      voucherStatus: "posted",
      lineIds: [
        { accountId: expenseAcc._id, label: "line", debit: 9000, credit: 0, partnerId: vendor._id, sourceId: bill._id },
        { accountId: cash._id, label: "line", debit: 0, credit: 9000 },
      ],
      totals: { amountUntaxed: 9000, amountTax: 0, amountTotal: 9000 },
    });

    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-14", killSwitchEnabled: true, maxAutonomyLevel: "observe" });
    const envelope = await runAi14(userId);
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { comparisons: { accountId: string; drivers: { type: string }[] }[] };
    const row = proposal.comparisons.find((c) => c.accountId === String(expenseAcc._id));

    expect(row).toBeDefined();
    expect(row!.drivers.some((d) => d.type === "timing")).toBe(true);
  });

  it("drivers + unexplained = total variance, to the cent, on a material movement with mixed drivers", async () => {
    const userId = await makeUser();
    const expenseAcc = await makeAccount("expense");
    const cash = await makeAccount("asset");
    const vendorA = await makeCustomer(userId, "Vendor A");
    const vendorB = await makeCustomer(userId, "Vendor B");

    // Prior period: only Vendor A, 1000.
    await postEntry(String(expenseAcc._id), String(cash._id), 1000, new Date("2026-01-10"), String(vendorA._id));
    // Current period: Vendor A steady at 1000 (recurring, no delta), Vendor B brand-new at 5000 (material "new" driver),
    // plus a scatter of tiny one-off amounts across several other counterparties (folds into unexplained).
    await postEntry(String(expenseAcc._id), String(cash._id), 1000, new Date("2026-02-10"), String(vendorA._id));
    await postEntry(String(expenseAcc._id), String(cash._id), 5000, new Date("2026-02-11"), String(vendorB._id));
    for (let i = 0; i < 3; i++) {
      const smallVendor = await makeCustomer(userId, `Small Vendor ${i}`);
      await postEntry(String(expenseAcc._id), String(cash._id), 10, new Date("2026-02-12"), String(smallVendor._id));
    }

    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-14", killSwitchEnabled: true, maxAutonomyLevel: "observe" });
    const envelope = await runAi14(userId);
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { comparisons: { accountId: string; variance: number; drivers: { amount: number; type: string; description: string }[]; unexplainedAmount: number }[] };

    const row = proposal.comparisons.find((c) => c.accountId === String(expenseAcc._id));
    expect(row).toBeDefined();

    const driverSum = row!.drivers.reduce((s, d) => s + d.amount, 0);
    expect(Math.round((driverSum + row!.unexplainedAmount) * 100) / 100).toBeCloseTo(row!.variance, 2);

    // Vendor B's brand-new 5000 is identified as a distinct "new" driver, not folded into the whole account.
    const newDriver = row!.drivers.find((d) => d.type === "new");
    expect(newDriver).toBeDefined();
    expect(newDriver!.amount).toBeCloseTo(5000, 2);
    // The tiny scattered amounts (30 total) are small enough to stay out of the named drivers list.
    expect(row!.drivers.every((d) => d.type !== "new" || d.amount !== 10)).toBe(true);
  });

  it("a one-off large invoice is identified as its own driver, not attributed to the whole account", async () => {
    const userId = await makeUser();
    const expenseAcc = await makeAccount("expense");
    const cash = await makeAccount("asset");
    const vendor = await makeCustomer(userId, "One-off Vendor");

    await postEntry(String(expenseAcc._id), String(cash._id), 100, new Date("2026-01-10"), String(vendor._id));
    await postEntry(String(expenseAcc._id), String(cash._id), 100, new Date("2026-02-05"), String(vendor._id)); // recurring, no delta
    await postEntry(String(expenseAcc._id), String(cash._id), 8000, new Date("2026-02-15"), String(vendor._id), "one-time large purchase"); // one-off spike

    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-14", killSwitchEnabled: true, maxAutonomyLevel: "observe" });
    const envelope = await runAi14(userId);
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { comparisons: { accountId: string; variance: number; drivers: { amount: number; type: string }[] }[] };
    const row = proposal.comparisons.find((c) => c.accountId === String(expenseAcc._id));

    expect(row!.drivers.length).toBeGreaterThan(0);
    expect(row!.drivers[0].amount).toBeCloseTo(8000, 2);
    // Not simply "the whole account moved by 8000" — variance genuinely reflects total activity.
    expect(row!.variance).toBeCloseTo(8000, 2);
  });

  it("an immaterial movement is reported but not decomposed or escalated as a finding", async () => {
    const userId = await makeUser();
    const expenseAcc = await makeAccount("expense");
    const cash = await makeAccount("asset");
    const vendor = await makeCustomer(userId, "Tiny Vendor");

    await postEntry(String(expenseAcc._id), String(cash._id), 100, new Date("2026-01-10"), String(vendor._id));
    await postEntry(String(expenseAcc._id), String(cash._id), 105, new Date("2026-02-10"), String(vendor._id)); // 5 unit / 5% move

    await AiMaterialityPolicy.create({ tenantId: TENANT, thresholds: [{ appliesTo: "flux_analysis", absoluteAmount: 100000, percentOfBalance: 50 }] });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-14", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    const envelope = await runAi14(userId);
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { comparisons: { accountId: string; materialityVerdict: string; drivers: unknown[] }[] };
    const row = proposal.comparisons.find((c) => c.accountId === String(expenseAcc._id));

    expect(row).toBeDefined();
    expect(row!.materialityVerdict).toBe("immaterial");
    expect(row!.drivers.length).toBe(0);
    expect(envelope.findings.some((f) => f.title.includes(String(expenseAcc.name)))).toBe(false);
  });

  it("no materiality policy configured -> movement reported unclassified, not filtered out", async () => {
    const userId = await makeUser();
    const expenseAcc = await makeAccount("expense");
    const cash = await makeAccount("asset");
    const vendor = await makeCustomer(userId, "Vendor");
    await postEntry(String(expenseAcc._id), String(cash._id), 100, new Date("2026-01-10"), String(vendor._id));
    await postEntry(String(expenseAcc._id), String(cash._id), 200, new Date("2026-02-10"), String(vendor._id));
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-14", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    const envelope = await runAi14(userId);
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { comparisons: { accountId: string; materialityVerdict: string }[] };
    const row = proposal.comparisons.find((c) => c.accountId === String(expenseAcc._id));
    expect(row!.materialityVerdict).toBe("unclassified");
  });
});
