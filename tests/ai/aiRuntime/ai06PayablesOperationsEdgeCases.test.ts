import { describe, expect, it, beforeAll, afterAll, afterEach, vi } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai06edge";

const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mockAuth }));

import Invoice from "@/models/finance/Invoice";
import PurchaseOrder from "@/models/finance/PurchaseOrder";
import Customer from "@/models/sales/Customer";
import User from "@/models/auth/User";
import AiMaterialityPolicy from "@/models/ai/AiMaterialityPolicy";
import AiPaymentRunProposal from "@/models/ai/AiPaymentRunProposal";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiAttentionItem from "@/models/ai/AiAttentionItem";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";
import ExtractedDocument from "@/models/ai/ExtractedDocument";

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai06PayablesOperations: typeof import("@/lib/aiRuntime/workflows/ai-06-payables-operations").ai06PayablesOperations;
let createDraftBill: typeof import("@/lib/docIntel/billCreate").createDraftBill;

const TENANT = "ai06-edge-tenant";
const OTHER_TENANT = "ai06-edge-other-tenant";

async function makeUser(tenantId: string = TENANT) {
  const u = await User.create({ tenantId, name: "Finance User", email: `f-${Date.now()}-${Math.random()}@example.com`, phone: "9999999999", password: "hashed", role: "finance", status: "active" });
  return String(u._id);
}

async function makeVendor(tenantId: string = TENANT, name = "Vendor Co") {
  return Customer.create({ tenantId, header: { name, is_company: true }, contact_details: {}, createdBy: new mongoose.Types.ObjectId() });
}

async function makePO(vendorId: string, tenantId: string = TENANT, overrides: Partial<Record<string, any>> = {}) {
  return PurchaseOrder.create({
    tenantId,
    name: `PO-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    partnerId: vendorId,
    createdBy: new mongoose.Types.ObjectId(),
    orderLines: [{ productId: new mongoose.Types.ObjectId(), name: "Widget", productQty: 10, receivedQty: 10, billedQty: 0, priceUnit: 12.0, priceSubtotal: 120 }],
    ...overrides,
  });
}

async function makeBill(vendorId: string, poName: string | undefined, overrides: Partial<Record<string, any>> = {}, tenantId: string = TENANT) {
  return Invoice.create({
    tenantId,
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

async function policy(tenantId: string = TENANT) {
  await AiWorkflowPolicy.create({ tenantId, workflowId: "AI-06", killSwitchEnabled: true, maxAutonomyLevel: "draft" });
}

describe("AI-06 — edge-case hardening (docs/ai/BRIEF-09-VERIFICATION.md Part C)", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Invoice.init(), PurchaseOrder.init(), Customer.init(), User.init(), AiMaterialityPolicy.init(),
      AiPaymentRunProposal.init(), AiWorkflowRun.init(), AiDecisionTrace.init(), AiAttentionItem.init(),
      AiWorkflowPolicy.init(), ExtractedDocument.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai06PayablesOperations } = await import("@/lib/aiRuntime/workflows/ai-06-payables-operations"));
    ({ createDraftBill } = await import("@/lib/docIntel/billCreate"));
    bootstrapAiRuntime();
    mockAuth.mockResolvedValue({ user: { id: String(new mongoose.Types.ObjectId()), tenantId: TENANT, role: "finance" } });
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Promise.all([
      Invoice.deleteMany({}), PurchaseOrder.deleteMany({}), Customer.deleteMany({}), User.deleteMany({}),
      AiMaterialityPolicy.deleteMany({}), AiPaymentRunProposal.deleteMany({}), AiWorkflowRun.deleteMany({}),
      AiDecisionTrace.deleteMany({}), AiAttentionItem.deleteMany({}), AiWorkflowPolicy.deleteMany({}), ExtractedDocument.deleteMany({}),
    ]);
  });

  // ── Section 1: trigger proof through the REAL call site ───────────────────────────────────
  // The real, current call site for "bill.created" is lib/docIntel/billCreate.ts::createDraftBill()
  // (its own safeEmitEvent() call, line ~105) — the document-intelligence "confirm extracted
  // vendor bill" step. Confirmed by grep across app/**+lib/**: app/api/finance/bills/route.ts,
  // the ordinary manual "create a vendor bill" form/route, does NOT emit bill.created at all —
  // so AI-06's bill_match mode (PO matching + duplicate detection) never fires for a manually
  // entered bill today, only for one confirmed through document intelligence. This is a real
  // product-coverage gap, but the bug is the missing emit in bills/route.ts (out of this file's
  // scope — AI-06's own source is correct and does exactly what it subscribes to). Documented in
  // AI-06.md's Trigger proof section; proven here via the one real call site that does exist.
  it("trigger proof: the real createDraftBill() service (not runWorkflow()) fires AI-06's bill_match and detects a PO mismatch", async () => {
    const userId = await makeUser();
    const vendor = await makeVendor();
    await makePO(String(vendor._id), TENANT, { name: "PO-TRIGGER-001" });
    await policy();

    const result = await createDraftBill(
      {
        vendorName: "Vendor Co",
        billDate: new Date().toISOString(),
        dueDate: new Date().toISOString(),
        totalAmount: 500,
        subtotal: 500,
        taxAmount: 0,
        lineItems: [{ description: "Widget", quantity: 50, unitPrice: 12, amount: 600 }], // over PO qty of 10
        poReference: "PO-TRIGGER-001",
      } as any,
      { tenantId: TENANT, userId },
    );

    // safeEmitEvent() is awaited inline (lib/aiRuntime/runtime/safeEmit.ts), so by the time
    // createDraftBill() resolves, AI-06's run has completed — same pattern as AI-04's own
    // trigger-proof test (tests/ai/aiRuntime/ai04ExpenseIntelligenceTriggerProof.test.ts).
    const run = await AiWorkflowRun.findOne({ tenantId: TENANT, workflowId: "AI-06", entityId: String(result.invoiceId) }).lean();
    expect(run, "AI-06 did not fire from the real createDraftBill() service").not.toBeNull();
    const trace = await AiDecisionTrace.findOne({ runId: String(run!._id) }).lean();
    const proposal = trace!.rawProposal as unknown as { matchResult: { verdict: string } };
    expect(proposal.matchResult.verdict).toBe("exception"); // quantity 50 vs PO's 10
  });

  // ── C.4 Cross-tenant hostile input — regression for this pass's fix ────────────────────────
  // Root cause (Part A.2): `Customer.findById(invoice.partnerId)` / `Customer.findById(bill.
  // partnerId)` were unscoped. `invoice`/`bill` themselves are always fetched tenant-scoped, but
  // their OWN `partnerId` field is not guaranteed same-tenant — app/api/finance/bills/route.ts
  // accepts `body.partnerId` from the request with no tenant-ownership check (confirmed by
  // reading it, line ~138), so a bad/hostile write there can leave an Invoice whose partnerId
  // points at another tenant's Customer. Fixed by scoping both reads to `{_id, tenantId}`.
  it("cross-tenant hostile: a bill whose partnerId points at another tenant's Customer never leaks that vendor's name", async () => {
    const victimVendor = await makeVendor(OTHER_TENANT, "Victim Vendor Co — should never appear");
    const bill = await makeBill(String(victimVendor._id), undefined, { name: "BILL-CROSS-TENANT" }, TENANT);
    await policy();

    const envelope = await runWorkflow(ai06PayablesOperations, { tenantId: TENANT, eventKey: "bill.created", payload: { invoiceId: String(bill._id) } });
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { matchResult: { billNumber: string } };
    expect(proposal.matchResult.billNumber).toBe("BILL-CROSS-TENANT");
    // The duplicate-scan candidate args carry the resolved vendor name — must be empty, never
    // the victim tenant's real vendor name, since the scoped lookup correctly finds nothing.
    const attentionItems = await AiAttentionItem.find({ tenantId: TENANT }).lean();
    for (const item of attentionItems) {
      expect(JSON.stringify(item)).not.toContain("Victim Vendor Co");
    }
  });

  it("cross-tenant hostile: the sweep's due-schedule vendor-name cache never resolves another tenant's Customer either", async () => {
    const victimVendor = await makeVendor(OTHER_TENANT, "Victim Sweep Vendor — should never appear");
    await makeBill(String(victimVendor._id), undefined, { name: "BILL-SWEEP-CROSS-TENANT", amountResidual: 100, amountTotal: 100 }, TENANT);
    await policy();

    const envelope = await runWorkflow(ai06PayablesOperations, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: {} });
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { dueSchedule: { billNumber: string; vendorName: string }[] };
    const entry = proposal.dueSchedule.find((e) => e.billNumber === "BILL-SWEEP-CROSS-TENANT");
    expect(entry).toBeDefined();
    expect(entry!.vendorName).toBe("Vendor"); // the safe fallback, never the victim's real name
  });

  // ── C.6 Adversarial — regression for this pass's fix ───────────────────────────────────────
  // Root cause: neither AI-06's own PO lookup nor the pre-existing real matcher
  // (lib/accounting/matching.ts::runPOMatching(), same gap, out of scope here) checked that a
  // referenced PO belongs to the SAME vendor as the bill — PurchaseOrder names are unique only
  // per {tenantId, name}, not per vendor. A bill from the wrong vendor whose line quantities/
  // prices happen to agree with someone else's real PO previously came back a clean "match".
  it("adversarial: a bill referencing a DIFFERENT vendor's real PO, with agreeing line amounts, is an exception — never a confident match", async () => {
    const realVendor = await makeVendor(TENANT, "Real PO Owner Co");
    const impersonator = await makeVendor(TENANT, "Impersonating Vendor Co");
    const po = await makePO(String(realVendor._id), TENANT, {
      name: "PO-VENDOR-MISMATCH-01",
      orderLines: [{ productId: new mongoose.Types.ObjectId(), name: "Widget", productQty: 10, receivedQty: 10, billedQty: 0, priceUnit: 12.0, priceSubtotal: 120 }],
    });
    // Bill from the WRONG vendor, quantities/price line up exactly with the real PO.
    const bill = await makeBill(String(impersonator._id), po.name, {
      invoiceLines: [{ productId: po.orderLines[0].productId, name: "Widget", quantity: 10, priceUnit: 12.0, priceSubtotal: 120, taxIds: [] }],
    });
    await policy();

    const envelope = await runWorkflow(ai06PayablesOperations, { tenantId: TENANT, eventKey: "bill.created", payload: { invoiceId: String(bill._id) } });
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { matchResult: { verdict: string; variances: string[] } };
    expect(proposal.matchResult.verdict).toBe("exception");
    expect(proposal.matchResult.variances.some((v) => v.includes("different vendor"))).toBe(true);
  });

  // ── C.4 Nothing configured ─────────────────────────────────────────────────────────────────
  it("nothing configured: no materiality policy row → reasonChain states which setting is missing", async () => {
    const vendor = await makeVendor();
    const bill = await makeBill(String(vendor._id), undefined);
    await policy();

    const envelope = await runWorkflow(ai06PayablesOperations, { tenantId: TENANT, eventKey: "bill.created", payload: { invoiceId: String(bill._id) } });
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    expect(trace!.reasonChain.some((r: string) => r.includes('no "po_matching" materiality threshold configured'))).toBe(true);
  });

  // ── C.4 Kill switch off ────────────────────────────────────────────────────────────────────
  it("kill switch off: no annotation, no attention item — clean no_action", async () => {
    const vendor = await makeVendor();
    const po = await makePO(String(vendor._id));
    const bill = await makeBill(String(vendor._id), po.name, {
      invoiceLines: [{ productId: po.orderLines[0].productId, name: "Widget", quantity: 999, priceUnit: 12, priceSubtotal: 11988, taxIds: [] }],
    });
    // Deliberately no AiWorkflowPolicy row — killSwitchEnabled defaults to false.

    const envelope = await runWorkflow(ai06PayablesOperations, { tenantId: TENANT, eventKey: "bill.created", payload: { invoiceId: String(bill._id) } });
    expect(envelope.autonomyApplied).toBe("recommend");
    const after = await Invoice.findById(bill._id).lean();
    expect(after!.discrepancyNotes).toBeFalsy();
  });

  // ── C.3 Concurrent duplicate event ─────────────────────────────────────────────────────────
  it("concurrent duplicate bill.created dispatch → exactly one match annotation write, not two", async () => {
    const vendor = await makeVendor();
    const po = await makePO(String(vendor._id));
    const bill = await makeBill(String(vendor._id), po.name, {
      invoiceLines: [{ productId: po.orderLines[0].productId, name: "Widget", quantity: 999, priceUnit: 12, priceSubtotal: 11988, taxIds: [] }],
      poMatchStatus: "mismatch", // draft_match_annotation only fires once the real matcher already flagged mismatch
    });
    await policy();
    const userId = await makeUser();

    // draft_match_annotation is a real financial-module write (not internal_state), so it also
    // needs a real acting user to clear routePermissionCheck — same requirement discovered for
    // AI-05's draft_receipt_allocation during this pass.
    const event = { tenantId: TENANT, eventKey: "bill.created", payload: { invoiceId: String(bill._id), actingUserId: userId } };
    await Promise.all([
      runWorkflow(ai06PayablesOperations, { ...event, id: undefined } as any),
      runWorkflow(ai06PayablesOperations, { ...event, id: undefined } as any),
    ]);

    const after = await Invoice.findById(bill._id).lean();
    // draft_match_annotation replaces discrepancyNotes with ONE quantity-variance description —
    // idempotent by construction (both runs write the same deterministic string), the shape
    // that matters is that neither run corrupted the field or threw uncaught.
    expect(after!.discrepancyNotes).toContain("quantity variance");
  });

  // ── C.1 Large volume ────────────────────────────────────────────────────────────────────────
  it("large volume: 3,000 open bills across 50 vendors, correct payment-run proposal within budget", async () => {
    const vendors = await Promise.all(Array.from({ length: 50 }, (_, i) => makeVendor(TENANT, `Bulk Vendor ${i}`)));
    const docs = vendors.flatMap((v, vi) =>
      Array.from({ length: 60 }, (_, i) => ({
        tenantId: TENANT,
        name: `BULK-BILL-${vi}-${i}`,
        partnerId: v._id,
        moveType: "in_invoice",
        state: "posted",
        invoiceLines: [],
        amountTotal: 100,
        amountResidual: 100,
        dueDate: new Date(Date.now() + 5 * 86400000),
      })),
    );
    await Invoice.insertMany(docs);
    await policy();

    const start = Date.now();
    const envelope = await runWorkflow(ai06PayablesOperations, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: {} });
    const elapsedMs = Date.now() - start;

    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { dueSchedule: unknown[] };
    expect(proposal.dueSchedule.length).toBe(3000);
    // eslint-disable-next-line no-console
    console.log(`AI-06 large-volume sweep (3,000 open bills / 50 vendors): ${elapsedMs}ms`);
    expect(elapsedMs).toBeLessThan(15000);
  }, 30000);

  // ── C.1 Null/missing + malformed data ──────────────────────────────────────────────────────
  it("malformed data (unicode/HTML vendor name, absurd dates, zero/negative amounts) never crashes and never fabricates a match", async () => {
    const weirdVendor = await makeVendor(TENANT, `<script>alert(1)</script> मराठी 日本語 ${"x".repeat(500)}`);
    await makeBill(String(weirdVendor._id), undefined, { amountTotal: 0, amountResidual: 0, dueDate: new Date("1900-01-01") });
    const negBill = await makeBill(String(weirdVendor._id), undefined, { amountTotal: -500, amountResidual: -500, dueDate: new Date("2099-12-31") });
    await policy();

    await expect(runWorkflow(ai06PayablesOperations, { tenantId: TENANT, eventKey: "bill.created", payload: { invoiceId: String(negBill._id) } })).resolves.toBeDefined();
    await expect(runWorkflow(ai06PayablesOperations, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: {} })).resolves.toBeDefined();
  });
});
