import { describe, expect, it, beforeAll } from "vitest";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_capabilityregistrydrift";

import { CAPABILITY_REGISTRY, getWorkflowGaps } from "@/lib/aiRuntime/capabilities/registry";

/**
 * Chunk 9 (0.2) — the structural check that would have caught the AI-06 staleness bug directly:
 * AI-06's own report declared AI-19/AI-27 had already closed gaps that AI-06's CODE still cited
 * as open (docs/ai/OPEN_QUESTIONS.md #36). That was possible only because each workflow held its
 * own hand-written `{what, reason}` array — nothing connected a workflow's declaration to whether
 * the gap it names was actually still open.
 *
 * Now every declaration lives in one place (lib/aiRuntime/capabilities/registry.ts) and workflows
 * read it via `getWorkflowGaps()` rather than hard-coding it, so the exact AI-06 failure shape is
 * structurally impossible: a workflow cannot cite a gap the registry itself has marked resolved,
 * because `getWorkflowGaps()` filters out anything `status !== "not_implemented"`/`"partial"`.
 * This file locks that in as a regression test, plus the referential-integrity checks that catch
 * the registry itself drifting (an id pointing at a workflow that no longer exists, or a
 * status/resolvedAt pair that contradicts itself).
 */

let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let getWorkflow: typeof import("@/lib/aiRuntime/runtime/registry").getWorkflow;

describe("Capability registry — drift checks (Chunk 9 0.2)", () => {
  beforeAll(async () => {
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ getWorkflow } = await import("@/lib/aiRuntime/runtime/registry"));
    bootstrapAiRuntime();
  });

  it("no capabilityId is declared twice", () => {
    const ids = CAPABILITY_REGISTRY.map((c) => c.capabilityId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every declaredBy workflow id is a real, currently-registered workflow", () => {
    for (const c of CAPABILITY_REGISTRY) {
      for (const workflowId of c.declaredBy) {
        expect(getWorkflow(workflowId), `${c.capabilityId} is declaredBy "${workflowId}", which is not a registered workflow`).toBeDefined();
      }
    }
  });

  it("every resolvedBy workflow id (when set) is a real, currently-registered workflow — catches a renamed/removed workflow left dangling in the registry", () => {
    for (const c of CAPABILITY_REGISTRY) {
      if (c.resolvedBy === null) continue;
      expect(getWorkflow(c.resolvedBy), `${c.capabilityId}'s resolvedBy "${c.resolvedBy}" is not a registered workflow`).toBeDefined();
    }
  });

  it("status and resolvedAt cannot contradict each other", () => {
    for (const c of CAPABILITY_REGISTRY) {
      if (c.status === "implemented") {
        expect(c.resolvedAt, `${c.capabilityId} is "implemented" but has no resolvedAt`).not.toBeNull();
        expect(c.resolvedBy, `${c.capabilityId} is "implemented" but has no resolvedBy`).not.toBeNull();
      } else {
        expect(c.resolvedAt, `${c.capabilityId} is "${c.status}" (still open) but carries a resolvedAt`).toBeNull();
      }
    }
  });

  it("no declaration is not_implemented while its resolvedBy workflow exists and already implements it — the exact AI-06 failure shape, locked in as a regression test", () => {
    for (const c of CAPABILITY_REGISTRY) {
      if (c.status !== "not_implemented" || c.resolvedBy === null) continue;
      // The resolving workflow must exist (checked above) but must NOT itself be citing this
      // same capabilityId as one of ITS OWN currently-open gaps — that would mean the workflow
      // that supposedly closes the gap is, by its own declaration, still blocked on it.
      const resolvedByOwnGaps = getWorkflowGaps(c.resolvedBy);
      expect(
        resolvedByOwnGaps.some((g) => g.what === c.capabilityId),
        `${c.capabilityId}'s resolvedBy "${c.resolvedBy}" cites the same capabilityId as its own open gap — contradictory`,
      ).toBe(false);
    }
  });

  it("no workflow's own declared gaps include a capability the registry already marks implemented — the direct AI-06 regression lock", () => {
    for (const c of CAPABILITY_REGISTRY) {
      if (c.status !== "implemented") continue;
      for (const workflowId of c.declaredBy) {
        const ownGaps = getWorkflowGaps(workflowId);
        expect(
          ownGaps.some((g) => g.what === c.capabilityId),
          `${workflowId} still cites "${c.capabilityId}" as an open gap, but the registry marks it implemented`,
        ).toBe(false);
      }
    }
  });
});
