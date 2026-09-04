import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai_tool_registry";

import TransactionLock from "@/models/finance/TransactionLock";
import AiToolCall from "@/models/ai/AiToolCall";
import User from "@/models/auth/User";

let registerControlTools: typeof import("@/lib/aiRuntime/tools/control").registerControlTools;
let callTool: typeof import("@/lib/aiRuntime/tools/registry").callTool;
let registerTool: typeof import("@/lib/aiRuntime/tools/registry").registerTool;
let ToolNotFoundError: typeof import("@/lib/aiRuntime/tools/registry").ToolNotFoundError;
let ToolAutonomyExceededError: typeof import("@/lib/aiRuntime/tools/registry").ToolAutonomyExceededError;
let __clearRegistryForTests: typeof import("@/lib/aiRuntime/tools/registry").__clearRegistryForTests;
let AI_AUTONOMY_LEVEL: typeof import("@/lib/constants/statuses").AI_AUTONOMY_LEVEL;
let AI_TOOL_SIDE_EFFECT: typeof import("@/lib/constants/statuses").AI_TOOL_SIDE_EFFECT;

const TENANT = "tool-registry-tenant";
const RUN_ID = new mongoose.Types.ObjectId().toString();
let ADMIN_USER_ID: string;

describe("AI tool registry — permissioned ERP tool layer", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await TransactionLock.init();
    await AiToolCall.init();
    await User.init();

    ({ registerControlTools } = await import("@/lib/aiRuntime/tools/control"));
    ({ callTool, registerTool, ToolNotFoundError, ToolAutonomyExceededError, __clearRegistryForTests } =
      await import("@/lib/aiRuntime/tools/registry"));
    ({ AI_AUTONOMY_LEVEL, AI_TOOL_SIDE_EFFECT } = await import("@/lib/constants/statuses"));

    __clearRegistryForTests();
    registerControlTools();

    const admin = await User.create({
      tenantId: TENANT,
      name: "Admin",
      email: `admin-${Date.now()}@example.com`,
      phone: "9999999999",
      password: "hashed",
      role: "admin",
      status: "active",
    });
    ADMIN_USER_ID = String(admin._id);
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await TransactionLock.deleteMany({});
    await AiToolCall.deleteMany({});
  });

  it("throws ToolNotFoundError for an unregistered tool", async () => {
    await expect(
      callTool("does_not_exist", {}, { tenantId: TENANT, runId: RUN_ID, requestedAutonomy: AI_AUTONOMY_LEVEL.OBSERVE }),
    ).rejects.toBeInstanceOf(ToolNotFoundError);
  });

  it("check_period_lock genuinely calls the real assertTransactionNotLocked — open period", async () => {
    const { result } = await callTool<{ open: boolean }>(
      "check_period_lock",
      { tenantId: TENANT, module: "sales", date: "2026-06-15" },
      { tenantId: TENANT, runId: RUN_ID, requestedAutonomy: AI_AUTONOMY_LEVEL.OBSERVE },
    );
    expect(result.open).toBe(true);
  });

  it("check_period_lock genuinely blocks when a real TransactionLock exists", async () => {
    await TransactionLock.create({
      tenantId: TENANT,
      module: "sales",
      lockedUpToDate: new Date("2026-06-30"),
      isLocked: true,
      lockedBy: new mongoose.Types.ObjectId(),
    });

    const { result } = await callTool<{ open: boolean; reason: string }>(
      "check_period_lock",
      { tenantId: TENANT, module: "sales", date: "2026-06-15" },
      { tenantId: TENANT, runId: RUN_ID, requestedAutonomy: AI_AUTONOMY_LEVEL.OBSERVE },
    );
    expect(result.open).toBe(false);
    expect(result.reason).toContain("locked");
  });

  it("check_sod flags a same-user preparer/approver conflict", async () => {
    const { result } = await callTool<{ conflict: boolean }>(
      "check_sod",
      { tenantId: TENANT, preparerId: "u1", approverId: "u1" },
      { tenantId: TENANT, runId: RUN_ID, requestedAutonomy: AI_AUTONOMY_LEVEL.OBSERVE },
    );
    expect(result.conflict).toBe(true);
  });

  it("check_sod does not flag different preparer/approver", async () => {
    const { result } = await callTool<{ conflict: boolean }>(
      "check_sod",
      { tenantId: TENANT, preparerId: "u1", approverId: "u2" },
      { tenantId: TENANT, runId: RUN_ID, requestedAutonomy: AI_AUTONOMY_LEVEL.OBSERVE },
    );
    expect(result.conflict).toBe(false);
  });

  it("idempotency key: calling a tool twice with the same key returns the cached result without re-invoking", async () => {
    let invocations = 0;
    registerTool({
      name: "test_counting_tool",
      description: "counts invocations",
      sideEffect: AI_TOOL_SIDE_EFFECT.EXECUTE,
      reversible: true,
      maxAutonomyLevel: AI_AUTONOMY_LEVEL.OBSERVE,
      module: "admin",
      handler: async () => {
        invocations += 1;
        return { invocations };
      },
    });

    const key = "fixed-idempotency-key";
    const first = await callTool<{ invocations: number }>(
      "test_counting_tool",
      {},
      { tenantId: TENANT, runId: RUN_ID, requestedAutonomy: AI_AUTONOMY_LEVEL.OBSERVE, userId: ADMIN_USER_ID },
      { idempotencyKey: key },
    );
    const second = await callTool<{ invocations: number }>(
      "test_counting_tool",
      {},
      { tenantId: TENANT, runId: RUN_ID, requestedAutonomy: AI_AUTONOMY_LEVEL.OBSERVE, userId: ADMIN_USER_ID },
      { idempotencyKey: key },
    );

    expect(invocations).toBe(1);
    expect(first.result.invocations).toBe(1);
    expect(second.result.invocations).toBe(1);
  });

  it("persistent idempotency (A.3): a write-type tool call is durably recorded, not just cached in-process", async () => {
    const { registerTool, __clearRegistryForTests } = await import("@/lib/aiRuntime/tools/registry");
    __clearRegistryForTests();
    registerControlTools();

    let invocations = 0;
    registerTool({
      name: "test_persistent_write_tool",
      description: "a draft-type tool",
      sideEffect: AI_TOOL_SIDE_EFFECT.DRAFT,
      reversible: true,
      maxAutonomyLevel: AI_AUTONOMY_LEVEL.DRAFT,
      module: "admin",
      handler: async () => {
        invocations += 1;
        return { invocations, createdId: "abc123" };
      },
    });

    const key = "persistent-key-1";
    await callTool(
      "test_persistent_write_tool",
      { foo: "bar" },
      { tenantId: TENANT, runId: RUN_ID, requestedAutonomy: AI_AUTONOMY_LEVEL.DRAFT, userId: ADMIN_USER_ID },
      { idempotencyKey: key },
    );

    const row = await AiToolCall.findOne({ tenantId: TENANT, toolName: "test_persistent_write_tool", idempotencyKey: key }).lean();
    expect(row).not.toBeNull();
    expect(row!.status).toBe("succeeded");
    expect(row!.result).toMatchObject({ invocations: 1, createdId: "abc123" });

    // Simulate a fresh process: clear the in-memory fast-path cache directly by
    // re-registering the tool set (this does NOT clear the DB), then call again —
    // must replay from the persistent store, not re-invoke the handler.
    __clearRegistryForTests();
    registerControlTools();
    registerTool({
      name: "test_persistent_write_tool",
      description: "a draft-type tool",
      sideEffect: AI_TOOL_SIDE_EFFECT.DRAFT,
      reversible: true,
      maxAutonomyLevel: AI_AUTONOMY_LEVEL.DRAFT,
      module: "admin",
      handler: async () => {
        invocations += 1;
        return { invocations, createdId: "abc123" };
      },
    });

    const replayed = await callTool<{ invocations: number }>(
      "test_persistent_write_tool",
      { foo: "bar" },
      { tenantId: TENANT, runId: RUN_ID, requestedAutonomy: AI_AUTONOMY_LEVEL.DRAFT, userId: ADMIN_USER_ID },
      { idempotencyKey: key },
    );

    expect(invocations).toBe(1); // handler was NOT invoked a second time
    expect(replayed.result.invocations).toBe(1);
  });

  it("persistent idempotency: a genuinely concurrent duplicate call (still in_flight) is rejected, not silently re-run", async () => {
    const { registerTool, __clearRegistryForTests } = await import("@/lib/aiRuntime/tools/registry");
    const { ToolCallInProgressError } = await import("@/lib/aiRuntime/tools/registry");
    __clearRegistryForTests();
    registerControlTools();

    // Directly seed an in_flight row to simulate a concurrent in-progress call.
    await AiToolCall.create({
      tenantId: TENANT,
      runId: RUN_ID,
      toolName: "test_inflight_tool",
      idempotencyKey: "inflight-key",
      argsHash: "irrelevant",
      status: "in_flight",
    });

    registerTool({
      name: "test_inflight_tool",
      description: "should never actually run in this test",
      sideEffect: AI_TOOL_SIDE_EFFECT.DRAFT,
      reversible: true,
      maxAutonomyLevel: AI_AUTONOMY_LEVEL.DRAFT,
      module: "admin",
      handler: async () => ({ shouldNotHappen: true }),
    });

    await expect(
      callTool(
        "test_inflight_tool",
        {},
        { tenantId: TENANT, runId: RUN_ID, requestedAutonomy: AI_AUTONOMY_LEVEL.DRAFT, userId: ADMIN_USER_ID },
        { idempotencyKey: "inflight-key" },
      ),
    ).rejects.toBeInstanceOf(ToolCallInProgressError);
  });

  it("rejects a call whose requested autonomy exceeds the tool's max_autonomy_level", async () => {
    registerTool({
      name: "test_observe_only_tool",
      description: "only callable at OBSERVE",
      sideEffect: AI_TOOL_SIDE_EFFECT.READ,
      reversible: true,
      maxAutonomyLevel: AI_AUTONOMY_LEVEL.OBSERVE,
      handler: async () => ({ ok: true }),
    });

    await expect(
      callTool(
        "test_observe_only_tool",
        {},
        { tenantId: TENANT, runId: RUN_ID, requestedAutonomy: AI_AUTONOMY_LEVEL.EXECUTE },
      ),
    ).rejects.toBeInstanceOf(ToolAutonomyExceededError);
  });

  it("structural permission gate: a draft/execute tool call is denied without a real, authorized user — even if the workflow never calls check_permission itself", async () => {
    const { ToolPermissionDeniedError } = await import("@/lib/aiRuntime/tools/registry");
    registerTool({
      name: "test_write_tool_no_module",
      description: "a write tool with no declared module — must fail closed",
      sideEffect: AI_TOOL_SIDE_EFFECT.EXECUTE,
      reversible: true,
      maxAutonomyLevel: AI_AUTONOMY_LEVEL.EXECUTE,
      handler: async () => ({ ok: true }),
    });

    // No userId at all.
    await expect(
      callTool(
        "test_write_tool_no_module",
        {},
        { tenantId: TENANT, runId: RUN_ID, requestedAutonomy: AI_AUTONOMY_LEVEL.EXECUTE },
      ),
    ).rejects.toBeInstanceOf(ToolPermissionDeniedError);

    // A real user, but the tool declared no module (denies by default, per A.2).
    await expect(
      callTool(
        "test_write_tool_no_module",
        {},
        { tenantId: TENANT, runId: RUN_ID, requestedAutonomy: AI_AUTONOMY_LEVEL.EXECUTE, userId: ADMIN_USER_ID },
      ),
    ).rejects.toBeInstanceOf(ToolPermissionDeniedError);
  });

  it("structural permission gate: a real, authorized user for the tool's declared module is allowed through", async () => {
    registerTool({
      name: "test_write_tool_with_module",
      description: "declares module: admin",
      sideEffect: AI_TOOL_SIDE_EFFECT.EXECUTE,
      reversible: true,
      maxAutonomyLevel: AI_AUTONOMY_LEVEL.EXECUTE,
      module: "admin",
      handler: async () => ({ ok: true }),
    });

    const { result } = await callTool<{ ok: boolean }>(
      "test_write_tool_with_module",
      {},
      { tenantId: TENANT, runId: RUN_ID, requestedAutonomy: AI_AUTONOMY_LEVEL.EXECUTE, userId: ADMIN_USER_ID },
    );
    expect(result.ok).toBe(true);
  });
});
