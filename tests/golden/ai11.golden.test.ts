import { describe, expect, it, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai11golden";

import Account from "@/models/finance/Account";
import Product from "@/models/inventory/Product";
import Stock from "@/models/inventory/Stock";
import StockMove from "@/models/inventory/StockMove";
import Batch from "@/models/inventory/Batch";
import Invoice from "@/models/finance/Invoice";
import Customer from "@/models/sales/Customer";
import JournalEntry from "@/models/finance/JournalEntry";
import AiInventoryCount from "@/models/ai/AiInventoryCount";
import AiInventoryFinding from "@/models/ai/AiInventoryFinding";
import AiMaterialityPolicy from "@/models/ai/AiMaterialityPolicy";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";
import { AI11_GOLDEN_CASES, GOLDEN_TENANT_PREFIX, GOLDEN_CREATOR, type GoldenCase } from "@/tests/golden/ai11/goldenCases";

/**
 * The golden-dataset CI check for AI-11 (docs/ai/BRIEF-10-PRE-QA.md P0.6). Same shape as
 * `tests/golden/ai27.golden.test.ts`: seeds each case, runs the real workflow through the real
 * executor, and checks the finding titles produced against a known-correct expectation.
 */

const PASS_RATE_THRESHOLD = 1.0; // AI-11's four detectors are pure statistics/lookups — no LLM call anywhere in the path

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai11InventoryCogs: typeof import("@/lib/aiRuntime/workflows/ai-11-inventory-cogs").ai11InventoryCogs;

async function seedCase(tenantId: string, goldenCase: GoldenCase) {
  const productIds = new Map<string, mongoose.Types.ObjectId>();
  for (const p of goldenCase.products) {
    const doc = await Product.create({
      tenantId,
      header: { name: p.name, sale_ok: true, purchase_ok: true, can_be_expensed: false },
      tab_general_information: { type: "consu", invoice_policy: "order", service_upsell: false, list_price: p.standardPrice, taxes_id: [], standard_price: p.standardPrice },
      createdBy: GOLDEN_CREATOR,
    });
    productIds.set(p.key, doc._id as mongoose.Types.ObjectId);
  }

  const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

  for (const m of goldenCase.moves ?? []) {
    const productId = productIds.get(m.productKey)!;
    await StockMove.create({
      tenantId,
      reference: m.reference,
      moveType: m.moveType ?? "incoming",
      scheduledDate: daysAgo(m.daysAgo),
      effectiveDate: daysAgo(m.daysAgo),
      lines: [{ productId, productName: goldenCase.products.find((p) => p.key === m.productKey)!.name, demand: m.qty, done: m.qty, uom: "Units", unitCost: m.unitCost, totalValue: m.qty * m.unitCost }],
      moveStatus: "move_executed",
      valuation: { method: "standard", totalValue: m.qty * m.unitCost },
    });
  }

  for (const s of goldenCase.stock ?? []) {
    const productId = productIds.get(s.productKey)!;
    await Stock.create({ tenantId, product: productId, quantity: s.quantity, type: s.type, reference: s.reference, createdAt: s.createdAtDaysAgo !== undefined ? daysAgo(s.createdAtDaysAgo) : undefined });
  }

  for (const c of goldenCase.counts ?? []) {
    const productId = productIds.get(c.productKey)!;
    await AiInventoryCount.create({ tenantId, productId, countedQty: c.countedQty, countedAt: daysAgo(c.daysAgo) });
  }

  if (goldenCase.sales && goldenCase.sales.length > 0) {
    const customer = await Customer.create({ tenantId, header: { name: "Golden Sales Customer", is_company: true }, createdBy: GOLDEN_CREATOR });
    const makeSale = async (productId: mongoose.Types.ObjectId, quantity: number, priceUnit: number, invoiceDate: Date) => {
      await Invoice.create({
        tenantId,
        name: `SALE-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        partnerId: customer._id,
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
    };
    for (const s of goldenCase.sales) {
      const productId = productIds.get(s.productKey)!;
      await makeSale(productId, s.quantity, s.priceUnit, daysAgo(s.daysAgo));
      if (s.alsoPriorMonth) await makeSale(productId, s.quantity, s.priceUnit, daysAgo(s.daysAgo + 30));
    }
  }

  if (goldenCase.glTieOut) {
    const inventoryAccount = await Account.create({ tenantId, name: "Inventory", code: `INV-${Math.random().toString(36).slice(2, 8)}`, account_type: "asset_current", isActive: true, isLocked: false, status: "active" });
    const grniAccount = await Account.create({ tenantId, name: "GRNI", code: `GRNI-${Math.random().toString(36).slice(2, 8)}`, account_type: "liability_current", isActive: true, isLocked: false, status: "active" });
    await JournalEntry.create({
      tenantId,
      header: { name: "JE-golden-gl-tieout", date: new Date(), journalType: "purchase" },
      status: "posted",
      voucherStatus: "posted",
      lineIds: [
        { accountId: inventoryAccount._id, label: "inventory receipt", debit: goldenCase.glTieOut.inventoryValue, credit: 0 },
        { accountId: grniAccount._id, label: "grni", debit: 0, credit: goldenCase.glTieOut.inventoryValue },
      ],
      totals: { amountUntaxed: goldenCase.glTieOut.inventoryValue, amountTax: 0, amountTotal: goldenCase.glTieOut.inventoryValue },
    });
  }
}

describe("AI-11 golden dataset", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Account.init(), Product.init(), Stock.init(), StockMove.init(), Batch.init(), Invoice.init(), Customer.init(), JournalEntry.init(),
      AiInventoryCount.init(), AiInventoryFinding.init(), AiMaterialityPolicy.init(),
      AiWorkflowRun.init(), AiDecisionTrace.init(), AiEvent.init(), AiToolCall.init(), AiWorkflowPolicy.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai11InventoryCogs } = await import("@/lib/aiRuntime/workflows/ai-11-inventory-cogs"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  it(`reports a pass rate >= ${PASS_RATE_THRESHOLD * 100}% across ${AI11_GOLDEN_CASES.length} golden case(s)`, async () => {
    const results: { id: string; passed: boolean; expected: string[]; actual: string[] }[] = [];

    for (const goldenCase of AI11_GOLDEN_CASES) {
      const tenantId = `${GOLDEN_TENANT_PREFIX}-${goldenCase.id}`;
      await seedCase(tenantId, goldenCase);
      await AiWorkflowPolicy.create({ tenantId, workflowId: "AI-11", killSwitchEnabled: true, maxAutonomyLevel: "recommend" });

      const envelope = await runWorkflow(ai11InventoryCogs, { tenantId, eventKey: "ai.sweep.hourly", payload: {} });
      const titles = envelope.findings.map((f) => f.title);

      const passed = goldenCase.mustFire.length === 0 ? envelope.findings.length === 0 : goldenCase.mustFire.every((t) => titles.some((title) => title.includes(t)));
      results.push({ id: goldenCase.id, passed, expected: goldenCase.mustFire, actual: titles });
    }

    const passRate = results.filter((r) => r.passed).length / results.length;
    const failures = results.filter((r) => !r.passed);

    // eslint-disable-next-line no-console
    console.log(`AI-11 golden dataset: ${results.length - failures.length}/${results.length} passed (${Math.round(passRate * 100)}%)`, failures.length > 0 ? { failures } : "");

    expect(passRate, `golden dataset regressions: ${JSON.stringify(failures, null, 2)}`).toBeGreaterThanOrEqual(PASS_RATE_THRESHOLD);
  });
});
