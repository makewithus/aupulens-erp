import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai01_edge";

// The real extraction step (lib/docIntel/extractor.ts) calls out to Azure OpenAI — no live model
// is available in this environment (docs/ai/BRIEF-09-VERIFICATION.md's own admission). Mocking it
// is what lets the TRIGGER-PROOF test below exercise the real route handler
// (app/api/document-intelligence/extract/route.ts) end-to-end — auth, file validation, OCR
// extraction, ExtractedDocument persistence, duplicate pre-check, safeEmitEvent — with only the
// one genuinely-unavailable dependency (the model call) stubbed to a deterministic result.
const { mockAuth, mockExtractDocument } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockExtractDocument: vi.fn(),
}));
vi.mock("@/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/docIntel/extractor", () => ({ extractDocument: mockExtractDocument }));

import ExtractedDocument from "@/models/ai/ExtractedDocument";
import Vendor from "@/models/admin/Vendor";
import Invoice from "@/models/finance/Invoice";
import User from "@/models/auth/User";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";
import AiToolCall from "@/models/ai/AiToolCall";
import AiEvent from "@/models/ai/AiEvent";
import { DOC_INTEL_STATUS, DOC_INTEL_TYPE } from "@/lib/docIntel/extractionSchemas";

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai01DocumentIngestion: typeof import("@/lib/aiRuntime/workflows/ai-01-document-ingestion").ai01DocumentIngestion;
let extractRoutePOST: typeof import("@/app/api/document-intelligence/extract/route").POST;

const TENANT = "ai01-edge-tenant";

function baseExtraction(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    vendorName: "Acme Supplies",
    vendorGstin: "",
    billNumber: `BILL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    billDate: new Date().toISOString(),
    dueDate: new Date().toISOString(),
    currency: "INR",
    poReference: "",
    lineItems: [{ description: "Widgets", quantity: 2, unitPrice: 500, amount: 1000 }],
    subtotal: 1000,
    taxAmount: 0,
    totalAmount: 1000,
    confidence: 90,
    ...overrides,
  };
}

async function makeExtractedDocument(extraction: Record<string, unknown>, tenantId = TENANT) {
  const doc = await ExtractedDocument.create({
    tenantId,
    docType: DOC_INTEL_TYPE.VENDOR_BILL,
    fileName: "bill.pdf",
    status: DOC_INTEL_STATUS.EXTRACTED,
    extraction,
    aiConfidence: extraction.confidence ?? 90,
    createdBy: new mongoose.Types.ObjectId(),
  });
  return String(doc._id);
}

async function makeVendor(name: string, tenantId = TENANT) {
  const v = await Vendor.create({ tenantId, name, category: "General" });
  return String(v._id);
}

async function makeFinanceUser(tenantId = TENANT) {
  const u = await User.create({
    tenantId,
    name: "Finance User",
    email: `finance-${Date.now()}-${Math.random()}@example.com`,
    phone: "9999999999",
    password: "hashed",
    role: "finance",
    status: "active",
  });
  return String(u._id);
}

describe("AI-01 — trigger proof and edge-case matrix (Chunk 9 verification)", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      ExtractedDocument.init(),
      Vendor.init(),
      Invoice.init(),
      User.init(),
      AiWorkflowRun.init(),
      AiDecisionTrace.init(),
      AiWorkflowPolicy.init(),
      AiToolCall.init(),
      AiEvent.init(),
    ]);

    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai01DocumentIngestion } = await import("@/lib/aiRuntime/workflows/ai-01-document-ingestion"));
    ({ POST: extractRoutePOST } = await import("@/app/api/document-intelligence/extract/route"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Promise.all([
      ExtractedDocument.deleteMany({}),
      Vendor.deleteMany({}),
      Invoice.deleteMany({}),
      User.deleteMany({}),
      AiWorkflowRun.deleteMany({}),
      AiDecisionTrace.deleteMany({}),
      AiToolCall.deleteMany({}),
      AiEvent.deleteMany({}),
      AiWorkflowPolicy.deleteMany({}),
    ]);
    vi.clearAllMocks();
  });

  // ── 1. Trigger proof — the REAL route, not runWorkflow() called directly ────────────────────
  it("TRIGGER PROOF: POST /api/document-intelligence/extract (the real upload route) fires AI-01 as a side effect and drafts an Invoice — no code here calls runWorkflow() or the workflow module directly", async () => {
    await makeVendor("Acme Supplies");
    // A real, persisted User is required — the real check_permission tool (rbacRouter.ts,
    // invoked inside the draft_bill tool call) looks this id up via User.findOne(); a
    // synthetic id with no matching User document fails permission and silently drops to
    // propose-only, which is what first exposed this ordering requirement.
    const userId = await makeFinanceUser();
    mockAuth.mockResolvedValue({ user: { id: userId, tenantId: TENANT } });
    mockExtractDocument.mockResolvedValue({ ok: true, data: baseExtraction({ billNumber: "TRIGGER-001" }) });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-01", killSwitchEnabled: true, maxAutonomyLevel: "draft" });

    // .txt (not .pdf) so the REAL lib/docIntel/textExtract.ts::extractContent runs unmocked
    // (raw UTF-8 passthrough) — only the genuinely-unavailable model call (extractDocument) is
    // stubbed; PDF parsing of a fake byte buffer would fail for reasons unrelated to AI-01 itself.
    const file = new File([Buffer.from("Vendor bill from Acme Supplies, total 1000 INR")], "bill.txt", { type: "text/plain" });
    const form = new FormData();
    form.set("file", file);
    form.set("docType", DOC_INTEL_TYPE.VENDOR_BILL);
    const req = { formData: () => Promise.resolve(form) } as any;

    const res = await extractRoutePOST(req);
    const body = await res.json();
    expect(body.success).toBe(true);

    // The route's OWN job (extraction + persistence) succeeded — now prove AI-01 fired as an
    // ADDITIVE side effect of that real business action, via the real safeEmitEvent path.
    const run = await AiWorkflowRun.findOne({ tenantId: TENANT, workflowId: "AI-01" }).lean();
    expect(run).not.toBeNull();
    expect(run!.status).toBe("completed");

    const invoice = await Invoice.findOne({ tenantId: TENANT, moveType: "in_invoice" }).lean();
    expect(invoice).not.toBeNull();
    expect((invoice as { state?: string })!.state).toBe("draft");
  });

  // ── 4. Edge-case matrix ──────────────────────────────────────────────────────────────────────

  it("C.1 malformed: a vendor name containing regex metacharacters does not throw and does not false-match an unrelated vendor (regression for the unescaped-$regex bug)", async () => {
    // "A.B. Traders" as a raw regex would match "AxBxTraders" too (unescaped `.` = any char).
    await makeVendor("AxBxTraders");
    const userId = await makeFinanceUser();
    const docId = await makeExtractedDocument(baseExtraction({ vendorName: "A.B. Traders" }));

    const envelope = await runWorkflow(ai01DocumentIngestion, {
      tenantId: TENANT,
      eventKey: "document.received",
      payload: { extractedDocumentId: docId, actingUserId: userId },
    });

    // Must NOT silently bind to the lookalike "AxBxTraders" — no exact vendor exists, so this
    // is the honest "unknown vendor" escalation, not a false match.
    expect(envelope.status).toBe("escalated");
    expect(envelope.findings[0].title).toContain("Unknown vendor");
  });

  it("C.1 malformed: an unbalanced-paren vendor name (invalid raw regex) does not crash the run — escalates cleanly instead of throwing", async () => {
    const userId = await makeFinanceUser();
    const docId = await makeExtractedDocument(baseExtraction({ vendorName: "Bosch (India Pvt Ltd" }));

    await expect(
      runWorkflow(ai01DocumentIngestion, {
        tenantId: TENANT,
        eventKey: "document.received",
        payload: { extractedDocumentId: docId, actingUserId: userId },
      }),
    ).resolves.toMatchObject({ status: "escalated" });
  });

  it("C.6 adversarial — confidently wrong answer: a vendor name matching TWO real Vendor records escalates as ambiguous instead of silently binding to one (regression for the arbitrary-pick bug)", async () => {
    // Vendor.name has no unique index (models/admin/Vendor.ts) — two real vendors with the
    // same name is a legal, real-world state (two branches, an un-merged duplicate entry).
    await makeVendor("Global Traders Pvt Ltd");
    await makeVendor("Global Traders Pvt Ltd");
    const userId = await makeFinanceUser();
    const docId = await makeExtractedDocument(baseExtraction({ vendorName: "Global Traders Pvt Ltd" }));

    const envelope = await runWorkflow(ai01DocumentIngestion, {
      tenantId: TENANT,
      eventKey: "document.received",
      payload: { extractedDocumentId: docId, actingUserId: userId },
    });

    expect(envelope.status).toBe("escalated");
    expect(envelope.findings[0].title).toContain("multiple records");
    const invoiceCount = await Invoice.countDocuments({ tenantId: TENANT });
    expect(invoiceCount).toBe(0);
  });

  it("C.1 null/missing fields: an extraction with no line items at all (subtotal/total only) is still arithmetic-checked correctly, not a false pass", async () => {
    await makeVendor("Acme Supplies");
    const userId = await makeFinanceUser();
    // lineItems: [] with subtotal/total that DON'T reconcile — the empty-array short-circuit in
    // arithmeticOk() must not vacuously pass when total itself is wrong.
    const docId = await makeExtractedDocument(baseExtraction({ lineItems: [], subtotal: 1000, taxAmount: 0, totalAmount: 5000 }));

    const envelope = await runWorkflow(ai01DocumentIngestion, {
      tenantId: TENANT,
      eventKey: "document.received",
      payload: { extractedDocumentId: docId, actingUserId: userId },
    });

    expect(envelope.status).toBe("escalated");
    expect(envelope.findings[0].title).toContain("reconcile");
  });

  it("C.3 concurrent duplicate event: the SAME document.received event fired simultaneously produces exactly one Invoice", async () => {
    await makeVendor("Acme Supplies");
    const userId = await makeFinanceUser();
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-01", killSwitchEnabled: true, maxAutonomyLevel: "draft" });
    const docId = await makeExtractedDocument(baseExtraction({ billNumber: "CONCURRENT-001" }));
    const event = await AiEvent.create({ tenantId: TENANT, eventKey: "document.received", payload: { extractedDocumentId: docId, actingUserId: userId } });
    const triggerEvent = { id: String(event._id), tenantId: TENANT, eventKey: "document.received", payload: { extractedDocumentId: docId, actingUserId: userId } };

    const results = await Promise.allSettled([
      runWorkflow(ai01DocumentIngestion, triggerEvent),
      runWorkflow(ai01DocumentIngestion, triggerEvent),
    ]);

    // Whether or not both promises resolve cleanly, the observable side effect must be singular.
    const invoiceCount = await Invoice.countDocuments({ tenantId: TENANT, moveType: "in_invoice" });
    expect(invoiceCount).toBe(1);
    const runCount = await AiWorkflowRun.countDocuments({ workflowId: "AI-01", triggerEventId: event._id });
    expect(runCount).toBe(1);
    void results;
  });

  it("C.4 cross-tenant hostile input: an extractedDocumentId belonging to tenant B, referenced from a tenant-A event, is never read or actioned (regression for the unscoped-findById cross-tenant bug)", async () => {
    const TENANT_B = "ai01-edge-tenant-b";
    await makeVendor("Acme Supplies", TENANT_B);
    const docId = await makeExtractedDocument(baseExtraction({ vendorName: "Acme Supplies" }), TENANT_B);
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-01", killSwitchEnabled: true, maxAutonomyLevel: "draft" });

    // Hostile: event claims tenantId TENANT but references tenant-B's ExtractedDocument id.
    // BEFORE the fix, extract() used `ExtractedDocument.findById(id)` with no tenant filter —
    // this would have SUCCEEDED, silently reading tenant B's confidential bill data into a run
    // scoped to tenant A. AFTER the fix (tenantId now part of the query), the lookup correctly
    // finds nothing under tenant A's context and the run fails loudly (escalates via a thrown
    // error, caught by the executor, never a silent guess) rather than leaking cross-tenant.
    await expect(
      runWorkflow(ai01DocumentIngestion, {
        tenantId: TENANT,
        eventKey: "document.received",
        payload: { extractedDocumentId: docId, actingUserId: "hostile-user" },
      }),
    ).rejects.toThrow(/not found/);

    const invoiceCount = await Invoice.countDocuments({ tenantId: TENANT });
    expect(invoiceCount).toBe(0);
    // And tenant B's own data must be completely untouched by tenant A's hostile event.
    const tenantBDoc = await ExtractedDocument.findById(docId).lean();
    expect((tenantBDoc as { status?: string })!.status).toBe(DOC_INTEL_STATUS.EXTRACTED);
  });
});
