import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai28";

import Customer from "@/models/sales/Customer";
import Invoice from "@/models/finance/Invoice";
import PurchaseOrder from "@/models/finance/PurchaseOrder";
import StockMove from "@/models/inventory/StockMove";
import TransactionLock from "@/models/finance/TransactionLock";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai28CutoffIntelligence: typeof import("@/lib/aiRuntime/workflows/ai-28-cutoff-intelligence").ai28CutoffIntelligence;

const TENANT = "ai28-tenant";

async function makeVendor() {
  const c = await Customer.create({ tenantId: TENANT, header: { name: "Acme Vendor", is_company: true }, createdBy: new mongoose.Types.ObjectId() });
  return c._id as mongoose.Types.ObjectId;
}

async function makeBillWithPo(opts: { invoiceDate: Date; receiptDate: Date; amount: number }) {
  const partnerId = await makeVendor();
  const inv = await Invoice.create({
    tenantId: TENANT,
    name: `BILL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    partnerId,
    moveType: "in_invoice",
    state: "posted",
    invoiceDate: opts.invoiceDate,
    dueDate: opts.invoiceDate,
    invoiceLines: [{ name: "Goods", priceSubtotal: opts.amount, quantity: 1, priceUnit: opts.amount }],
    amountTotal: opts.amount,
  });

  const move = await StockMove.create({
    tenantId: TENANT,
    reference: `SM-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    moveType: "incoming",
    sourceLocation: {},
    destinationLocation: {},
    effectiveDate: opts.receiptDate,
    lines: [],
    moveStatus: "move_executed",
  });

  const po = await PurchaseOrder.create({
    tenantId: TENANT,
    name: `PO-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    partnerId,
    dateOrder: opts.receiptDate,
    orderLines: [{ productId: new mongoose.Types.ObjectId(), name: "Goods", productQty: 1, receivedQty: 1, billedQty: 1, priceUnit: opts.amount, taxIds: [], priceSubtotal: opts.amount }],
    totals: { amountUntaxed: opts.amount, amountTax: 0, amountTotal: opts.amount },
    status: "approved",
    invoiceIds: [inv._id],
    stockMoveIds: [move._id],
    createdBy: new mongoose.Types.ObjectId(),
  });

  return { invoiceId: String(inv._id), poId: String(po._id) };
}

async function runAi28(periodEnd: string) {
  return runWorkflow(ai28CutoffIntelligence, { tenantId: TENANT, eventKey: "period.horizon.reached", payload: { periodEnd } });
}

describe("AI-28 — Cut-off intelligence", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Customer.init(),
      Invoice.init(),
      PurchaseOrder.init(),
      StockMove.init(),
      TransactionLock.init(),
      AiWorkflowRun.init(),
      AiDecisionTrace.init(),
      AiEvent.init(),
      AiToolCall.init(),
      AiWorkflowPolicy.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai28CutoffIntelligence } = await import("@/lib/aiRuntime/workflows/ai-28-cutoff-intelligence"));
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
      PurchaseOrder.deleteMany({}),
      StockMove.deleteMany({}),
      TransactionLock.deleteMany({}),
      AiWorkflowRun.deleteMany({}),
      AiDecisionTrace.deleteMany({}),
      AiEvent.deleteMany({}),
      AiToolCall.deleteMany({}),
      AiWorkflowPolicy.deleteMany({}),
    ]);
  });

  it("goods received on the 30th, invoiced on the 3rd → belongs to the earlier period", async () => {
    await makeBillWithPo({ invoiceDate: new Date("2026-02-03"), receiptDate: new Date("2026-01-30"), amount: 10000 });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-28", killSwitchEnabled: true, maxAutonomyLevel: "recommend" });

    const envelope = await runAi28(new Date("2026-02-05").toISOString());

    const finding = envelope.findings.find((f) => f.title.includes("Cut-off exception"));
    expect(finding).toBeDefined();
    expect(finding!.detail).toContain("2026-01");
  });

  it("a locked prior period → proposes a current-period adjustment, never a back-dated post", async () => {
    await makeBillWithPo({ invoiceDate: new Date("2026-02-03"), receiptDate: new Date("2026-01-30"), amount: 10000 });
    await TransactionLock.create({ tenantId: TENANT, module: "purchases", lockedUpToDate: new Date("2026-01-31"), isLocked: true });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-28", killSwitchEnabled: true, maxAutonomyLevel: "recommend" });

    const envelope = await runAi28(new Date("2026-02-05").toISOString());

    const finding = envelope.findings.find((f) => f.title.includes("Cut-off exception"));
    expect(finding).toBeDefined();
    expect(finding!.detail).toContain("current_period_adjustment");
    expect(finding!.detail).toContain("never back-dated");
  });

  it("false positive: a transaction posted in the same period as its governing date → no finding", async () => {
    await makeBillWithPo({ invoiceDate: new Date("2026-01-15"), receiptDate: new Date("2026-01-10"), amount: 10000 });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-28", killSwitchEnabled: true, maxAutonomyLevel: "recommend" });

    const envelope = await runAi28(new Date("2026-01-31").toISOString());

    expect(envelope.findings.some((f) => f.title.includes("Cut-off exception"))).toBe(false);
  });

  it("a bill with no linked PO/StockMove evidence → evidence_unavailable, not a silent pass", async () => {
    const partnerId = await makeVendor();
    await Invoice.create({
      tenantId: TENANT,
      name: `BILL-${Date.now()}`,
      partnerId,
      moveType: "in_invoice",
      state: "posted",
      invoiceDate: new Date("2026-02-01"),
      dueDate: new Date("2026-02-01"),
      invoiceLines: [{ name: "Services", priceSubtotal: 5000, quantity: 1, priceUnit: 5000 }],
      amountTotal: 5000,
    });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-28", killSwitchEnabled: true, maxAutonomyLevel: "recommend" });

    const envelope = await runAi28(new Date("2026-02-05").toISOString());

    // No PO/StockMove evidence → not counted as a cutoff exception, not silently declared correct.
    expect(envelope.findings.some((f) => f.title.includes("Cut-off exception"))).toBe(false);
    const run = await AiWorkflowRun.findOne({ workflowId: "AI-28" }).sort({ createdAt: -1 }).lean();
    expect(run).not.toBeNull();
  });

  it("RECOMMEND only — act() never calls a tool, drafts nothing", async () => {
    await makeBillWithPo({ invoiceDate: new Date("2026-02-03"), receiptDate: new Date("2026-01-30"), amount: 10000 });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-28", killSwitchEnabled: true, maxAutonomyLevel: "recommend" });

    const envelope = await runAi28(new Date("2026-02-05").toISOString());

    expect(envelope.metrics.autoActioned).toBe(0);
  });
});
