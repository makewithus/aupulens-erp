/**
 * Pure-logic tests for the Aupulens Studio engine: condition evaluation,
 * template interpolation, catalog step validation, and the step-execution core
 * (via injected fake runners — no DB/network). The real runners (webhook/AI/
 * notify) and DB persistence are covered by live verification.
 */

import { describe, it, expect } from "vitest";
import { evaluateConditions, interpolate, getPath } from "@/lib/studio/conditions";
import { validateStep, WORKFLOW_ACTION_TYPE } from "@/lib/studio/catalog";
import { executeSteps, type ActionRunnerMap, type RunContext } from "@/lib/studio/engine";

describe("conditions", () => {
  const payload = { payload: { name: "Acme", amount: 50000, tags: "vip,new" } };

  it("getPath resolves dot paths", () => {
    expect(getPath(payload, "payload.name")).toBe("Acme");
    expect(getPath(payload, "payload.missing")).toBeUndefined();
  });

  it("empty conditions always pass", () => {
    expect(evaluateConditions([], payload)).toBe(true);
  });

  it("evaluates operators (AND semantics)", () => {
    expect(evaluateConditions([{ field: "payload.amount", operator: "greater_than", value: 1000 }], payload)).toBe(true);
    expect(evaluateConditions([{ field: "payload.amount", operator: "less_than", value: 1000 }], payload)).toBe(false);
    expect(evaluateConditions([{ field: "payload.name", operator: "equals", value: "Acme" }], payload)).toBe(true);
    expect(evaluateConditions([{ field: "payload.tags", operator: "contains", value: "VIP" }], payload)).toBe(true);
    expect(evaluateConditions([{ field: "payload.missing", operator: "not_exists" }], payload)).toBe(true);
    // one failing condition fails the AND
    expect(evaluateConditions([
      { field: "payload.amount", operator: "greater_than", value: 1000 },
      { field: "payload.name", operator: "equals", value: "Nope" },
    ], payload)).toBe(false);
  });
});

describe("interpolate", () => {
  it("substitutes dot-path tokens", () => {
    expect(interpolate("Hi {{payload.name}} ({{payload.amount}})", { payload: { name: "Acme", amount: 50000 } })).toBe("Hi Acme (50000)");
  });
  it("renders missing paths as empty string", () => {
    expect(interpolate("x={{payload.nope}}", { payload: {} })).toBe("x=");
  });
});

describe("validateStep", () => {
  it("rejects unknown action types", () => {
    expect(validateStep({ type: "nope", params: {} })).toMatch(/Unknown action/);
  });
  it("requires mandatory params", () => {
    expect(validateStep({ type: WORKFLOW_ACTION_TYPE.LOG, params: {} })).toMatch(/required/);
    expect(validateStep({ type: WORKFLOW_ACTION_TYPE.LOG, params: { message: "hi" } })).toBeNull();
  });
});

describe("executeSteps", () => {
  const ctx = (): RunContext => ({ tenantId: "t1", userId: "u1", vars: { payload: { amount: 5000 } } });
  const fakeRunners: ActionRunnerMap = {
    log: async (p) => `logged:${p.message}`,
    set_context: async (p, c) => { c.vars[String(p.key)] = p.value; return "set"; },
    boom: async () => { throw new Error("kaboom"); },
  };

  it("skips when conditions fail", async () => {
    const res = await executeSteps(
      [{ field: "payload.amount", operator: "greater_than", value: 999999 }],
      [{ type: "log", params: { message: "x" } }],
      ctx(), fakeRunners,
    );
    expect(res.status).toBe("skipped");
    expect(res.conditionsMet).toBe(false);
    expect(res.stepResults).toHaveLength(0);
  });

  it("runs all steps on success and threads context", async () => {
    const c = ctx();
    const res = await executeSteps(
      [],
      [{ type: "set_context", params: { key: "flag", value: "yes" } }, { type: "log", params: { message: "done" } }],
      c, fakeRunners,
    );
    expect(res.status).toBe("success");
    expect(res.stepResults).toHaveLength(2);
    expect(c.vars.flag).toBe("yes");
  });

  it("stops on first failure and marks partial when earlier steps ran", async () => {
    const res = await executeSteps(
      [],
      [{ type: "log", params: { message: "ok" } }, { type: "boom", params: {} }, { type: "log", params: { message: "never" } }],
      ctx(), fakeRunners,
    );
    expect(res.status).toBe("partial");
    expect(res.stepResults).toHaveLength(2); // third never runs
    expect(res.error).toMatch(/kaboom/);
  });

  it("marks failed when the very first step fails", async () => {
    const res = await executeSteps([], [{ type: "boom", params: {} }], ctx(), fakeRunners);
    expect(res.status).toBe("failed");
  });

  it("fails a step with no registered runner", async () => {
    const res = await executeSteps([], [{ type: "ghost", params: {} }], ctx(), fakeRunners);
    expect(res.status).toBe("failed");
    expect(res.stepResults[0].message).toMatch(/No runner/);
  });
});
