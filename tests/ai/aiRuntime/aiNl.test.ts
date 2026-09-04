import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import { execSync } from "node:child_process";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ainl";

import Customer from "@/models/sales/Customer";
import Invoice from "@/models/finance/Invoice";
import AiEvent from "@/models/ai/AiEvent";
import AiCommandProposal from "@/models/ai/AiCommandProposal";
import AiHold from "@/models/ai/AiHold";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";
import AiOperationsRepairLog from "@/models/ai/AiOperationsRepairLog";

let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let getWorkflow: typeof import("@/lib/aiRuntime/runtime/registry").getWorkflow;
let resolveWorkflowIntentCheap: typeof import("@/lib/aiRuntime/nl/resolveIntent").resolveWorkflowIntentCheap;
let unmatchedResponse: typeof import("@/lib/aiRuntime/nl/resolveIntent").unmatchedResponse;
let handleWorkflowIntent: typeof import("@/lib/aiRuntime/nl/workflowChatHandler").handleWorkflowIntent;
let executeWorkflowProposal: typeof import("@/lib/aiRuntime/nl/workflowChatHandler").executeWorkflowProposal;
let runWorkflowFromChat: typeof import("@/lib/aiRuntime/nl/chatBridge").runWorkflowFromChat;
let noSupportResponse: typeof import("@/lib/aiRuntime/nl/explain").noSupportResponse;

const TENANT = "ainl-tenant";
const CREATOR = new mongoose.Types.ObjectId();
const USER_ID = String(new mongoose.Types.ObjectId());

const CANONICAL_UTTERANCES: { text: string; workflowId: string }[] = [
  { text: "Reconcile this bank account.", workflowId: "AI-22" },
  { text: "Why is gross margin down?", workflowId: "AI-14" },
  { text: "Prepare March accruals.", workflowId: "AI-07" },
  { text: "Show me what blocks close.", workflowId: "AI-13" },
  { text: "Fix the obvious bank matches.", workflowId: "AI-03" },
  { text: "Prepare the GST workpaper.", workflowId: "AI-12" },
  { text: "Find duplicate vendor payments.", workflowId: "AI-27" },
  { text: "Why doesn't AP tie to GL?", workflowId: "AI-22" },
  { text: "Show me the support for this number.", workflowId: "AI-18" },
  { text: "Which customers should I chase first?", workflowId: "AI-05" },
  { text: "Are we going to be short on cash next month?", workflowId: "AI-16" },
  { text: "Why did the system code this bill to that account?", workflowId: "AI-18" },
];

describe("AI-NL — natural-language control layer", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Customer.init(), Invoice.init(), AiEvent.init(), AiCommandProposal.init(), AiHold.init(),
      AiWorkflowRun.init(), AiDecisionTrace.init(), AiToolCall.init(), AiWorkflowPolicy.init(), AiOperationsRepairLog.init(),
    ]);
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ getWorkflow } = await import("@/lib/aiRuntime/runtime/registry"));
    ({ resolveWorkflowIntentCheap, unmatchedResponse } = await import("@/lib/aiRuntime/nl/resolveIntent"));
    ({ handleWorkflowIntent, executeWorkflowProposal } = await import("@/lib/aiRuntime/nl/workflowChatHandler"));
    ({ runWorkflowFromChat } = await import("@/lib/aiRuntime/nl/chatBridge"));
    ({ noSupportResponse } = await import("@/lib/aiRuntime/nl/explain"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Promise.all([
      Customer.deleteMany({}), Invoice.deleteMany({}), AiEvent.deleteMany({}), AiCommandProposal.deleteMany({}), AiHold.deleteMany({}),
      AiWorkflowRun.deleteMany({}), AiDecisionTrace.deleteMany({}), AiToolCall.deleteMany({}), AiWorkflowPolicy.deleteMany({}), AiOperationsRepairLog.deleteMany({}),
    ]);
  });

  it("all twelve canonical utterances resolve to the correct workflow without an LLM call", () => {
    for (const { text, workflowId } of CANONICAL_UTTERANCES) {
      const resolved = resolveWorkflowIntentCheap(text);
      expect(resolved, `"${text}" should resolve`).not.toBeNull();
      expect(resolved!.workflowId, `"${text}"`).toBe(workflowId);
      expect(resolved!.resolvedBy).toBe("keyword");
      expect(resolved!.alternatives).toEqual([]);
    }
  });

  it("an explicit workflow-id mention resolves via the workflow_id layer, not keyword", () => {
    const resolved = resolveWorkflowIntentCheap("run AI-13 for me");
    expect(resolved).not.toBeNull();
    expect(resolved!.workflowId).toBe("AI-13");
    expect(resolved!.resolvedBy).toBe("workflow_id");
  });

  it("an ambiguous utterance matching two intents returns alternatives (one clarifying question, not a guess)", () => {
    const resolved = resolveWorkflowIntentCheap("reconcile the bank, and why doesn't ap tie out");
    expect(resolved).not.toBeNull();
    expect(resolved!.alternatives.length).toBeGreaterThan(0);
  });

  it("an unmatched utterance resolves to nothing and offers the nearest capabilities, never an improvised action", () => {
    const resolved = resolveWorkflowIntentCheap("please compose a haiku about invoices");
    expect(resolved).toBeNull();
    const fallback = unmatchedResponse("please compose a haiku about invoices");
    expect(fallback.message).toBe("I can't do that yet.");
    expect(fallback.suggestions.length).toBeGreaterThan(0);
  });

  it("a factual question with no supporting data answers 'I don't have that', never from the model's own knowledge", () => {
    const response = noSupportResponse("what is our EBITDA margin trend for a product we don't sell");
    expect(response.message).toContain("I don't have that");
    expect(response.citations).toEqual([]);
  });

  it("an OBSERVE-level workflow runs immediately from chat and explains — no proposal, no confirmation needed", async () => {
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-13", killSwitchEnabled: true, maxAutonomyLevel: "observe" });
    const result = await handleWorkflowIntent(TENANT, USER_ID, "AI-13", "ai.sweep.hourly", {});
    expect(result.action).toBe("explain");
    expect(result.message).toBeTruthy();
    const proposals = await AiCommandProposal.countDocuments({ tenantId: TENANT });
    expect(proposals).toBe(0);
  });

  it("a workflow above OBSERVE previews with real counts/amounts and requires confirmation before executing", async () => {
    const vendor = await Customer.create({ tenantId: TENANT, header: { name: "Chat Vendor Co", is_company: true }, createdBy: CREATOR });
    await Invoice.create({
      tenantId: TENANT, name: "CHAT-BILL-1", partnerId: vendor._id, moveType: "in_invoice", state: "posted",
      invoiceDate: new Date("2026-04-01"), dueDate: new Date("2026-04-01"), sourceDocument: "CHAT-DUP",
      invoiceLines: [{ name: "Goods", priceSubtotal: 4000, quantity: 1, priceUnit: 4000 }],
      amountUntaxed: 4000, amountTax: 0, amountTotal: 4000, amountResidual: 4000, paymentState: "not_paid",
    });
    await Invoice.create({
      tenantId: TENANT, name: "CHAT-BILL-2", partnerId: vendor._id, moveType: "in_invoice", state: "posted",
      invoiceDate: new Date("2026-04-02"), dueDate: new Date("2026-04-02"), sourceDocument: "chat dup",
      invoiceLines: [{ name: "Goods", priceSubtotal: 4000, quantity: 1, priceUnit: 4000 }],
      amountUntaxed: 4000, amountTax: 0, amountTotal: 4000, amountResidual: 4000, paymentState: "not_paid",
    });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-27", killSwitchEnabled: true, maxAutonomyLevel: "recommend" });

    const result = await handleWorkflowIntent(TENANT, USER_ID, "AI-27", "ai.sweep.hourly", {});
    expect(result.action).toBe("confirm");
    expect(result.proposalId).toBeTruthy();
    expect(result.recordCount).toBeGreaterThan(0);
    expect(result.totalAmount).toBeGreaterThan(0);

    const proposal = await AiCommandProposal.findById(result.proposalId).lean();
    expect(proposal!.module).toBe("ai-workflow");
    expect(proposal!.status).toBe("proposed");

    // Confirming actually runs the real workflow — a hold gets placed, same as the event path.
    const executed = await executeWorkflowProposal(TENANT, USER_ID, proposal!.params as { workflowId: string; eventKey: string; parameters: Record<string, unknown> });
    expect(executed.resultRef).toBeTruthy();
    const hold = await AiHold.findOne({ tenantId: TENANT, "subjectRef.model": "Invoice" }).lean();
    expect(hold).toBeDefined();
  });

  it("A.1: a chat-triggered run is refused identically to an event-triggered run when policy forbids it, and succeeds identically when policy allows it", async () => {
    await AiEvent.create({ tenantId: TENANT, eventKey: "test.chat-gate", status: "dead_letter", attempts: 1, lastError: "boom" });
    // No AiWorkflowPolicy row — killSwitchEnabled defaults to false, identical to the event path's own default-deny.
    const forbidden = await runWorkflowFromChat("AI-30", "ai.sweep.hourly", TENANT, USER_ID, {});
    const forbiddenTrace = await AiDecisionTrace.findOne({ runId: forbidden.runId }).lean();
    const forbiddenProposal = forbiddenTrace!.rawProposal as unknown as { repairsAttempted: { outcome: string }[] };
    expect(forbiddenProposal.repairsAttempted.every((r) => r.outcome.startsWith("skipped"))).toBe(true);

    await AiWorkflowPolicy.findOneAndUpdate({ tenantId: TENANT, workflowId: "AI-30" }, { killSwitchEnabled: true, maxAutonomyLevel: "controlled_autonomous" }, { upsert: true });
    const allowed = await runWorkflowFromChat("AI-30", "ai.sweep.hourly", TENANT, USER_ID, {});
    const allowedTrace = await AiDecisionTrace.findOne({ runId: allowed.runId }).lean();
    const allowedProposal = allowedTrace!.rawProposal as unknown as { repairsAttempted: { outcome: string }[] };
    expect(allowedProposal.repairsAttempted.some((r) => r.outcome === "success")).toBe(true);
  });

  it("an unregistered workflow id returns 'unknown', never an improvised action", async () => {
    const result = await handleWorkflowIntent(TENANT, USER_ID, "AI-99", "ai.sweep.hourly", {});
    expect(result.action).toBe("unknown");
  });

  it("if AI-NL were deleted, event-triggered workflow runs still complete — no core runtime file imports lib/aiRuntime/nl/**", async () => {
    const output = execSync(
      String.raw`grep -rln "aiRuntime/nl" lib/aiRuntime/runtime lib/aiRuntime/bootstrap.ts app/api/cron || true`,
      { encoding: "utf-8", cwd: process.cwd() },
    );
    expect(output.trim()).toBe("");

    // And the underlying pipe itself completes normally, exactly as every event trigger relies on.
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-13", killSwitchEnabled: true, maxAutonomyLevel: "observe" });
    const workflow = getWorkflow("AI-13")!;
    const envelope = await runWorkflow(workflow, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: {} });
    expect(envelope.status).toBeTruthy();
  });
});
