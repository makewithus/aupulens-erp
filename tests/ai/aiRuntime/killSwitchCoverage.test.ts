import { describe, expect, it, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";

process.env.MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/aupulens_test_ai_killswitch_coverage";

/**
 * Phase 10 Addendum A Part 0.2's structural test — "in the style of the
 * source-grep tests" (tests/ai/aiRuntime/safety.test.ts). The runtime
 * defect this project just fixed: `lib/aiRuntime/runtime/eventBus.ts` used
 * to exempt a workflow from its own kill switch based on DECLARED AUTONOMY
 * LEVEL (OBSERVE/RECOMMEND assumed to never write), which was false for 9
 * of 30 real workflows (docs/ai/audits/KILLSWITCH_AUDIT.md). The fix makes
 * the exemption depend on a workflow-declared `performsWrites` field
 * instead. A declared field only helps if nothing can reach a write tool
 * without declaring it — this test is that check: it reads every
 * workflow's real source, finds every `rt.callTool("name", ...)` call, and
 * fails if any resolved tool has a write-capable `sideEffect` ("draft" or
 * "execute") while the workflow's own `performsWrites` is not `true`. A
 * 31st workflow that adds a write tool call without setting the field
 * fails this test, not silently reintroduces the bypass.
 */

let listWorkflows: typeof import("@/lib/aiRuntime/runtime/registry").listWorkflows;
let getTool: typeof import("@/lib/aiRuntime/tools/registry").getTool;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;

const WORKFLOWS_DIR = path.join(process.cwd(), "lib/aiRuntime/workflows");

/** "AI-00-SMOKE" -> "0", "AI-11" -> "11" — parseInt strips leading zeros so the
 *  directory-matching regex below can't have "AI-1" spuriously match "ai-11-...". */
function numericIdOf(workflowId: string): string {
  const m = /^AI-(\d+)/i.exec(workflowId);
  expect(m, `workflow id "${workflowId}" does not match the expected AI-NN pattern`).not.toBeNull();
  return String(parseInt(m![1], 10));
}

function readWorkflowSource(workflowId: string): string {
  const numericId = numericIdOf(workflowId);
  const dirs = fs.readdirSync(WORKFLOWS_DIR).filter((d) => new RegExp(`^ai-0*${numericId}-`, "i").test(d));
  expect(dirs.length, `no source directory found for workflow "${workflowId}" — update this test's matching`).toBeGreaterThan(0);
  let source = "";
  for (const d of dirs) {
    const idxPath = path.join(WORKFLOWS_DIR, d, "index.ts");
    if (fs.existsSync(idxPath)) source += fs.readFileSync(idxPath, "utf-8");
  }
  expect(source.length, `workflow "${workflowId}" resolved to directory/directories ${dirs.join(", ")} but no index.ts had content`).toBeGreaterThan(0);
  return source;
}

function writeCapableToolNames(source: string, getToolFn: typeof import("@/lib/aiRuntime/tools/registry").getTool): string[] {
  const toolNames = new Set(Array.from(source.matchAll(/callTool(?:<[^>]*>)?\(\s*["'`]([a-zA-Z0-9_]+)["'`]/g)).map((m) => m[1]));
  return Array.from(toolNames).filter((name) => {
    const tool = getToolFn(name);
    return tool && (tool.sideEffect === "draft" || tool.sideEffect === "execute");
  });
}

describe("Phase 10 Addendum A Part 0.2 — kill-switch coverage", () => {
  beforeAll(async () => {
    ({ listWorkflows } = await import("@/lib/aiRuntime/runtime/registry"));
    ({ getTool } = await import("@/lib/aiRuntime/tools/registry"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    bootstrapAiRuntime();
  });

  it("registers all thirty-plus workflows — this test is vacuous if bootstrap silently registered fewer", () => {
    expect(listWorkflows().length).toBeGreaterThanOrEqual(30);
  });

  it("✗ a workflow that can reach a write-capable tool is exempt from the kill switch → every such workflow declares performsWrites: true", () => {
    const workflows = listWorkflows();
    expect(workflows.length).toBeGreaterThan(0);

    const violations: string[] = [];

    for (const wf of workflows) {
      const source = readWorkflowSource(wf.id);
      const writeTools = writeCapableToolNames(source, getTool);
      if (writeTools.length > 0 && !wf.performsWrites) {
        violations.push(`${wf.id} calls write-capable tool(s) [${writeTools.join(", ")}] but does not declare performsWrites: true`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("a workflow declaring performsWrites: true actually calls at least one write-capable tool — the flag should not be set speculatively", () => {
    const workflows = listWorkflows().filter((wf) => wf.performsWrites);
    expect(workflows.length).toBeGreaterThan(0); // the audited 9 must still be flagged

    const overDeclared: string[] = [];

    for (const wf of workflows) {
      const source = readWorkflowSource(wf.id);
      if (writeCapableToolNames(source, getTool).length === 0) overDeclared.push(wf.id);
    }

    expect(overDeclared).toEqual([]);
  });

  it("✓ the dispatch gate only skips a disabled workflow when it can write — a read-only OBSERVE workflow with performsWrites unset must never be exempt-checked away from running", () => {
    // Documents the intended contract for eventBus.ts's dispatchEvent(): the audit found the
    // OLD exemption too broad (autonomy-level based). The fix must not swing the other way and
    // gate every workflow — read-only ones (performsWrites falsy) keep their exemption, since
    // Hard Rule 6 only requires a kill switch for something that WRITES. This is asserted as a
    // property of the registry itself: every workflow with performsWrites falsy must resolve to
    // zero write-capable tool calls (the inverse of the first assertion above), so eventBus.ts's
    // `if (!enabled && workflow.performsWrites) continue;` never wrongly lets a writer through.
    const workflows = listWorkflows().filter((wf) => !wf.performsWrites);
    const wronglyExempt: string[] = [];

    for (const wf of workflows) {
      const source = readWorkflowSource(wf.id);
      if (writeCapableToolNames(source, getTool).length > 0) wronglyExempt.push(wf.id);
    }

    expect(wronglyExempt).toEqual([]);
  });
});
