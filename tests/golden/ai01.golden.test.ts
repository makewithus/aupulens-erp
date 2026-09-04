import { describe, expect, it, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai01golden";

import ExtractedDocument from "@/models/ai/ExtractedDocument";
import Vendor from "@/models/admin/Vendor";
import Invoice from "@/models/finance/Invoice";
import Customer from "@/models/sales/Customer";
import TaxRate from "@/models/finance/TaxRate";
import User from "@/models/auth/User";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";
import { DOC_INTEL_STATUS, DOC_INTEL_TYPE } from "@/lib/docIntel/extractionSchemas";
import { AI01_GOLDEN_CASES, GOLDEN_TENANT_PREFIX, GOLDEN_CREATOR, type GoldenCase } from "@/tests/golden/ai01/goldenCases";

/**
 * The golden-dataset CI check for AI-01 (docs/ai/BRIEF-09-VERIFICATION.md 0.3), built to the same
 * standard as `tests/golden/ai27.golden.test.ts`. Unlike a normal unit test (proves the code does
 * what it did yesterday), this reports a PASS RATE across a named case set and fails the whole
 * run if it drops below `PASS_RATE_THRESHOLD` — the signal a change to AI-01's deterministic
 * extraction/reason logic altered real behaviour.
 */

const PASS_RATE_THRESHOLD = 1.0; // every golden case must pass — AI-01's own logic (duplicate/arithmetic/
// currency/vendor/tax checks) is fully deterministic given a seeded ExtractedDocument; the LLM/OCR
// extraction itself happens upstream in lib/docIntel/ and is not part of this workflow (see goldenCases.ts's
// doc comment) — so there is no model call in this loop and no honest reason to accept less than 100%.

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai01DocumentIngestion: typeof import("@/lib/aiRuntime/workflows/ai-01-document-ingestion").ai01DocumentIngestion;

async function seedCase(tenantId: string, goldenCase: GoldenCase) {
  if (goldenCase.seedVendor) {
    await Vendor.create({ tenantId, name: goldenCase.extraction.vendorName, category: "General" });
  }

  if (goldenCase.seedTaxRate) {
    await TaxRate.create({
      tenantId,
      name: "GST 18%",
      type: "gst",
      ratePercent: 18,
      appliesTo: "purchase",
      status: "active",
      createdBy: GOLDEN_CREATOR,
    });
  }

  if (goldenCase.seedPriorBill) {
    const vendor = await Customer.create({
      tenantId,
      header: { name: goldenCase.extraction.vendorName, is_company: true },
      createdBy: GOLDEN_CREATOR,
    });
    await Invoice.create({
      tenantId,
      name: `GOLDEN-PRIOR-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      partnerId: vendor._id,
      moveType: "in_invoice",
      state: "posted",
      invoiceDate: new Date(),
      dueDate: new Date(),
      sourceDocument: goldenCase.seedPriorBill.billNumber,
      invoiceLines: [{ name: "Prior goods", priceSubtotal: goldenCase.seedPriorBill.amountTotal, quantity: 1, priceUnit: goldenCase.seedPriorBill.amountTotal }],
      amountUntaxed: goldenCase.seedPriorBill.amountTotal,
      amountTax: 0,
      amountTotal: goldenCase.seedPriorBill.amountTotal,
      amountResidual: goldenCase.seedPriorBill.amountTotal,
      paymentState: "not_paid",
    });
  }

  const user = await User.create({
    tenantId,
    name: "Golden Finance User",
    email: `golden-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
    phone: "9999999999",
    password: "hashed",
    role: "finance",
    status: "active",
  });

  const extraction = {
    vendorName: goldenCase.extraction.vendorName,
    vendorGstin: "",
    billNumber: goldenCase.extraction.billNumber,
    billDate: new Date().toISOString(),
    dueDate: new Date().toISOString(),
    currency: goldenCase.extraction.currency,
    poReference: "",
    lineItems: goldenCase.extraction.lineItems,
    subtotal: goldenCase.extraction.subtotal,
    taxAmount: goldenCase.extraction.taxAmount,
    totalAmount: goldenCase.extraction.totalAmount,
    confidence: goldenCase.extraction.confidence ?? 90,
  };

  const doc = await ExtractedDocument.create({
    tenantId,
    docType: DOC_INTEL_TYPE.VENDOR_BILL,
    fileName: "golden-bill.pdf",
    status: DOC_INTEL_STATUS.EXTRACTED,
    extraction,
    aiConfidence: extraction.confidence,
    createdBy: GOLDEN_CREATOR,
  });

  return { extractedDocumentId: String(doc._id), actingUserId: String(user._id) };
}

describe("AI-01 golden dataset", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      ExtractedDocument.init(),
      Vendor.init(),
      Invoice.init(),
      Customer.init(),
      TaxRate.init(),
      User.init(),
      AiWorkflowRun.init(),
      AiDecisionTrace.init(),
      AiEvent.init(),
      AiToolCall.init(),
      AiWorkflowPolicy.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai01DocumentIngestion } = await import("@/lib/aiRuntime/workflows/ai-01-document-ingestion"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  it(`reports a pass rate >= ${PASS_RATE_THRESHOLD * 100}% across ${AI01_GOLDEN_CASES.length} golden case(s)`, async () => {
    const results: { id: string; passed: boolean; detail: string }[] = [];

    for (const goldenCase of AI01_GOLDEN_CASES) {
      const tenantId = `${GOLDEN_TENANT_PREFIX}-${goldenCase.id}`;
      const { extractedDocumentId, actingUserId } = await seedCase(tenantId, goldenCase);
      await AiWorkflowPolicy.create({ tenantId, workflowId: "AI-01", killSwitchEnabled: true, maxAutonomyLevel: "draft" });

      const preExistingInvoiceCount = await Invoice.countDocuments({ tenantId, moveType: "in_invoice" });

      const envelope = await runWorkflow(ai01DocumentIngestion, {
        tenantId,
        eventKey: "document.received",
        payload: { extractedDocumentId, actingUserId },
      });

      const postInvoiceCount = await Invoice.countDocuments({ tenantId, moveType: "in_invoice" });
      const invoiceCreated = postInvoiceCount > preExistingInvoiceCount;
      const firstFinding = envelope.findings[0];

      const checks = {
        status: envelope.status === goldenCase.expected.status,
        findingType: firstFinding?.type === goldenCase.expected.findingType,
        title: Boolean(firstFinding?.title?.includes(goldenCase.expected.titleContains)),
        invoiceCreated: invoiceCreated === goldenCase.expected.invoiceCreated,
      };
      const passed = Object.values(checks).every(Boolean);

      results.push({
        id: goldenCase.id,
        passed,
        detail: passed
          ? ""
          : JSON.stringify({ checks, expected: goldenCase.expected, actual: { status: envelope.status, findingType: firstFinding?.type, title: firstFinding?.title, invoiceCreated } }),
      });
    }

    const passRate = results.filter((r) => r.passed).length / results.length;
    const failures = results.filter((r) => !r.passed);

    console.log(`AI-01 golden dataset: ${results.length - failures.length}/${results.length} passed (${Math.round(passRate * 100)}%)`, failures.length > 0 ? { failures } : "");

    expect(passRate, `golden dataset regressions: ${JSON.stringify(failures)}`).toBeGreaterThanOrEqual(PASS_RATE_THRESHOLD);
  });
});
