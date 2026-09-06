import { describe, expect, it, beforeAll } from "vitest";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_capabilityregistrycoverage";

// controls/definitions.ts and reconciliation/definitions.ts both import connectDB at their own
// top level (for their real population()/run() implementations), so — like every other file in
// this suite that reaches lib/db.ts transitively — they must be imported dynamically, inside
// beforeAll, after MONGODB_URI is set above. capabilities/registry.ts has no such dependency
// (pure data) and stays a plain static import.
import { CAPABILITY_REGISTRY } from "@/lib/aiRuntime/capabilities/registry";

let CONTROL_DEFINITIONS: typeof import("@/lib/aiRuntime/controls/definitions").CONTROL_DEFINITIONS;
let RECONCILIATION_DEFINITIONS: typeof import("@/lib/aiRuntime/reconciliation/definitions").RECONCILIATION_DEFINITIONS;

beforeAll(async () => {
  ({ CONTROL_DEFINITIONS } = await import("@/lib/aiRuntime/controls/definitions"));
  ({ RECONCILIATION_DEFINITIONS } = await import("@/lib/aiRuntime/reconciliation/definitions"));
});

/**
 * Chunk 10 (P0.4) — the coverage half of the registry check that `capabilityRegistryDrift.test.ts`
 * cannot perform. That file proves the registry is internally consistent; it has no way to notice
 * a declaration that was never added to the registry in the first place, because it only walks
 * `CAPABILITY_REGISTRY` and `getWorkflowGaps()`.
 *
 * That's exactly the gap `approver_authority` fell through: `controls/definitions.ts`'s
 * `approverAuthorityDefinition` is a full, real `ControlDefinition` (real `population()`/`test()`
 * functions) with `status: "partial"` and its own hand-written `reasonIfLimited` string — it was
 * never built through the `notImplemented()` helper that reads from the registry, so nothing ever
 * told the registry it existed. This file walks `CONTROL_DEFINITIONS`/`RECONCILIATION_DEFINITIONS`
 * themselves (the OTHER direction) and asserts every non-fully-implemented one is mirrored in the
 * registry with a matching status — so a future hand-coded "partial"/`not_implemented` definition
 * fails this test the moment it's added, rather than sitting undiscovered for a whole chunk.
 */

describe("Capability registry coverage — every non-implemented control/reconciliation definition is registered (Chunk 10, P0.4)", () => {
  it("every ControlDefinition with status !== 'implemented' has a matching, same-status CAPABILITY_REGISTRY entry", () => {
    const gaps = CONTROL_DEFINITIONS.filter((c) => c.status !== "implemented");
    expect(gaps.length, "sanity check: expected at least the known not_implemented/partial controls to exist").toBeGreaterThan(0);

    for (const control of gaps) {
      const entry = CAPABILITY_REGISTRY.find((c) => c.capabilityId === control.id);
      expect(entry, `ControlDefinition "${control.id}" has status "${control.status}" but no matching entry exists in CAPABILITY_REGISTRY — this is exactly the gap approver_authority fell through. Add it.`).toBeDefined();
      expect(entry!.status, `ControlDefinition "${control.id}" is "${control.status}" in code but "${entry!.status}" in the registry — these must agree.`).toBe(control.status);
    }
  });

  it("every ReconciliationDefinition with run === null (not implemented) has a matching CAPABILITY_REGISTRY entry", () => {
    const gaps = RECONCILIATION_DEFINITIONS.filter((r) => r.run === null);
    expect(gaps.length, "sanity check: expected at least the known not_implemented reconciliation definitions to exist").toBeGreaterThan(0);

    for (const def of gaps) {
      const entry = CAPABILITY_REGISTRY.find((c) => c.capabilityId === def.id);
      expect(entry, `ReconciliationDefinition "${def.id}" has run: null (not implemented) but no matching entry exists in CAPABILITY_REGISTRY.`).toBeDefined();
      expect(entry!.status).toBe("not_implemented");
    }
  });

  it("no ControlDefinition/ReconciliationDefinition id collides across the two definition sets with a different meaning", () => {
    const controlIds = new Set(CONTROL_DEFINITIONS.map((c) => c.id));
    const reconciliationIds = new Set(RECONCILIATION_DEFINITIONS.map((r) => r.id));
    const overlap = [...controlIds].filter((id) => reconciliationIds.has(id));
    expect(overlap, "a control id and a reconciliation id collide — the registry keys them in one flat namespace, so this would make one entry ambiguous between two different real definitions").toEqual([]);
  });
});
