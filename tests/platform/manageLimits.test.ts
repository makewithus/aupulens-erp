import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_platform_managelimits";

import AiLimit from "@/models/platform/AiLimit";
import AiOverageConfig from "@/models/platform/AiOverageConfig";
import AdminRole from "@/models/platform/AdminRole";
import PlatformAuditLog from "@/models/platform/PlatformAuditLog";
import { ADMIN_CAPABILITY, ADMIN_ROLE, AI_AT_LIMIT_BEHAVIOR } from "@/lib/constants/statuses";
import { AdminActor } from "@/lib/platform/auth/types";
import { ROLE_MATRIX } from "@/lib/platform/auth/roleMatrix";

let setAiLimit: typeof import("@/lib/platform/ai/manageLimits").setAiLimit;
let setAiOverageConfig: typeof import("@/lib/platform/ai/manageLimits").setAiOverageConfig;
let ManageAiLimitError: typeof import("@/lib/platform/ai/manageLimits").ManageAiLimitError;
let invalidateAdminRoleCache: typeof import("@/lib/platform/auth/adminRbac").invalidateAdminRoleCache;

function makeActor(role: string): AdminActor {
  return {
    id: new mongoose.Types.ObjectId().toString(),
    email: "actor@example.com",
    name: "Actor",
    role: role as AdminActor["role"],
    sessionId: "test-session",
  };
}

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI!);
  await AiLimit.init();
  await AiOverageConfig.init();
  await AdminRole.init();
  await PlatformAuditLog.init();
  ({ setAiLimit, setAiOverageConfig, ManageAiLimitError } = await import(
    "@/lib/platform/ai/manageLimits"
  ));
  ({ invalidateAdminRoleCache } = await import("@/lib/platform/auth/adminRbac"));
  // Seed roles from the SAME corrected matrix production seeds from, not a
  // hand-picked test fixture — this is what makes the GLOBAL_ADMIN-refused
  // test below a real proof the corrected §30 matrix is live, not a proof
  // of whatever this test file happened to seed.
  for (const [role, { capabilities }] of Object.entries(ROLE_MATRIX)) {
    await AdminRole.create({ role, capabilities, description: "" });
  }
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

afterEach(async () => {
  await AiLimit.deleteMany({});
  await AiOverageConfig.deleteMany({});
  await PlatformAuditLog.deleteMany({}).setOptions({ allowRetentionDelete: true });
});

describe("setAiLimit — §15, gated on MANAGE_AI_LIMITS (AI_ADMIN + GLOBAL_SUPER_ADMIN only)", () => {
  it("AI_ADMIN can set a limit; absent fields stay unset, atLimitBehavior defaults to BLOCK", async () => {
    const tenantId = "limits-co";
    await setAiLimit(makeActor(ADMIN_ROLE.AI_ADMIN), tenantId, { monthlyCreditsUsd: 500 }, "customer request");

    const limit = await AiLimit.findOne({ tenantId });
    expect(limit!.monthlyCreditsUsd).toBe(500);
    expect(limit!.dailyCreditsUsd).toBeUndefined();
    expect(limit!.atLimitBehavior).toBe(AI_AT_LIMIT_BEHAVIOR.BLOCK);

    const audits = await PlatformAuditLog.find({ tenantId });
    expect(audits).toHaveLength(1);
    expect(audits[0].eventType).toBe("ai_limit_changed");
  });

  it("GLOBAL_SUPER_ADMIN can set a limit", async () => {
    await setAiLimit(makeActor(ADMIN_ROLE.GLOBAL_SUPER_ADMIN), "super-co", { maxRequestsPerMonth: 1000 }, "test");
    expect((await AiLimit.findOne({ tenantId: "super-co" }))!.maxRequestsPerMonth).toBe(1000);
  });

  it("GLOBAL_ADMIN is REFUSED — the live proof the corrected §30 matrix denies this role 'Configure AI Limits' (Phase 9 Part 0.1)", async () => {
    const tenantId = "denied-global-admin-co";
    await expect(
      setAiLimit(makeActor(ADMIN_ROLE.GLOBAL_ADMIN), tenantId, { monthlyCreditsUsd: 999 }, "test"),
    ).rejects.toThrow();
    expect(await AiLimit.findOne({ tenantId })).toBeNull();
  });

  it("BILLING_ADMIN and READ_ONLY_ADMIN are also refused", async () => {
    await expect(
      setAiLimit(makeActor(ADMIN_ROLE.BILLING_ADMIN), "b-co", { monthlyCreditsUsd: 1 }, "test"),
    ).rejects.toThrow();
    await expect(
      setAiLimit(makeActor(ADMIN_ROLE.READ_ONLY_ADMIN), "r-co", { monthlyCreditsUsd: 1 }, "test"),
    ).rejects.toThrow();
  });

  it("passing a field as null clears that specific override without touching others", async () => {
    const tenantId = "clear-co";
    await setAiLimit(
      makeActor(ADMIN_ROLE.AI_ADMIN),
      tenantId,
      { monthlyCreditsUsd: 500, dailyCreditsUsd: 50 },
      "initial",
    );
    await setAiLimit(makeActor(ADMIN_ROLE.AI_ADMIN), tenantId, { dailyCreditsUsd: null }, "remove daily cap");

    const limit = await AiLimit.findOne({ tenantId }).lean();
    expect(limit!.monthlyCreditsUsd).toBe(500);
    expect(limit!.dailyCreditsUsd).toBeUndefined();
  });

  it("requires a reason", async () => {
    await expect(
      setAiLimit(makeActor(ADMIN_ROLE.AI_ADMIN), "reason-co", { monthlyCreditsUsd: 1 }, ""),
    ).rejects.toThrow(ManageAiLimitError);
  });
});

describe("setAiOverageConfig — §16, same capability and audit shape", () => {
  it("AI_ADMIN can configure overage", async () => {
    const tenantId = "overage-co";
    await setAiOverageConfig(
      makeActor(ADMIN_ROLE.AI_ADMIN),
      tenantId,
      { enabled: true, ratePerCreditUsd: 0.02, softLimitUsd: 100, hardLimitUsd: 500 },
      "enterprise deal allows overage",
    );
    const config = await AiOverageConfig.findOne({ tenantId });
    expect(config!.enabled).toBe(true);
    expect(config!.hardLimitUsd).toBe(500);
  });

  it("GLOBAL_ADMIN is refused", async () => {
    await expect(
      setAiOverageConfig(makeActor(ADMIN_ROLE.GLOBAL_ADMIN), "denied-overage-co", { enabled: true }, "test"),
    ).rejects.toThrow();
  });
});
