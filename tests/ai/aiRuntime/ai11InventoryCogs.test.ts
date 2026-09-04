import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai11";

import Account from "@/models/finance/Account";
import JournalEntry from "@/models/finance/JournalEntry";
import Product from "@/models/inventory/Product";
import Stock from "@/models/inventory/Stock";
import StockMove from "@/models/inventory/StockMove";
import Batch from "@/models/inventory/Batch";
import Invoice from "@/models/finance/Invoice";
import AiInventoryCount from "@/models/ai/AiInventoryCount";
import AiInventoryFinding from "@/models/ai/AiInventoryFinding";
import AiMaterialityPolicy from "@/models/ai/AiMaterialityPolicy";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";
import Customer from "@/models/sales/Customer";

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai11InventoryCogs: typeof import("@/lib/aiRuntime/workflows/ai-11-inventory-cogs").ai11InventoryCogs;
let detectNegativeStock: typeof import("@/lib/aiRuntime/inventory/detect").detectNegativeStock;
let detectCountVariances: typeof import("@/lib/aiRuntime/inventory/detect").detectCountVariances;
let computeWeightedAverageCost: typeof import("@/lib/aiRuntime/inventory/detect").computeWeightedAverageCost;
let resolveInventoryAccountMapping: typeof import("@/lib/aiRuntime/inventory/accountMapping").resolveInventoryAccountMapping;

const TENANT = "ai11-tenant";
const CREATOR = new mongoose.Types.ObjectId();

async function makeAccount(account_type: string, code: string, name = `Account ${code}`) {
  const acc = await Account.create({ tenantId: TENANT, name, code, account_type, isActive: true, isLocked: false, status: "active" });
  return acc;
}

async function makeProduct(name: string, standardPrice: number) {
  const p = await Product.create({
    tenantId: TENANT,
    header: { name, sale_ok: true, purchase_ok: true, can_be_expensed: false },
    tab_general_information: { type: "consu", invoice_policy: "order", service_upsell: false, list_price: standardPrice, taxes_id: [], standard_price: standardPrice },
    createdBy: CREATOR,
  });
  return p;
}

async function makeIncomingMove(productId: mongoose.Types.ObjectId, productName: string, qty: number, unitCost: number, effectiveDate: Date, reference: string) {
  return StockMove.create({
    tenantId: TENANT,
    reference,
    moveType: "incoming",
    scheduledDate: effectiveDate,
    effectiveDate,
    lines: [{ productId, productName, demand: qty, done: qty, uom: "Units", unitCost, totalValue: qty * unitCost }],
    moveStatus: "move_executed",
    valuation: { method: "standard", totalValue: qty * unitCost },
  });
}

function monthRange(now: Date, monthOffset: number): { start: Date; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + monthOffset, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + monthOffset + 1, 0, 23, 59, 59, 999));
  return { start, end };
}

let saleCustomerId: mongoose.Types.ObjectId | undefined;
async function makeSaleInvoice(productId: mongoose.Types.ObjectId, quantity: number, priceUnit: number, invoiceDate: Date) {
  if (!saleCustomerId) {
    const customer = await Customer.create({ tenantId: TENANT, header: { name: "Healthy Customer", is_company: true }, createdBy: CREATOR });
    saleCustomerId = customer._id as mongoose.Types.ObjectId;
  }
  await Invoice.create({
    tenantId: TENANT,
    name: `SALE-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    partnerId: saleCustomerId,
    moveType: "out_invoice",
    state: "posted",
    invoiceDate,
    dueDate: invoiceDate,
    invoiceLines: [{ productId, name: "line", priceSubtotal: quantity * priceUnit, quantity, priceUnit }],
    amountUntaxed: quantity * priceUnit,
    amountTax: 0,
    amountTotal: quantity * priceUnit,
    amountResidual: 0,
    paymentState: "paid",
  });
}

describe("AI-11 — Inventory / COGS intelligence", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Account.init(), JournalEntry.init(), Product.init(), Stock.init(), StockMove.init(), Batch.init(), Invoice.init(), Customer.init(),
      AiInventoryCount.init(), AiInventoryFinding.init(), AiMaterialityPolicy.init(),
      AiWorkflowRun.init(), AiDecisionTrace.init(), AiEvent.init(), AiToolCall.init(), AiWorkflowPolicy.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai11InventoryCogs } = await import("@/lib/aiRuntime/workflows/ai-11-inventory-cogs"));
    ({ detectNegativeStock, detectCountVariances, computeWeightedAverageCost } = await import("@/lib/aiRuntime/inventory/detect"));
    ({ resolveInventoryAccountMapping } = await import("@/lib/aiRuntime/inventory/accountMapping"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    saleCustomerId = undefined;
    await Promise.all([
      Account.deleteMany({}), JournalEntry.deleteMany({}), Product.deleteMany({}), Stock.deleteMany({}), StockMove.deleteMany({}), Batch.deleteMany({}), Invoice.deleteMany({}), Customer.deleteMany({}),
      AiInventoryCount.deleteMany({}), AiInventoryFinding.deleteMany({}), AiMaterialityPolicy.deleteMany({}),
      AiWorkflowRun.deleteMany({}), AiDecisionTrace.deleteMany({}), AiEvent.deleteMany({}), AiToolCall.deleteMany({}), AiWorkflowPolicy.deleteMany({}),
    ]);
  });

  it("a sale posted before its receipt → negative stock detected with the causing sequence", async () => {
    const product = await makeProduct("Widget", 100);
    await Stock.create({ tenantId: TENANT, product: product._id, quantity: -10, type: "out", reference: "SALE-1", createdAt: new Date("2026-01-01T00:00:00Z") });
    await Stock.create({ tenantId: TENANT, product: product._id, quantity: 6, type: "in", reference: "RECEIPT-1", createdAt: new Date("2026-01-02T00:00:00Z") });

    const findings = await detectNegativeStock(TENANT);
    expect(findings.length).toBe(1);
    expect(findings[0].productId).toBe(String(product._id));
    expect(findings[0].qty).toBe(-4);
    expect(findings[0].causingSequence.length).toBe(1);
    expect(findings[0].causingSequence[0].reference).toBe("SALE-1");
  });

  it("count variance is valued correctly at the weighted-average cost in use", async () => {
    const product = await makeProduct("Gadget", 999); // standard_price deliberately far off — WAC must win
    await makeIncomingMove(product._id as mongoose.Types.ObjectId, "Gadget", 10, 40, new Date("2026-01-01"), "MOVE-A");
    await makeIncomingMove(product._id as mongoose.Types.ObjectId, "Gadget", 10, 60, new Date("2026-01-02"), "MOVE-B");
    await Stock.create({ tenantId: TENANT, product: product._id, quantity: 20, type: "in", reference: "RECEIPT-A" });
    await AiInventoryCount.create({ tenantId: TENANT, productId: product._id, countedQty: 15, countedAt: new Date("2026-01-10") });

    const wac = await computeWeightedAverageCost(TENANT, String(product._id));
    expect(wac.weightedAverageCost).toBe(50); // (10*40 + 10*60) / 20

    const variances = await detectCountVariances(TENANT);
    expect(variances.length).toBe(1);
    expect(variances[0].systemQty).toBe(20);
    expect(variances[0].variance).toBe(-5);
    expect(variances[0].valuedAt).toBe(-250); // -5 * 50
  });

  it("weighted-average cost recomputes correctly after a receipt", async () => {
    const product = await makeProduct("Component", 0);
    await makeIncomingMove(product._id as mongoose.Types.ObjectId, "Component", 10, 100, new Date("2026-02-01"), "MOVE-1");
    let wac = await computeWeightedAverageCost(TENANT, String(product._id));
    expect(wac).toEqual({ productId: String(product._id), weightedAverageCost: 100, onHandQty: 10 });

    await makeIncomingMove(product._id as mongoose.Types.ObjectId, "Component", 5, 130, new Date("2026-02-02"), "MOVE-2");
    wac = await computeWeightedAverageCost(TENANT, String(product._id));
    expect(wac.weightedAverageCost).toBe(110); // (10*100 + 5*130) / 15
    expect(wac.onHandQty).toBe(15);

    // An outgoing move only reduces quantity — average cost is unchanged.
    await StockMove.create({
      tenantId: TENANT,
      reference: "MOVE-3",
      moveType: "outgoing",
      effectiveDate: new Date("2026-02-03"),
      lines: [{ productId: product._id, productName: "Component", demand: 5, done: 5, uom: "Units", unitCost: 110, totalValue: 550 }],
      moveStatus: "move_executed",
      valuation: { method: "standard", totalValue: 550 },
    });
    wac = await computeWeightedAverageCost(TENANT, String(product._id));
    expect(wac.weightedAverageCost).toBe(110);
    expect(wac.onHandQty).toBe(10);
  });

  it("a seeded inventory subledger-to-GL difference is detected to the smallest unit", async () => {
    const inventoryAccount = await makeAccount("asset_current", "1300", "Inventory");
    const product = await makeProduct("Tracked Item", 100);
    await StockMove.create({
      tenantId: TENANT,
      reference: "MOVE-GL",
      moveType: "incoming",
      effectiveDate: new Date("2026-03-01"),
      lines: [{ productId: product._id, productName: "Tracked Item", demand: 10, done: 10, uom: "Units", unitCost: 100, totalValue: 1000.01 }],
      moveStatus: "move_executed",
      valuation: { method: "standard", totalValue: 1000.01 },
    });
    // GL only records 1000.00 — a real 0.01 gap (smallest currency unit) against the subledger valuation.
    await JournalEntry.create({
      tenantId: TENANT,
      header: { name: "JE-inv", date: new Date("2026-03-01"), journalType: "purchase" },
      status: "posted",
      voucherStatus: "posted",
      lineIds: [
        { accountId: inventoryAccount._id, label: "inventory receipt", debit: 1000.0, credit: 0 },
        { accountId: (await makeAccount("liability_current", "2200", "GRNI"))._id, label: "grni", debit: 0, credit: 1000.0 },
      ],
      totals: { amountUntaxed: 1000, amountTax: 0, amountTotal: 1000 },
    });

    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-11", killSwitchEnabled: true, maxAutonomyLevel: "recommend" });
    const envelope = await runWorkflow(ai11InventoryCogs, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: {} });

    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { subledgerToGl: { qtyValue: number; glValue: number; difference: number; status: string } };
    expect(proposal.subledgerToGl.qtyValue).toBe(1000.01);
    expect(proposal.subledgerToGl.glValue).toBe(1000.0);
    expect(proposal.subledgerToGl.difference).toBe(0.01);
    expect(proposal.subledgerToGl.status).toBe("unreconciled");

    const finding = envelope.findings.find((f) => f.title.includes("does not tie to the GL"));
    expect(finding).toBeDefined();

    const stored = await AiInventoryFinding.findOne({ tenantId: TENANT }).lean();
    expect(stored).toBeDefined();
    expect((stored!.subledgerToGl as { difference: number }).difference).toBe(0.01);
  });

  it("answers which accounts constitute inventory, reusing lib/accounting/inventory.ts's own resolution", async () => {
    await makeAccount("asset_current", "1300", "Inventory");
    const mapping = await resolveInventoryAccountMapping(TENANT);
    expect(mapping.resolved).toBe(true);
    expect(mapping.accounts[0].code).toBe("1300");
  });

  it("an explicitly configured AiAccountMapping overrides the code heuristic (Chunk 8b 0.2)", async () => {
    await makeAccount("asset_current", "1300", "Default Inventory"); // the heuristic's own answer
    const override = await makeAccount("asset_current", "9999", "Regional Inventory Override");
    const { default: AiAccountMapping } = await import("@/models/ai/AiAccountMapping");
    await AiAccountMapping.create({ tenantId: TENANT, role: "inventory", accountIds: [override._id], source: "configured", basis: "human override for test" });

    const mapping = await resolveInventoryAccountMapping(TENANT);
    expect(mapping.resolved).toBe(true);
    expect(mapping.accounts[0].code).toBe("9999");
    expect(mapping.basis).toContain("explicitly configured");
    await AiAccountMapping.deleteMany({ tenantId: TENANT });
  });

  it("a well-managed inventory — positive stock, valuation matching GL and standard cost, stable margins — produces zero findings (false positive check)", async () => {
    const inventoryAccount = await makeAccount("asset_current", "1300", "Inventory");
    const product = await makeProduct("Healthy Product", 100);
    const now = new Date();

    await makeIncomingMove(product._id as mongoose.Types.ObjectId, "Healthy Product", 10, 100, now, "MOVE-HEALTHY");
    await Stock.create({ tenantId: TENANT, product: product._id, quantity: 10, type: "in", reference: "MOVE-HEALTHY" });
    await JournalEntry.create({
      tenantId: TENANT,
      header: { name: "JE-healthy", date: now, journalType: "purchase" },
      status: "posted",
      voucherStatus: "posted",
      lineIds: [
        { accountId: inventoryAccount._id, label: "inventory receipt", debit: 1000, credit: 0 },
        { accountId: (await makeAccount("liability_current", "2200b", "GRNI2"))._id, label: "grni", debit: 0, credit: 1000 },
      ],
      totals: { amountUntaxed: 1000, amountTax: 0, amountTotal: 1000 },
    });

    // Stable margin: same price/qty/cost ratio this month and last month.
    const cur = monthRange(now, 0);
    const prior = monthRange(now, -1);
    await makeSaleInvoice(product._id as mongoose.Types.ObjectId, 2, 200, new Date(cur.start.getTime() + 24 * 60 * 60 * 1000));
    await makeSaleInvoice(product._id as mongoose.Types.ObjectId, 2, 200, new Date(prior.start.getTime() + 24 * 60 * 60 * 1000));

    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-11", killSwitchEnabled: true, maxAutonomyLevel: "recommend" });
    const envelope = await runWorkflow(ai11InventoryCogs, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: {} });

    expect(envelope.findings).toEqual([]);
  });

  it("no path in AI-11's own code ever writes to Product/InventoryItem/Stock/StockMove/Batch (source-grep)", async () => {
    const { execSync } = await import("node:child_process");
    const output = execSync(
      String.raw`grep -rnE '\.(save|create|updateOne|updateMany|deleteOne|deleteMany|findOneAndUpdate|findByIdAndUpdate|findOneAndDelete|insertMany)\(' lib/aiRuntime/workflows/ai-11-inventory-cogs lib/aiRuntime/inventory lib/aiRuntime/tools/inventoryTools.ts || true`,
      { encoding: "utf-8", cwd: process.cwd() },
    );
    const forbiddenWrites = output
      .split("\n")
      .filter((line) => line.trim())
      .filter((line) => !/AiInventoryFinding/.test(line));
    expect(forbiddenWrites).toEqual([]);
  });
});
