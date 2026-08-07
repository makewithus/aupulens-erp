/**
 * Visual ERP Builder graph→rule compiler tests (6.10).
 *
 * The canvas is a visual layer over the SAME AutomationRule backend, so the
 * critical guarantee is that a valid node graph compiles to the exact payload
 * POST /api/crm/automations expects, with the same vocabulary validation as the
 * NL and form builders.
 */
import { describe, it, expect, vi } from "vitest";

// compileGraphToRule is pure, but it imports the vocabulary constants from
// nlToRule, which transitively imports @/lib/ai/tenantAi → @/lib/db (whose
// top-level guard throws without MONGODB_URI). Mock the DB so it imports.
vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/models/Organization", () => ({ default: function Organization() {} }));

import { compileGraphToRule, type WorkflowNode } from "@/lib/crm/workflowGraph";

const trigger = (over = {}): WorkflowNode => ({ id: "t1", data: { kind: "trigger", trigger: "record_created", entity: "Lead", ...over } as any });
const action = (over = {}): WorkflowNode => ({ id: "a1", data: { kind: "action", actionType: "create_task", payload: "", ...over } as any });

describe("compileGraphToRule", () => {
  it("compiles a trigger + condition + action graph into the rule payload", () => {
    const nodes: WorkflowNode[] = [
      trigger({ entity: "Opportunity", trigger: "stage_changed" }),
      { id: "c1", data: { kind: "condition", field: "stage", operator: "equals", value: "Negotiation" } },
      action({ actionType: "create_task", payload: '{"title":"Follow up"}' }),
    ];
    const res = compileGraphToRule("Deal follow-up", nodes);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.rule).toMatchObject({
        name: "Deal follow-up",
        entity: "Opportunity",
        trigger: "stage_changed",
        conditions: [{ field: "stage", operator: "equals", value: "Negotiation" }],
        actions: [{ type: "create_task", payload: { title: "Follow up" } }],
      });
      expect(res.warnings).toEqual([]);
    }
  });

  it("requires a name", () => {
    expect(compileGraphToRule("", [trigger(), action()])).toMatchObject({ ok: false });
  });

  it("requires exactly one trigger", () => {
    expect(compileGraphToRule("x", [action()])).toMatchObject({ ok: false, error: expect.stringMatching(/Trigger/) });
    expect(compileGraphToRule("x", [trigger(), trigger({ }), action()])).toMatchObject({ ok: false, error: expect.stringMatching(/one Trigger/) });
  });

  it("requires at least one action", () => {
    expect(compileGraphToRule("x", [trigger()])).toMatchObject({ ok: false, error: expect.stringMatching(/Action/) });
  });

  it("coerces an unknown trigger/entity to safe defaults with warnings", () => {
    const res = compileGraphToRule("x", [trigger({ trigger: "when_pigs_fly", entity: "Unicorn" }), action()]);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.rule.trigger).toBe("record_created");
      expect(res.rule.entity).toBe("Lead");
      expect(res.warnings.length).toBe(2);
    }
  });

  it("drops invalid conditions and unsupported actions", () => {
    const nodes: WorkflowNode[] = [
      trigger(),
      { id: "c1", data: { kind: "condition", field: "x", operator: "telepathy", value: "1" } },
      { id: "a1", data: { kind: "action", actionType: "launch_missiles", payload: "" } },
      { id: "a2", data: { kind: "action", actionType: "send_email", payload: '{"subject":"hi"}' } },
    ];
    const res = compileGraphToRule("x", nodes);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.rule.conditions).toHaveLength(0);
      expect(res.rule.actions).toHaveLength(1);
      expect(res.rule.actions[0].type).toBe("send_email");
    }
  });

  it("tolerates malformed action payload JSON (defaults to {})", () => {
    const res = compileGraphToRule("x", [trigger(), action({ payload: "{not valid json" })]);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.rule.actions[0].payload).toEqual({});
  });
});
