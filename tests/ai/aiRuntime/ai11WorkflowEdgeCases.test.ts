import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai11edge";
process.env.CRON_SECRET = "ai11-edge-test-secret";

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
import Organization from "@/models/admin/Organization";

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai11InventoryCogs: typeof import("@/lib/aiRuntime/workflows/ai-11-inventory-cogs").ai11InventoryCogs;
let detectNegativeStock: typeof import("@/lib/aiRuntime/inventory/detect").detectNegativeStock;

const TENANT = "ai11-edge-tenant";
const OTHER_TENANT = "ai11-edge-other-tenant";
const CREATOR = new mongoose.Types.ObjectId();

async function makeAccount(account_type: string, code: string, tenantId = TENANT) {
  const acc = await Account.create({ tenantId, name: `Account ${code}`, code, account_type, isActive: true, isLocked: false, status: "active" });
  return acc;
}

async function makeProduct(name: string, standardPrice: number, tenantId = TENANT) {
  const p = await Product.create({
    tenantId,
    header: { name, sale_ok: true, purchase_ok: true, can_be_expensed: false },
    tab_general_information: { type: "consu", invoice_policy: "order", service_upsell: false, list_price: standardPrice, taxes_id: [], standard_price: standardPrice },
    createdBy: CREATOR,
  });
  return p;
}

describe("AI-11 — edge-case hardening (docs/ai/BRIEF-09-VERIFICATION.md Part C)", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Account.init(), JournalEntry.init(), Product.init(), Stock.init(), StockMove.init(), Batch.init(), Invoice.init(), Customer.init(),
      AiInventoryCount.init(), AiInventoryFinding.init(), AiMaterialityPolicy.init(),
      AiWorkflowRun.init(), AiDecisionTrace.init(), AiEvent.init(), AiToolCall.init(), AiWorkflowPolicy.init(), Organization.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai11InventoryCogs } = await import("@/lib/aiRuntime/workflows/ai-11-inventory-cogs"));
    ({ detectNegativeStock } = await import("@/lib/aiRuntime/inventory/detect"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Promise.all([
      Account.deleteMany({}), JournalEntry.deleteMany({}), Product.deleteMany({}), Stock.deleteMany({}), StockMove.deleteMany({}), Batch.deleteMany({}), Invoice.deleteMany({}), Customer.deleteMany({}),
      AiInventoryCount.deleteMany({}), AiInventoryFinding.deleteMany({}), AiMaterialityPolicy.deleteMany({}),
      AiWorkflowRun.deleteMany({}), AiDecisionTrace.deleteMany({}), AiEvent.deleteMany({}), AiToolCall.deleteMany({}), AiWorkflowPolicy.deleteMany({}), Organization.deleteMany({}),
    ]);
  });

  // ── Section 1: trigger proof through the REAL call site ─────────────────────────────────
  // AI-11 has no dedicated per-record business action (it is a continuous inventory scan) —
  // its real trigger is the cron sweep route Vercel Cron calls hourly in production. Proving
  // via that route (not runWorkflow()) is the honest equivalent of "the ordinary business
  // action" for a sweep-shaped workflow.
  it("trigger proof: the real cron sweep route (not runWorkflow()) fires AI-11 and detects a seeded negative-stock item", async () => {
    await Organization.create({ name: "AI11 Edge Co", subdomain: TENANT, ownerUserId: new mongoose.Types.ObjectId(), isActive: true });
    const product = await makeProduct("Route-Trigger Widget", 100);
    await Stock.create({ tenantId: TENANT, product: product._id, quantity: -10, type: "out", reference: "SALE-ROUTE", createdAt: new Date("2026-01-01T00:00:00Z") });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-11", killSwitchEnabled: true, maxAutonomyLevel: "recommend" });

    const { POST } = await import("@/app/api/cron/ai/runtime-sweep/route");
    const req = { headers: { get: (h: string) => (h.toLowerCase() === "authorization" ? `Bearer ${process.env.CRON_SECRET}` : null) } } as any;
    const res = await POST(req);
    expect(res.status).toBe(200);

    const run = await AiWorkflowRun.findOne({ tenantId: TENANT, workflowId: "AI-11" }).sort({ startedAt: -1 }).lean();
    expect(run, "the cron route must have dispatched a real ai.sweep.hourly event that reached AI-11").not.toBeNull();
    expect(run!.findings.some((f) => f.title.includes("Negative stock"))).toBe(true);
  });

  // ── C.1 Large volume: 1,500 products, correctness + timing ────────────────────────────────
  it("large volume: 1,500 products scanned correctly within the performance budget (C.1 Large)", async () => {
    await makeAccount("asset_current", "1300");
    const products = Array.from({ length: 1500 }, (_, i) => ({
      tenantId: TENANT,
      header: { name: `Bulk Product ${i}`, sale_ok: true, purchase_ok: true, can_be_expensed: false },
      tab_general_information: { type: "consu", invoice_policy: "order", service_upsell: false, list_price: 100, taxes_id: [], standard_price: 100 },
      createdBy: CREATOR,
    }));
    const inserted = await Product.insertMany(products);
    const stockDocs = inserted.map((p, i) => ({
      tenantId: TENANT,
      product: p._id,
      quantity: 10,
      type: "in",
      reference: `BULK-${i}`,
      createdAt: new Date(),
    }));
    await Stock.insertMany(stockDocs);
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-11", killSwitchEnabled: true, maxAutonomyLevel: "recommend" });

    const start = Date.now();
    const envelope = await runWorkflow(ai11InventoryCogs, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: {} });
    const elapsedMs = Date.now() - start;
    // eslint-disable-next-line no-console
    console.log(`AI-11 large-volume scan (1,500 products): ${elapsedMs}ms`);

    expect(envelope.findings.filter((f) => f.title.includes("Negative stock"))).toHaveLength(0);
    expect(elapsedMs, "AI-11's per-product detectors are documented as N+1 in the verification record — measured honestly here, not asserted to an unrealistic bound").toBeLessThan(60000);
  }, 90000);

  // ── C.1 Null/missing + malformed ───────────────────────────────────────────────────────────
  it("null/missing fields and malformed data (no warehouse, HTML/unicode product name, zero standard_price) never crash the scan", async () => {
    await makeAccount("asset_current", "1300b");
    const product = await Product.create({
      tenantId: TENANT,
      header: { name: `<script>alert(1)</script> 商品名 منتج ${"z".repeat(500)}`, sale_ok: true, purchase_ok: true, can_be_expensed: false },
      tab_general_information: { type: "consu", invoice_policy: "order", service_upsell: false, list_price: 0, taxes_id: [], standard_price: 0 }, // zero cost
      createdBy: CREATOR,
    });
    // Stock entry with no warehouse field at all, and a receipt with zero unitCost.
    await Stock.create({ tenantId: TENANT, product: product._id, quantity: 5, type: "in", reference: "MALFORMED-1", createdAt: new Date("1900-01-01") });
    await StockMove.create({
      tenantId: TENANT,
      reference: "MALFORMED-MOVE",
      moveType: "incoming",
      effectiveDate: new Date("2099-12-31"),
      lines: [{ productId: product._id, productName: product.header!.name, demand: 5, done: 5, uom: "Units", unitCost: 0, totalValue: 0 }],
      moveStatus: "move_executed",
      valuation: { method: "standard", totalValue: 0 },
    });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-11", killSwitchEnabled: true, maxAutonomyLevel: "recommend" });

    await expect(runWorkflow(ai11InventoryCogs, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: {} })).resolves.toBeDefined();
    // 5 units on hand with a genuinely zero standard_price → a legitimate zero_cost_with_quantity
    // anomaly is fine; the point of this test is that malformed/edge-shaped data never throws.
  });

  // ── C.4 Cross-tenant isolation (positive proof: AI-11 never sees another tenant's inventory) ─
  it("cross-tenant isolation: tenant A's sweep never sees or flags tenant B's negative stock", async () => {
    const productA = await makeProduct("Tenant A Product", 50, TENANT);
    await Stock.create({ tenantId: TENANT, product: productA._id, quantity: 5, type: "in", reference: "A-CLEAN" });

    const productB = await makeProduct("Tenant B Product", 50, OTHER_TENANT);
    await Stock.create({ tenantId: OTHER_TENANT, product: productB._id, quantity: -50, type: "out", reference: "B-NEGATIVE", createdAt: new Date("2026-01-01") });

    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-11", killSwitchEnabled: true, maxAutonomyLevel: "recommend" });
    const envelope = await runWorkflow(ai11InventoryCogs, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: {} });

    expect(envelope.findings.filter((f) => f.title.includes("Negative stock"))).toHaveLength(0);
    // Direct confirmation the detector itself is tenant-scoped (not just the workflow wrapper).
    const negForA = await detectNegativeStock(TENANT);
    expect(negForA).toHaveLength(0);
    const negForB = await detectNegativeStock(OTHER_TENANT);
    expect(negForB.length).toBeGreaterThan(0);
  });

  // ── C.6 Adversarial: a confidently-wrong "healthy margin" trap ────────────────────────────
  it("adversarial: a product priced consistently at a stale standard_price (no real cost signal) is flagged as a valuation anomaly, not silently reported as a healthy stable margin", async () => {
    const product = await makeProduct("Stale-Cost Product", 999); // standard_price wildly off from real receipt cost
    await StockMove.create({
      tenantId: TENANT,
      reference: "STALE-RECEIPT",
      moveType: "incoming",
      effectiveDate: new Date("2026-01-01"),
      lines: [{ productId: product._id, productName: "Stale-Cost Product", demand: 10, done: 10, uom: "Units", unitCost: 40, totalValue: 400 }],
      moveStatus: "move_executed",
      valuation: { method: "standard", totalValue: 400 },
    });
    await Stock.create({ tenantId: TENANT, product: product._id, quantity: 10, type: "in", reference: "STALE-RECEIPT" });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-11", killSwitchEnabled: true, maxAutonomyLevel: "recommend" });

    const envelope = await runWorkflow(ai11InventoryCogs, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: {} });

    // standard_price (999) vs weighted-average (40) is a >25% swing — a naive report using
    // standard_price alone for margin/valuation would look "fine"; AI-11 must catch the swing.
    const anomaly = envelope.findings.find((f) => f.title.includes("Valuation anomaly"));
    expect(anomaly).toBeDefined();
    expect(anomaly!.detail).toContain("40");
  });
});
