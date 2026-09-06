import { describe, expect, it, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai05golden";

import { SalesInvoice as SalesInvoiceModel } from "@/models/sales/SalesInvoice";
import Payment from "@/models/sales/Payment";
import Customer from "@/models/sales/Customer";
import Invoice from "@/models/finance/Invoice";
import User from "@/models/auth/User";
import AiDispute from "@/models/ai/AiDispute";
import AiCommunicationDraft from "@/models/ai/AiCommunicationDraft";
import AiMaterialityPolicy from "@/models/ai/AiMaterialityPolicy";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";
import AiAttentionItem from "@/models/ai/AiAttentionItem";
import { AI05_GOLDEN_CASES, GOLDEN_TENANT_PREFIX, type Ai05GoldenCase } from "@/tests/golden/ai05/goldenCases";

const SalesInvoice: any = SalesInvoiceModel;

/**
 * The golden-dataset CI check for AI-05 (docs/ai/BRIEF-10-PRE-QA.md P0.6). Unlike a normal test
 * (proves the code does what it did yesterday), this reports a PASS RATE across a named case set
 * and fails the whole run if it drops below `PASS_RATE_THRESHOLD` — the signal a behaviour change
 * altered real decisions, which a per-assertion test can miss if it only checks the cases it
 * happens to include.
 */

// AI-05's allocation classification and worklist false-positive guard are plain deterministic
// arithmetic (confirmed by reading proposeAllocation()/the worklist loop — no LLM call anywhere
// in this workflow), so 100% is the only honest bar.
const PASS_RATE_THRESHOLD = 1.0;

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai05ReceivablesOperations: typeof import("@/lib/aiRuntime/workflows/ai-05-receivables-operations").ai05ReceivablesOperations;

async function seedAndRun(tenantId: string, goldenCase: Ai05GoldenCase) {
  await AiWorkflowPolicy.create({ tenantId, workflowId: "AI-05", killSwitchEnabled: true, maxAutonomyLevel: "draft" });
  const user = await User.create({ tenantId, name: "Golden Sales User", email: `f-${Date.now()}-${Math.random()}@example.com`, phone: "9999999999", password: "hashed", role: "sales", status: "active" });
  const customer = await Customer.create({ tenantId, header: { name: "Golden Customer", is_company: true }, contact_details: {}, createdBy: user._id });

  for (const inv of goldenCase.invoices) {
    await SalesInvoice.create({
      tenantId,
      number: `INV-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      customerId: customer._id,
      status: "saved",
      invoiceDate: new Date(),
      dueDate: new Date(Date.now() + inv.dueDateOffsetDays * 86400000),
      lineItems: [],
      taxableAmount: inv.totalAmount,
      totalAmount: inv.totalAmount,
      payments: [],
    });
  }

  if (goldenCase.paymentUnusedAmount !== undefined) {
    await Payment.create({
      tenantId,
      customerId: customer._id,
      paymentNumber: `PAY-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      paymentDate: new Date(),
      amountReceived: goldenCase.paymentUnusedAmount,
      allocations: [],
      unusedAmount: goldenCase.paymentUnusedAmount,
      status: "draft",
    });
  }

  const envelope = await runWorkflow(ai05ReceivablesOperations, { tenantId, eventKey: "ai.sweep.hourly", payload: { actingUserId: String(user._id) } });
  const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
  const proposal = trace!.rawProposal as unknown as { allocationCandidates: { type: string }[]; worklist: unknown[] };

  return {
    allocationType: proposal.allocationCandidates[0]?.type as Ai05GoldenCase["expected"]["allocationType"] | undefined,
    shortPaymentFindingRaised: envelope.findings.some((f) => f.title.startsWith("Short payment")),
    worklistCount: proposal.worklist.length,
  };
}

describe("AI-05 golden dataset", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      SalesInvoice.init(), Payment.init(), Customer.init(), Invoice.init(), User.init(), AiDispute.init(),
      AiCommunicationDraft.init(), AiMaterialityPolicy.init(), AiWorkflowRun.init(), AiDecisionTrace.init(),
      AiEvent.init(), AiToolCall.init(), AiWorkflowPolicy.init(), AiAttentionItem.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai05ReceivablesOperations } = await import("@/lib/aiRuntime/workflows/ai-05-receivables-operations"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  it(`reports a pass rate >= ${PASS_RATE_THRESHOLD * 100}% across ${AI05_GOLDEN_CASES.length} golden case(s)`, async () => {
    const results: { id: string; passed: boolean; expected: unknown; actual: unknown }[] = [];

    for (const goldenCase of AI05_GOLDEN_CASES) {
      const tenantId = `${GOLDEN_TENANT_PREFIX}-${goldenCase.id}`;
      const actual = await seedAndRun(tenantId, goldenCase);
      const passed =
        actual.allocationType === goldenCase.expected.allocationType &&
        actual.shortPaymentFindingRaised === goldenCase.expected.shortPaymentFindingRaised &&
        actual.worklistCount === goldenCase.expected.worklistCount;
      results.push({ id: goldenCase.id, passed, expected: goldenCase.expected, actual });
    }

    const passRate = results.filter((r) => r.passed).length / results.length;
    const failures = results.filter((r) => !r.passed);

    console.log(`AI-05 golden dataset: ${results.length - failures.length}/${results.length} passed (${Math.round(passRate * 100)}%)`, failures.length > 0 ? { failures } : "");

    expect(passRate, `golden dataset regressions: ${JSON.stringify(failures)}`).toBeGreaterThanOrEqual(PASS_RATE_THRESHOLD);
  });
});
