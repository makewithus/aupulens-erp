import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai20";

import Customer from "@/models/sales/Customer";
import Invoice from "@/models/finance/Invoice";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai20RelatedPartyDetection: typeof import("@/lib/aiRuntime/workflows/ai-20-related-party-detection").ai20RelatedPartyDetection;
let detectRelatedParties: typeof import("@/lib/aiRuntime/relatedParty/detectRelatedParties").detectRelatedParties;
let matchPair: typeof import("@/lib/aiRuntime/relatedParty/detectRelatedParties").matchPair;

const TENANT_A = "ai20-tenant-a";
const TENANT_B = "ai20-tenant-b";

async function makeCustomer(tenantId: string, opts: { name: string; gstin?: string; pan?: string; email?: string; street?: string; city?: string; zip?: string }) {
  const c = await Customer.create({
    tenantId,
    header: { name: opts.name, is_company: true },
    contact_details: { email: opts.email },
    address_tab: { type: "contact", street: opts.street, city: opts.city, zip: opts.zip },
    gstin: opts.gstin,
    pan: opts.pan,
    createdBy: new mongoose.Types.ObjectId(),
  });
  return c._id as mongoose.Types.ObjectId;
}

async function makeOpenInvoice(tenantId: string, moveType: "out_invoice" | "in_invoice", partnerId: mongoose.Types.ObjectId, amount: number) {
  return Invoice.create({
    tenantId,
    name: `INV-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    partnerId,
    moveType,
    state: "posted",
    invoiceDate: new Date("2026-01-10"),
    dueDate: new Date("2026-01-10"),
    invoiceLines: [{ name: "Goods", priceSubtotal: amount, quantity: 1, priceUnit: amount }],
    amountUntaxed: amount,
    amountTax: 0,
    amountTotal: amount,
    amountResidual: amount,
    paymentState: "not_paid",
  });
}

describe("AI-20 — Related-party detection", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([Customer.init(), Invoice.init(), AiWorkflowRun.init(), AiDecisionTrace.init(), AiEvent.init(), AiToolCall.init(), AiWorkflowPolicy.init()]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai20RelatedPartyDetection } = await import("@/lib/aiRuntime/workflows/ai-20-related-party-detection"));
    ({ detectRelatedParties, matchPair } = await import("@/lib/aiRuntime/relatedParty/detectRelatedParties"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Promise.all([
      Customer.deleteMany({}),
      Invoice.deleteMany({}),
      AiWorkflowRun.deleteMany({}),
      AiDecisionTrace.deleteMany({}),
      AiEvent.deleteMany({}),
      AiToolCall.deleteMany({}),
      AiWorkflowPolicy.deleteMany({}),
    ]);
  });

  it("a shared tax registration number is a certain match", async () => {
    const customer = await makeCustomer(TENANT_A, { name: "Acme Trading Pvt Ltd", gstin: "29ABCDE1234F1Z5" });
    const vendor = await makeCustomer(TENANT_A, { name: "Completely Different Name Co", gstin: "29ABCDE1234F1Z5" });
    await makeOpenInvoice(TENANT_A, "out_invoice", customer, 5000);
    await makeOpenInvoice(TENANT_A, "in_invoice", vendor, 2000);

    const matches = await detectRelatedParties(TENANT_A);
    const match = matches.find((m) => m.customerRef === String(customer) && m.vendorRef === String(vendor));
    expect(match).toBeDefined();
    expect(match!.classification).toBe("certain");
    expect(match!.matchedOn).toContain("tax_registration_number");
    expect(match!.receivableExposure).toBe(5000);
    expect(match!.payableExposure).toBe(2000);
    expect(match!.net).toBe(3000);
  });

  it("name similarity alone is possible — never certain (the explicit false-positive guard)", () => {
    const result = matchPair(
      { header: { name: "Blue Ocean Traders Pvt Ltd" } },
      { header: { name: "Blue Ocean Traders LLP" } },
    );
    expect(result.classification).toBe("possible");
  });

  it("genuinely different similar-named companies with no shared identifiers are not matched at all", async () => {
    const customer = await makeCustomer(TENANT_A, { name: "Sterling Industries", gstin: "27AAAAA0000A1Z1", email: "ap@sterling-industries-one.example", street: "1 First St", city: "Mumbai", zip: "400001" });
    const vendor = await makeCustomer(TENANT_A, { name: "Sterling Enterprises", gstin: "19BBBBB1111B2Z2", email: "billing@sterling-enterprises-two.example", street: "99 Ninth Ave", city: "Chennai", zip: "600001" });
    await makeOpenInvoice(TENANT_A, "out_invoice", customer, 5000);
    await makeOpenInvoice(TENANT_A, "in_invoice", vendor, 2000);

    const matches = await detectRelatedParties(TENANT_A);
    const match = matches.find((m) => m.customerRef === String(customer) && m.vendorRef === String(vendor));
    // "Sterling Industries" vs "Sterling Enterprises" shares only one token ("sterling") out of
    // three total unique tokens — well under the similarity threshold, so nothing fires.
    expect(match).toBeUndefined();
  });

  it("no cross-tenant read is possible — a tenant-B match never appears in tenant-A's results, structurally, not just by filter", async () => {
    const customerA = await makeCustomer(TENANT_A, { name: "Acme Trading Pvt Ltd", gstin: "29ABCDE1234F1Z5" });
    await makeOpenInvoice(TENANT_A, "out_invoice", customerA, 1000);
    // Identical GSTIN, but registered under a DIFFERENT tenant — tenant A must never see it.
    const vendorB = await makeCustomer(TENANT_B, { name: "Acme Trading Pvt Ltd", gstin: "29ABCDE1234F1Z5" });
    await makeOpenInvoice(TENANT_B, "in_invoice", vendorB, 500);

    const matchesA = await detectRelatedParties(TENANT_A);
    expect(matchesA.some((m) => m.vendorRef === String(vendorB))).toBe(false);
    // Tenant A has no vendor-role candidate of its own this run, so the candidate pool itself
    // is empty — confirming isolation is structural (no data to leak into), not a lucky filter.
    expect(matchesA).toEqual([]);
  });

  it("the workflow raises a HIGH finding for a certain match, never proposes a merge or elimination", async () => {
    const customer = await makeCustomer(TENANT_A, { name: "Acme Trading Pvt Ltd", pan: "ABCDE1234F" });
    const vendor = await makeCustomer(TENANT_A, { name: "Totally Unrelated Name", pan: "ABCDE1234F" });
    await makeOpenInvoice(TENANT_A, "out_invoice", customer, 1000);
    await makeOpenInvoice(TENANT_A, "in_invoice", vendor, 400);
    await AiWorkflowPolicy.create({ tenantId: TENANT_A, workflowId: "AI-20", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    const envelope = await runWorkflow(ai20RelatedPartyDetection, { tenantId: TENANT_A, eventKey: "period.horizon.reached", payload: {} });
    const finding = envelope.findings.find((f) => f.title.includes("certain"));
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe("high");

    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { consolidation: { status: string }; relatedParties: unknown[] };
    expect(proposal.consolidation.status).toBe("not_implemented");
    // No proposedAction anywhere carries a merge/eliminate-shaped tool call.
    for (const f of envelope.findings) {
      expect(f.proposedAction).toBeUndefined();
    }
  });
});
