import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
vi.mock("@/lib/db", () => ({ default: async () => mongoose.connection }));
import AiToolCall from "@/models/ai/AiToolCall";
import { callTool, registerTool, __clearRegistryForTests } from "@/lib/aiRuntime/tools/registry";
import { AI_AUTONOMY_LEVEL, AI_TOOL_SIDE_EFFECT } from "@/lib/constants/statuses";
const handler = vi.fn(async (_args: any, ctx: any) => ({ sourceTenant: ctx.tenantId }));
const context = (tenantId: any) => ({ tenantId, runId: new mongoose.Types.ObjectId().toString(), requestedAutonomy: AI_AUTONOMY_LEVEL.OBSERVE });
beforeAll(async () => { await mongoose.connect(process.env.MONGODB_URI!, { serverSelectionTimeoutMS: 5000 }); await AiToolCall.init(); });
beforeEach(() => {
  __clearRegistryForTests(); handler.mockClear();
  registerTool({ name: "final_audit_cache", description: "Synthetic internal state fixture", sideEffect: AI_TOOL_SIDE_EFFECT.DRAFT, category: "internal_state", reversible: true, maxAutonomyLevel: AI_AUTONOMY_LEVEL.OBSERVE, handler });
});
afterAll(async () => { if (mongoose.connection.name.startsWith("aupulens_test_")) await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
describe("Final audit: AI tool tenant cache isolation", () => {
  it("does not return tenant A's cached result when tenant B reuses the same tool and idempotency key", async () => {
    const key = `shared-${Date.now()}`;
    expect((await callTool("final_audit_cache", {}, context("cache-a"), { idempotencyKey: key })).result).toEqual({ sourceTenant: "cache-a" });
    expect((await callTool("final_audit_cache", {}, context("cache-b"), { idempotencyKey: key })).result).toEqual({ sourceTenant: "cache-b" });
    expect(handler).toHaveBeenCalledTimes(2);
    expect(await AiToolCall.countDocuments({ idempotencyKey: key })).toBe(2);
  });
  it.each([undefined, "", "   ", { $ne: "foreign" }])("fails closed on invalid tenant context %j", async (tenantId) => {
    await expect(callTool("final_audit_cache", {}, context(tenantId))).rejects.toThrow("Tenant identity is required");
    expect(handler).not.toHaveBeenCalled();
  });
});
