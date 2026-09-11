import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_platform_limit_behavior";

import AiLimit from "@/models/platform/AiLimit";
import PlatformAuditLog from "@/models/platform/PlatformAuditLog";
import { AI_AT_LIMIT_BEHAVIOR } from "@/lib/constants/statuses";

let resolveAtLimitDecision: typeof import("@/lib/platform/ai/limitBehavior").resolveAtLimitDecision;

describe("resolveAtLimitDecision — source doc §15's 4 at-limit behaviours", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await AiLimit.init();
    await PlatformAuditLog.init();
    ({ resolveAtLimitDecision } = await import("@/lib/platform/ai/limitBehavior"));
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await AiLimit.deleteMany({});
    await PlatformAuditLog.deleteMany({}).setOptions({ allowRetentionDelete: true });
  });

  it("BLOCK is the default when no AiLimit row exists — byte-identical to pre-Phase-4 behaviour", async () => {
    const decision = await resolveAtLimitDecision("unconfigured-tenant");
    expect(decision).toEqual({ action: "block" });
  });

  it("BLOCK when explicitly configured", async () => {
    await AiLimit.create({ tenantId: "acme", atLimitBehavior: AI_AT_LIMIT_BEHAVIOR.BLOCK });
    const decision = await resolveAtLimitDecision("acme");
    expect(decision).toEqual({ action: "block" });
  });

  it("THROTTLE allows the call and specifies a delay", async () => {
    await AiLimit.create({ tenantId: "acme", atLimitBehavior: AI_AT_LIMIT_BEHAVIOR.THROTTLE });
    const decision = await resolveAtLimitDecision("acme");
    expect(decision.action).toBe("allow");
    if (decision.action === "allow") {
      expect(decision.behavior).toBe(AI_AT_LIMIT_BEHAVIOR.THROTTLE);
      expect(decision.delayMs).toBeGreaterThan(0);
    }
  });

  it("ALLOW_WITH_OVERAGE allows the call and audits a WARNING-severity event", async () => {
    await AiLimit.create({ tenantId: "acme", atLimitBehavior: AI_AT_LIMIT_BEHAVIOR.ALLOW_WITH_OVERAGE });
    const decision = await resolveAtLimitDecision("acme");
    expect(decision.action).toBe("allow");
    const logs = await PlatformAuditLog.find({ tenantId: "acme" });
    expect(logs).toHaveLength(1);
    expect(logs[0].severity).toBe("warning");
  });

  it("ALLOW_AND_LOG allows the call and audits", async () => {
    await AiLimit.create({ tenantId: "acme", atLimitBehavior: AI_AT_LIMIT_BEHAVIOR.ALLOW_AND_LOG });
    const decision = await resolveAtLimitDecision("acme");
    expect(decision.action).toBe("allow");
    const logs = await PlatformAuditLog.find({ tenantId: "acme" });
    expect(logs).toHaveLength(1);
  });

  it("BLOCK does not audit an extra event (the existing AI_LIMIT_REACHED gated response is the record)", async () => {
    await AiLimit.create({ tenantId: "acme", atLimitBehavior: AI_AT_LIMIT_BEHAVIOR.BLOCK });
    await resolveAtLimitDecision("acme");
    const logs = await PlatformAuditLog.find({ tenantId: "acme" });
    expect(logs).toHaveLength(0);
  });

  it("different tenants have independent behaviours", async () => {
    await AiLimit.create({ tenantId: "acme", atLimitBehavior: AI_AT_LIMIT_BEHAVIOR.BLOCK });
    await AiLimit.create({ tenantId: "globex", atLimitBehavior: AI_AT_LIMIT_BEHAVIOR.ALLOW_AND_LOG });
    expect(await resolveAtLimitDecision("acme")).toEqual({ action: "block" });
    expect((await resolveAtLimitDecision("globex")).action).toBe("allow");
  });
});
