import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_platform_globalsearch";

import Organization from "@/models/admin/Organization";
import User from "@/models/auth/User";
import AdminUser from "@/models/platform/AdminUser";
import AdminRole from "@/models/platform/AdminRole";
import PlatformAuditLog from "@/models/platform/PlatformAuditLog";
import SubscriptionEvent from "@/models/admin/SubscriptionEvent";
import AiUsageRecord from "@/models/platform/AiUsageRecord";
import ApiKey from "@/models/platform/ApiKey";
import { ADMIN_CAPABILITY, ADMIN_ROLE, ENTITY_STATUS } from "@/lib/constants/statuses";
import { AdminActor } from "@/lib/platform/auth/types";

let globalSearch: typeof import("@/lib/platform/search/globalSearch").globalSearch;
let invalidateAdminRoleCache: typeof import("@/lib/platform/auth/adminRbac").invalidateAdminRoleCache;

function makeActor(): AdminActor {
  return {
    id: new mongoose.Types.ObjectId().toString(),
    email: "actor@example.com",
    name: "Actor",
    role: ADMIN_ROLE.GLOBAL_ADMIN,
    sessionId: "test-session",
  };
}

describe("globalSearch — cross-tenant, audited, real records only (source doc §23)", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Organization.init();
    await User.init();
    await AdminUser.init();
    await AdminRole.init();
    await PlatformAuditLog.init();
    await SubscriptionEvent.init();
    await AiUsageRecord.init();
    await ApiKey.init();
    ({ globalSearch } = await import("@/lib/platform/search/globalSearch"));
    ({ invalidateAdminRoleCache } = await import("@/lib/platform/auth/adminRbac"));
    await AdminRole.create({
      role: ADMIN_ROLE.GLOBAL_ADMIN,
      capabilities: [ADMIN_CAPABILITY.GLOBAL_SEARCH],
      description: "",
    });
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Organization.deleteMany({});
    await User.deleteMany({});
    await AdminUser.deleteMany({});
    await PlatformAuditLog.deleteMany({}).setOptions({ allowRetentionDelete: true });
    await SubscriptionEvent.deleteMany({});
    await AiUsageRecord.deleteMany({});
    await ApiKey.deleteMany({});
  });

  it("finds an organization by name", async () => {
    await Organization.create({ name: "Acme Corp", subdomain: "acme", ownerUserId: new mongoose.Types.ObjectId() });
    const results = await globalSearch(makeActor(), "test", "Acme");
    expect(results.some((r) => r.type === "organization" && r.label === "Acme Corp")).toBe(true);
  });

  it("finds a tenant user by email", async () => {
    await User.create({
      tenantId: "acme",
      name: "Jane",
      email: "jane@acme.com",
      phone: "1",
      password: "hashedpw",
      role: "admin",
      status: ENTITY_STATUS.ACTIVE,
    });
    const results = await globalSearch(makeActor(), "test", "jane@acme");
    expect(results.some((r) => r.type === "user" && r.label === "jane@acme.com")).toBe(true);
  });

  it("finds an audit event by entityId", async () => {
    await PlatformAuditLog.create({
      actorId: "a1",
      actorType: "admin",
      actorRole: "global_admin",
      eventCategory: "organisation",
      eventType: "organization_created",
      severity: "info",
      entityType: "Organization",
      entityId: "unique-entity-123",
    });
    const results = await globalSearch(makeActor(), "test", "unique-entity-123");
    expect(results.some((r) => r.type === "audit_event")).toBe(true);
  });

  it("finds an AI usage record by requestId", async () => {
    await AiUsageRecord.create({
      tenantId: "acme",
      feature: "ai_assistant",
      modelName: "gpt-4o",
      inputTokens: 10,
      outputTokens: 5,
      estimatedCostUsd: 0,
      latencyMs: 100,
      status: "success",
      requestId: "req-unique-456",
    });
    const results = await globalSearch(makeActor(), "test", "req-unique-456");
    expect(results.some((r) => r.type === "ai_usage_record")).toBe(true);
  });

  it("returns an empty array for an empty query, never the whole database", async () => {
    await Organization.create({ name: "Acme Corp", subdomain: "acme", ownerUserId: new mongoose.Types.ObjectId() });
    const results = await globalSearch(makeActor(), "test", "");
    expect(results).toEqual([]);
  });

  it("returns a real, honest empty result for a query matching nothing", async () => {
    const results = await globalSearch(makeActor(), "test", "no-such-thing-exists-anywhere-xyz");
    expect(results).toEqual([]);
  });

  it("audits every search, including one with zero results", async () => {
    await globalSearch(makeActor(), "investigating ticket #123", "nonexistent-query-xyz");
    const logs = await PlatformAuditLog.find({ entityType: "GlobalSearch" });
    expect(logs).toHaveLength(1);
    expect(logs[0].entityId).toBe("nonexistent-query-xyz");
    expect(logs[0].metadata?.reason).toBe("investigating ticket #123");
  });

  it("denies an actor without GLOBAL_SEARCH capability", async () => {
    await AdminRole.create({ role: ADMIN_ROLE.READ_ONLY_ADMIN, capabilities: [], description: "" });
    invalidateAdminRoleCache();
    const actor: AdminActor = { ...makeActor(), role: ADMIN_ROLE.READ_ONLY_ADMIN };
    await expect(globalSearch(actor, "test", "anything")).rejects.toThrow();
  });
});
