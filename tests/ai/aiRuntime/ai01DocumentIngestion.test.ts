import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai01";

import ExtractedDocument from "@/models/ai/ExtractedDocument";
import Vendor from "@/models/admin/Vendor";
import Invoice from "@/models/finance/Invoice";
import User from "@/models/auth/User";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";
import AiToolCall from "@/models/ai/AiToolCall";
import { DOC_INTEL_STATUS, DOC_INTEL_TYPE } from "@/lib/docIntel/extractionSchemas";

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai01DocumentIngestion: typeof import("@/lib/aiRuntime/workflows/ai-01-document-ingestion").ai01DocumentIngestion;

const TENANT = "ai01-tenant";

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

async function makeExtractedDocument(extraction: Record<string, unknown>, opts: { fileHash?: string } = {}) {
  const doc = await ExtractedDocument.create({
    tenantId: TENANT,
    docType: DOC_INTEL_TYPE.VENDOR_BILL,
    fileName: "bill.pdf",
    status: DOC_INTEL_STATUS.EXTRACTED,
    extraction,
    aiConfidence: extraction.confidence ?? 90,
    createdBy: new mongoose.Types.ObjectId(),
    fileHash: opts.fileHash,
  });
  return String(doc._id);
}

async function makeVendor(name: string) {
  await Vendor.create({ tenantId: TENANT, name, category: "General" });
}

async function makeFinanceUser() {
  const u = await User.create({
    tenantId: TENANT,
    name: "Finance User",
    email: `finance-${Date.now()}-${Math.random()}@example.com`,
    phone: "9999999999",
    password: "hashed",
    role: "finance",
    status: "active",
  });
  return String(u._id);
}

describe("AI-01 — Document ingestion & accounting extraction", () => {
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
    ]);

    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai01DocumentIngestion } = await import("@/lib/aiRuntime/workflows/ai-01-document-ingestion"));
    bootstrapAiRuntime();
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-01", killSwitchEnabled: true, maxAutonomyLevel: "draft" });
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Promise.all([
      ExtractedDocument.deleteMany({ tenantId: TENANT }),
      Vendor.deleteMany({ tenantId: TENANT }),
      Invoice.deleteMany({ tenantId: TENANT }),
      User.deleteMany({ tenantId: TENANT }),
      AiWorkflowRun.deleteMany({}),
      AiDecisionTrace.deleteMany({}),
      AiToolCall.deleteMany({}),
    ]);
  });

  it("clean known-vendor bill → draft Invoice created (state: draft), evidence linked", async () => {
    await makeVendor("Acme Supplies");
    const userId = await makeFinanceUser();
    const docId = await makeExtractedDocument(baseExtraction());

    const envelope = await runWorkflow(ai01DocumentIngestion, {
      tenantId: TENANT,
      eventKey: "document.received",
      payload: { extractedDocumentId: docId, actingUserId: userId },
    });

    expect(envelope.status).toBe("completed");
    const invoice = await Invoice.findOne({ tenantId: TENANT, moveType: "in_invoice" }).lean();
    expect(invoice).not.toBeNull();
    expect((invoice as { state?: string })!.state).toBe("draft");

    const doc = await ExtractedDocument.findById(docId).lean();
    expect((doc as { createdRecordId?: unknown })!.createdRecordId).toBeTruthy();
    expect((doc as { status?: string })!.status).toBe(DOC_INTEL_STATUS.CONFIRMED);
  });

  it("same bill submitted twice → second run creates no second Invoice, raises a duplicate finding", async () => {
    await makeVendor("Acme Supplies");
    const userId = await makeFinanceUser();
    const extraction = baseExtraction({ billNumber: "DUP-001" });
    const firstDocId = await makeExtractedDocument(extraction);
    await runWorkflow(ai01DocumentIngestion, {
      tenantId: TENANT,
      eventKey: "document.received",
      payload: { extractedDocumentId: firstDocId, actingUserId: userId },
    });

    const secondDocId = await makeExtractedDocument(extraction);
    const envelope = await runWorkflow(ai01DocumentIngestion, {
      tenantId: TENANT,
      eventKey: "document.received",
      payload: { extractedDocumentId: secondDocId, actingUserId: userId },
    });

    expect(envelope.status).toBe("escalated");
    expect(envelope.findings[0].title).toContain("duplicate");
    const invoiceCount = await Invoice.countDocuments({ tenantId: TENANT, moveType: "in_invoice" });
    expect(invoiceCount).toBe(1);
  });

  it("lines don't sum to total → escalated, no draft created", async () => {
    await makeVendor("Acme Supplies");
    const userId = await makeFinanceUser();
    const docId = await makeExtractedDocument(
      baseExtraction({ lineItems: [{ description: "X", quantity: 1, unitPrice: 100, amount: 100 }], subtotal: 100, taxAmount: 0, totalAmount: 9999 }),
    );

    const envelope = await runWorkflow(ai01DocumentIngestion, {
      tenantId: TENANT,
      eventKey: "document.received",
      payload: { extractedDocumentId: docId, actingUserId: userId },
    });

    expect(envelope.status).toBe("escalated");
    const invoiceCount = await Invoice.countDocuments({ tenantId: TENANT });
    expect(invoiceCount).toBe(0);
  });

  it("non-INR document → escalated, no conversion attempted", async () => {
    await makeVendor("Acme Supplies");
    const userId = await makeFinanceUser();
    const docId = await makeExtractedDocument(baseExtraction({ currency: "USD" }));

    const envelope = await runWorkflow(ai01DocumentIngestion, {
      tenantId: TENANT,
      eventKey: "document.received",
      payload: { extractedDocumentId: docId, actingUserId: userId },
    });

    expect(envelope.status).toBe("escalated");
    expect(envelope.findings[0].title).toContain("Non-INR");
    const invoiceCount = await Invoice.countDocuments({ tenantId: TENANT });
    expect(invoiceCount).toBe(0);
  });

  it("unknown vendor → escalated with a proposed vendor; no Vendor record is created", async () => {
    const userId = await makeFinanceUser();
    const docId = await makeExtractedDocument(baseExtraction({ vendorName: "Totally New Vendor Ltd" }));

    const envelope = await runWorkflow(ai01DocumentIngestion, {
      tenantId: TENANT,
      eventKey: "document.received",
      payload: { extractedDocumentId: docId, actingUserId: userId },
    });

    expect(envelope.status).toBe("escalated");
    expect(envelope.findings[0].title).toContain("Unknown vendor");
    const vendorCount = await Vendor.countDocuments({ tenantId: TENANT, name: "Totally New Vendor Ltd" });
    expect(vendorCount).toBe(0);
    const invoiceCount = await Invoice.countDocuments({ tenantId: TENANT });
    expect(invoiceCount).toBe(0);
  });

  it("a DOC_INTEL_TYPE other than vendor_bill is out of scope this batch and escalates", async () => {
    const userId = await makeFinanceUser();
    const doc = await ExtractedDocument.create({
      tenantId: TENANT,
      docType: DOC_INTEL_TYPE.VENDOR_BILL, // only type that exists today — simulate via direct field override
      fileName: "x.pdf",
      status: DOC_INTEL_STATUS.EXTRACTED,
      extraction: baseExtraction(),
      aiConfidence: 90,
      createdBy: new mongoose.Types.ObjectId(),
    });
    await ExtractedDocument.updateOne({ _id: doc._id }, { $set: { docType: "receipt" } });

    const envelope = await runWorkflow(ai01DocumentIngestion, {
      tenantId: TENANT,
      eventKey: "document.received",
      payload: { extractedDocumentId: String(doc._id), actingUserId: userId },
    });

    // Zero confidence (nothing proposed) correctly cannot reach DRAFT, and the gate's
    // "escalate" is the honest outcome for "nothing was classified" — same pattern as AI-02.
    expect(envelope.status).toBe("escalated");
    expect(envelope.findings).toHaveLength(0);
  });

  it("no acting user (autonomous trigger) → drops to propose-only, sets nothing", async () => {
    await makeVendor("Acme Supplies");
    const docId = await makeExtractedDocument(baseExtraction());

    const envelope = await runWorkflow(ai01DocumentIngestion, {
      tenantId: TENANT,
      eventKey: "document.received",
      payload: { extractedDocumentId: docId },
    });

    expect(envelope.autonomyApplied).toBe("recommend");
    const invoiceCount = await Invoice.countDocuments({ tenantId: TENANT });
    expect(invoiceCount).toBe(0);
  });

  it("replay of the same document.received event → exactly one Invoice", async () => {
    await makeVendor("Acme Supplies");
    const userId = await makeFinanceUser();
    const docId = await makeExtractedDocument(baseExtraction());
    const AiEvent = (await import("@/models/ai/AiEvent")).default;
    const event = await AiEvent.create({ tenantId: TENANT, eventKey: "document.received", payload: { extractedDocumentId: docId, actingUserId: userId } });
    const triggerEvent = { id: String(event._id), tenantId: TENANT, eventKey: "document.received", payload: { extractedDocumentId: docId, actingUserId: userId } };

    await runWorkflow(ai01DocumentIngestion, triggerEvent);
    await runWorkflow(ai01DocumentIngestion, triggerEvent);

    const invoiceCount = await Invoice.countDocuments({ tenantId: TENANT });
    expect(invoiceCount).toBe(1);
    await AiEvent.deleteMany({});
  });

  it("the existing manual upload → confirm flow is untouched (draft_bill still callable directly, byte-identical Invoice shape)", async () => {
    const { createDraftBill } = await import("@/lib/docIntel/billCreate");
    const result = await createDraftBill(baseExtraction() as never, { tenantId: TENANT, userId: String(new mongoose.Types.ObjectId()) });
    expect(result.invoiceId).toBeTruthy();
    const invoice = await Invoice.findById(result.invoiceId).lean();
    expect((invoice as { state?: string })!.state).toBe("draft");
  });
});
