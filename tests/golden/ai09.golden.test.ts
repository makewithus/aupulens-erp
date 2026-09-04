import { describe, expect, it, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai09golden";

import Account from "@/models/finance/Account";
import Customer from "@/models/sales/Customer";
import User from "@/models/auth/User";
import SaleOrder from "@/models/sales/SaleOrder";
import { SalesInvoice } from "@/models/sales/SalesInvoice";
import JournalEntry from "@/models/finance/JournalEntry";
import AiSchedule from "@/models/ai/AiSchedule";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";
import { AI09_GOLDEN_CASES, GOLDEN_TENANT_PREFIX, GOLDEN_CREATOR, type Ai09GoldenCase } from "@/tests/golden/ai09/goldenCases";

/**
 * The golden-dataset CI check for AI-09 (docs/ai/BRIEF-09-VERIFICATION.md Part 0.3). Unlike a
 * normal test (proves the code does what it did yesterday), this reports a PASS RATE across a
 * named case set and fails the whole run if it drops below `PASS_RATE_THRESHOLD` — the signal a
 * behaviour change altered outcomes, which a per-assertion test can miss if it only checks the
 * cases it happens to include.
 */

// AI-09 is fully deterministic (four-quantity divergence comparison — no LLM call anywhere in the
// workflow, per its own module doc comment), so 100% is the only honest bar — same reasoning as
// AI-27's golden dataset.
const PASS_RATE_THRESHOLD = 1.0;

const SalesInvoiceModel = SalesInvoice as unknown as mongoose.Model<Record<string, unknown>>;

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai09RevenueRecognition: typeof import("@/lib/aiRuntime/workflows/ai-09-revenue-recognition").ai09RevenueRecognition;

async function seedAndRun(tenantId: string, goldenCase: Ai09GoldenCase) {
  const userId = await User.create({ tenantId, name: "Finance User", email: `f-${Date.now()}-${Math.random()}@example.com`, phone: "9999999999", password: "hashed", role: "finance", status: "active" });
  const partner = await Customer.create({ tenantId, header: { name: goldenCase.customerName, is_company: true }, createdBy: GOLDEN_CREATOR });

  if (goldenCase.createAccounts) {
    await Account.create({ tenantId, name: "Income", code: `INC-${Math.random().toString(36).slice(2, 8)}`, account_type: "income", isActive: true, isLocked: false, status: "active" });
    await Account.create({ tenantId, name: "Unbilled", code: `UNB-${Math.random().toString(36).slice(2, 8)}`, account_type: "asset_current", isActive: true, isLocked: false, status: "active" });
    await Account.create({ tenantId, name: "Deferred", code: `DEF-${Math.random().toString(36).slice(2, 8)}`, account_type: "liability_current", isActive: true, isLocked: false, status: "active" });
  }

  let salesInvoiceIds: mongoose.Types.ObjectId[] = [];
  if (goldenCase.billedAmount !== undefined) {
    const inv = await SalesInvoiceModel.create({
      tenantId,
      number: `SI-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: "Regular",
      customerId: partner._id,
      invoiceDate: new Date(),
      dueDate: new Date(),
      lineItems: [{ name: "Item", qty: 1, unitPrice: goldenCase.billedAmount, discount: 0, discountMode: "amount", taxRate: 0, lineTotal: goldenCase.billedAmount }],
      taxableAmount: goldenCase.billedAmount,
      totalAmount: goldenCase.billedAmount,
      status: "saved",
    });
    salesInvoiceIds = [inv._id as mongoose.Types.ObjectId];
  }

  await SaleOrder.create({
    tenantId,
    header: { name: goldenCase.orderName ?? `SO-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, partnerId: partner._id, dateOrder: new Date() },
    orderLines: [{ name: "Service", productQty: 1, priceUnit: goldenCase.amount, taxIds: [], discount: 0, priceSubtotal: goldenCase.amount }],
    totals: { amountUntaxed: goldenCase.amount, amountTax: 0, amountTotal: goldenCase.amount },
    status: "posted",
    q2cStatus: "sales_order",
    shipmentStatus: goldenCase.shipmentStatus,
    salesInvoiceIds,
    revenueRecognition: goldenCase.method ? { method: goldenCase.method, recognizedAt: goldenCase.recognized ? new Date() : undefined } : undefined,
  });

  await AiWorkflowPolicy.create({ tenantId, workflowId: "AI-09", killSwitchEnabled: true, maxAutonomyLevel: "draft", confidenceThreshold: 0.1 });

  const envelope = await runWorkflow(ai09RevenueRecognition, { tenantId, eventKey: "ai.sweep.hourly", payload: { actingUserId: String(userId._id) } });
  const journalCountAfterSweep = await JournalEntry.countDocuments({ tenantId });
  const scheduleCreatedAfterSweep = (await AiSchedule.countDocuments({ tenantId, scheduleType: "deferred_revenue", "sourceRef.model": "SaleOrder" })) > 0;

  return {
    findingTitles: envelope.findings.map((f) => f.title).sort(),
    journalCountAfterSweep,
    scheduleCreatedAfterSweep,
  };
}

describe("AI-09 golden dataset", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Account.init(), Customer.init(), User.init(), SaleOrder.init(), SalesInvoice.init(), JournalEntry.init(),
      AiSchedule.init(), AiWorkflowRun.init(), AiDecisionTrace.init(), AiEvent.init(), AiToolCall.init(), AiWorkflowPolicy.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai09RevenueRecognition } = await import("@/lib/aiRuntime/workflows/ai-09-revenue-recognition"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  it(`reports a pass rate >= ${PASS_RATE_THRESHOLD * 100}% across ${AI09_GOLDEN_CASES.length} golden case(s)`, async () => {
    const results: { id: string; passed: boolean; expected: unknown; actual: unknown }[] = [];

    for (const goldenCase of AI09_GOLDEN_CASES) {
      const tenantId = `${GOLDEN_TENANT_PREFIX}-${goldenCase.id}`;
      const actual = await seedAndRun(tenantId, goldenCase);
      const expectedTitles = [...goldenCase.expected.findingTitles].sort();
      const passed =
        JSON.stringify(actual.findingTitles) === JSON.stringify(expectedTitles) &&
        actual.journalCountAfterSweep === goldenCase.expected.journalCountAfterSweep &&
        actual.scheduleCreatedAfterSweep === goldenCase.expected.scheduleCreatedAfterSweep;
      results.push({ id: goldenCase.id, passed, expected: goldenCase.expected, actual });
    }

    const passRate = results.filter((r) => r.passed).length / results.length;
    const failures = results.filter((r) => !r.passed);

    console.log(`AI-09 golden dataset: ${results.length - failures.length}/${results.length} passed (${Math.round(passRate * 100)}%)`, failures.length > 0 ? { failures } : "");

    expect(passRate, `golden dataset regressions: ${JSON.stringify(failures)}`).toBeGreaterThanOrEqual(PASS_RATE_THRESHOLD);
  });
});
