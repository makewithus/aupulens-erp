import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import { execSync } from "node:child_process";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai_safety";

import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let registerWorkflow: typeof import("@/lib/aiRuntime/runtime/registry").registerWorkflow;
let listTools: typeof import("@/lib/aiRuntime/tools/registry").listTools;
let AI_AUTONOMY_LEVEL: typeof import("@/lib/constants/statuses").AI_AUTONOMY_LEVEL;
let AI_FINDING_TYPE: typeof import("@/lib/constants/statuses").AI_FINDING_TYPE;
let AI_FINDING_SEVERITY: typeof import("@/lib/constants/statuses").AI_FINDING_SEVERITY;

const TENANT = "safety-tenant";

// Part 4.5's assertion list, as literal tests — not prose.
describe("Part 4.5 safety assertions", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await AiWorkflowRun.init();
    await AiDecisionTrace.init();

    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ registerWorkflow } = await import("@/lib/aiRuntime/runtime/registry"));
    ({ listTools } = await import("@/lib/aiRuntime/tools/registry"));
    ({ AI_AUTONOMY_LEVEL, AI_FINDING_TYPE, AI_FINDING_SEVERITY } = await import("@/lib/constants/statuses"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await AiWorkflowRun.deleteMany({});
    await AiDecisionTrace.deleteMany({});
  });

  it("✗ AI writes directly to the database → no ORM write-method imports in lib/aiRuntime/workflows/**", () => {
    // Static source grep, not a runtime check — the constraint is on workflow
    // DEFINITION code, not on the runtime plumbing itself (which legitimately
    // writes to AiWorkflowRun/AiDecisionTrace/etc. as the audit substrate).
    const output = execSync(
      String.raw`grep -rnE '\.(save|create|updateOne|updateMany|deleteOne|deleteMany|findOneAndUpdate|findByIdAndUpdate|findOneAndDelete|insertMany)\(' lib/aiRuntime/workflows || true`,
      { cwd: process.cwd(), encoding: "utf-8" },
    );
    expect(output.trim()).toBe("");
  });

  it("✗ an `internal_state`-category tool writes outside models/ai/** (docs/ai/BRIEF-05-BATCH-D.md Part 0.3) → every write call inside its handler targets a model whose name starts with \"Ai\"", () => {
    // Static source analysis, not `handler.toString()`: under Vite/esbuild's module transform, a
    // default-imported model binding (e.g. `AiSchedule`) can be renamed to a generic `default`
    // identifier in the compiled function source, making a stringified-function check unreliable.
    // Reading the real .ts source and brace-matching the named handler's body sidesteps that
    // entirely — same "grep the real source" spirit as this file's other structural tests.
    const internalStateTools = listTools().filter((t) => t.category === "internal_state");
    expect(internalStateTools.length).toBeGreaterThan(0); // the category itself must be in use, not just declared

    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");

    // {tool name} -> {source file, handler function name} — every current internal_state tool.
    const handlerLocations: Record<string, { file: string; fn: string }> = {
      create_task: { file: "lib/aiRuntime/tools/financeWriteTools.ts", fn: "createTaskHandler" },
      resolve_task: { file: "lib/aiRuntime/tools/control.ts", fn: "resolve_task" }, // inline handler, matched by tool name below
      record_close_assertion: { file: "lib/aiRuntime/tools/closeTools.ts", fn: "recordCloseAssertionHandler" },
      draft_prepaid_schedule: { file: "lib/aiRuntime/tools/scheduleWriteTools.ts", fn: "draftPrepaidScheduleHandler" },
      draft_depreciation_schedule: { file: "lib/aiRuntime/tools/scheduleWriteTools.ts", fn: "draftDepreciationScheduleHandler" },
      link_schedule_draft: { file: "lib/aiRuntime/tools/scheduleWriteTools.ts", fn: "linkScheduleDraftHandler" },
      record_learning_outcome: { file: "lib/aiRuntime/tools/internalStateTools.ts", fn: "recordLearningOutcomeHandler" },
      draft_communication: { file: "lib/aiRuntime/tools/receivablesTools.ts", fn: "draftCommunicationHandler" },
      open_dispute: { file: "lib/aiRuntime/tools/receivablesTools.ts", fn: "openDisputeHandler" },
      record_payment_run_proposal: { file: "lib/aiRuntime/tools/payablesTools.ts", fn: "recordPaymentRunProposalHandler" },
      record_anomaly: { file: "lib/aiRuntime/tools/anomalyTools.ts", fn: "recordAnomalyHandler" },
      // confirm_anomaly/dismiss_anomaly are thin wrappers around the shared reviewAnomaly() —
      // that's where the real writes are, so it's what must be checked (pointing at the wrapper
      // itself would find zero write calls and pass vacuously).
      confirm_anomaly: { file: "lib/aiRuntime/tools/anomalyTools.ts", fn: "reviewAnomaly" },
      dismiss_anomaly: { file: "lib/aiRuntime/tools/anomalyTools.ts", fn: "reviewAnomaly" },
      suppress_anomaly: { file: "lib/aiRuntime/tools/anomalyTools.ts", fn: "suppressAnomalyHandler" },
      record_anomaly_review: { file: "lib/aiRuntime/tools/anomalyTools.ts", fn: "recordAnomalyReviewHandler" },
      // rebuildTaxProjectionHandler just calls rebuildTaxProjection() in a different file — the
      // real writes are there, so that's what must be checked (see confirm_anomaly's own note
      // above for why pointing at the thin wrapper would pass vacuously).
      rebuild_tax_projection: { file: "lib/aiRuntime/tax/rebuildTaxProjection.ts", fn: "rebuildTaxProjection" },
      record_evidence_pack: { file: "lib/aiRuntime/tools/auditTools.ts", fn: "recordEvidencePackHandler" },
      record_control_result: { file: "lib/aiRuntime/tools/controlMonitoringTools.ts", fn: "recordControlResultHandler" },
      place_hold: { file: "lib/aiRuntime/tools/masterDataTools.ts", fn: "placeHoldHandler" },
      record_master_data_profile: { file: "lib/aiRuntime/tools/masterDataTools.ts", fn: "recordMasterDataProfileHandler" },
      record_inventory_findings: { file: "lib/aiRuntime/tools/inventoryTools.ts", fn: "recordInventoryFindingsHandler" },
      record_duplicate_findings: { file: "lib/aiRuntime/tools/duplicateTools.ts", fn: "recordDuplicateFindingsHandler" },
      record_accounting_policy: { file: "lib/aiRuntime/tools/policyTools.ts", fn: "recordAccountingPolicyHandler" },
      record_policy_findings: { file: "lib/aiRuntime/tools/policyTools.ts", fn: "recordPolicyFindingsHandler" },
      requeue_dead_lettered_event: { file: "lib/aiRuntime/tools/opsHealthTools.ts", fn: "requeueDeadLetterHandler" },
      // Same real write AI-12's own rebuild_tax_projection tool checks — refreshTaxProjectionHandler
      // (opsHealthTools.ts) is a thin wrapper with no direct write call of its own; the actual
      // AiTaxTransaction write lives in rebuildTaxProjection() itself.
      refresh_tax_projection: { file: "lib/aiRuntime/tax/rebuildTaxProjection.ts", fn: "rebuildTaxProjection" },
      record_operations_findings: { file: "lib/aiRuntime/tools/opsHealthTools.ts", fn: "recordOperationsFindingsHandler" },
      record_account_mapping: { file: "lib/aiRuntime/tools/accountMappingTools.ts", fn: "recordAccountMappingHandler" },
    };

    function extractFunctionBody(source: string, fnName: string): string {
      // Matches `function fnName(`, `async function fnName(`, or `name: async (` / `name: async (args) =>` inline forms.
      const anchor = new RegExp(`(?:async\\s+function\\s+${fnName}\\s*\\(|name:\\s*"${fnName}"[\\s\\S]{0,1000}?handler:\\s*async\\s*\\()`);
      const anchorMatch = anchor.exec(source);
      expect(anchorMatch, `could not locate handler "${fnName}" in source`).not.toBeNull();
      const openBraceIdx = source.indexOf("{", anchorMatch!.index);
      let depth = 0;
      let i = openBraceIdx;
      for (; i < source.length; i++) {
        if (source[i] === "{") depth++;
        else if (source[i] === "}") {
          depth--;
          if (depth === 0) break;
        }
      }
      return source.slice(openBraceIdx, i + 1);
    }

    const writeCallPattern = /\b([A-Za-z_$][A-Za-z0-9_$]*)\.(save|create|updateOne|updateMany|deleteOne|deleteMany|findOneAndUpdate|findByIdAndUpdate|findOneAndDelete|insertMany)\s*\(/g;
    const violations: string[] = [];

    for (const tool of internalStateTools) {
      const loc = handlerLocations[tool.name];
      expect(loc, `no handlerLocations entry for internal_state tool "${tool.name}" — add one`).toBeDefined();
      const source = fs.readFileSync(path.join(process.cwd(), loc.file), "utf-8");
      const body = extractFunctionBody(source, loc.fn);
      for (const match of body.matchAll(writeCallPattern)) {
        const identifier = match[1];
        if (!/^Ai[A-Z]/.test(identifier)) {
          violations.push(`${tool.name} (${loc.file}::${loc.fn}): "${identifier}.${match[2]}(...)"`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("✗ AI releases payments / changes vendor bank details / etc. → NEVER_AUTONOMOUS action classes never reach act()", async () => {
    let actWasCalled = false;

    registerWorkflow({
      id: "AI-00-SAFETY-NEVER-AUTONOMOUS",
      version: "1.0.0",
      eventKeys: [],
      actionClass: "release_payment",
      defaultAutonomy: AI_AUTONOMY_LEVEL.EXECUTE,
      async observe(event) {
        return { entityId: event.tenantId, raw: {} };
      },
      async extract() {
        return {};
      },
      async reason() {
        return {
          proposal: { would: "release a payment" },
          confidence: 1,
          findings: [
            {
              id: "f1",
              type: AI_FINDING_TYPE.PROPOSAL,
              severity: AI_FINDING_SEVERITY.CRITICAL,
              title: "would release payment",
              detail: "must never auto-execute",
              confidence: 1,
              subjectRefs: [],
              evidence: [],
              reasonChain: [],
            },
          ],
          reasonChain: ["proposing a payment release"],
        };
      },
      async validate() {
        return { valid: true };
      },
      async act() {
        actWasCalled = true; // must never happen
        return { findings: [], actionsTaken: [{ tool: "release_payment", args: {}, reversible: false }] };
      },
      async verify() {
        return { ok: true };
      },
    });

    const { getWorkflow } = await import("@/lib/aiRuntime/runtime/registry");
    const workflow = getWorkflow("AI-00-SAFETY-NEVER-AUTONOMOUS")!;
    const envelope = await runWorkflow(workflow, { tenantId: TENANT, eventKey: "n/a", payload: {} });

    expect(actWasCalled).toBe(false);
    expect(envelope.status).toBe("escalated");
    expect(envelope.autonomyApplied).toBe("never_autonomous");
    expect(envelope.findings.every((f) => f.actionTaken === null)).toBe(true);
  });

  it("✗ AiWorkflowPolicy.maxAutonomyLevel: RECOMMEND caps a workflow that declared EXECUTE → act() never reaches EXECUTE-level behaviour (docs/ai/BRIEF-04-BATCH-C.md Part 0.1)", async () => {
    const AiWorkflowPolicy = (await import("@/models/ai/AiWorkflowPolicy")).default;
    await AiWorkflowPolicy.init();
    await AiWorkflowPolicy.create({
      tenantId: TENANT,
      workflowId: "AI-00-SAFETY-MAX-AUTONOMY-CLAMP",
      killSwitchEnabled: true, // deliberately ON — proves the clamp, not the kill switch, is what blocks this
      maxAutonomyLevel: AI_AUTONOMY_LEVEL.RECOMMEND,
      confidenceThreshold: 0,
    });

    let reachedExecuteLevelBehaviour = false;

    registerWorkflow({
      id: "AI-00-SAFETY-MAX-AUTONOMY-CLAMP",
      version: "1.0.0",
      eventKeys: [],
      actionClass: "some_ordinary_write_action", // NOT in the NEVER_AUTONOMOUS list — isolates the clamp
      defaultAutonomy: AI_AUTONOMY_LEVEL.EXECUTE,
      async observe(event) {
        return { entityId: event.tenantId, raw: {} };
      },
      async extract() {
        return {};
      },
      async reason() {
        return {
          proposal: {},
          confidence: 1,
          findings: [],
          reasonChain: ["everything else would pass — only the policy clamp should stop this"],
          gateOverrides: { periodOpen: true, permissionOk: true },
        };
      },
      async validate() {
        return { valid: true };
      },
      async act(_reasoned, _ctx, decision) {
        if (decision.autonomyApplied === AI_AUTONOMY_LEVEL.EXECUTE) reachedExecuteLevelBehaviour = true;
        return { findings: [], actionsTaken: [] };
      },
      async verify() {
        return { ok: true };
      },
    });

    const { getWorkflow } = await import("@/lib/aiRuntime/runtime/registry");
    const workflow = getWorkflow("AI-00-SAFETY-MAX-AUTONOMY-CLAMP")!;
    const envelope = await runWorkflow(workflow, { tenantId: TENANT, eventKey: "n/a", payload: {} });

    expect(reachedExecuteLevelBehaviour).toBe(false);
    expect(envelope.autonomyApplied).toBe(AI_AUTONOMY_LEVEL.RECOMMEND);
    await AiWorkflowPolicy.deleteMany({ tenantId: TENANT, workflowId: "AI-00-SAFETY-MAX-AUTONOMY-CLAMP" });
  });

  it("✓ every AI action is fully audited → a run that fails mid-pipeline still writes a finalized AiDecisionTrace", async () => {
    registerWorkflow({
      id: "AI-00-SAFETY-FAILING",
      version: "1.0.0",
      eventKeys: [],
      actionClass: "read_only",
      defaultAutonomy: AI_AUTONOMY_LEVEL.OBSERVE,
      async observe(event) {
        return { entityId: event.tenantId, raw: {} };
      },
      async extract() {
        throw new Error("deliberate failure for the safety test");
      },
      async reason() {
        return { proposal: {}, confidence: 1, findings: [], reasonChain: [] };
      },
      async validate() {
        return { valid: true };
      },
      async act() {
        return { findings: [], actionsTaken: [] };
      },
      async verify() {
        return { ok: true };
      },
    });

    const { getWorkflow } = await import("@/lib/aiRuntime/runtime/registry");
    const workflow = getWorkflow("AI-00-SAFETY-FAILING")!;

    await expect(runWorkflow(workflow, { tenantId: TENANT, eventKey: "n/a", payload: {} })).rejects.toThrow(
      "deliberate failure",
    );

    const run = await AiWorkflowRun.findOne({ workflowId: "AI-00-SAFETY-FAILING" }).lean();
    expect(run).not.toBeNull();
    expect(run!.status).toBe("failed");

    const trace = await AiDecisionTrace.findOne({ runId: run!._id }).lean();
    expect(trace).not.toBeNull();
    expect(trace!.finalOutcome).toBe("failed");
    expect(trace!.finalizedAt).not.toBeUndefined();
    expect(trace!.reasonChain.join(" ")).toContain("deliberate failure");
  });

  it("✓ every autonomous workflow has a kill switch → AiWorkflowPolicy default is killSwitchEnabled: false", async () => {
    const AiWorkflowPolicy = (await import("@/models/ai/AiWorkflowPolicy")).default;
    await AiWorkflowPolicy.init();
    const doc = new AiWorkflowPolicy({ tenantId: TENANT, workflowId: "AI-UNSEEN" });
    expect(doc.killSwitchEnabled).toBe(false);
    await AiWorkflowPolicy.deleteMany({ tenantId: TENANT });
  });
});
