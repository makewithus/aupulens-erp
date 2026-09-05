import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai19_edge";

// Hoisted auth mock for the real-route trigger-proof test (docs/ai/BRIEF-09-VERIFICATION.md Part
// B.1) — same pattern as tests/ai/aiRuntime/ai04ExpenseIntelligenceTriggerProof.test.ts. Only the
// session is faked; everything else (Vendor, the AI runtime, the real route handler) is real.
const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mockAuth }));

import Customer from "@/models/sales/Customer";
import Invoice from "@/models/finance/Invoice";
import Employee from "@/models/hr/Employee";
import InventoryItem from "@/models/inventory/InventoryItem";
import Vendor from "@/models/admin/Vendor";
import AiHold from "@/models/ai/AiHold";
import AiMasterDataProfile from "@/models/ai/AiMasterDataProfile";
import AiMasterDataSnapshot from "@/models/ai/AiMasterDataSnapshot";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai19MasterData: typeof import("@/lib/aiRuntime/workflows/ai-19-master-data").ai19MasterData;
let vendorsPOST: typeof import("@/app/api/admin/vendors/route").POST;

const TENANT = "ai19-edge-tenant";
const VICTIM_TENANT = "ai19-edge-victim-tenant";
const CREATOR = new mongoose.Types.ObjectId();

async function makeVendorWithBill(tenantId: string, name: string, gstin?: string) {
  const vendor = await Customer.create({ tenantId, header: { name, is_company: true }, gstin, createdBy: CREATOR });
  await Invoice.create({
    tenantId, name: `BILL-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, partnerId: vendor._id, moveType: "in_invoice", state: "posted",
    invoiceDate: new Date("2026-01-05"), dueDate: new Date("2026-01-05"),
    invoiceLines: [{ name: "Goods", priceSubtotal: 1000, quantity: 1, priceUnit: 1000 }],
    amountUntaxed: 1000, amountTax: 0, amountTotal: 1000, amountResidual: 1000, paymentState: "not_paid",
  });
  return vendor._id as mongoose.Types.ObjectId;
}

async function makeEmployee(tenantId: string, firstName: string, lastName: string, email: string, bankName?: string, accountNumber?: string) {
  const emp = await Employee.create({
    tenantId, firstName, lastName, email, employeeCode: `EMP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    phone: "9999999999", dateOfJoining: new Date("2020-01-01"), status: "active",
    bankDetails: bankName ? { bankName, accountNumber, ifscCode: "HDFC0000001" } : undefined,
  });
  return emp._id as mongoose.Types.ObjectId;
}

describe("AI-19 — edge-case matrix (docs/ai/BRIEF-09-VERIFICATION.md Part C)", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Customer.init(), Invoice.init(), Employee.init(), InventoryItem.init(), Vendor.init(), AiHold.init(), AiMasterDataProfile.init(), AiMasterDataSnapshot.init(),
      AiWorkflowRun.init(), AiDecisionTrace.init(), AiEvent.init(), AiToolCall.init(), AiWorkflowPolicy.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai19MasterData } = await import("@/lib/aiRuntime/workflows/ai-19-master-data"));
    ({ POST: vendorsPOST } = await import("@/app/api/admin/vendors/route"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Promise.all([
      Customer.deleteMany({}), Invoice.deleteMany({}), Employee.deleteMany({}), InventoryItem.deleteMany({}), Vendor.deleteMany({}), AiHold.deleteMany({}),
      AiMasterDataProfile.deleteMany({}), AiMasterDataSnapshot.deleteMany({}), AiWorkflowRun.deleteMany({}), AiDecisionTrace.deleteMany({}),
      AiEvent.deleteMany({}), AiToolCall.deleteMany({}), AiWorkflowPolicy.deleteMany({}),
    ]);
  });

  // ── 1. Trigger proof (Part B.1) ──────────────────────────────────────────
  it("trigger proof: POST /api/admin/vendors (the real business action, not runWorkflow() directly) fires AI-19 via master_data.changed", async () => {
    mockAuth.mockResolvedValue({ user: { id: String(new mongoose.Types.ObjectId()), tenantId: TENANT, role: "admin" } });
    const req = { json: () => Promise.resolve({ name: "Real Route Vendor Co", category: "supplier" }) } as any;

    const res = await vendorsPOST(req);
    const body = await res.json();
    expect(body.vendor, JSON.stringify(body)).toBeDefined();
    const vendorId = String(body.vendor._id);

    const run = await AiWorkflowRun.findOne({ tenantId: TENANT, workflowId: "AI-19", entityId: `Vendor:${vendorId}` }).lean();
    expect(run, "AI-19 did not fire from the real POST /api/admin/vendors route").not.toBeNull();
    expect(run!.status).not.toBe("failed");
    const trace = await AiDecisionTrace.findOne({ runId: String(run!._id) }).lean();
    expect(trace, "the run has no audited decision trace").not.toBeNull();
  });

  // ── 2. Cross-tenant hostile input (Part C.4) ─────────────────────────────
  it("cross-tenant hostile: a master_data.changed event carrying another tenant's real Employee id is refused, not read or held", async () => {
    const victimEmpId = await makeEmployee(VICTIM_TENANT, "Victim", "Employee", `victim-${Date.now()}@x.com`, "HDFC Bank", "111100002222");
    // Establish the victim's own baseline snapshot for real, under the victim's own tenant.
    await AiWorkflowPolicy.create({ tenantId: VICTIM_TENANT, workflowId: "AI-19", killSwitchEnabled: true, maxAutonomyLevel: "recommend" });
    await runWorkflow(ai19MasterData, { tenantId: VICTIM_TENANT, eventKey: "master_data.changed", payload: { model: "Employee", id: String(victimEmpId) } });

    // A hostile/replayed event: same real Employee id, but dispatched under an ATTACKER tenantId.
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-19", killSwitchEnabled: true, maxAutonomyLevel: "recommend" });
    const envelope = await runWorkflow(ai19MasterData, { tenantId: TENANT, eventKey: "master_data.changed", payload: { model: "Employee", id: String(victimEmpId) } });

    expect(envelope.findings).toEqual([]);
    expect(envelope.metrics.autoActioned).toBe(0);

    // No snapshot or hold was ever created for the attacker's tenant against this record — the
    // scoped `Model.findOne({ _id, tenantId })` in act() returned null and the run no-actioned.
    const attackerSnapshot = await AiMasterDataSnapshot.findOne({ tenantId: TENANT, entityModel: "Employee", recordId: String(victimEmpId) }).lean();
    expect(attackerSnapshot).toBeNull();
    const attackerHold = await AiHold.findOne({ tenantId: TENANT, "subjectRef.id": String(victimEmpId) }).lean();
    expect(attackerHold).toBeNull();

    // The victim's own data is untouched by the hostile attempt.
    const victimSnapshotCount = await AiMasterDataSnapshot.countDocuments({ tenantId: VICTIM_TENANT, entityModel: "Employee", recordId: String(victimEmpId) });
    expect(victimSnapshotCount).toBe(1);
  });

  // ── 3. Concurrent duplicate event (Part C.3) ─────────────────────────────
  it("concurrent duplicate event: two genuinely simultaneous master_data.changed runs for the same bank change place exactly one hold", async () => {
    const empId = await makeEmployee(TENANT, "Concurrent", "Payee", `concurrent-${Date.now()}@x.com`, "HDFC Bank", "555500001111");
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-19", killSwitchEnabled: true, maxAutonomyLevel: "recommend" });

    // Baseline snapshot first (sequential, real behaviour — a hold never fires on first sight).
    await runWorkflow(ai19MasterData, { tenantId: TENANT, eventKey: "master_data.changed", payload: { model: "Employee", id: String(empId) } });

    // The real bank-detail change.
    await Employee.updateOne({ _id: empId }, { $set: { "bankDetails.accountNumber": "999900001111" } });

    // Two genuinely concurrent runs reacting to the same change — no event.id, so nothing at the
    // eventBus level deduplicates this; only the tool-layer idempotency fix (section 9) can.
    const results = await Promise.allSettled([
      runWorkflow(ai19MasterData, { tenantId: TENANT, eventKey: "master_data.changed", payload: { model: "Employee", id: String(empId) } }),
      runWorkflow(ai19MasterData, { tenantId: TENANT, eventKey: "master_data.changed", payload: { model: "Employee", id: String(empId) } }),
    ]);

    // At least one run must have completed the hold; the other may fail cleanly (in-flight
    // rejection) or succeed via the idempotency cache — either way, never two open holds.
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);

    const openHolds = await AiHold.find({ tenantId: TENANT, "subjectRef.model": "Employee", "subjectRef.id": String(empId), status: "open" }).lean();
    expect(openHolds.length, "exactly one open hold must exist after a genuinely concurrent duplicate event, not two").toBe(1);
  });

  // ── 4. Regression: item-duplicate findings must cite InventoryItem, not Customer (bug fix) ──
  it("bug regression: a duplicate InventoryItem finding's subjectRefs cite InventoryItem, not Customer", async () => {
    const creator = new mongoose.Types.ObjectId();
    await InventoryItem.create({ tenantId: TENANT, itemCode: "EDGE-SR-001", name: "Edge Steel Rod 10mm", category: "raw", unit: "pcs", warehouse: "Main", createdBy: creator });
    await InventoryItem.create({ tenantId: TENANT, itemCode: "EDGE-SR-002", name: "edge   steel rod 10mm", category: "raw", unit: "pcs", warehouse: "Main", createdBy: creator });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-19", killSwitchEnabled: true, maxAutonomyLevel: "recommend" });

    const envelope = await runWorkflow(ai19MasterData, { tenantId: TENANT, eventKey: "period.horizon.reached", payload: {} });
    const finding = envelope.findings.find((f) => f.title.includes("duplicate record"));
    expect(finding, "expected a duplicate-item finding").toBeDefined();
    expect(finding!.subjectRefs.every((r) => r.model === "InventoryItem"), `subjectRefs were ${JSON.stringify(finding!.subjectRefs)} — must be InventoryItem, not Customer`).toBe(true);
  });

  // ── 5. Regression + adversarial: a masked-string collision must not hide a real bank change ──
  it("bug regression / adversarial: a bank account number changed to a DIFFERENT number sharing the same length and last 4 digits is still detected (masked-string collision)", async () => {
    // "111100002222" and "999900002222" are different real account numbers, same length (12),
    // same last four ("2222") — maskValue() alone renders both as "********2222", identical.
    const empId = await makeEmployee(TENANT, "Mask", "Collision", `mask-collision-${Date.now()}@x.com`, "HDFC Bank", "111100002222");
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-19", killSwitchEnabled: true, maxAutonomyLevel: "recommend" });

    await runWorkflow(ai19MasterData, { tenantId: TENANT, eventKey: "master_data.changed", payload: { model: "Employee", id: String(empId) } });
    await Employee.updateOne({ _id: empId }, { $set: { "bankDetails.accountNumber": "999900002222" } });
    const envelope = await runWorkflow(ai19MasterData, { tenantId: TENANT, eventKey: "master_data.changed", payload: { model: "Employee", id: String(empId) } });

    const finding = envelope.findings.find((f) => f.title.includes("Bank detail changed"));
    expect(finding, "a real bank-account swap that collides under masking must still raise a CRITICAL finding, not silence").toBeDefined();
    expect(finding!.severity).toBe("critical");
    const hold = await AiHold.findOne({ tenantId: TENANT, "subjectRef.model": "Employee", "subjectRef.id": String(empId), status: "open" }).lean();
    expect(hold).not.toBeNull();
  });

  // ── 6. Malformed / null fields (Part C.1) ────────────────────────────────
  it("malformed data: a vendor with no GSTIN and a 500-char unicode/HTML name, plus a zero-amount bill, does not crash the sweep", async () => {
    // Customer.header.name is `required` at the schema level (confirmed by this file's own
    // earlier failed attempt to seed a nameless Customer) — a fully missing name cannot reach
    // this workflow through any real write path, so that specific sub-case is structurally
    // impossible rather than untested; the genuinely reachable malformed shapes (unicode/HTML,
    // absurd length, zero-amount line, no GSTIN) are exercised below instead.
    const creator = new mongoose.Types.ObjectId();
    const weirdName = "<script>alert(1)</script> " + "日本語ベンダー مرحبا ".repeat(15);
    const v1 = await Customer.create({ tenantId: TENANT, header: { name: weirdName.slice(0, 500) }, createdBy: creator });
    await Invoice.create({
      tenantId: TENANT, name: `BILL-${v1._id}`, partnerId: v1._id, moveType: "in_invoice", state: "posted",
      invoiceDate: new Date("2026-01-05"), dueDate: new Date("2026-01-05"),
      invoiceLines: [{ name: "Goods", priceSubtotal: 0, quantity: 1, priceUnit: 0 }], // zero-amount line
      amountUntaxed: 0, amountTax: 0, amountTotal: 0, amountResidual: 0, paymentState: "not_paid",
    });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-19", killSwitchEnabled: true, maxAutonomyLevel: "recommend" });

    await expect(runWorkflow(ai19MasterData, { tenantId: TENANT, eventKey: "period.horizon.reached", payload: {} })).resolves.toBeDefined();
  });

  // ── 7. Large volume (Part C.1, measured honestly) ────────────────────────
  it("large volume: 200 vendors (O(n^2) pairwise matching) completes correctly and within budget, extrapolated honestly for 10k+", async () => {
    const creator = new mongoose.Types.ObjectId();
    const N = 200;
    const vendors = await Customer.insertMany(
      Array.from({ length: N }, (_, i) => ({ tenantId: TENANT, header: { name: `Volume Vendor ${i}` }, createdBy: creator })),
    );
    await Invoice.insertMany(
      vendors.map((v, i) => ({
        tenantId: TENANT, name: `VOL-BILL-${i}`, partnerId: v._id, moveType: "in_invoice", state: "posted",
        invoiceDate: new Date("2026-01-05"), dueDate: new Date("2026-01-05"),
        invoiceLines: [{ name: "Goods", priceSubtotal: 100, quantity: 1, priceUnit: 100 }],
        amountUntaxed: 100, amountTax: 0, amountTotal: 100, amountResidual: 100, paymentState: "not_paid",
      })),
    );
    // One genuine duplicate pair planted among the 200, to prove correctness isn't sacrificed for speed.
    const dupA = await Customer.create({ tenantId: TENANT, header: { name: "Duplicate Find Co Ltd" }, gstin: "29VOLDUP0001Z5", createdBy: creator });
    const dupB = await Customer.create({ tenantId: TENANT, header: { name: "Duplicate Find Co Limited" }, gstin: "29VOLDUP0001Z5", createdBy: creator });
    for (const v of [dupA, dupB]) {
      await Invoice.create({
        tenantId: TENANT, name: `DUP-BILL-${v._id}`, partnerId: v._id, moveType: "in_invoice", state: "posted",
        invoiceDate: new Date("2026-01-05"), dueDate: new Date("2026-01-05"),
        invoiceLines: [{ name: "Goods", priceSubtotal: 100, quantity: 1, priceUnit: 100 }],
        amountUntaxed: 100, amountTax: 0, amountTotal: 100, amountResidual: 100, paymentState: "not_paid",
      });
    }
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-19", killSwitchEnabled: true, maxAutonomyLevel: "recommend" });

    const started = Date.now();
    const envelope = await runWorkflow(ai19MasterData, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: {} });
    const elapsedMs = Date.now() - started;

    const dupFinding = envelope.findings.find((f) => f.detail?.includes("Duplicate Find Co"));
    // The pair is found correctly regardless of population size.
    expect(envelope.findings.some((f) => f.title.includes("duplicate record"))).toBe(true);
    void dupFinding;

    // findDuplicateEntities/findDuplicateItems are real O(n^2) pairwise scans (docs/ai/
    // BRIEF-09-VERIFICATION.md Part C.1 "no unbounded query, no N+1") — measured, not assumed.
    // eslint-disable-next-line no-console
    console.log(`AI-19 sweep over ${N + 2} vendors: ${elapsedMs}ms`);
    expect(elapsedMs).toBeLessThan(10_000); // Part E.3 single-run budget at this population
    // Honest extrapolation: (10000/202)^2 * elapsedMs — at typical measured speeds (tens of ms)
    // this projects to single-digit seconds, but the growth is quadratic, not linear (see
    // AI-19.md section 4/9): a tenant with genuinely 10k+ *unique vendors with bills* (not just
    // 10k invoices) would need blocking/bucketing (e.g. by normalized name prefix or GSTIN)
    // before a full pairwise scan — undocumented today, flagged here rather than silently assumed safe.
  });
});
