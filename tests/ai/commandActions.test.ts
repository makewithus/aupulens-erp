/**
 * Generalized Command Center action-registry tests.
 *
 * The confirm gate's safety hinges on: (a) every supported action is
 * registered, (b) buildPreview validates without mutating, (c) unknown actions
 * are rejected. The full propose→confirm→execute→audit flow against a real DB
 * is covered live by scripts/verify-command-executor.ts.
 */
import { describe, it, expect, vi } from "vitest";

const { mockConnectDB, mockLeadFindOne, mockTaskCreate, mockAuditCreate } = vi.hoisted(() => ({
  mockConnectDB: vi.fn(),
  mockLeadFindOne: vi.fn(),
  mockTaskCreate: vi.fn(),
  mockAuditCreate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ default: mockConnectDB }));
vi.mock("@/models/crm/Lead", () => ({
  default: { findOne: (...a: any[]) => ({ select: () => ({ lean: () => mockLeadFindOne(...a) }) }) },
}));
vi.mock("@/models/crm/Task", () => ({ default: { create: mockTaskCreate } }));
vi.mock("@/models/crm/CrmAuditLog", () => ({ default: { create: mockAuditCreate } }));

import { COMMAND_ACTIONS, COMMAND_ACTION_TYPES, isCommandAction, CommandActionError } from "@/lib/ai/commandActions";

describe("command action registry", () => {
  it("registers the expected actions and flags the destructive one", () => {
    expect(COMMAND_ACTION_TYPES).toEqual(expect.arrayContaining(["create_task", "update_lead_status", "delete_lead"]));
    expect(COMMAND_ACTIONS.delete_lead.destructive).toBe(true);
    expect(COMMAND_ACTIONS.create_task.destructive).toBe(false);
    expect(COMMAND_ACTIONS.update_lead_status.destructive).toBe(false);
  });

  it("isCommandAction rejects unknown actions", () => {
    expect(isCommandAction("delete_lead")).toBe(true);
    expect(isCommandAction("drop_database")).toBe(false);
  });
});

describe("create_task buildPreview (no mutation, lenient params)", () => {
  it("accepts title, taskDescription, or description as the task text", async () => {
    for (const params of [{ title: "Call CFO" }, { taskDescription: "Call CFO" }, { description: "Call CFO" }]) {
      const { summary, preview } = await COMMAND_ACTIONS.create_task.buildPreview(params, "t1");
      expect(summary).toContain("Call CFO");
      expect((preview as any).title).toBe("Call CFO");
    }
    // Crucially, previewing NEVER creates a task.
    expect(mockTaskCreate).not.toHaveBeenCalled();
  });

  it("maps 'tomorrow' to a near-term due date and defaults otherwise", async () => {
    expect((await COMMAND_ACTIONS.create_task.buildPreview({ title: "x", dueDate: "tomorrow" }, "t1")).preview).toMatchObject({ dueInDays: 1 });
    expect((await COMMAND_ACTIONS.create_task.buildPreview({ title: "x" }, "t1")).preview).toMatchObject({ dueInDays: 3 });
  });

  it("throws a CommandActionError when no title can be derived", async () => {
    await expect(COMMAND_ACTIONS.create_task.buildPreview({}, "t1")).rejects.toBeInstanceOf(CommandActionError);
  });
});

describe("update_lead_status buildPreview", () => {
  it("rejects an invalid status without touching the DB record", async () => {
    await expect(COMMAND_ACTIONS.update_lead_status.buildPreview({ leadId: "1", status: "Bogus" }, "t1")).rejects.toBeInstanceOf(CommandActionError);
  });

  it("summarises the from→to transition for a real lead", async () => {
    mockLeadFindOne.mockResolvedValueOnce({ lead_name: "Jo", status: "New" });
    const { summary, preview } = await COMMAND_ACTIONS.update_lead_status.buildPreview({ leadId: "1", status: "Qualified" }, "t1");
    expect(summary).toContain("New");
    expect(summary).toContain("Qualified");
    expect(preview).toMatchObject({ from: "New", to: "Qualified" });
  });

  it("throws when the lead does not exist", async () => {
    mockLeadFindOne.mockResolvedValueOnce(null);
    await expect(COMMAND_ACTIONS.update_lead_status.buildPreview({ leadId: "missing", status: "Qualified" }, "t1")).rejects.toBeInstanceOf(CommandActionError);
  });
});

describe("delete_lead buildPreview (destructive)", () => {
  it("produces an irreversible-flagged preview and does not delete", async () => {
    mockLeadFindOne.mockResolvedValueOnce({ lead_name: "Zed", company_name: "Z Co", status: "New" });
    const { summary, preview } = await COMMAND_ACTIONS.delete_lead.buildPreview({ leadId: "1" }, "t1");
    expect(summary).toMatch(/PERMANENTLY DELETE/);
    expect(preview).toMatchObject({ irreversible: true });
  });
});
