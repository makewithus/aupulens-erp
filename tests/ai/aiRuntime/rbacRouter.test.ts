import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai_rbac_router";

import User from "@/models/auth/User";

let routePermissionCheck: typeof import("@/lib/aiRuntime/tools/rbacRouter").routePermissionCheck;

const TENANT = "rbac-router-tenant";

async function makeUser(role: string, permissions: string[] = []) {
  const user = await User.create({
    tenantId: TENANT,
    name: "Test User",
    email: `${role}-${Date.now()}-${Math.random()}@example.com`,
    phone: "9999999999",
    password: "hashed",
    role,
    permissions,
    status: "active",
  });
  return String(user._id);
}

describe("check_permission's real RBAC router (A.2)", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await User.init();
    ({ routePermissionCheck } = await import("@/lib/aiRuntime/tools/rbacRouter"));
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await User.deleteMany({});
  });

  it("denies when no userId is provided", async () => {
    const result = await routePermissionCheck(TENANT, undefined, "finance", "draft_bill");
    expect(result.allowed).toBe(false);
  });

  it("denies when the user does not exist for this tenant", async () => {
    const result = await routePermissionCheck(TENANT, new mongoose.Types.ObjectId().toString(), "finance", "draft_bill");
    expect(result.allowed).toBe(false);
  });

  it("finance module: a finance-role user is allowed", async () => {
    const userId = await makeUser("finance");
    const result = await routePermissionCheck(TENANT, userId, "finance", "draft_bill");
    expect(result.allowed).toBe(true);
  });

  it("finance module: an hr-role user is denied", async () => {
    const userId = await makeUser("hr");
    const result = await routePermissionCheck(TENANT, userId, "finance", "draft_bill");
    expect(result.allowed).toBe(false);
  });

  it("finance module: admin and master-admin are always allowed", async () => {
    const adminId = await makeUser("admin");
    const masterId = await makeUser("master-admin");
    expect((await routePermissionCheck(TENANT, adminId, "finance", "draft_bill")).allowed).toBe(true);
    expect((await routePermissionCheck(TENANT, masterId, "finance", "draft_bill")).allowed).toBe(true);
  });

  it("inventory module allows inventory AND finance roles (matches middleware.ts's real table)", async () => {
    const invId = await makeUser("inventory");
    const finId = await makeUser("finance");
    const salesId = await makeUser("sales");
    expect((await routePermissionCheck(TENANT, invId, "inventory", "x")).allowed).toBe(true);
    expect((await routePermissionCheck(TENANT, finId, "inventory", "x")).allowed).toBe(true);
    expect((await routePermissionCheck(TENANT, salesId, "inventory", "x")).allowed).toBe(false);
  });

  it("an unmapped module denies by default, not by placeholder-allow", async () => {
    const adminId = await makeUser("admin");
    const result = await routePermissionCheck(TENANT, adminId, "some-future-module", "x");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("no mapped permission check");
  });

  it("crm module: routes to the real lib/crm/rbac.ts — admin always allowed", async () => {
    const adminId = await makeUser("admin");
    const result = await routePermissionCheck(TENANT, adminId, "crm", "lead.delete");
    expect(result.allowed).toBe(true);
  });

  it("crm module: an unrecognized permission string is denied, not passed through", async () => {
    const adminId = await makeUser("admin");
    const result = await routePermissionCheck(TENANT, adminId, "crm", "not_a_real_permission");
    expect(result.allowed).toBe(false);
  });

  it("crm module: a sales-role user without an explicit grant is denied a write permission", async () => {
    const salesId = await makeUser("sales", []);
    const result = await routePermissionCheck(TENANT, salesId, "crm", "lead.delete");
    expect(result.allowed).toBe(false);
  });

  it("crm module: a sales-role user with an explicit permission grant is allowed", async () => {
    const salesId = await makeUser("sales", ["lead.delete"]);
    const result = await routePermissionCheck(TENANT, salesId, "crm", "lead.delete");
    expect(result.allowed).toBe(true);
  });
});
