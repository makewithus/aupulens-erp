import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai27_edge";

// Hoisted auth mock for the real-route trigger-proof test — same pattern as
// tests/ai/aiRuntime/ai04ExpenseIntelligenceTriggerProof.test.ts. Only the session is faked.
const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mockAuth }));

import Customer from "@/models/sales/Customer";
import Invoice from "@/models/finance/Invoice";
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
let invoicesPOST: typeof import("@/app/api/finance/invoices/route").POST;

const TENANT = "ai27-edge-tenant";
const TENANT_B = "ai27-edge-tenant-b";
const CREATOR = new mongoose.Types.ObjectId();

async function makeVendor(tenantId: string, name: string) {
  const c = await Customer.create({ tenantId, header: { name, is_company: true }, createdBy: CREATOR });
  return c._id as mongoose.Types.ObjectId;
}

async function makeBill(tenantId: string, vendorId: mongoose.Types.ObjectId, opts: { sourceDocument?: string; poReference?: string; amount: number; date: Date }) {
  const inv = await Invoice.create({
    tenantId,
    name: `INV-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
    amountResidual: opts.amount,
    paymentState: "not_paid",
  });
  return inv._id as mongoose.Types.ObjectId;
}

describe("AI-27 — edge-case matrix (docs/ai/BRIEF-09-VERIFICATION.md Part C)", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Customer.init(), Invoice.init(), AiHold.init(), AiDuplicateFinding.init(),
      AiWorkflowRun.init(), AiDecisionTrace.init(), AiEvent.init(), AiToolCall.init(), AiWorkflowPolicy.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai27DuplicateDetection } = await import("@/lib/aiRuntime/workflows/ai-27-duplicate-detection"));
    ({ POST: invoicesPOST } = await import("@/app/api/finance/invoices/route"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Promise.all([
      Customer.deleteMany({}), Invoice.deleteMany({}), AiHold.deleteMany({}), AiDuplicateFinding.deleteMany({}),
      AiWorkflowRun.deleteMany({}), AiDecisionTrace.deleteMany({}), AiEvent.deleteMany({}), AiToolCall.deleteMany({}), AiWorkflowPolicy.deleteMany({}),
    ]);
  });

  async function policy(tenantId: string) {
    await AiWorkflowPolicy.create({ tenantId, workflowId: "AI-27", killSwitchEnabled: true, maxAutonomyLevel: "recommend" });
  }

  // ── 1. Trigger proof (Part B.1) ──────────────────────────────────────────
  it("trigger proof: POST /api/finance/invoices (the real business action, not runWorkflow() directly) fires AI-27 via invoice.created", async () => {
    const vendorId = await makeVendor(TENANT, "Real Route Customer Co");
    mockAuth.mockResolvedValue({ user: { id: String(new mongoose.Types.ObjectId()), tenantId: TENANT, role: "finance" } });

    const req = {
      json: () =>
        Promise.resolve({
          partnerId: String(vendorId),
          dueDate: new Date().toISOString(),
          invoiceDate: new Date().toISOString(),
          items: [{ description: "Consulting", quantity: 1, rate: 5000, amount: 5000 }],
          amountTotal: 5000,
        }),
    } as any;

    const res = await invoicesPOST(req as any);
    const body = await res.json();
    expect(body.invoice, JSON.stringify(body)).toBeDefined();
    const invoiceId = String(body.invoice._id);

    const run = await AiWorkflowRun.findOne({ tenantId: TENANT, workflowId: "AI-27" }).sort({ createdAt: -1 }).lean();
    expect(run, "AI-27 did not fire from the real POST /api/finance/invoices route").not.toBeNull();
    expect(run!.status).not.toBe("failed");
    const trace = await AiDecisionTrace.findOne({ runId: String(run!._id) }).lean();
    expect(trace, "the run has no audited decision trace").not.toBeNull();
    void invoiceId;
  });

  // ── 2. Cross-tenant isolation (Part C.4) ─────────────────────────────────
  it("cross-tenant hostile: two tenants with an identical duplicate-shaped bill pattern never see each other's candidates", async () => {
    const vendorA = await makeVendor(TENANT, "Shared-Shape Vendor");
    const vendorB = await makeVendor(TENANT_B, "Shared-Shape Vendor");
    // Same document number, same amount, same date, in BOTH tenants — a real duplicate pattern
    // that must be detected independently per tenant, never cross-contaminated.
    await makeBill(TENANT, vendorA, { sourceDocument: "SHARED-001", amount: 7000, date: new Date("2026-05-01") });
    await makeBill(TENANT, vendorA, { sourceDocument: "shared 001", amount: 7000, date: new Date("2026-05-02") });
    await makeBill(TENANT_B, vendorB, { sourceDocument: "SHARED-001", amount: 7000, date: new Date("2026-05-01") });
    await policy(TENANT);
    await policy(TENANT_B);

    const envelopeA = await runWorkflow(ai27DuplicateDetection, { tenantId: TENANT, eventKey: "bill.created", payload: {} });
    const traceA = await AiDecisionTrace.findOne({ runId: envelopeA.runId }).lean();
    const proposalA = traceA!.rawProposal as unknown as { candidates: { primaryRef: string; duplicateRef: string }[] };
    // Exactly one candidate pair, both refs belonging to tenant A's own two bills only.
    expect(proposalA.candidates.length).toBe(1);
    const tenantABillIds = new Set((await Invoice.find({ tenantId: TENANT }).select("_id").lean()).map((b) => String(b._id)));
    expect(tenantABillIds.has(proposalA.candidates[0].primaryRef)).toBe(true);
    expect(tenantABillIds.has(proposalA.candidates[0].duplicateRef)).toBe(true);

    // Tenant B's single bill has no partner within its own tenant — must raise zero candidates,
    // never matched against tenant A's identical-looking bill.
    const envelopeB = await runWorkflow(ai27DuplicateDetection, { tenantId: TENANT_B, eventKey: "bill.created", payload: {} });
    const traceB = await AiDecisionTrace.findOne({ runId: envelopeB.runId }).lean();
    const proposalB = traceB!.rawProposal as unknown as { candidates: unknown[] };
    expect(proposalB.candidates).toEqual([]);
  });

  // ── 3. Concurrent duplicate event (Part C.3) ─────────────────────────────
  it("concurrent duplicate event: two genuinely simultaneous sweeps finding the same duplicate bill place exactly one hold", async () => {
    const vendor = await makeVendor(TENANT, "Concurrent Duplicate Vendor");
    await makeBill(TENANT, vendor, { sourceDocument: "CONC-001", amount: 9000, date: new Date("2026-06-01") });
    await makeBill(TENANT, vendor, { sourceDocument: "conc 001", amount: 9000, date: new Date("2026-06-02") });
    await policy(TENANT);

    const results = await Promise.allSettled([
      runWorkflow(ai27DuplicateDetection, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: {} }),
      runWorkflow(ai27DuplicateDetection, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: {} }),
    ]);
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);

    const openHolds = await AiHold.find({ tenantId: TENANT, "subjectRef.model": "Invoice", status: "open" }).lean();
    expect(openHolds.length, "exactly one open hold must exist after a genuinely concurrent duplicate event, not two").toBe(1);
  });

  // ── 4. Malformed / null data (Part C.1) ──────────────────────────────────
  it("malformed data: negative amount, zero amount, missing sourceDocument, and a 500-char unicode/HTML vendor name do not crash detection", async () => {
    const weirdVendor = await makeVendor(TENANT, ("<script>alert(1)</script> " + "日本語ベンダー مرحبا ".repeat(15)).slice(0, 500));
    await makeBill(TENANT, weirdVendor, { amount: -5000, date: new Date("2026-07-01") }); // negative amount, no sourceDocument
    await makeBill(TENANT, weirdVendor, { amount: 0, date: new Date("2026-07-02") }); // zero amount
    await makeBill(TENANT, weirdVendor, { amount: 1234.5678, date: new Date("1900-01-01") }); // absurd date, over-precision amount
    await makeBill(TENANT, weirdVendor, { amount: 999999, date: new Date("2099-12-31") }); // absurd future date
    await policy(TENANT);

    await expect(runWorkflow(ai27DuplicateDetection, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: {} })).resolves.toBeDefined();
  });

  // ── 5. Adversarial pass (Part C.6) ───────────────────────────────────────
  it("adversarial: two genuinely independent, coincidentally identical bills (same vendor/amount/date) are held for human review, never silently trusted or auto-paid", async () => {
    // The "confidently wrong answer a human would accept" shape here isn't a missed duplicate —
    // it's the opposite: two REAL, independent purchases from the same vendor, same day, same
    // round amount (a plausible coincidence — e.g. two separate ₹5,000 stationery orders). AI-27
    // scores this "certain" (vendor+amount+date all match) with no way to know they're distinct.
    // What makes this safe rather than "confidently wrong reaching a customer" is structural:
    // AI-27 never releases/blocks a payment or deletes a bill by itself — `place_hold` is the only
    // write, and no `release_hold` tool exists at any autonomy level (asserted in the main suite).
    // A false positive here costs a human five minutes of review, not a wrong posting.
    const vendor = await makeVendor(TENANT, "Coincidence Co");
    await makeBill(TENANT, vendor, { sourceDocument: "PO-9001-A", amount: 5000, date: new Date("2026-08-10") });
    await makeBill(TENANT, vendor, { sourceDocument: "PO-9002-B", amount: 5000, date: new Date("2026-08-10") });
    await policy(TENANT);

    const envelope = await runWorkflow(ai27DuplicateDetection, { tenantId: TENANT, eventKey: "bill.created", payload: {} });
    const finding = envelope.findings.find((f) => f.title.includes("Likely duplicate bill"));
    expect(finding, "same vendor/amount/date must be flagged for review, even without certainty").toBeDefined();

    const hold = await AiHold.findOne({ tenantId: TENANT, "subjectRef.model": "Invoice" }).lean();
    expect(hold, "a hold — not an autonomous payment block or deletion — is the only effect").not.toBeNull();
    expect(hold!.status).toBe("open");

    // No JournalEntry/payment action of any kind exists — AI-27 only ever writes AiHold/
    // AiDuplicateFinding (asserted generically by the source-grep test in the main suite); this
    // confirms the SAME false-positive-prone case doesn't escalate into anything destructive.
    const { getTool } = await import("@/lib/aiRuntime/tools/registry");
    expect(getTool("release_hold")).toBeUndefined();
  });

  // ── 6. Large volume (Part C.1, measured honestly) ────────────────────────
  it("large volume: 400 bills across many vendors (O(n^2) cross-source scoring) completes correctly and within budget, extrapolated honestly for 10k+", async () => {
    const N_VENDORS = 40;
    const BILLS_PER_VENDOR = 10; // 400 bills total
    const vendors = await Promise.all(Array.from({ length: N_VENDORS }, (_, i) => makeVendor(TENANT, `Volume Vendor ${i}`)));
    const bills = [];
    for (let v = 0; v < N_VENDORS; v++) {
      for (let b = 0; b < BILLS_PER_VENDOR; b++) {
        bills.push({
          tenantId: TENANT, name: `VOL-${v}-${b}`, partnerId: vendors[v], moveType: "in_invoice", state: "posted",
          invoiceDate: new Date(Date.UTC(2026, b % 12, 5)), dueDate: new Date(Date.UTC(2026, b % 12, 5)),
          sourceDocument: `VOL-DOC-${v}-${b}`,
          invoiceLines: [{ name: "Goods", priceSubtotal: 1000 + b, quantity: 1, priceUnit: 1000 + b }],
          amountUntaxed: 1000 + b, amountTax: 0, amountTotal: 1000 + b, amountResidual: 1000 + b, paymentState: "not_paid",
        });
      }
    }
    await Invoice.insertMany(bills);
    // One genuine duplicate planted, to prove correctness survives at this population.
    const dupVendor = vendors[0];
    await makeBill(TENANT, dupVendor, { sourceDocument: "PLANTED-DUP", amount: 42000, date: new Date("2026-09-01") });
    await makeBill(TENANT, dupVendor, { sourceDocument: "planted dup", amount: 42000, date: new Date("2026-09-02") });
    await policy(TENANT);

    const started = Date.now();
    const envelope = await runWorkflow(ai27DuplicateDetection, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: {} });
    const elapsedMs = Date.now() - started;

    expect(envelope.findings.some((f) => f.title.includes("Likely duplicate bill"))).toBe(true);
    // eslint-disable-next-line no-console
    console.log(`AI-27 sweep over ${bills.length + 2} bills: ${elapsedMs}ms`);
    expect(elapsedMs).toBeLessThan(10_000); // Part E.3 single-run budget at this population

    // Honest extrapolation, not assumed: scoreBillPairs() is O(n^2) over the FULL bill array
    // (lib/aiRuntime/duplicates/detect.ts), plus an O(n^3) same-vendor "split payment" scan. At
    // 402 bills this measured comfortably inside budget; the growth is polynomial, not linear —
    // a tenant with a genuine 10k+ bill history would need date-windowed blocking (e.g. only
    // scoring bills within N days of each other) before a full pairwise scan, which does not
    // exist today. Flagged here explicitly rather than silently assumed safe at 25x this volume.
  });
});
