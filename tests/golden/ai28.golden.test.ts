import { describe, expect, it, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai28golden";

import Customer from "@/models/sales/Customer";
import Invoice from "@/models/finance/Invoice";
import PurchaseOrder from "@/models/finance/PurchaseOrder";
import StockMove from "@/models/inventory/StockMove";
import TransactionLock from "@/models/finance/TransactionLock";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";
import { AI28_GOLDEN_CASES, GOLDEN_TENANT_PREFIX, type GoldenCase } from "@/tests/golden/ai28/goldenCases";

/**
 * The golden-dataset CI check for AI-28 (docs/ai/BRIEF-09-VERIFICATION.md 0.3). Unlike a normal
 * test (proves the code does what it did yesterday), this reports a PASS RATE across a named case
 * set and fails the whole run if it drops below `PASS_RATE_THRESHOLD` — the signal a scoring
 * change altered real behaviour, which a per-assertion test can miss if it only checks the cases
 * it happens to include.
 */

const PASS_RATE_THRESHOLD = 1.0; // AI-28 is a thin wrapper over evaluateCutoff.ts, a deterministic date comparison against real PO/StockMove/TransactionLock evidence — no model call in the loop, so 100% is the honest bar, same as AI-27.

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai28CutoffIntelligence: typeof import("@/lib/aiRuntime/workflows/ai-28-cutoff-intelligence").ai28CutoffIntelligence;

async function makeVendor(tenantId: string) {
  const c = await Customer.create({ tenantId, header: { name: "Golden Vendor", is_company: true }, createdBy: new mongoose.Types.ObjectId() });
  return c._id as mongoose.Types.ObjectId;
}

async function seedCase(tenantId: string, goldenCase: GoldenCase) {
  const partnerId = await makeVendor(tenantId);
  const invoiceName = `GOLDEN-BILL-${goldenCase.id}`;
  const inv = await Invoice.create({
    tenantId,
    name: invoiceName,
    partnerId,
    moveType: "in_invoice",
    state: "posted",
    invoiceDate: new Date(goldenCase.invoiceDate),
    dueDate: new Date(goldenCase.invoiceDate),
    invoiceLines: [{ name: "Goods", priceSubtotal: goldenCase.amount, quantity: 1, priceUnit: goldenCase.amount }],
    amountTotal: goldenCase.amount,
  });

  if (goldenCase.receiptDate) {
    const move = await StockMove.create({
      tenantId,
      reference: `GOLDEN-SM-${goldenCase.id}`,
      moveType: "incoming",
      sourceLocation: {},
      destinationLocation: {},
      effectiveDate: new Date(goldenCase.receiptDate),
      lines: [],
      moveStatus: "move_executed",
    });
    await PurchaseOrder.create({
      tenantId,
      name: `GOLDEN-PO-${goldenCase.id}`,
      partnerId,
      dateOrder: new Date(goldenCase.receiptDate),
      orderLines: [{ productId: new mongoose.Types.ObjectId(), name: "Goods", productQty: 1, receivedQty: 1, billedQty: 1, priceUnit: goldenCase.amount, taxIds: [], priceSubtotal: goldenCase.amount }],
      totals: { amountUntaxed: goldenCase.amount, amountTax: 0, amountTotal: goldenCase.amount },
      status: "approved",
      invoiceIds: [inv._id],
      stockMoveIds: [move._id],
      createdBy: new mongoose.Types.ObjectId(),
    });
  }

  if (goldenCase.lockedUpToDate) {
    await TransactionLock.create({ tenantId, module: "purchases", lockedUpToDate: new Date(goldenCase.lockedUpToDate), isLocked: true });
  }

  return invoiceName;
}

describe("AI-28 golden dataset", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Customer.init(), Invoice.init(), PurchaseOrder.init(), StockMove.init(), TransactionLock.init(),
      AiWorkflowRun.init(), AiDecisionTrace.init(), AiEvent.init(), AiToolCall.init(), AiWorkflowPolicy.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai28CutoffIntelligence } = await import("@/lib/aiRuntime/workflows/ai-28-cutoff-intelligence"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  it(`reports a pass rate >= ${PASS_RATE_THRESHOLD * 100}% across ${AI28_GOLDEN_CASES.length} golden case(s)`, async () => {
    const results: { id: string; passed: boolean; reason?: string }[] = [];

    for (const goldenCase of AI28_GOLDEN_CASES) {
      const tenantId = `${GOLDEN_TENANT_PREFIX}-${goldenCase.id}`;
      const invoiceName = await seedCase(tenantId, goldenCase);
      await AiWorkflowPolicy.create({ tenantId, workflowId: "AI-28", killSwitchEnabled: true, maxAutonomyLevel: "recommend" });

      const envelope = await runWorkflow(ai28CutoffIntelligence, {
        tenantId,
        eventKey: "period.horizon.reached",
        payload: { periodEnd: new Date(goldenCase.periodEnd).toISOString() },
      });
      const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
      const proposal = trace!.rawProposal as unknown as { evidenceUnavailableCount: number };

      let passed = true;
      const reasons: string[] = [];

      const finding = envelope.findings.find((f) => f.title.includes(invoiceName));
      if (goldenCase.expected.findingRaised) {
        if (!finding) {
          passed = false;
          reasons.push("expected a cut-off exception finding, none raised");
        } else {
          if (goldenCase.expected.proposedAction && !finding.detail.includes(goldenCase.expected.proposedAction)) {
            passed = false;
            reasons.push(`detail missing proposedAction "${goldenCase.expected.proposedAction}": ${finding.detail}`);
          }
          for (const substr of goldenCase.expected.detailContains ?? []) {
            if (!finding.detail.includes(substr)) {
              passed = false;
              reasons.push(`detail missing "${substr}": ${finding.detail}`);
            }
          }
        }
      } else if (finding) {
        passed = false;
        reasons.push(`expected no finding, got: ${finding.detail}`);
      }

      if (proposal.evidenceUnavailableCount !== goldenCase.expected.evidenceUnavailableCount) {
        passed = false;
        reasons.push(`evidenceUnavailableCount ${proposal.evidenceUnavailableCount} !== expected ${goldenCase.expected.evidenceUnavailableCount}`);
      }

      results.push({ id: goldenCase.id, passed, reason: reasons.length > 0 ? reasons.join("; ") : undefined });
    }

    const passRate = results.filter((r) => r.passed).length / results.length;
    const failures = results.filter((r) => !r.passed);

    console.log(`AI-28 golden dataset: ${results.length - failures.length}/${results.length} passed (${Math.round(passRate * 100)}%)`, failures.length > 0 ? { failures } : "");

    expect(passRate, `golden dataset regressions: ${JSON.stringify(failures)}`).toBeGreaterThanOrEqual(PASS_RATE_THRESHOLD);
  });
});
