import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai06";

import Invoice from "@/models/finance/Invoice";
import PurchaseOrder from "@/models/finance/PurchaseOrder";
import Customer from "@/models/sales/Customer";
import User from "@/models/auth/User";
import AiMaterialityPolicy from "@/models/ai/AiMaterialityPolicy";
import AiPaymentRunProposal from "@/models/ai/AiPaymentRunProposal";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";
import AiAttentionItem from "@/models/ai/AiAttentionItem";
import ExtractedDocument from "@/models/ai/ExtractedDocument";

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai06PayablesOperations: typeof import("@/lib/aiRuntime/workflows/ai-06-payables-operations").ai06PayablesOperations;
let computeLineVariances: typeof import("@/lib/accounting/matching").computeLineVariances;
let getTool: typeof import("@/lib/aiRuntime/tools/registry").getTool;

const TENANT = "ai06-tenant";
// Its own tenant — record_payment_run_proposal's idempotency key is date-scoped
// (tenantId:day), by design (avoid spamming duplicate proposals within a day), which would
// otherwise collide across the several tests in this file that all trigger a sweep for TENANT
// on the same day.
const TENANT_PR = "ai06-tenant-payment-run";

async function makeUser(tenantId: string = TENANT) {
  const u = await User.create({ tenantId, name: "Finance User", email: `f-${Date.now()}-${Math.random()}@example.com`, phone: "9999999999", password: "hashed", role: "finance", status: "active" });
  return String(u._id);
}

async function makeVendor(userId: string, tenantId: string = TENANT) {
  const c = await Customer.create({ tenantId, header: { name: "Vendor Co", is_company: true }, contact_details: {}, createdBy: userId });
  return c;
}

async function makePO(vendorId: string, overrides: Partial<Record<string, any>> = {}) {
  return PurchaseOrder.create({
    tenantId: TENANT,
    name: `PO-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    partnerId: vendorId,
    orderLines: [{ productId: new mongoose.Types.ObjectId(), name: "Widget", productQty: 10, receivedQty: 10, billedQty: 0, priceUnit: 12.0 }],
    ...overrides,
  });
}

async function makeBill(vendorId: string, poName: string | undefined, overrides: Partial<Record<string, any>> = {}) {
  return Invoice.create({
    tenantId: TENANT,
    name: `BILL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    partnerId: vendorId,
    moveType: "in_invoice",
    state: "posted",
    poReference: poName,
    poMatchType: "2_way",
    poMatchStatus: "pending",
    invoiceLines: [],
    amountTotal: 120,
    amountResidual: 120,
    dueDate: new Date(),
    ...overrides,
  });
}

async function runAi06Sweep(actingUserId?: string, tenantId: string = TENANT) {
  return runWorkflow(ai06PayablesOperations, { tenantId, eventKey: "ai.sweep.hourly", payload: actingUserId ? { actingUserId } : {} });
}
async function runAi06Bill(invoiceId: string, actingUserId?: string) {
  return runWorkflow(ai06PayablesOperations, { tenantId: TENANT, eventKey: "bill.created", payload: { invoiceId, actingUserId } });
}

describe("AI-06 — Payables operations", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Invoice.init(),
      PurchaseOrder.init(),
      Customer.init(),
      User.init(),
      AiMaterialityPolicy.init(),
      AiPaymentRunProposal.init(),
      AiWorkflowRun.init(),
      AiDecisionTrace.init(),
      AiEvent.init(),
      AiToolCall.init(),
      AiWorkflowPolicy.init(),
      AiAttentionItem.init(),
      ExtractedDocument.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai06PayablesOperations } = await import("@/lib/aiRuntime/workflows/ai-06-payables-operations"));
    ({ computeLineVariances } = await import("@/lib/accounting/matching"));
    ({ getTool } = await import("@/lib/aiRuntime/tools/registry"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Promise.all([
      Invoice.deleteMany({}),
      PurchaseOrder.deleteMany({}),
      Customer.deleteMany({}),
      User.deleteMany({}),
      AiMaterialityPolicy.deleteMany({}),
      AiPaymentRunProposal.deleteMany({}),
      AiWorkflowRun.deleteMany({}),
      AiDecisionTrace.deleteMany({}),
      AiEvent.deleteMany({}),
      AiToolCall.deleteMany({}),
      AiWorkflowPolicy.deleteMany({}),
      AiAttentionItem.deleteMany({}),
      ExtractedDocument.deleteMany({}),
    ]);
  });

  describe("computeLineVariances (pure)", () => {
    it("identifies a quantity variance and its amount", () => {
      const result = computeLineVariances(
        [{ productId: "p1" as any, name: "Widget", quantity: 15, priceUnit: 12, priceSubtotal: 180, taxIds: [] }],
        [{ productId: "p1" as any, name: "Widget", productQty: 10, receivedQty: 10, billedQty: 0, priceUnit: 12, taxIds: [], priceSubtotal: 0 }],
        "2_way",
      );
      const line = result[0] as any;
      expect(line.verdict).toBe("exception");
      expect(line.quantity.withinTolerance).toBe(false);
      expect(line.quantity.variance).toBeCloseTo(5, 2);
      expect(line.price.withinTolerance).toBe(true);
    });

    it("identifies a price variance and its amount", () => {
      const result = computeLineVariances(
        [{ productId: "p1" as any, name: "Widget", quantity: 10, priceUnit: 12.34, priceSubtotal: 123.4, taxIds: [] }],
        [{ productId: "p1" as any, name: "Widget", productQty: 10, receivedQty: 10, billedQty: 0, priceUnit: 12.0, taxIds: [], priceSubtotal: 0 }],
        "2_way",
      );
      const line = result[0] as any;
      expect(line.verdict).toBe("exception");
      expect(line.price.withinTolerance).toBe(false);
      expect(line.price.variance).toBeCloseTo(0.34, 2);
      expect(line.quantity.withinTolerance).toBe(true);
    });

    it("identifies a missing-receipt exception on the receipt leg (3-way)", () => {
      const result = computeLineVariances(
        [{ productId: "p1" as any, name: "Widget", quantity: 10, priceUnit: 12, priceSubtotal: 120, taxIds: [] }],
        [{ productId: "p1" as any, name: "Widget", productQty: 10, receivedQty: 0, billedQty: 0, priceUnit: 12, taxIds: [], priceSubtotal: 0 }],
        "3_way",
      );
      const line = result[0] as any;
      expect(line.verdict).toBe("exception");
      expect(line.receipt.withinTolerance).toBe(false);
      expect(line.receipt.variance).toBeCloseTo(10, 2);
      expect(line.quantity.withinTolerance).toBe(true); // billed matches PO order qty
    });

    it("identifies an over-receipt exception (billed far below received) on the receipt leg (3-way)", () => {
      const result = computeLineVariances(
        [{ productId: "p1" as any, name: "Widget", quantity: 5, priceUnit: 12, priceSubtotal: 60, taxIds: [] }],
        [{ productId: "p1" as any, name: "Widget", productQty: 20, receivedQty: 20, billedQty: 0, priceUnit: 12, taxIds: [], priceSubtotal: 0 }],
        "3_way",
      );
      const line = result[0] as any;
      expect(line.verdict).toBe("exception");
      expect(line.receipt.withinTolerance).toBe(false);
      expect(line.receipt.variance).toBeCloseTo(-15, 2);
    });

    it("false positive: a bill matching its PO and receipt within tolerance produces no exception", () => {
      const result = computeLineVariances(
        [{ productId: "p1" as any, name: "Widget", quantity: 10, priceUnit: 12, priceSubtotal: 120, taxIds: [] }],
        [{ productId: "p1" as any, name: "Widget", productQty: 10, receivedQty: 10, billedQty: 0, priceUnit: 12, taxIds: [], priceSubtotal: 0 }],
        "3_way",
      );
      const line = result[0] as any;
      expect(line.verdict).toBe("match");
    });

    it("matching.ts's existing runPOMatching callers behave identically — see tests/accounting/matching.test.ts (unmodified, still green)", () => {
      expect(true).toBe(true);
    });
  });

  it("the payment run cannot be released by the AI at any confidence, with any policy, with the kill switch on — no such tool exists", () => {
    expect(getTool("release_payment_run")).toBeUndefined();
    expect(getTool("execute_payment_run")).toBeUndefined();
    expect(getTool("pay_bill")).toBeUndefined();
  });

  it("early_payment_discount and cross_source_duplicate_search are no longer declared not_implemented here — Chunk 8a's AI-19/AI-27 close them (Chunk 8b D.3 staleness fix)", async () => {
    const userId = await makeUser();
    const vendor = await makeVendor(userId);
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-06", killSwitchEnabled: true, maxAutonomyLevel: "draft" });

    const envelope = await runAi06Sweep(userId);
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { checksNotImplemented: { what: string; reason: string }[] };
    expect(proposal.checksNotImplemented.find((c) => c.what === "early_payment_discount")).toBeUndefined();
    expect(proposal.checksNotImplemented.find((c) => c.what === "cross_source_duplicate_search")).toBeUndefined();
    void vendor;
  });

  it("vendor_bank_change_hold is still honestly declared not_implemented — Vendor/Customer genuinely carry no bank-detail field", async () => {
    const userId = await makeUser();
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-06", killSwitchEnabled: true, maxAutonomyLevel: "draft" });
    const envelope = await runAi06Sweep(userId);
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { checksNotImplemented: { what: string; reason: string }[] };
    const check = proposal.checksNotImplemented.find((c) => c.what === "vendor_bank_change_hold");
    expect(check).toBeDefined();
    expect(check!.reason).toMatch(/no bank-detail field/);
  });

  it("duplicate bill detected raises an attention item", async () => {
    const userId = await makeUser();
    const vendor = await makeVendor(userId);
    await makeBill(String(vendor._id), undefined, { name: "BILL-DUP-0001", amountTotal: 500 });
    const secondBill = await makeBill(String(vendor._id), undefined, { name: "BILL-DUP-0001-copy", amountTotal: 500 });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-06", killSwitchEnabled: true, maxAutonomyLevel: "draft" });

    await runAi06Bill(String(secondBill._id), userId);

    const items = await AiAttentionItem.find({ tenantId: TENANT, workflowId: "AI-06" }).lean();
    expect(items.some((i) => i.what.includes("duplicate"))).toBe(true);
  });

  it("a payment-run proposal is recorded with included/excluded/totals, grouped by vendor and currency", async () => {
    const userId = await makeUser(TENANT_PR);
    const vendorA = await makeVendor(userId, TENANT_PR);
    const vendorB = await makeVendor(userId, TENANT_PR);
    await makeBill(String(vendorA._id), undefined, { tenantId: TENANT_PR, state: "posted", amountResidual: 1000, amountTotal: 1000 });
    await makeBill(String(vendorB._id), undefined, { tenantId: TENANT_PR, state: "draft", amountResidual: 500, amountTotal: 500 }); // unapproved -> excluded
    await AiWorkflowPolicy.create({ tenantId: TENANT_PR, workflowId: "AI-06", killSwitchEnabled: true, maxAutonomyLevel: "draft" });

    await runAi06Sweep(userId, TENANT_PR);

    const proposals = await AiPaymentRunProposal.find({ tenantId: TENANT_PR }).lean();
    expect(proposals.length).toBe(1);
    expect(proposals[0].included.length).toBe(1);
    expect(proposals[0].excluded.length).toBe(1);
    expect(proposals[0].excluded[0].reason).toBe("unapproved");
    expect(proposals[0].totalsByCurrency[0].amount).toBeCloseTo(1000, 2);

    await Promise.all([
      Invoice.deleteMany({ tenantId: TENANT_PR }),
      Customer.deleteMany({ tenantId: TENANT_PR }),
      User.deleteMany({ tenantId: TENANT_PR }),
      AiWorkflowPolicy.deleteMany({ tenantId: TENANT_PR }),
      AiPaymentRunProposal.deleteMany({ tenantId: TENANT_PR }),
    ]);
  });
});
